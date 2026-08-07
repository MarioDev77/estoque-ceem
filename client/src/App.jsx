import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Alunos from './pages/Alunos.jsx';
import Calendario from './pages/Calendario.jsx';
import Alimentos from './pages/Alimentos.jsx';
import Fornecedores from './pages/Fornecedores.jsx';
import Estoque from './pages/Estoque.jsx';
import Entradas from './pages/Entradas.jsx';
import Lotes from './pages/Lotes.jsx';
import Fichas from './pages/Fichas.jsx';
import Cardapio from './pages/Cardapio.jsx';
import Consumo from './pages/Consumo.jsx';
import Sobras from './pages/Sobras.jsx';
import Desperdicio from './pages/Desperdicio.jsx';
import Compras from './pages/Compras.jsx';
import Financeiro from './pages/Financeiro.jsx';
import Relatorios from './pages/Relatorios.jsx';
import RelatorioAnual from './pages/RelatorioAnual.jsx';
import Auditoria from './pages/Auditoria.jsx';
import Usuarios from './pages/Usuarios.jsx';
import IA from './pages/IA.jsx';
import Scanner from './pages/Scanner.jsx';
import Config from './pages/Config.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      />
    </Routes>
  );
}

