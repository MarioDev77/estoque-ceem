import React, { useEffect, useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, today, formatDateBR, formatNumber } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';

export default function Sobras() {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [mealTypes, setMealTypes] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ date: today(), meal_type_id: '2', prepared_quantity: 400, served_quantity: 360, remaining_quantity: 40, discarded_quantity: 0, notes: '' });

  async function load() {
    try {
      const [sobras, mts] = await Promise.all([api.get('/sobras', { params: { days: 90 } }), api.get('/tipos-refeicao')]);
      setRows(sobras.data);
      setMealTypes(mts.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar sobras.'));
    }
  }
  useEffect(() => { load(); }, []);

  function tankFormatter() {
    const prepared = Number(form.prepared_quantity);
    const served = Number(form.served_quantity);
    const remaining = Math.max(0, prepared - served);
    const discarded = Number(form.discarded_quantity);
    return { prepared, served, remaining, discarded };
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const t = tankFormatter();
      await api.post('/sobras', { ...form, remaining_quantity: t.remaining });
      setOpen(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao registrar sobras.'));
    }
  }

  const totalPrepared = rows.reduce((a, b) => a + Number(b.prepared_quantity || 0), 0);
  const totalServed = rows.reduce((a, b) => a + Number(b.served_quantity || 0), 0);
  const totalRemaining = rows.reduce((a, b) => a + Number(b.remaining_quantity || 0), 0);
  const totalDiscarded = rows.reduce((a, b) => a + Number(b.discarded_quantity || 0), 0);
  const wasteRate = totalPrepared > 0 ? ((totalServed / totalPrepared) * 100).toFixed(1) : '0';

  return (
    <div>
      <PageHeader
        title="Sobras das Refeições"
        subtitle="Controle de produção x serviço x sobra — identifica cardápios superestimados"
        actions={
          can('sobras', 'can_create') && (
            <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Registrar sobras</button>
          )
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="stats-grid mini">
        <div className="stat-card stat-teal"><div className="stat-info"><span className="stat-label">Preparado</span><strong className="stat-value">{formatNumber(totalPrepared)}</strong></div></div>
        <div className="stat-card stat-blue"><div className="stat-info"><span className="stat-label">Servido</span><strong className="stat-value">{formatNumber(totalServed)}</strong></div></div>
        <div className="stat-card stat-orange"><div className="stat-info"><span className="stat-label">Sobra</span><strong className="stat-value">{formatNumber(totalRemaining)}</strong></div></div>
        <div className="stat-card stat-danger"><div className="stat-info"><span className="stat-label">Descartado</span><strong className="stat-value">{formatNumber(totalDiscarded)}</strong></div></div>
        <div className="stat-card stat-green"><div className="stat-info"><span className="stat-label">Aproveitamento</span><strong className="stat-value">{wasteRate}%</strong></div></div>
      </div>

      <div className="card">
        <div className="card-header"><h3><ClipboardList size={18} /> Registros</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Data</th><th>Refeição</th><th>Preparado</th><th>Servido</th><th>Sobra</th><th>Descartado</th><th>Aproveitamento</th><th>Notas</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rate = r.prepared_quantity > 0 ? ((r.served_quantity / r.prepared_quantity) * 100).toFixed(1) : '—';
                const tone = Number(rate) >= 95 ? 'green' : Number(rate) >= 85 ? 'orange' : 'danger';
                return (
                  <tr key={r.id}>
                    <td>{formatDateBR(r.date)}</td>
                    <td>{r.meal_type_name || '—'}</td>
                    <td>{formatNumber(r.prepared_quantity)}</td>
                    <td>{formatNumber(r.served_quantity)}</td>
                    <td>{formatNumber(r.remaining_quantity)}</td>
                    <td>{formatNumber(r.discarded_quantity)}</td>
                    <td><Badge tone={tone}>{rate}%</Badge></td>
                    <td><small>{r.notes}</small></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan="8" className="empty-cell">Nenhum registro de sobras.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Registrar sobras da refeição">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={save} className="form-grid">
          <label>Data
            <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </label>
          <label>Tipo de refeição
            <select className="input" value={form.meal_type_id} onChange={(e) => setForm({ ...form, meal_type_id: e.target.value })}>
              {mealTypes.map((mt) => <option key={mt.id} value={mt.id}>{mt.name}</option>)}
            </select>
          </label>
          <label>Preparado (porções)
            <input className="input" type="number" min="0" value={form.prepared_quantity} onChange={(e) => {
              const v = Number(e.target.value);
              const served = Math.min(Number(form.served_quantity) || 0, v);
              setForm({ ...form, prepared_quantity: e.target.value, served_quantity: served, remaining_quantity: Math.max(0, v - served) });
            }} />
          </label>
          <label>Servido (porções)
            <input className="input" type="number" min="0" value={form.served_quantity} onChange={(e) => {
              const v = Number(e.target.value);
              const prepared = Number(form.prepared_quantity) || 0;
              setForm({ ...form, served_quantity: e.target.value, remaining_quantity: Math.max(0, prepared - v) });
            }} />
          </label>
          <label>Descartado
            <input className="input" type="number" min="0" value={form.discarded_quantity} onChange={(e) => setForm({ ...form, discarded_quantity: e.target.value })} />
          </label>
          <label>Sobra (automático)</label>
          <div className="auto-value">{formatNumber(tankFormatter().remaining)} porções</div>
          <label className="full">Notas
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="form-actions full">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Salvar</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

