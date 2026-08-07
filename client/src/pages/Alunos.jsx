import React, { useEffect, useState } from 'react';
import { Users, Plus, Pencil } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, formatNumber } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';

const SHIFTS = [
  { value: 'manha', label: 'Manhã' },
  { value: 'tarde', label: 'Tarde' },
  { value: 'integral', label: 'Integral' },
];

export default function Alunos() {
  const { can } = useAuth();
  const [data, setData] = useState({ rows: [], totals: [] });
  const [year, setYear] = useState(new Date().getFullYear());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ school_year: new Date().getFullYear(), shift: 'manha', total_students: '', estimated_meals_per_day: '', notes: '' });
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await api.get('/alunos');
      setData(res.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar alunos.'));
    }
  }
  useEffect(() => { load(); }, []);

  const rows = data.rows.filter((r) => r.school_year === Number(year));
  const totalRow = data.totals.find((t) => t.school_year === Number(year));

  function openNew() {
    setEditing(null);
    setForm({ school_year: Number(year), shift: 'manha', total_students: '', estimated_meals_per_day: '', notes: '' });
    setOpen(true);
  }
  function openEdit(row) {
    setEditing(row);
    setForm({ school_year: row.school_year, shift: row.shift, total_students: row.total_students, estimated_meals_per_day: row.estimated_meals_per_day, notes: row.notes || '' });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        await api.put(`/alunos/${editing.id}`, form);
      } else {
        await api.post('/alunos', form);
      }
      setOpen(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao salvar.'));
    }
  }

  return (
    <div>
      <PageHeader
        title="Cadastro de Alunos"
        subtitle="Resumo de alunos atendidos por turno e planejamento de refeições"
        actions={
          can('alunos', 'can_create') && (
            <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Novo</button>
          )
        }
      />

      <div className="card">
        <div className="card-header">
          <h3><Users size={18} /> Alunos por turno</h3>
          <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
            {[...new Set([...data.totals.map((t) => t.school_year), new Date().getFullYear()])].sort((a, b) => b - a).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Turno</th><th>Total de alunos</th><th>Refeições estimadas/dia</th><th>Observações</th>{can('alunos', 'can_edit') && <th></th>}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Badge tone="teal">{SHIFTS.find((s) => s.value === r.shift)?.label || r.shift}</Badge></td>
                  <td>{formatNumber(r.total_students)}</td>
                  <td>{formatNumber(r.estimated_meals_per_day)}</td>
                  <td>{r.notes}</td>
                  {can('alunos', 'can_edit') && (
                    <td className="ta-right">
                      <button className="icon-btn" onClick={() => openEdit(r)}><Pencil size={15} /></button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan="5" className="empty-cell">Nenhum registro para {year}.</td></tr>
              )}
            </tbody>
            {totalRow && (
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th>{formatNumber(totalRow.total)}</th>
                  <th>{formatNumber(totalRow.meals)}</th>
                  <th colSpan="2"></th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar turno' : 'Novo turno de alunos'}>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={save} className="form-grid">
          <label>Ano letivo
            <input className="input" type="number" value={form.school_year} onChange={(e) => setForm({ ...form, school_year: e.target.value })} required />
          </label>
          <label>Turno
            <select className="input" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} disabled={!!editing}>
              {SHIFTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label>Total de alunos
            <input className="input" type="number" min="0" value={form.total_students} onChange={(e) => setForm({ ...form, total_students: e.target.value })} required />
          </label>
          <label>Refeições estimadas por dia
            <input className="input" type="number" min="0" value={form.estimated_meals_per_day} onChange={(e) => setForm({ ...form, estimated_meals_per_day: e.target.value })} required />
          </label>
          <label className="full">Observações
            <textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

