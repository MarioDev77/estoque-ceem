import React from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, CalendarDays, UtensilsCrossed, BookOpen, Apple,
  Package, PackagePlus, Layers, ClipboardList, HandPlatter, Scissors,
  Recycle, ShoppingCart, Wallet, FileBarChart2, CalendarClock, History,
  ShieldCheck, Bot, ScanBarcode, Settings, LogOut, Bell, ChefHat,
} from 'lucide-react';
import { useAuth } from '../auth.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Alunos from '../pages/Alunos.jsx';
import Calendario from '../pages/Calendario.jsx';
import Alimentos from '../pages/Alimentos.jsx';
import Fornecedores from '../pages/Fornecedores.jsx';
import Estoque from '../pages/Estoque.jsx';
import Entradas from '../pages/Entradas.jsx';
import Lotes from '../pages/Lotes.jsx';
import Fichas from '../pages/Fichas.jsx';
import Cardapio from '../pages/Cardapio.jsx';
import Consumo from '../pages/Consumo.jsx';
import Sobras from '../pages/Sobras.jsx';
import Desperdicio from '../pages/Desperdicio.jsx';
import Compras from '../pages/Compras.jsx';
import Financeiro from '../pages/Financeiro.jsx';
import Relatorios from '../pages/Relatorios.jsx';
import RelatorioAnual from '../pages/RelatorioAnual.jsx';
import Auditoria from '../pages/Auditoria.jsx';
import Usuarios from '../pages/Usuarios.jsx';
import IA from '../pages/IA.jsx';
import Scanner from '../pages/Scanner.jsx';
import Config from '../pages/Config.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard', exact: true },
  { to: '/cardapio', label: 'Cardápio', icon: UtensilsCrossed, module: 'cardapio' },
  { to: '/estoque', label: 'Estoque', icon: Package, module: 'estoque' },
  { to: '/scanner', label: 'Scanner', icon: ScanBarcode, module: 'scanner' },
  { to: '/consumo', label: 'Consumo', icon: HandPlatter, module: 'consumo' },
  { to: '/compras', label: 'Compras', icon: ShoppingCart, module: 'compras' },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet, module: 'financeiro' },
  { to: '/ia', label: 'IA', icon: Bot, module: 'ia' },
];

const MENU_SECONDARY = [
  { to: '/alunos', label: 'Alunos', icon: Users, module: 'alunos' },
  { to: '/calendario', label: 'Calendário Escolar', icon: CalendarDays, module: 'calendario' },
  { to: '/fichas', label: 'Fichas Técnicas', icon: BookOpen, module: 'fichas' },
  { to: '/alimentos', label: 'Alimentos', icon: Apple, module: 'alimentos' },
  { to: '/lotes', label: 'Lotes e Validade', icon: Layers, module: 'estoque' },
  { to: '/entradas', label: 'Entradas', icon: PackagePlus, module: 'entradas' },
  { to: '/sobras', label: 'Sobras', icon: ClipboardList, module: 'sobras' },
  { to: '/desperdicio', label: 'Desperdício', icon: Recycle, module: 'desperdicio' },
  { to: '/fornecedores', label: 'Fornecedores', icon: ChefHat, module: 'fornecedores' },
  { to: '/relatorios', label: 'Relatórios', icon: FileBarChart2, module: 'relatorios' },
  { to: '/relatorio-anual', label: 'Relatório Anual', icon: CalendarClock, module: 'relatorios' },
  { to: '/auditoria', label: 'Auditoria', icon: History, module: 'auditoria' },
  { to: '/usuarios', label: 'Usuários', icon: ShieldCheck, module: 'usuarios' },
  { to: '/config', label: 'Configurações', icon: Settings, module: 'usuarios' },
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const location = useLocation();

  const bottomNav = NAV_ITEMS.map((item) => ({ ...item, icon: item.to === '/scanner' ? ScanBarcode : item.icon }));

  function Page({ children }) {
    return children;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo-escola.png" alt="Colégio Estadual de Tempo Integral Eudóxia Maria" className="sidebar-logo" />
          <div>
            <strong>Eudóxia Maria</strong>
            <small>Gestão Alimentar</small>
          </div>
        </div>
        <nav className="sidebar-nav">
          <p className="nav-section-label">Principal</p>
          {NAV_ITEMS.filter((i) => can(i.module)).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.exact} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <item.icon size={18} /> <span>{item.label}</span>
            </NavLink>
          ))}
          <p className="nav-section-label">Gestão</p>
          {MENU_SECONDARY.filter((i) => can(i.module)).map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <item.icon size={18} /> <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="avatar">{user?.name?.slice(0, 1) || 'U'}</span>
            <div>
              <strong>{user?.name}</strong>
              <small>{user?.role_name}</small>
            </div>
          </div>
          <button className="icon-btn" title="Sair" onClick={logout}><LogOut size={18} /></button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => window.dispatchEvent(new Event('menu-toggle'))}>
            <span style={{ fontSize: 20 }}>☰</span>
          </button>
          <h1>Gestão da Alimentação Escolar</h1>
          <div className="topbar-right">
            <NavLink to="/scanner" className="icon-btn" title="Scanner"><ScanBarcode size={20} /></NavLink>
            <NavLink to="/ia" className="icon-btn" title="IA"><Bot size={20} /></NavLink>
            <NavLink to="/" className="icon-btn" title="Notificações"><Bell size={20} /></NavLink>
            <span className="topbar-user">{user?.name?.split(' ')[0]}</span>
          </div>
        </header>

        <div className="page-container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/alunos" element={<Alunos />} />
            <Route path="/calendario" element={<Calendario />} />
            <Route path="/alimentos" element={<Alimentos />} />
            <Route path="/fornecedores" element={<Fornecedores />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/entradas" element={<Entradas />} />
            <Route path="/lotes" element={<Lotes />} />
            <Route path="/fichas" element={<Fichas />} />
            <Route path="/cardapio" element={<Cardapio />} />
            <Route path="/consumo" element={<Consumo />} />
            <Route path="/sobras" element={<Sobras />} />
            <Route path="/desperdicio" element={<Desperdicio />} />
            <Route path="/compras" element={<Compras />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/relatorio-anual" element={<RelatorioAnual />} />
            <Route path="/auditoria" element={<Auditoria />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/ia" element={<IA />} />
            <Route path="/scanner" element={<Scanner />} />
            <Route path="/config" element={<Config />} />
            <Route path="*" element={<Page><Dashboard /></Page>} />
          </Routes>
        </div>
      </main>

      {/* Navegação inferior mobile */}
      <nav className="bottom-nav">
        {bottomNav.filter((i) => can(i.module)).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.exact} className={({ isActive }) => isActive ? 'bn-item active' : 'bn-item'}>
            <item.icon size={22} />
            <span>{item.label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

