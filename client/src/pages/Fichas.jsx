import React, { useEffect, useState } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Eye } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, formatNumber } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';

export default function Fichas() {
  const { can } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [foods, setFoods] = useState([]);
  const [mealTypes, setMealTypes] = useState([]);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', meal_type_id: '', servings: '', instructions: '', observations: '', ingredients: [] });

  async function load() {
    try {
      const [recs, foodsRes, mts] = await Promise.all([api.get('/fichas'), api.get('/alimentos'), api.get('/tipos-refeicao')]);
      setRecipes(recs.data);
      setFoods(foodsRes.data);
      setMealTypes(mts.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar fichas.'));
    }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ name: '', meal_type_id: '', servings: '', instructions: '', observations: '', ingredients: [{ food_id: '', quantity_per_serving: '', unit: 'kg', notes: '' }] });
    setOpen(true);
  }
  function openEdit(r) {
    setEditing(r);
    setForm({
      name: r.name, meal_type_id: r.meal_type_id || '', servings: r.servings || '', instructions: r.instructions || '',
      observations: r.observations || '',
      ingredients: (r.ingredients || []).map((i) => ({ id: i.id, food_id: i.food_id, quantity_per_serving: i.quantity_per_serving, unit: i.unit || 'kg', notes: i.notes || '' })),
    });
    setOpen(true);
  }

  function setIng(idx, field, value) {
    const ings = [...form.ingredients];
    ings[idx] = { ...ings[idx], [field]: value };
    setForm({ ...form, ingredients: ings });
  }
  function addIng() {
    setForm({ ...form, ingredients: [...form.ingredients, { food_id: '', quantity_per_serving: '', unit: 'kg', notes: '' }] });
  }
  function remIng(idx) {
    setForm({ ...form, ingredients: form.ingredients.filter((_, i) => i !== idx) });
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form, servings: Number(form.servings) || 1 };
      if (editing) await api.put(`/fichas/${editing.id}`, payload);
      else await api.post('/fichas', payload);
      setOpen(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao salvar ficha.'));
    }
  }

  return (
    <div>
      <PageHeader
        title="Fichas Técnicas"
        subtitle="Receitas com ingredientes, porções e modo de preparo — base do cálculo automático de consumo"
        actions={
          can('fichas', 'can_create') && (
            <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Nova ficha</button>
          )
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card-grid recipes">
        {recipes.map((r) => (
          <div key={r.id} className="card recipe-card">
            <div className="recipe-head">
              <span className="recipe-icon"><BookOpen size={20} /></span>
              <div>
                <h3>{r.name}</h3>
                {r.meal_type_name && <Badge tone="teal">{r.meal_type_name}</Badge>}
              </div>
            </div>
            <p className="muted">Rende: {r.servings} porções · {r.ingredients?.length || 0} ingredientes</p>
            <div className="recipe-ing-list">
              {(r.ingredients || []).slice(0, 4).map((i) => (
                <span key={i.id} className="ing-chip">{i.food_name} <strong>{formatNumber(i.quantity_per_serving)} {i.unit}</strong></span>
              ))}
              {(r.ingredients || []).length > 4 && <span className="muted">+{(r.ingredients || []).length - 4} ingredientes</span>}
            </div>
            <div className="recipe-actions">
              <button className="btn btn-outline" onClick={() => setViewing(r)}><Eye size={15} /> Ver</button>
              {can('fichas', 'can_edit') && <button className="btn btn-outline" onClick={() => openEdit(r)}><Pencil size={15} /> Editar</button>}
              {can('fichas', 'can_delete') && <button className="btn btn-outline danger" onClick={async () => { if (confirm('Excluir ficha?')) { await api.delete(`/fichas/${r.id}`); load(); } }}><Trash2 size={15} /></button>}
            </div>
          </div>
        ))}
      </div>

      {/* Visualizar ficha */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name || 'Ficha técnica'} size="lg">
        {viewing && (
          <div>
            <p><Badge tone="teal">{viewing.meal_type_name || '—'}</Badge> Rende {viewing.servings} porções</p>
            <h4>Ingredientes</h4>
            <table className="table">
              <thead><tr><th>Ingrediente</th><th>Por pessoa</th><th>Notas</th></tr></thead>
              <tbody>
                {(viewing.ingredients || []).map((i) => (
                  <tr key={i.id}><td>{i.food_name}</td><td>{formatNumber(i.quantity_per_serving)} {i.unit}</td><td>{i.notes}</td></tr>
                ))}
              </tbody>
            </table>
            <h4>Modo de preparo</h4>
            <p>{viewing.instructions || '—'}</p>
            {viewing.observations && <><h4>Observações</h4><p>{viewing.observations}</p></>}
          </div>
        )}
      </Modal>

      {/* Editar/criar ficha */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar ficha' : 'Nova ficha técnica'} size="xl">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={save} className="form-grid">
          <label>Nome da preparação
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>Tipo de refeição
            <select className="input" value={form.meal_type_id} onChange={(e) => setForm({ ...form, meal_type_id: e.target.value })}>
              <option value="">—</option>
              {mealTypes.map((mt) => <option key={mt.id} value={mt.id}>{mt.name}</option>)}
            </select>
          </label>
          <label>Porções (rendimento)
            <input className="input" type="number" min="1" value={form.servings} onChange={(e) => setForm({ ...form, servings: e.target.value })} />
          </label>

          <div className="full">
            <div className="section-title">
              <h4>Ingredientes (quantidade por pessoa)</h4>
              <button type="button" className="btn btn-outline" onClick={addIng}><Plus size={14} /> Adicionar</button>
            </div>
            {form.ingredients.map((ing, idx) => (
              <div key={idx} className="ing-row">
                <select className="input" value={ing.food_id} onChange={(e) => setIng(idx, 'food_id', e.target.value)} required>
                  <option value="">Alimento…</option>
                  {foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <input className="input" type="number" step="0.001" min="0" placeholder="Qtd por pessoa" value={ing.quantity_per_serving} onChange={(e) => setIng(idx, 'quantity_per_serving', e.target.value)} required />
                <select className="input" value={ing.unit} onChange={(e) => setIng(idx, 'unit', e.target.value)}>
                  {['kg', 'g', 'L', 'mL', 'un'].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <button type="button" className="icon-btn danger" onClick={() => remIng(idx)}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>

          <label className="full">Modo de preparo
            <textarea className="input" rows="4" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          </label>
          <label className="full">Observações
            <textarea className="input" rows="2" value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
          </label>

          <div className="form-actions full">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Salvar ficha</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

