import React, { useEffect, useState } from 'react';
import { HandPlatter, Plus, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, today, formatCurrency, formatDateBR, formatNumber } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';

export default function Consumo() {
  const { can } = useAuth();
  const [fichas, setFichas] = useState([]);
  const [mealTypes, setMealTypes] = useState([]);
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ date: today(), recipe_id: '', meal_type_id: '2', served_students: 400, items: [], notes: '' });
  const [preview, setPreview] = useState(null);

  async function load() {
    try {
      const [ficRes, mtRes, histRes] = await Promise.all([
        api.get('/fichas'), api.get('/tipos-refeicao'), api.get('/consumo', { params: { start: '1900-01-01', end: '2100-12-31' } }),
      ]);
      setFichas(ficRes.data);
      setMealTypes(mtRes.data);
      setHistory(histRes.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar consumo.'));
    }
  }
  useEffect(() => { load(); }, []);

  async function handlePreview() {
    setError('');
    try {
      const body = formulaBody();
      const res = await api.post('/consumo/simular', body);
      setPreview(res.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao simular consumo.'));
    }
  }

  function formulaBody() {
    if (form.recipe_id) return { recipe_id: Number(form.recipe_id), students: Number(form.served_students) };
    return { meal_type_id: form.meal_type_id, students: Number(form.served_students), items: form.items };
  }

  async function confirmar() {
    setError('');
    try {
      const payload = {
        date: form.date, meal_type_id: Number(form.meal_type_id), served_students: Number(form.served_students),
        recipe_id: form.recipe_id ? Number(form.recipe_id) : null,
        items: form.recipe_id ? undefined : form.items.filter((i) => i.food_id),
        notes: form.notes,
      };
      await api.post('/consumo', payload);
      alert('Refeição registrada! Estoque atualizado automaticamente (FEFO).');
      setOpen(false);
      setPreview(null);
      load();
    } catch (err) {
      const data = err.response?.data;
      if (data?.insufficient) {
        setError(data.error);
      } else {
        setError(getErrMsg(err, 'Erro ao registrar consumo.'));
      }
    }
  }

  const allSufficient = !preview || preview.items.every((i) => i.sufficient);

  return (
    <div>
      <PageHeader
        title="Registro de Consumo"
        subtitle="Refeições realizadas — calcula e debita automaticamente os ingredientes (FEFO)"
        actions={
          can('consumo', 'can_create') && (
            <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Registrar refeição</button>
          )
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <div className="card-header"><h3><HandPlatter size={18} /> Refeições realizadas</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Data</th><th>Tipo</th><th>Servidas</th><th>Planejadas</th><th>Ficha/Receita</th><th>Consumo</th><th>Registrado por</th></tr>
            </thead>
            <tbody>
              {history.slice(0, 50).map((m) => (
                <tr key={m.id}>
                  <td>{formatDateBR(m.date)}</td>
                  <td><Badge tone="teal">{m.meal_type_name}</Badge></td>
                  <td><strong>{formatNumber(m.served_students)}</strong></td>
                  <td>{formatNumber(m.planned_students)}</td>
                  <td>{m.recipe_name || '—'}</td>
                  <td>{formatNumber(m.total_kg)} kg <small className="muted">({m.items_count} itens)</small></td>
                  <td><small>{m.registered_by_name}</small></td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan="7" className="empty-cell">Nenhuma refeição registrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => { setOpen(false); setPreview(null); }} title="Registrar refeição realizada" size="xl">
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="form-grid">
          <label>Data
            <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <label>Tipo de refeição
            <select className="input" value={form.meal_type_id} onChange={(e) => setForm({ ...form, meal_type_id: e.target.value })}>
              {mealTypes.map((mt) => <option key={mt.id} value={mt.id}>{mt.name}</option>)}
            </select>
          </label>
          <label>Quantidade servida (alunos)
            <input className="input" type="number" min="0" value={form.served_students} onChange={(e) => setForm({ ...form, served_students: e.target.value })} />
          </label>
          <label>Ficha técnica
            <select className="input" value={form.recipe_id} onChange={(e) => setForm({ ...form, recipe_id: e.target.value })}>
              <option value="">—</option>
              {fichas.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <div className="full">
            <button type="button" className="btn btn-outline" onClick={handlePreview}><CheckCircle2 size={15} /> Simular consumo</button>
            {preview && <span className="muted" style={{ marginLeft: 10 }}>{preview.items.length} ingredientes · custo estimado <strong>{formatCurrency(preview.totalCost)}</strong></span>}
          </div>

          {preview && (
            <div className="full preview-box">
              <h4>Esta refeição consumirá:</h4>
              {preview.items.map((i) => (
                <div key={i.food_id} className={`preview-item ${i.sufficient ? 'ok' : 'no'}`}>
                  <span className="preview-ico">{i.sufficient ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</span>
                  <span><strong>{formatNumber(i.quantity)} {i.unit}</strong> de {i.food_name}</span>
                  <span className="muted">Estoque: {formatNumber(i.available)} {i.unit}</span>
                  {!i.sufficient && <Badge tone="danger">Insuficiente</Badge>}
                </div>
              ))}
            </div>
          )}

          {preview && !allSufficient && (
            <div className="full alert alert-warning">
              <AlertTriangle size={16} /> Alguns ingredientes não possuem estoque suficiente. Você pode registrar mesmo assim (será gerada falta) ou ajustar a quantidade servida.
            </div>
          )}

          <label className="full">Observações
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ex.: almoço de 400 alunos" />
          </label>

          <div className="form-actions full">
            <button type="button" className="btn" onClick={() => { setOpen(false); setPreview(null); }}>Cancelar</button>
            <button type="button" className="btn btn-success" onClick={confirmar}>Confirmar e debitar estoque</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

