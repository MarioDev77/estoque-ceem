import React, { useEffect, useState } from 'react';
import { FileText, Download, FileSpreadsheet, FileJson } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, today, startOfMonth, endOfMonth, formatCurrency, formatDateBR, formatNumber } from '../utils.js';
import { PageHeader, Badge } from '../components/ui.jsx';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const TYPES = [
  { id: 'consumo', label: 'Consumo mensal' },
  { id: 'consumo_alimento', label: 'Consumo por alimento' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'compras', label: 'Compras' },
  { id: 'gastos', label: 'Gastos' },
  { id: 'desperdicio', label: 'Desperdícios' },
  { id: 'validade', label: 'Validade' },
  { id: 'refeicoes', label: 'Refeições' },
  { id: 'cardapios', label: 'Cardápios' },
  { id: 'custo_refeicao', label: 'Custo por refeição' },
];

export default function Relatorios() {
  const { can } = useAuth();
  const [type, setType] = useState('consumo');
  const [range, setRange] = useState({ start: startOfMonth(today()), end: endOfMonth(today()) });
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const res = await api.get('/relatorios', { params: { type, ...range } });
      setReport(res.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao gerar relatório.'));
    }
  }
  useEffect(() => { load(); }, [type, range.start, range.end]);

  const colsFor = () => {
    if (!report?.data || report.data.length === 0) return [];
    return Object.keys(report.data[0]).filter((k) => k !== 'id');
  };

  function exportCSV() {
    if (!report?.data) return;
    const rows = Array.isArray(report.data) ? report.data : [report.data];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
    XLSX.writeFile(wb, `relatorio_${type}_${today()}.xlsx`);
  }

  function exportPDF() {
    if (!report?.data) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Relatório: ${TYPES.find((t) => t.id === type)?.label || type}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Período: ${formatDateBR(report.start)} a ${formatDateBR(report.end)}`, 14, 27);
    const rows = Array.isArray(report.data) ? report.data : [report.data];
    const headers = colsFor().map((c) => c.replace(/_/g, ' '));
    const body = rows.map((r) => colsFor().map((c) => String(r[c] ?? '')));
    autoTable(doc, { head: [headers], body, startY: 32 });
    doc.save(`relatorio_${type}_${today()}.pdf`);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `relatorio_${type}_${today()}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  const isCostReport = type === 'custo_refeicao';
  const summary = isCostReport ? report?.data : null;

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle="Geração, visualização e exportação em Excel, PDF e JSON"
        actions={
          <div className="row-actions">
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input className="input" type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
            <span className="muted">até</span>
            <input className="input" type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
          </div>
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="export-bar">
        <button className="btn btn-success" onClick={exportCSV}><FileSpreadsheet size={16} /> Excel</button>
        <button className="btn btn-danger" onClick={exportPDF}><FileText size={16} /> PDF</button>
        <button className="btn btn-outline" onClick={exportJSON}><FileJson size={16} /> JSON</button>
      </div>

      {isCostReport && summary && (
        <div className="stats-grid mini">
          <div className="stat-card stat-teal"><div className="stat-info"><span className="stat-label">Gastos no período</span><strong className="stat-value">{formatCurrency(summary.totalExpenses)}</strong></div></div>
          <div className="stat-card stat-blue"><div className="stat-info"><span className="stat-label">Refeições servidas</span><strong className="stat-value">{formatNumber(summary.totalMeals)}</strong></div></div>
          <div className="stat-card stat-green"><div className="stat-info"><span className="stat-label">Custo por refeição</span><strong className="stat-value">{formatCurrency(summary.costPerMeal)}</strong></div></div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3><Download size={18} /> {TYPES.find((t) => t.id === type)?.label} — {report ? `${report.data.length} registros` : ''}</h3>
          <Badge tone="teal">{formatDateBR(report?.start)} a {formatDateBR(report?.end)}</Badge>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>{colsFor().map((c) => <th key={c}>{c.replace(/_/g, ' ')}</th>)}</tr>
            </thead>
            <tbody>
              {report && Array.isArray(report.data) && report.data.slice(0, 200).map((r, i) => (
                <tr key={i}>{colsFor().map((c) => <td key={c}>{String(r[c] ?? '')}</td>)}</tr>
              ))}
              {report && Array.isArray(report.data) && report.data.length === 0 && <tr><td className="empty-cell">Sem dados para o período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

