import React, { useEffect, useState } from 'react';
import { ShieldCheck, Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, formatDateTime } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';

export default function Usuarios() {
  const { can } = useAuth();
  const [data, setData] = useState({ rows: [], roles: [] });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role_id: '', active: true });

  async function load() {
    try {
      const res = await api.get('/usuarios');
      setData(res.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar usuários.'));
    }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ name: '', email: '', password: '', role_id: 2, active: true });
    setOpen(true);
  }
  function openEdit(u) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role_id: u.role_name ? data.roles.find((r) => r.name === u.role_name)?.id : 2, active: !!u.active });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        const payload = { ...form, password: form.password || undefined };
        delete payload.password_blank;
        await api.put(`/usuarios/${editing.id}`, payload);
      } else {
        await api.post('/usuarios', form);
      }
      setOpen(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao salvar usuário.'));
    }
  }

  async function remove(u) {
    if (!confirm(`Desativar usuário ${u.name}?`)) return;
    try {
      await api.delete(`/usuarios/${u.id}`);
      load();
    } catch (err) {
      alert(getErrMsg(err, 'Erro ao desativar.'));
    }
  }

  const roleTone = (r) => {
    const map = { 'Administrador': 'danger', 'Nutrição': 'teal', 'Cantina': 'orange', 'Direção': 'purple' };
    return map[r] || 'neutral';
  };

  return (
    <div>
      <PageHeader
        title="Usuários e Permissões"
        subtitle="Controle de acesso por perfil: Administrador, Nutrição, Cantina, Direção"
        actions={
          can('usuarios', 'can_create') && (
            <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Novo usuário</button>
          )
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="roles-overview">
        {data.roles.map((r) => (
          <div key={r.id} className="role-pill"><ShieldCheck size={14} /> {r.name} <span className="muted">— {r.description}</span></div>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><h3><ShieldCheck size={18} /> {data.rows.length} usuários</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Criado em</th>{can('usuarios', 'can_edit') && <th></th>}</tr>
            </thead>
            <tbody>
              {data.rows.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td>{u.email}</td>
                  <td><Badge tone={roleTone(u.role_name)}>{u.role_name}</Badge></td>
                  <td><Badge tone={u.active ? 'green' : 'neutral'}>{u.active ? 'Ativo' : 'Inativo'}</Badge></td>
                  <td>{formatDateTime(u.created_at)}</td>
                  {can('usuarios', 'can_edit') && (
                    <td className="ta-right">
                      <button className="icon-btn" onClick={() => openEdit(u)}><Pencil size={14} /></button>
                      {can('usuarios', 'can_delete') && <button className="icon-btn danger" onClick={() => remove(u)}><Trash2 size={14} /></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar usuário' : 'Novo usuário'}>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={save} className="form-grid">
          <label className="full">Nome
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="full">E-mail
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label className="full">Senha {editing && <small className="muted">(deixe em branco para manter)</small>}
            <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing} />
          </label>
          <label className="full">Perfil de acesso
            <select className="input" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
              {data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="full" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Usuário ativo
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

