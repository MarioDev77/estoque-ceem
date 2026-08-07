import React, { useEffect, useState } from 'react';
import { School, Save, Building2 } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg } from '../utils.js';
import { PageHeader } from '../components/ui.jsx';

export default function Config() {
  const { can } = useAuth();
  const [school, setSchool] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', city: '', state: '', cnpj: '', phone: '', email: '', school_year: '' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function load() {
    try {
      const res = await api.get('/escola');
      setSchool(res.data);
      setForm(res.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar escola.'));
    }
  }
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    try {
      await api.put('/escola', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao salvar.'));
    }
  }

  const YEAR = new Date().getFullYear();

  return (
    <div>
      <PageHeader title="Configurações da Escola" subtitle="Dados institucionais e ano letivo" />

      {error && <div className="alert alert-danger">{error}</div>}
      {saved && <div className="alert alert-success">✅ Dados salvos com sucesso!</div>}

      <div className="card">
        <div className="card-header"><h3><School size={18} /> Perfil da escola</h3></div>
        {school && (
          <form onSubmit={save} className="form-grid">
            <label className="full">Nome da escola
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label className="full">Endereço
              <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label>Cidade
              <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </label>
            <label>UF
              <input className="input" maxLength="2" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </label>
            <label>CNPJ
              <input className="input" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
            </label>
            <label>Telefone
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>E-mail
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label>Ano letivo atual
              <input className="input" type="number" min="2024" max="2035" value={form.school_year} onChange={(e) => setForm({ ...form, school_year: e.target.value })} />
            </label>
            <div className="full info-tip">
              <Building2 size={16} />
              <p><strong>Ano letivo vigente:</strong> {YEAR}. O calendário e o planejamento anual são atrelados a este ano no cadastro.</p>
            </div>
            <div className="form-actions full">
              {can('usuarios', 'can_edit') && (
                <button type="submit" className="btn btn-primary"><Save size={16} /> Salvar alterações</button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

