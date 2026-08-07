import React, { useEffect, useState } from 'react';
import { CalendarDays, Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, formatDateBR } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';

const DAY_TYPES = [
  { value: 'letivo', label: 'Dia letivo', tone: 'green' },
  { value: 'ferias', label: 'Férias', tone: 'blue' },
  { value: 'feriado', label: 'Feriado', tone: 'orange' },
  { value: 'recesso', label: 'Recesso', tone: 'purple' },
  { value: 'evento', label: 'Evento escolar', tone: 'teal' },
  { value: 'sem_alimentacao', label: 'Sem alimentação', tone: 'neutral' },
];

export default function Calendario() {
  const { can } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState({ rows: [], summary: [] });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ school_year: new Date().getFullYear(), date: '', day_type: 'letivo', description: '' });
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await api.get('/calendario', { params: { year } });
      setData(res.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar calendário.'));
    }
  }
  useEffect(() => { load(); }, [year]);

  function openNew() {
    setEditing(null);
    setForm({ school_year: Number(year), date: '', day_type: 'letivo', description: '' });
    setOpen(true);
  }
  function openEdit(r) {
    setEditing(r);
    setForm({ school_year: r.school_year, date: r.date, day_type: r.day_type, description: r.description || '' });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        await api.put(`/calendario/${editing.id}`, form);
      } else {
        await api.post('/calendario', form);
      }
      setOpen(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao salvar.'));
    }
  }

  async function remove(r) {
    if (!confirm('Excluir este dia do calendário?')) return;
    try {
      await api.delete(`/calendario/${r.id}`);
      load();
    } catch (err) {
      alert(getErrMsg(err, 'Erro ao excluir.'));
    }
  }

  // Agrupa por mês
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div>
      <PageHeader
        title="Calendário Escolar"
        subtitle="Dias letivos, férias, feriados, recessos e eventos — usados automaticamente no planejamento de refeições"
        actions={
          <div className="row-actions">
            <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
              {[new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {can('calendario', 'can_create') && (
              <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Novo</button>
            )}
          </div>
        }
      />

      <div className="summary-strip">
        {['letivo', 'ferias', 'feriado', 'recesso', 'evento', 'sem_alimentacao'].map((t) => {
          const item = data.summary.find((s) => s.day_type === t);
          const def = DAY_TYPES.find((d) => d.value === t);
          return (
            <div key={t} className="summary-item">
              <Badge tone={def?.tone}>{def?.label}</Badge>
              <strong>{item ? item.count : 0}</strong>
            </div>
          );
        })}
      </div>

      {/* Visão mensal */}
      {months.map((m) => {
        const days = data.rows.filter((r) => Number(r.date.slice(5, 7)) === m);
        if (days.length === 0) return null;
        return (
          <div key={m} className="card">
            <div className="card-header">
              <h3><CalendarDays size={18} /> {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][m - 1]} {year}</h3>
              <Badge tone="teal">{days.filter((d) => d.day_type === 'letivo').length} dias letivos</Badge>
            </div>
            <div className="calendar-compact">
              {days.map((d) => {
                const def = DAY_TYPES.find((x) => x.value === d.day_type);
                return (
                  <div key={d.id} className={`cal-day cal-${d.day_type}`}>
                    <span className="cal-num">{formatDateBR(d.date)}</span>
                    <Badge tone={def?.tone}>{def?.label}</Badge>
                    {d.description && <small>{d.description}</small>}
                    {(can('calendario', 'can_edit') || can('calendario', 'can_delete')) && (
                      <div className="cal-actions">
                        {can('calendario', 'can_edit') && <button className="icon-btn" onClick={() => openEdit(d)}><Pencil size={13} /></button>}
                        {can('calendario', 'can_delete') && <button className="icon-btn danger" onClick={() => remove(d)}><Trash2 size={13} /></button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {data.rows.length === 0 && (
        <div className="card empty-state">
          <CalendarDays size={40} />
          <h3>Nenhum registro no calendário de {year}</h3>
          <p>Adicione dias letivos, férias e feriados para o planejamento automático de refeições.</p>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar dia' : 'Novo dia'}>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={save} className="form-grid">
          <label>Data
            <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </label>
          <label>Tipo
            <select className="input" value={form.day_type} onChange={(e) => setForm({ ...form, day_type: e.target.value })}>
              {DAY_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          <label className="full">Descrição
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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

