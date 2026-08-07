import React, { useEffect, useState } from 'react';
import { Apple, Plus, Pencil, Trash2, Search } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, formatCurrency, formatNumber } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';

const UNITS = ['kg', 'g', 'L', 'mL', 'un'];

export default function Alimentos() {
  const { can } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', category_id: '', unit: 'kg', barcode: '', brand: '', storage_location: '',
    avg_price: '', min_stock: '', ideal_stock: '', photo: '',
  });

  async function load() {
    try {
      const [foodsRes, catsRes] = await Promise.all([api.get('/alimentos'), api.get('/categorias')]);
      setItems(foodsRes.data);
      setCategories(catsRes.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar alimentos.'));
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = items.filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.barcode && i.barcode.includes(search))
  );

  function openNew() {
    setEditing(null);
    setForm({ name: '', category_id: '', unit: 'kg', barcode: '', brand: '', storage_location: '', avg_price: '', min_stock: '', ideal_stock: '', photo: '' });
    setOpen(true);
  }
  function openEdit(item) {
    setEditing(item);
    setForm({ name: item.name, category_id: item.category_id || '', unit: item.unit, barcode: item.barcode || '', brand: item.brand || '', storage_location: item.storage_location || '', avg_price: item.avg_price, min_stock: item.min_stock, ideal_stock: item.ideal_stock, photo: item.photo || '' });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      if (editing) await api.put(`/alimentos/${editing.id}`, form);
      else await api.post('/alimentos', form);
      setOpen(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao salvar.'));
    }
  }

  async function remove(item) {
    if (!confirm(`Desativar ${item.name}?`)) return;
    try {
      await api.delete(`/alimentos/${item.id}`);
      load();
    } catch (err) {
      alert(getErrMsg(err, 'Erro ao excluir.'));
    }
  }

  return (
    <div>
      <PageHeader
        title="Alimentos"
        subtitle="Cadastro de alimentos utilizados na alimentação escolar"
        actions={
          can('alimentos', 'can_create') && (
            <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Novo alimento</button>
          )
        }
      />

      <div className="card">
        <div className="card-header">
          <h3><Apple size={18} /> {filtered.length} alimentos</h3>
          <div className="search-box">
            <Search size={16} />
            <input className="input" placeholder="Buscar por nome ou código de barras" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Alimento</th><th>Categoria</th><th>Un.</th><th>Código de barras</th><th>Estoque</th><th>Preço médio</th><th>Mínimo</th>{can('alimentos', 'can_edit') && <th></th>}</tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.name}</strong>{i.storage_location && <small className="muted block">📦 {i.storage_location}</small>}</td>
                  <td><Badge tone="teal">{i.category_name || '—'}</Badge></td>
                  <td>{i.unit}</td>
                  <td className="mono">{i.barcode || '—'}</td>
                  <td>
                    {formatNumber(i.stock_quantity)}{' '}{i.unit}
                    {i.stock_quantity <= i.min_stock && <div><Badge tone="danger">Estoque baixo</Badge></div>}
                  </td>
                  <td>{formatCurrency(i.avg_price)}</td>
                  <td>{formatNumber(i.min_stock)} {i.unit}</td>
                  {can('alimentos', 'can_edit') && (
                    <td className="ta-right">
                      <button className="icon-btn" onClick={() => openEdit(i)}><Pencil size={15} /></button>
                      {can('alimentos', 'can_delete') && <button className="icon-btn danger" onClick={() => remove(i)}><Trash2 size={15} /></button>}
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan="8" className="empty-cell">Nenhum alimento encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar alimento' : 'Novo alimento'} size="lg">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={save} className="form-grid">
          <label className="full">Nome
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>Categoria
            <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Unidade
            <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label>Código de barras
            <input className="input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="789..." />
          </label>
          <label>Marca
            <input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </label>
          <label>Local de armazenamento
            <input className="input" value={form.storage_location} onChange={(e) => setForm({ ...form, storage_location: e.target.value })} placeholder="Despensa A1" />
          </label>
          <label>Preço médio (R$)
            <input className="input" type="number" step="0.01" value={form.avg_price} onChange={(e) => setForm({ ...form, avg_price: e.target.value })} />
          </label>
          <label>Estoque mínimo
            <input className="input" type="number" step="0.1" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
          </label>
          <label>Estoque ideal
            <input className="input" type="number" step="0.1" value={form.ideal_stock} onChange={(e) => setForm({ ...form, ideal_stock: e.target.value })} />
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

