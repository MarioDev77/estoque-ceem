import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, UtensilsCrossed, HandPlatter, CalendarDays, Package, PackageX,
  AlertTriangle, PackageMinus, ShoppingCart, Wallet, TrendingUp, CircleDollarSign,
  Recycle, Bell, Bot, ArrowRight, Timer, CheckCircle2, XCircle,
} from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatCurrency, formatNumber, monthLabel, getErrMsg } from '../utils.js';
import { StatCard, PageHeader, Badge } from '../components/ui.jsx';
import { BarChart, LineChart, PieChart } from '../components/Charts.jsx';

const PERIODS = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
  { value: 'bimestre', label: 'Bimestre' },
  { value: 'semestre', label: 'Semestre' },
  { value: 'ano', label: 'Ano' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('mes');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get('/dashboard', { params: { period } })
      .then((res) => setData(res.data))
      .catch((err) => setError(getErrMsg(err, 'Erro ao carregar dashboard.')))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading && !data) return <div className="page-loading">Carregando dashboard…</div>;
  if (error && !data) return <div className="alert alert-danger">{error}</div>;
  if (!data) return null;

  const ind = data.indicators;
  const ch = data.charts;
  const months = ch.gastoPorMes.map((g) => monthLabel(g.month));

  return (
    <div>
      <PageHeader
        title={`Olá, ${user?.name?.split(' ')[0] || 'Administrador'}! 👋`}
        subtitle="Visão geral da alimentação escolar"
        actions={
          <div className="period-selector">
            {PERIODS.map((p) => (
              <button key={p.value} className={period === p.value ? 'chip active' : 'chip'} onClick={() => setPeriod(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Indicadores */}
      <div className="stats-grid">
        <StatCard icon={Users} label="Alunos atendidos" value={formatNumber(ind.totalStudents)} tone="teal" />
        <StatCard icon={CalendarDays} label="Cardápios planejados" value={formatNumber(ind.cardapiosPlanejados)} tone="teal" />
        <StatCard icon={UtensilsCrossed} label="Refeições planejadas" value={formatNumber(ind.refeicoesPlanejadas)} tone="blue" />
        <StatCard icon={HandPlatter} label="Refeições realizadas" value={formatNumber(ind.refeicoesRealizadas)} tone="green" />
        <StatCard icon={Package} label="Alimentos em estoque" value={formatNumber(ind.alimentosEstoque)} tone="teal" />
        <StatCard icon={PackageMinus} label="Estoque baixo" value={formatNumber(ind.estoqueBaixo)} tone={ind.estoqueBaixo > 0 ? 'orange' : 'green'} />
        <StatCard icon={XCircle} label="Alimentos em falta" value={formatNumber(ind.alimentosFalta)} tone={ind.alimentosFalta > 0 ? 'danger' : 'green'} />
        <StatCard icon={Timer} label="Vencidos" value={formatNumber(ind.vencidos)} tone={ind.vencidos > 0 ? 'danger' : 'green'} />
        <StatCard icon={AlertTriangle} label="Vencem em 7 dias" value={formatNumber(ind.vence7)} tone={ind.vence7 > 0 ? 'orange' : 'green'} />
        <StatCard icon={ShoppingCart} label="Compras no período" value={formatNumber(ind.comprasRealizadas)} tone="blue" />
        <StatCard icon={Wallet} label="Gastos do período" value={formatCurrency(ind.gastosMes)} tone="purple" />
        <StatCard icon={TrendingUp} label="Gastos do ano" value={formatCurrency(ind.gastosAno)} tone="purple" />
        <StatCard icon={CircleDollarSign} label="Orçamento disponível" value={formatCurrency(ind.orcamentoDisponivel)} tone="green" />
        <StatCard icon={Recycle} label="Valor desperdiçado" value={formatCurrency(ind.desperdicioMes)} tone={ind.desperdicioMes > 0 ? 'orange' : 'green'} />
      </div>

      {/* Alertas */}
      {data.notifications?.length > 0 && (
        <div className="card alerts-card">
          <div className="card-header">
            <h3><Bell size={18} /> Alertas do período</h3>
            <Link to="/estoque" className="btn-link">Ver estoque <ArrowRight size={14} /></Link>
          </div>
          <div className="alert-list">
            {data.notifications.map((n) => (
              <div key={n.id} className={`alert-item severity-${n.severity}`}>
                <span className="severity-dot" />
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráficos */}
      <div className="charts-grid">
        <div className="card chart-card">
          <h3>Gastos por mês</h3>
          <BarChart labels={months} datasets={[{ label: 'Gastos (R$)', data: ch.gastoPorMes.map((g) => g.amount), backgroundColor: '#0f766e' }]} />
        </div>
        <div className="card chart-card">
          <h3>Refeições servidas por mês</h3>
          <BarChart labels={ch.refeicoesPorMes.map((r) => monthLabel(r.month))} datasets={[{ label: 'Refeições', data: ch.refeicoesPorMes.map((r) => r.total), backgroundColor: '#14b8a6' }]} />
        </div>
        <div className="card chart-card">
          <h3>Consumo de alimentos por mês</h3>
          <LineChart labels={ch.consumoPorMes.map((c) => monthLabel(c.month))} datasets={[{ label: 'Consumo (kg/L/un)', data: ch.consumoPorMes.map((c) => c.qty), borderColor: '#3b82f6' }]} />
        </div>
        <div className="card chart-card">
          <h3>Desperdício por mês</h3>
          <BarChart labels={ch.desperdicioPorMes.map((d) => monthLabel(d.month))} datasets={[
            { label: 'Desperdício (kg)', data: ch.desperdicioPorMes.map((d) => d.qty), backgroundColor: '#ef4444' },
            { label: 'Custo (R$)', data: ch.desperdicioPorMes.map((d) => d.cost), backgroundColor: '#f97316' },
          ]} />
        </div>
        <div className="card chart-card">
          <h3>Alimentos mais utilizados</h3>
          <BarChart
            horizontal
            labels={ch.alimentosMais.map((a) => a.name)}
            datasets={[{ label: 'Quantidade', data: ch.alimentosMais.map((a) => a.qty), backgroundColor: '#10b981' }]}
            height={300}
          />
        </div>
        <div className="card chart-card">
          <h3>Gastos por categoria</h3>
          <PieChart labels={ch.gastosPorCategoria.map((g) => g.name)} data={ch.gastosPorCategoria.map((g) => g.amount)} />
        </div>
        <div className="card chart-card">
          <h3>Consumo por tipo de refeição</h3>
          <PieChart labels={ch.consumoPorTipo.map((t) => t.name)} data={ch.consumoPorTipo.map((t) => t.qty)} />
        </div>
        <div className="card chart-card">
          <h3>Comparação: planejado x real</h3>
          <BarChart
            horizontal
            labels={ch.comparativo.map((c) => c.name)}
            datasets={[
              { label: 'Planejado', data: ch.comparativo.map((c) => c.planned), backgroundColor: '#94a3b8' },
              { label: 'Real', data: ch.comparativo.map((c) => c.real_qty), backgroundColor: '#0f766e' },
            ]}
            height={300}
          />
        </div>
        <div className="card chart-card">
          <h3>Compras por mês</h3>
          <BarChart labels={ch.comprasPorMes.map((c) => monthLabel(c.month))} datasets={[{ label: 'Compras (R$)', data: ch.comprasPorMes.map((c) => c.total), backgroundColor: '#8b5cf6' }]} />
        </div>
        <div className="card chart-card">
          <h3>Alimentos menos utilizados</h3>
          <BarChart
            horizontal
            labels={ch.alimentosMenos.map((a) => a.name)}
            datasets={[{ label: 'Quantidade', data: ch.alimentosMenos.map((a) => a.qty), backgroundColor: '#f59e0b' }]}
            height={300}
          />
        </div>
      </div>

      {/* Atalhos rápidos */}
      <div className="quick-actions">
        <Link to="/consumo" className="qa-card"><HandPlatter size={20} /><strong>Registrar Consumo</strong><span>Baixa automática FEFO</span></Link>
        <Link to="/cardapio" className="qa-card"><CalendarDays size={20} /><strong>Planejar Cardápio</strong><span>Semanal ou mensal</span></Link>
        <Link to="/compras" className="qa-card"><ShoppingCart size={20} /><strong>Lista de Compras</strong><span>Inteligente</span></Link>
        <Link to="/ia" className="qa-card"><Bot size={20} /><strong>Assistente de IA</strong><span>Analisar dados</span></Link>
      </div>
    </div>
  );
}

