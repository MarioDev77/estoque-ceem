import React, { useEffect, useState } from 'react';
import { Truck, Plus, Pencil, Trash2, Phone, Mail, MapPin } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, formatCurrency, formatDateBR } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';

export default function Fornecedores() {
  const { can } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', cnpj: '', phone: '', email: '', address: '', products_supplied: '' });

  async function load() {
    try {
      const res = await api.get('/fornecedores');
      setSuppliers(res.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar fornecedores.'));
    }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ name: '', cnpj: '', phone: '', email: '', address: '', products_supplied: '' });
    setOpen(true);
  }
  function openEdit(s) {
    setEditing(s);
    setForm({ name: s.name, cnpj: s.cnpj || '', phone: s.phone || '', email: s.email || '', address: s.address || '', products_supplied: s.products_supplied || '' });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      if (editing) await api.put(`/fornecedores/${editing.id}`, form);
      else await api.post('/fornecedores', form);
      setOpen(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao salvar.'));
    }
  }

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        subtitle="Cadastro, produtos fornecidos e histórico de compras"
        actions={
          can('fornecedores', 'can_create') && (
            <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Novo fornecedor</button>
          )
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card-grid suppliers">
        {suppliers.map((s) => (
          <div key={s.id} className="card supplier-card">
            <div className="supplier-head">
              <span className="supplier-icon"><Truck size={20} /></span>
              <div>
                <h3>{s.name}</h3>
                <small className="muted">{s.cnpj}</small>
              </div>
            </div>
            <div className="supplier-info">
              {s.phone && <span><Phone size={13} /> {s.phone}</span>}
              {s.email && <span><Mail size={13} /> {s.email}</span>}
              {s.address && <span><MapPin size={13} /> {s.address}</span>}
            </div>
            <small className="muted">Produtos: {s.products_supplied || '—'}</small>
            <small className="muted block">Compras: {s.purchase_count || 0} · Total {formatCurrency(s.purchase_total)}</small>
            {can('fornecedores', 'can_edit') && (
              <div className="recipe-actions">
                <button className="btn btn-outline" onClick={() => openEdit(s)}><Pencil size={14} /> Editar</button>
                {can('fornecedores', 'can_delete') && <button className="btn btn-outline danger" onClick={async () => { if (confirm('Excluir fornecedor?')) { await api.delete(`/fornecedores/${s.id}`); load(); } }}><Trash2 size={14} /></button>}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar fornecedor' : 'Novo fornecedor'} size="lg">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={save} className="form-grid">
          <label className="full">Nome
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>CNPJ
            <input className="input" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
          </label>
          <label>Telefone
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label>E-mail
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="full">Endereço
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </label>
          <label className="full">Produtos fornecidos
            <input className="input" value={form.products_supplied} onChange={(e) => setForm({ ...form, products_supplied: e.target.value })} placeholder="Ex.: frutas, verduras, legumes" />
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

