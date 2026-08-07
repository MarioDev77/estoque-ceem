import React, { useEffect, useState } from 'react';
import { ShoppingCart, Plus, Download, Save, CheckCircle2, Trash2, Sparkles } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, today, addDays, formatCurrency, formatDateBR, formatNumber } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';
import * as XLSX from 'xlsx';

export default function Compras() {
  const { can } = useAuth();
  const [days, setDays] = useState(15);
  const [sug, setSug] = useState(null);
  const [shoppingList, setShoppingList] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [foods, setFoods] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [purchForm, setPurchForm] = useState({ supplier_id: '', purchase_date: today(), invoice_number: '', items: [{ food_id: '', quantity: '', unit_cost: '' }], notes: '' });

  async function loadAll() {
    try {
      const [sugRes, listRes, purRes, supRes, foodRes] = await Promise.all([
        api.get('/compras/sugestao', { params: { days } }),
        api.get('/compras/lista'),
        api.get('/compras', { params: { start: '1900-01-01', end: '2100-12-31' } }),
        api.get('/fornecedores'),
        api.get('/alimentos'),
      ]);
      setSug(sugRes.data);
      setShoppingList(listRes.data);
      setPurchases(purRes.data);
      setSuppliers(supRes.data);
      setFoods(foodRes.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar compras.'));
    }
  }
  useEffect(() => { loadAll(); }, [days]);

  async function salvarSugestao() {
    const items = (sug?.toBuyList || []).map((r) => ({ food_id: r.food_id, quantity: r.to_buy, reason: 'Sugestão inteligente — atendimento ao cardápio e consumo médio' }));
    try {
      await api.post('/compras/salvar', { items });
      loadAll();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao salvar lista.'));
    }
  }

  function exportCSV() {
    const rows = (sug?.toBuyList || []).map((r) => ({
      Alimento: r.name, Estoque: r.stock, Necessário: r.requirement, Comprar: r.to_buy, Unidade: r.unit, 'Custo estimado': r.total_cost,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lista de compras');
    XLSX.writeFile(wb, `lista_compras_${today()}.xlsx`);
  }

  function markBought(item) {
    api.post(`/compras/lista/item/${item.id}/comprado`).then(loadAll);
  }
  function removeItem(item) {
    api.delete(`/compras/lista/${item.id}`).then(loadAll);
  }

  function setPurItem(idx, field, value) {
    const items = [...purchForm.items];
    items[idx] = { ...items[idx], [field]: value };
    setPurchForm({ ...purchForm, items });
  }
  function addPurItem() {
    setPurchForm({ ...purchForm, items: [...purchForm.items, { food_id: '', quantity: '', unit_cost: '' }] });
  }
  function remPurItem(idx) {
    setPurchForm({ ...purchForm, items: purchForm.items.filter((_, i) => i !== idx) });
  }

  async function savePurchase(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/compras', { ...purchForm, items: purchForm.items.filter((i) => i.food_id && i.quantity) });
      setOpen(false);
      loadAll();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao registrar compra.'));
    }
  }

  return (
    <div>
      <PageHeader
        title="Planejamento de Compras"
        subtitle="Sugestão inteligente baseada em cardápio futuro, consumo médio, estoque e validade"
        actions={
          <div className="row-actions">
            <span className="muted">Período:</span>
            <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value="7">7 dias</option>
              <option value="15">15 dias</option>
              <option value="30">30 dias</option>
              <option value="60">60 dias</option>
            </select>
            {can('compras', 'can_create') && <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Registrar compra</button>}
          </div>
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}

      {sug && (
        <div className="card">
          <div className="card-header">
            <h3><Sparkles size={18} /> Lista de compras inteligente — próximos {sug.summary.days} dias</h3>
            <div className="row-actions">
              {sug.summary.items > 0 && (
                <>
                  <button className="btn btn-outline" onClick={exportCSV}><Download size={15} /> Exportar</button>
                  {can('compras', 'can_create') && <button className="btn btn-primary" onClick={salvarSugestao}><Save size={15} /> Salvar como lista</button>}
                </>
              )}
            </div>
          </div>
          <div className="summary-strip">
            <div className="summary-item"><strong>{sug.summary.items}</strong><span>itens para comprar</span></div>
            <div className="summary-item"><strong>{formatCurrency(sug.summary.total_cost)}</strong><span>custo estimado</span></div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Alimento</th><th>Estoque</th><th>Necessário</th><th>Comprar</th><th>Un.</th><th>Custo estimado</th></tr>
              </thead>
              <tbody>
                {sug.toBuyList.map((r) => (
                  <tr key={r.food_id}>
                    <td><strong>{r.name}</strong>{r.category && <small className="muted block">{r.category}</small>}</td>
                    <td>{formatNumber(r.stock)}</td>
                    <td>{formatNumber(r.requirement)}</td>
                    <td><strong className="text-primary">{formatNumber(r.to_buy)}</strong></td>
                    <td>{r.unit}</td>
                    <td>{formatCurrency(r.total_cost)}</td>
                  </tr>
                ))}
                {sug.toBuyList.length === 0 && <tr><td colSpan="6" className="empty-cell">Tudo em dia! Nenhuma compra necessária para o período.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3><ShoppingCart size={18} /> Lista de compras pendente</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Alimento</th><th>Quantidade</th><th>Motivo</th><th>Status</th>{can('compras', 'can_edit') && <th></th>}</tr>
            </thead>
            <tbody>
              {shoppingList.map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.name}</strong></td>
                  <td>{formatNumber(i.quantity)} {i.unit}</td>
                  <td><small>{i.reason}</small></td>
                  <td><Badge tone={i.status === 'comprado' ? 'green' : i.status === 'pendente' ? 'orange' : 'neutral'}>{i.status}</Badge></td>
                  {can('compras', 'can_edit') && (
                    <td className="ta-right">
                      {i.status === 'pendente' && <button className="icon-btn" title="Marcar como comprado" onClick={() => markBought(i)}><CheckCircle2 size={16} /></button>}
                      {can('compras', 'can_delete') && <button className="icon-btn danger" onClick={() => removeItem(i)}><Trash2 size={15} /></button>}
                    </td>
                  )}
                </tr>
              ))}
              {shoppingList.length === 0 && <tr><td colSpan="5" className="empty-cell">Lista vazia. Gere a sugestão inteligente.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Histórico de compras</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Data</th><th>Fornecedor</th><th>NF</th><th>Itens</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {purchases.slice(0, 20).map((p) => (
                <tr key={p.id}>
                  <td>{formatDateBR(p.purchase_date)}</td>
                  <td>{p.supplier_name || '—'}</td>
                  <td className="mono">{p.invoice_number || '—'}</td>
                  <td>{p.items.length} itens</td>
                  <td><strong>{formatCurrency(p.total)}</strong></td>
                  <td><Badge tone="green">{p.status}</Badge></td>
                </tr>
              ))}
              {purchases.length === 0 && <tr><td colSpan="6" className="empty-cell">Nenhuma compra registrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Registrar compra (entra no estoque)" size="xl">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={savePurchase} className="form-grid">
          <label>Fornecedor
            <select className="input" value={purchForm.supplier_id} onChange={(e) => setPurchForm({ ...purchForm, supplier_id: e.target.value })}>
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Data da compra
            <input className="input" type="date" value={purchForm.purchase_date} onChange={(e) => setPurchForm({ ...purchForm, purchase_date: e.target.value })} />
          </label>
          <label>Nota fiscal
            <input className="input" value={purchForm.invoice_number} onChange={(e) => setPurchForm({ ...purchForm, invoice_number: e.target.value })} />
          </label>
          <div className="full">
            <div className="section-title">
              <h4>Itens</h4>
              <button type="button" className="btn btn-outline" onClick={addPurItem}><Plus size={14} /> Adicionar</button>
            </div>
            {purchForm.items.map((it, idx) => (
              <div key={idx} className="ing-row">
                <select className="input" value={it.food_id} onChange={(e) => setPurItem(idx, 'food_id', e.target.value)} required>
                  <option value="">Alimento…</option>
                  {foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <input className="input" type="number" step="0.1" min="0" placeholder="Qtd" value={it.quantity} onChange={(e) => setPurItem(idx, 'quantity', e.target.value)} required />
                <input className="input" type="number" step="0.01" min="0" placeholder="Custo un. R$" value={it.unit_cost} onChange={(e) => setPurItem(idx, 'unit_cost', e.target.value)} />
                <button type="button" className="icon-btn danger" onClick={() => remPurItem(idx)}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <label className="full">Observações
            <input className="input" value={purchForm.notes} onChange={(e) => setPurchForm({ ...purchForm, notes: e.target.value })} />
          </label>
          <div className="full info-tip"><p><strong>Ao salvar:</strong> o sistema cria lotes, atualiza o estoque, registra movimentações e atualiza o preço médio.</p></div>
          <div className="form-actions full">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Registrar compra</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

