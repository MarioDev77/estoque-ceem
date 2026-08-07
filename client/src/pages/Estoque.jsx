import React, { useEffect, useState } from 'react';
import { Package, AlertTriangle, Timer, Minus, SlidersHorizontal } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, formatCurrency, formatDateBR, formatNumber } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';

export default function Estoque() {
  const { can } = useAuth();
  const [stock, setStock] = useState([]);
  const [alerts, setAlerts] = useState({ estoqueBaixo: [], vencidos: [], vence7: [], vence30: [] });
  const [categories, setCategories] = useState([]);
  const [catFilter, setCatFilter] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [openSaida, setOpenSaida] = useState(false);
  const [openAjuste, setOpenAjuste] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ quantity: '', reason: 'perda', responsible: '', notes: '' });
  const [error, setError] = useState('');

  async function load() {
    try {
      const params = {};
      if (catFilter) params.category = catFilter;
      if (lowOnly) params.low = '1';
      const [stockRes, alertRes, catRes] = await Promise.all([
        api.get('/estoque', { params }), api.get('/alertas'), api.get('/categorias'),
      ]);
      setStock(stockRes.data);
      setAlerts(alertRes.data);
      setCategories(catRes.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar estoque.'));
    }
  }
  useEffect(() => { load(); }, [catFilter, lowOnly]);

  function openSaidaModal(item) {
    setSelected(item);
    setForm({ quantity: '', reason: 'perda', responsible: '', notes: '' });
    setOpenSaida(true);
  }
  function openAjusteModal(item) {
    setSelected(item);
    setForm({ quantity: item.quantity, responsible: '', notes: '' });
    setOpenAjuste(true);
  }

  async function saveSaida(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/estoque/saida', { food_id: selected.id, quantity: form.quantity, reason: form.reason, responsible: form.responsible, notes: form.notes });
      setOpenSaida(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao registrar saída.'));
    }
  }
  async function saveAjuste(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/estoque/ajuste', { food_id: selected.id, quantity: form.quantity, responsible: form.responsible, notes: form.notes });
      setOpenAjuste(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao ajustar estoque.'));
    }
  }

  const stockStatus = (s) => {
    if (s.quantity <= 0) return { label: 'Em falta', tone: 'danger' };
    if (s.quantity <= s.min_stock) return { label: 'Abaixo do mínimo', tone: 'orange' };
    return { label: 'Adequado', tone: 'green' };
  };

  return (
    <div>
      <PageHeader
        title="Estoque de Alimentos"
        subtitle="Situação atual, alertas e controle por lote (FEFO)"
        actions={
          <div className="row-actions">
            <select className="input" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="">Todas as categorias</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className={lowOnly ? 'chip active' : 'chip'} onClick={() => setLowOnly(!lowOnly)}><SlidersHorizontal size={14} /> Somente baixo</button>
          </div>
        }
      />

      {/* Alertas */}
      <div className="alerts-grid">
        <div className="alert-panel danger">
          <h4><Timer size={16} /> Vencidos</h4>
          {alerts.vencidos.map((l) => <p key={l.id}>🔴 {l.name} — lote {l.batch_number} ({l.quantity} {l.unit}) — venceu em {formatDateBR(l.expiry_date)}</p>)}
          {alerts.vencidos.length === 0 && <p className="muted">Nenhum alimento vencido.</p>}
        </div>
        <div className="alert-panel warning">
          <h4><AlertTriangle size={16} /> Vencem em até 7 dias</h4>
          {alerts.vence7.map((l) => <p key={l.id}>🟠 {l.name} — lote {l.batch_number} ({l.quantity} {l.unit}) — {formatDateBR(l.expiry_date)}</p>)}
          {alerts.vence7.length === 0 && <p className="muted">Nenhum alimento vencendo nos próximos 7 dias.</p>}
        </div>
        <div className="alert-panel info">
          <h4><AlertTriangle size={16} /> Vencem em até 30 dias</h4>
          {alerts.vence30.map((l) => <p key={l.id}>🟡 {l.name} — lote {l.batch_number} ({l.quantity} {l.unit}) — {formatDateBR(l.expiry_date)}</p>)}
          {alerts.vence30.length === 0 && <p className="muted">Nenhum alimento vencendo em 30 dias.</p>}
        </div>
        <div className="alert-panel danger">
          <h4><Package size={16} /> Estoque baixo / falta</h4>
          {alerts.estoqueBaixo.map((s) => <p key={s.id}>🔴 {s.name} — {s.quantity} {s.unit} (mínimo {s.min_stock})</p>)}
          {alerts.estoqueBaixo.length === 0 && <p className="muted">Estoques dentro do mínimo.</p>}
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Tabela de estoque */}
      <div className="card">
        <div className="card-header"><h3><Package size={18} /> {stock.length} itens</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Alimento</th><th>Status</th><th>Quantidade</th><th>Mínimo</th><th>Ideal</th><th>Preço médio</th><th>Local</th>{can('estoque', 'can_create') && <th className="ta-right">Ações</th>}</tr>
            </thead>
            <tbody>
              {stock.map((s) => {
                const st = stockStatus(s);
                return (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong><small className="muted block">{s.category_name}</small></td>
                    <td><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td><strong>{formatNumber(s.quantity)} {s.unit}</strong></td>
                    <td>{formatNumber(s.min_stock)} {s.unit}</td>
                    <td>{formatNumber(s.ideal_stock)} {s.unit}</td>
                    <td>{formatCurrency(s.avg_price)}</td>
                    <td><small>{s.storage_location || '—'}</small></td>
                    {can('estoque', 'can_create') && (
                      <td className="ta-right">
                        <button className="icon-btn" title="Registrar saída" onClick={() => openSaidaModal(s)}><Minus size={15} /></button>
                        <button className="icon-btn" title="Ajustar estoque" onClick={() => openAjusteModal(s)}><SlidersHorizontal size={15} /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {stock.length === 0 && <tr><td colSpan="8" className="empty-cell">Nenhum item.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={openSaida} onClose={() => setOpenSaida(false)} title={`Saída de ${selected?.name || ''}`}>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={saveSaida} className="form-grid">
          <label>Quantidade
            <input className="input" type="number" step="0.1" min="0.1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </label>
          <label>Motivo
            <select className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              <option value="utilizacao_refeicao">Utilização em refeição</option>
              <option value="perda">Perda</option>
              <option value="desperdicio">Desperdício</option>
              <option value="vencido">Produto vencido</option>
              <option value="danificado">Produto danificado</option>
              <option value="doacao">Doação</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </label>
          <label>Responsável
            <input className="input" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
          </label>
          <label>Observações
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="form-actions full">
            <button type="button" className="btn" onClick={() => setOpenSaida(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Registrar saída</button>
          </div>
        </form>
      </Modal>

      <Modal open={openAjuste} onClose={() => setOpenAjuste(false)} title={`Ajuste de estoque: ${selected?.name || ''}`}>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={saveAjuste} className="form-grid">
          <label>Nova quantidade
            <input className="input" type="number" step="0.1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </label>
          <label>Responsável
            <input className="input" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
          </label>
          <label className="full">Observações
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="form-actions full">
            <button type="button" className="btn" onClick={() => setOpenAjuste(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Salvar ajuste</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

