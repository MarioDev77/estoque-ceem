import React, { useEffect, useState } from 'react';
import { FileBarChart2, Download, GraduationCap, UtensilsCrossed, Wallet, Recycle, TrendingUp } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, formatCurrency, formatNumber, monthLabel } from '../utils.js';
import { PageHeader, Badge } from '../components/ui.jsx';
import { BarChart, LineChart } from '../components/Charts.jsx';

export default function RelatorioAnual() {
  const { can } = useAuth();
  const year = new Date().getFullYear();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const res = await api.get('/relatorio-anual', { params: { year } });
      setData(res.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao gerar relatório anual.'));
    }
  }
  useEffect(() => { load(); }, []);

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <div className="loading">Carregando…</div>;

  const i = data.indicators;

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(data.school?.name || 'Escola', 14, 20);
    doc.setFontSize(14);
    doc.text(`Relatório da Alimentação Escolar — ${data.year}`, 14, 28);
    doc.setFontSize(10);
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 35);
    autoTable(doc, {
      startY: 40,
      head: [['Indicador', 'Valor']],
      body: [
        ['Total de refeições realizadas', i.totalRefeicoes],
        ['Alunos servidos', formatNumber(i.totalAlunosServidos)],
        ['Alunos atendidos', formatNumber(i.totalAlunos)],
        ['Dias letivos', i.diasLetivos],
        ['Total gasto', formatCurrency(i.totalGasto)],
        ['Custo médio por refeição', formatCurrency(i.custoMedio)],
        ['Alimentos consumidos (kg)', formatNumber(i.alimentosConsumidos)],
        ['Compras realizadas', i.comprasRealizadas],
        ['Total comprado', formatCurrency(i.totalCompras)],
        ['Total desperdiçado (kg)', formatNumber(i.totalDesperdicio)],
        ['Valor desperdiçado', formatCurrency(i.totalDesperdicioCost)],
      ],
    });
    doc.save(`relatorio_anual_${data.year}.pdf`);
  }

  return (
    <div>
      <PageHeader
        title={`Relatório da Alimentação Escolar — ${data.year}`}
        subtitle="Resumo anual completo do planejamento, consumo, gastos e desperdícios"
        actions={
          can('relatorios', 'can_create') && (
            <button className="btn btn-danger" onClick={exportPDF}><Download size={16} /> Exportar PDF</button>
          )
        }
      />

      <div className="stats-grid">
        <div className="stat-card stat-teal"><div className="stat-info"><span className="stat-label"><UtensilsCrossed size={14} /> Refeições</span><strong className="stat-value">{formatNumber(i.totalRefeicoes)}</strong></div></div>
        <div className="stat-card stat-blue"><div className="stat-info"><span className="stat-label"><GraduationCap size={14} /> Alunos servidos</span><strong className="stat-value">{formatNumber(i.totalAlunosServidos)}</strong></div></div>
        <div className="stat-card stat-green"><div className="stat-info"><span className="stat-label"><Wallet size={14} /> Total gasto</span><strong className="stat-value">{formatCurrency(i.totalGasto)}</strong></div></div>
        <div className="stat-card stat-purple"><div className="stat-info"><span className="stat-label"><TrendingUp size={14} /> Custo/refeição</span><strong className="stat-value">{formatCurrency(i.custoMedio)}</strong></div></div>
        <div className="stat-card stat-orange"><div className="stat-info"><span className="stat-label"><Recycle size={14} /> Desperdício</span><strong className="stat-value">{formatNumber(i.totalDesperdicio)} kg</strong></div></div>
      </div>

      <div className="charts-grid two">
        <div className="card chart-card">
          <h3>Evolução dos gastos</h3>
          <LineChart labels={(data.evolucaoGastos || []).map((g) => monthLabel(g.month))} datasets={[{ label: 'R$', data: (data.evolucaoGastos || []).map((g) => g.amount), borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,0.1)' }]} />
        </div>
        <div className="card chart-card">
          <h3>Evolução do consumo (refeições)</h3>
          <LineChart labels={(data.evolucaoConsumo || []).map((g) => monthLabel(g.month))} datasets={[{ label: 'Refeições', data: (data.evolucaoConsumo || []).map((g) => g.meals), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)' }]} />
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Alimentos mais utilizados</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Alimento</th><th>Quantidade consumida</th><th>Unidade</th></tr></thead>
            <tbody>
              {(data.maisUtilizados || []).map((r) => (
                <tr key={r.name}><td><strong>{r.name}</strong></td><td>{formatNumber(r.qty)}</td><td>{r.unit}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Alimentos mais desperdiçados</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Alimento</th><th>Quantidade</th><th>Valor perdido</th></tr></thead>
            <tbody>
              {(data.maisDesperdicados || []).map((r) => (
                <tr key={r.name}><td><strong>{r.name}</strong></td><td>{formatNumber(r.qty)} {r.unit}</td><td>{formatCurrency(r.cost)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

