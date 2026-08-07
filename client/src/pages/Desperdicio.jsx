import React, { useEffect, useState } from 'react';
import { Recycle, Plus, Trash2 } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, today, startOfMonth, endOfMonth, formatCurrency, formatDateBR, formatNumber } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';
import { BarChart, PieChart } from '../components/Charts.jsx';

const REASON_TONES = { excesso_producao: 'orange', vencimento: 'danger', preparo: 'purple', armazenamento: 'blue', sobras: 'warning', danificado: 'neutral' };

export default function Desperdicio() {
  const { can } = useAuth();
  const [data, setData] = useState({ rows: [], reasons: [], reasonLabels: {} });
  const [indicators, setIndicators] = useState({});
  const [foods, setFoods] = useState([]);
  const [range, setRange] = useState({ start: startOfMonth(today()), end: endOfMonth(today()) });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ food_id: '', quantity: '', reason: 'sobras', date: today(), responsible: '', notes: '' });

  async function load() {
    try {
      const [dRes, iRes, fRes] = await Promise.all([
        api.get('/desperdicio', { params: range }), api.get('/desperdicio/indicadores', { params: range }), api.get('/alimentos'),
      ]);
      setData(dRes.data);
      setIndicators(iRes.data);
      setFoods(fRes.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar desperdício.'));
    }
  }
  useEffect(() => { load(); }, [range.start, range.end]);

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/desperdicio', form);
      setOpen(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao registrar desperdício.'));
    }
  }

  async function remove(r) {
    if (!confirm('Excluir registro de desperdício?')) return;
    try {
      await api.delete(`/desperdicio/${r.id}`);
      load();
    } catch (err) {
      alert(getErrMsg(err, 'Erro ao excluir.'));
    }
  }

  return (
    <div>
      <PageHeader
        title="Controle de Desperdício"
        subtitle="Registre perdas, identifique causas e reduza gastos"
        actions={
          <div className="row-actions">
            <input className="input" type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
            <span className="muted">até</span>
            <input className="input" type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
            {can('desperdicio', 'can_create') && <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Registrar</button>}
          </div>
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="stats-grid mini">
        <div className="stat-card stat-orange"><div className="stat-info"><span className="stat-label">Total desperdiçado</span><strong className="stat-value">{formatNumber(indicators.totalQty)} kg</strong></div></div>
        <div className="stat-card stat-danger"><div className="stat-info"><span className="stat-label">Valor perdido</span><strong className="stat-value">{formatCurrency(indicators.totalCost)}</strong></div></div>
        {indicators.mostWasted && (
          <div className="stat-card stat-purple"><div className="stat-info"><span className="stat-label">Maior desperdício</span><strong className="stat-value">{indicators.mostWasted.name} ({formatNumber(indicators.mostWasted.qty)} {indicators.mostWasted.unit})</strong></div></div>
        )}
      </div>

      <div className="charts-grid two">
        <div className="card chart-card">
          <h3>Desperdício por alimento</h3>
          <BarChart horizontal labels={(indicators.byFood || []).map((b) => b.name)} datasets={[{ label: 'Quantidade', data: (indicators.byFood || []).map((b) => b.qty), backgroundColor: '#ef4444' }]} height={260} />
        </div>
        <div className="card chart-card">
          <h3>Desperdício por motivo</h3>
          <PieChart labels={(indicators.byReason || []).map((r) => r.label)} data={(indicators.byReason || []).map((r) => r.qty)} />
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3><Recycle size={18} /> Registros</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Data</th><th>Alimento</th><th>Qtd</th><th>Motivo</th><th>Custo estimado</th><th>Responsável</th>{can('desperdicio', 'can_create') && <th></th>}</tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateBR(r.date)}</td>
                  <td><strong>{r.food_name}</strong></td>
                  <td>{formatNumber(r.quantity)} {r.unit}</td>
                  <td><Badge tone={REASON_TONES[r.reason] || 'neutral'}>{data.reasonLabels?.[r.reason] || r.reason}</Badge></td>
                  <td>{formatCurrency(r.estimated_cost)}</td>
                  <td><small>{r.responsible}</small></td>
                  {can('desperdicio', 'can_create') && <td className="ta-right"><button className="icon-btn danger" onClick={() => remove(r)}><Trash2 size={14} /></button></td>}
                </tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan="7" className="empty-cell">Nenhum registro de desperdício no período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Registrar desperdício">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={save} className="form-grid">
          <label className="full">Alimento
            <select className="input" value={form.food_id} onChange={(e) => setForm({ ...form, food_id: e.target.value })} required>
              <option value="">Selecione…</option>
              {foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <label>Quantidade
            <input className="input" type="number" step="0.1" min="0.1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </label>
          <label>Motivo
            <select className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              {data.reasons.map((r) => <option key={r} value={r}>{data.reasonLabels?.[r] || r}</option>)}
            </select>
          </label>
          <label>Data
            <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <label>Responsável
            <input className="input" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
          </label>
          <label className="full">Observações
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="full info-tip"><p><strong>Obs.:</strong> registrar desperdício também debita o estoque automaticamente.</p></div>
          <div className="form-actions full">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Registrar</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

