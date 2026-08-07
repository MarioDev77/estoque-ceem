import React, { useEffect, useState } from 'react';
import { History, Search } from 'lucide-react';
import api from '../api.js';
import { getErrMsg, formatDateTime } from '../utils.js';
import { PageHeader, Badge } from '../components/ui.jsx';

export default function Auditoria() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    try {
      const res = await api.get('/auditoria');
      setRows(res.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar auditoria.'));
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) =>
    !search || `${r.user_name} ${r.action} ${r.module} ${r.entity_type}`.toLowerCase().includes(search.toLowerCase())
  );

  const toneMap = { criar: 'green', editar: 'orange', excluir: 'danger', 'registrar_preco': 'blue', 'regenerar_alertas': 'purple', 'registrar_entrada': 'teal' };

  return (
    <div>
      <PageHeader
        title="Auditoria"
        subtitle="Registro de todas as alterações importantes do sistema"
      />

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <div className="card-header">
          <h3><History size={18} /> {filtered.length} registros</h3>
          <div className="search-box">
            <Search size={16} />
            <input className="input" placeholder="Buscar por usuário, ação ou módulo" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Módulo</th><th>Entidade</th><th>Detalhes</th></tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td><strong>{r.user_name || 'Sistema'}</strong></td>
                  <td><Badge tone={toneMap[r.action] || 'neutral'}>{r.action}</Badge></td>
                  <td>{r.module}</td>
                  <td><small>{r.entity_type}{r.entity_id ? ` #${r.entity_id}` : ''}</small></td>
                  <td className="audit-detail">
                    {r.new_value && <span>{typeof r.new_value === 'string' ? r.new_value : JSON.stringify(r.new_value)}</span>}
                    {r.old_value && <span className="muted">← {typeof r.old_value === 'string' ? r.old_value : JSON.stringify(r.old_value)}</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan="6" className="empty-cell">Nenhum registro de auditoria.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

