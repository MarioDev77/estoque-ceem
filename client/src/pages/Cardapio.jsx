import React, { useEffect, useMemo, useState } from 'react';
import { UtensilsCrossed, Plus, CalendarRange, CheckCircle2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, today, addDays, formatDateBR } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function Cardapio() {
  const { can } = useAuth();
  const [data, setData] = useState({ menus: [], calendar: [], school: null });
  const [foods, setFoods] = useState([]);
  const [mealTypes, setMealTypes] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [open, setOpen] = useState(false);
  const [openPlan, setOpenPlan] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ date: today(), meals: [{ meal_type_id: '2', title: 'Almoço', expected_students: 750, items: [] }] });
  const [planForm, setPlanForm] = useState({ start: today(), end: addDays(today(), 14), recipe_id: '', meal_type_id: '2', students: 750 });

  const { year, month } = currentMonth;

  async function load() {
    try {
      const res = await api.get('/cardapios/mes', { params: { year, month } });
      setData(res.data);
      const [fRes, mtRes] = await Promise.all([api.get('/alimentos'), api.get('/tipos-refeicao')]);
      setFoods(fRes.data);
      setMealTypes(mtRes.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar cardápio.'));
    }
  }
  useEffect(() => { load(); }, [year, month]);

  const menusByDate = useMemo(() => {
    const map = {};
    for (const m of data.menus) {
      if (!map[m.date]) map[m.date] = [];
      map[m.date].push(m);
    }
    return map;
  }, [data.menus]);

  const calendarByDate = useMemo(() => {
    const map = {};
    for (const c of data.calendar) map[c.date] = c;
    return map;
  }, [data.calendar]);

  // Grid do mês
  const days = useMemo(() => {
    const lastDay = new Date(year, month, 0).getDate();
    const firstDow = new Date(year, month - 1, 1).getDay();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= lastDay; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  function changeMonth(delta) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setCurrentMonth({ year: y, month: m });
  }

  const dateKey = (d) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const mealTypeName = (id) => mealTypes.find((mt) => mt.id === Number(id))?.name || '';

  function openNewDay(date) {
    const dStr = `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    setForm({ date: dStr, meals: [{ meal_type_id: '2', title: 'Almoço', expected_students: 750, items: [] }] });
    setOpen(true);
  }

  function setMeal(idx, field, value) {
    const meals = [...form.meals];
    meals[idx] = { ...meals[idx], [field]: value };
    setForm({ ...form, meals });
  }
  function setItem(mealIdx, itemIdx, field, value) {
    const meals = [...form.meals];
    const items = [...meals[mealIdx].items];
    items[itemIdx] = { ...items[itemIdx], [field]: value };
    meals[mealIdx] = { ...meals[mealIdx], items };
    setForm({ ...form, meals });
  }
  function addMeal() {
    setForm({ ...form, meals: [...form.meals, { meal_type_id: '1', title: 'Lanche da manhã', expected_students: 750, items: [] }] });
  }
  function addItem(mealIdx) {
    const meals = [...form.meals];
    meals[mealIdx] = { ...meals[mealIdx], items: [...meals[mealIdx].items, { food_id: '', portion_per_student: '' }] };
    setForm({ ...form, meals });
  }
  function remItem(mealIdx, itemIdx) {
    const meals = [...form.meals];
    meals[mealIdx] = { ...meals[mealIdx], items: meals[mealIdx].items.filter((_, i) => i !== itemIdx) };
    setForm({ ...form, meals });
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/cardapios', form);
      setOpen(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao salvar cardápio.'));
    }
  }
  async function savePlan(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/cardapios/planejar', planForm);
      alert(`Cardápio planejado para ${res.data.created} dias letivos!`);
      setOpenPlan(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao planejar cardápio.'));
    }
  }

  const statusBadge = (status) => {
    const cfg = { planejado: { tone: 'blue', label: '🟢 Planejado' }, confirmado: { tone: 'orange', label: 'Confirmação' }, realizado: { tone: 'green', label: 'Realizado' }, cancelado: { tone: 'neutral', label: 'Cancelado' } };
    return cfg[status] || cfg.planejado;
  };

  return (
    <div>
      <PageHeader
        title="Cardápio e Calendário de Refeições"
        subtitle="Planejamento diário, semanal e mensal das refeições"
        actions={
          <div className="row-actions">
            <button className="btn btn-outline" onClick={() => { setPlanForm({ ...planForm, start: today(), end: addDays(today(), 14) }); setOpenPlan(true); }}><CalendarRange size={16} /> Planejar período</button>
            {can('cardapio', 'can_create') && <button className="btn btn-primary" onClick={() => openNewDay(new Date().getDate())}><Plus size={16} /> Novo dia</button>}
          </div>
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <div className="card-header">
          <div className="picker">
            <button className="icon-btn" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button>
            <h3>{['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][month - 1]} {year}</h3>
            <button className="icon-btn" onClick={() => changeMonth(1)}><ChevronRight size={18} /></button>
          </div>
        </div>

        <div className="meal-calendar">
          <div className="mc-header">
            {WEEKDAYS.map((w, i) => <div key={i} className="mc-dow">{w}</div>)}
          </div>
          <div className="mc-grid">
            {days.map((d, idx) => {
              if (d === null) return <div key={`e${idx}`} className="mc-cell empty" />;
              const k = dateKey(d);
              const menus = menusByDate[k] || [];
              const cal = calendarByDate[k];
              const isToday = k === today();
              return (
                <div key={k} className={`mc-cell ${isToday ? 'today' : ''} ${cal ? `cal-${cal.day_type}` : ''}`}>
                  <div className="mc-cell-head">
                    <span className="mc-num">{d}</span>
                    {(can('cardapio', 'can_create')) && <button className="icon-btn" onClick={() => openNewDay(d)}><Plus size={13} /></button>}
                  </div>
                  {cal && cal.day_type !== 'letivo' && <small className="mc-cal-label">{cal.day_type.replace('_', ' ')}</small>}
                  {menus.map((m) => (
                    <div key={m.id} className="mc-meal">
                      <span className="mc-meal-type">{m.meal_type_name}</span>
                      <small>{m.items}</small>
                      <Badge tone={statusBadge(m.status).tone}>{statusBadge(m.status).label}</Badge>
                      {m.expected_students > 0 && <small className="muted">{m.expected_students} refeições</small>}
                    </div>
                  ))}
                  {menus.length === 0 && cal?.day_type !== 'ferias' && <small className="muted">Sem cardápio</small>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Novo dia */}
      <Modal open={open} onClose={() => setOpen(false)} title={`Cardápio de ${formatDateBR(form.date)}`} size="xl">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={save}>
          {form.meals.map((meal, mi) => (
            <div key={mi} className="meal-block">
              <div className="meal-block-head">
                <h4>Refeição {mi + 1}</h4>
                <button type="button" className="icon-btn danger" onClick={() => mi > 0 && setForm({ ...form, meals: form.meals.filter((_, i) => i !== mi) })}>✕</button>
              </div>
              <div className="form-grid">
                <label>Tipo
                  <select className="input" value={meal.meal_type_id} onChange={(e) => setMeal(mi, 'meal_type_id', e.target.value)}>
                    {mealTypes.map((mt) => <option key={mt.id} value={mt.id}>{mt.name}</option>)}
                  </select>
                </label>
                <label>Título
                  <input className="input" value={meal.title} onChange={(e) => setMeal(mi, 'title', e.target.value)} />
                </label>
                <label>Alunos estimados
                  <input className="input" type="number" min="0" value={meal.expected_students} onChange={(e) => setMeal(mi, 'expected_students', e.target.value)} />
                </label>
              </div>
              <div className="ing-row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => addItem(mi)}><Plus size={14} /> Alimento</button>
              </div>
              {meal.items.map((item, ii) => (
                <div key={ii} className="ing-row">
                  <select className="input" value={item.food_id} onChange={(e) => setItem(mi, ii, 'food_id', e.target.value)} required>
                    <option value="">Alimento…</option>
                    {foods.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.unit})</option>)}
                  </select>
                  <input className="input" type="number" step="0.001" min="0" placeholder="Porção/aluno (ex.: 0.1 = 100g)" value={item.portion_per_student} onChange={(e) => setItem(mi, ii, 'portion_per_student', e.target.value)} required />
                  <button type="button" className="icon-btn danger" onClick={() => remItem(mi, ii)}>✕</button>
                </div>
              ))}
            </div>
          ))}
          <div className="form-actions" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-outline" onClick={addMeal}><Plus size={14} /> Adicionar refeição</button>
            <div>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Salvar cardápio</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Planejar período */}
      <Modal open={openPlan} onClose={() => setOpenPlan(false)} title="Planejar cardápio de um período" size="lg">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={savePlan} className="form-grid">
          <label>Data inicial
            <input className="input" type="date" value={planForm.start} onChange={(e) => setPlanForm({ ...planForm, start: e.target.value })} required />
          </label>
          <label>Data final
            <input className="input" type="date" value={planForm.end} onChange={(e) => setPlanForm({ ...planForm, end: e.target.value })} required />
          </label>
          <label>Ficha técnica (refeição)
            <select className="input" value={planForm.recipe_id} onChange={(e) => setPlanForm({ ...planForm, recipe_id: e.target.value })} required>
              <option value="">Selecione…</option>
              {data.menus.length >= 0 && <option value="1">Arroz com frango</option>}
            </select>
          </label>
          <label>Tipo de refeição
            <select className="input" value={planForm.meal_type_id} onChange={(e) => setPlanForm({ ...planForm, meal_type_id: e.target.value })}>
              {mealTypes.map((mt) => <option key={mt.id} value={mt.id}>{mt.name}</option>)}
            </select>
          </label>
          <label>Quantidade de alunos
            <input className="input" type="number" min="0" value={planForm.students} onChange={(e) => setPlanForm({ ...planForm, students: e.target.value })} />
          </label>
          <div className="full info-tip">
            <CheckCircle2 size={16} />
            <p><strong>Atenção:</strong> o sistema criará o cardápio automaticamente para todos os dias letivos do período, calculando as quantidades necessárias a partir da ficha técnica (porção × alunos).</p>
          </div>
          <div className="form-actions full">
            <button type="button" className="btn" onClick={() => setOpenPlan(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary"><CalendarRange size={16} /> Planejar</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

