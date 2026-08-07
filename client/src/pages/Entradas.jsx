import React, { useEffect, useState } from 'react';
import { PackagePlus, Plus, History } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, formatCurrency, formatDateBR, formatDateTime, formatNumber } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';

const REASONS = ['compra', 'doacao', 'transferencia', 'reposicao', 'outro'];

export default function Entradas() {
  const { can } = useAuth();
  const [foods, setFoods] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ food_id: '', quantity: '', batch_number: '', expiry_date: '', supplier_id: '', unit_cost: '', reason: 'compra', responsible: '', notes: '' });

  async function load() {
    try {
      const [foodsRes, supRes, movRes] = await Promise.all([
        api.get('/alimentos'), api.get('/fornecedores'), api.get('/estoque/movimentos', { params: { limit: 100 } }),
      ]);
      setFoods(foodsRes.data);
      setSuppliers(supRes.data);
      setMovements(movRes.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar entrada.'));
    }
  }
  useEffect(() => { load(); }, []);

  const entradas = movements.filter((m) => m.movement_type === 'entrada');

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/estoque/entrada', form);
      setOpen(false);
      setForm({ food_id: '', quantity: '', batch_number: '', expiry_date: '', supplier_id: '', unit_cost: '', reason: 'compra', responsible: '', notes: '' });
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao registrar entrada.'));
    }
  }

  return (
    <div>
      <PageHeader
        title="Entrada de Alimentos"
        subtitle="Compras, doações, transferências, reposições e outros"
        actions={
          can('entradas', 'can_create') && (
            <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Nova entrada</button>
          )
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <div className="card-header"><h3><History size={18} /> Histórico de entradas</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Data</th><th>Alimento</th><th>Tipo</th><th>Quantidade</th><th>Lote</th><th>Validade</th><th>Valor</th><th>Fornecedor</th><th>Responsável</th></tr>
            </thead>
            <tbody>
              {entradas.slice(0, 60).map((m) => (
                <tr key={m.id}>
                  <td>{formatDateTime(m.created_at)}</td>
                  <td><strong>{m.food_name}</strong></td>
                  <td><Badge tone={m.reason === 'compra' ? 'teal' : 'blue'}>{m.reason}</Badge></td>
                  <td>{formatNumber(m.quantity)} {m.unit}</td>
                  <td className="mono">{m.batch_number || '—'}</td>
                  <td>{m.expiry_date ? formatDateBR(m.expiry_date) : '—'}</td>
                  <td>{formatCurrency(m.total_cost)}</td>
                  <td>{m.supplier_name || '—'}</td>
                  <td><small>{m.responsible}</small></td>
                </tr>
              ))}
              {entradas.length === 0 && <tr><td colSpan="9" className="empty-cell">Nenhuma entrada registrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Nova entrada de alimento" size="lg">
        <form onSubmit={save} className="form-grid">
          <label className="full">Alimento
            <select className="input" value={form.food_id} onChange={(e) => setForm({ ...form, food_id: e.target.value })} required>
              <option value="">Selecione…</option>
              {foods.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.unit})</option>)}
            </select>
          </label>
          <label>Tipo de entrada
            <select className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label>Quantidade
            <input className="input" type="number" step="0.1" min="0.1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </label>
          <label>Lote
            <input className="input" value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} placeholder="L2026-01" />
          </label>
          <label>Validade
            <input className="input" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
          </label>
          <label>Fornecedor
            <select className="input" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Custo unitário (R$)
            <input className="input" type="number" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
          </label>
          <label>Responsável
            <input className="input" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
          </label>
          <label className="full">Observações
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="form-actions full">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary"><PackagePlus size={16} /> Registrar entrada</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

