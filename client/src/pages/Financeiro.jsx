import React, { useEffect, useState } from 'react';
import { Wallet, Plus, Pencil, Trash2, PiggyBank, Calculator, TrendingUp } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../auth.jsx';
import { getErrMsg, today, startOfMonth, endOfMonth, formatCurrency, formatDateBR } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';
import { BarChart, PieChart } from '../components/Charts.jsx';

export default function Financeiro() {
  const { can } = useAuth();
  const [despesas, setDespesas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [orcamento, setOrcamento] = useState(null);
  const [custo, setCusto] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [range, setRange] = useState({ start: startOfMonth(today()), end: endOfMonth(today()) });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ category_id: '', description: '', amount: '', expense_date: today(), supplier_id: '', payment_method: '', responsible: '', notes: '' });

  async function load() {
    try {
      const [dRes, cRes, oRes, cuRes, sRes] = await Promise.all([
        api.get('/despesas', { params: range }), api.get('/despesas/categorias'), api.get('/orcamento'),
        api.get('/custo-refeicao', { params: range }), api.get('/fornecedores'),
      ]);
      setDespesas(dRes.data);
      setCategorias(cRes.data);
      setOrcamento(oRes.data);
      setCusto(cuRes.data);
      setSuppliers(sRes.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar financeiro.'));
    }
  }
  useEffect(() => { load(); }, [range.start, range.end]);

  function openNew() {
    setEditing(null);
    setForm({ category_id: '', description: '', amount: '', expense_date: today(), supplier_id: '', payment_method: '', responsible: '', notes: '' });
    setOpen(true);
  }
  function openEdit(d) {
    setEditing(d);
    setForm({ category_id: d.category_id || '', description: d.description, amount: d.amount, expense_date: d.expense_date, supplier_id: d.supplier_id || '', payment_method: d.payment_method || '', responsible: d.responsible || '', notes: d.notes || '' });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      if (editing) await api.put(`/despesas/${editing.id}`, form);
      else await api.post('/despesas', form);
      setOpen(false);
      load();
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao salvar despesa.'));
    }
  }

  async function updBudget(period, periodValue, amount) {
    if (!amount) return;
    try {
      await api.post('/orcamento', { school_year: orcamento.year, period, period_value: periodValue, amount });
      load();
    } catch (err) {
      alert(getErrMsg(err, 'Erro ao salvar orçamento.'));
    }
  }

  const spentPct = orcamento && orcamento.annual ? Math.min(100, (orcamento.spent / orcamento.annual.amount) * 100) : 0;

  const byCategory = {};
  for (const d of despesas) {
    const key = d.category_name || 'Outros';
    byCategory[key] = (byCategory[key] || 0) + Number(d.amount);
  }

  return (
    <div>
      <PageHeader
        title="Controle Financeiro"
        subtitle="Gastos da alimentação escolar, orçamento e custo por refeição"
        actions={
          can('financeiro', 'can_create') && (
            <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Nova despesa</button>
          )
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Orçamento */}
      {orcamento && orcamento.annual && (
        <div className="card budget-card">
          <div className="card-header">
            <h3><PiggyBank size={18} /> Orçamento {orcamento.year}</h3>
            {can('orcamento', 'can_edit') && (
              <div className="row-actions">
                <input className="input" type="number" defaultValue={orcamento.annual.amount} onBlur={(e) => updBudget('ano', String(orcamento.year), e.target.value)} placeholder="Orçamento anual" />
                <button className="btn btn-outline" onClick={() => { const v = prompt('Novo valor do orçamento anual:', orcamento.annual.amount); if (v) updBudget('ano', String(orcamento.year), v); }}>Editar</button>
              </div>
            )}
          </div>
          <div className="budget-numbers">
            <div><span>Orçamento anual</span><strong>{formatCurrency(orcamento.annual.amount)}</strong></div>
            <div><span>Gasto</span><strong className={spentPct > 85 ? 'text-danger' : ''}>{formatCurrency(orcamento.spent)}</strong></div>
            <div><span>Disponível</span><strong className={orcamento.annual.amount - orcamento.spent > 0 ? 'text-success' : 'text-danger'}>{formatCurrency(Math.max(0, orcamento.annual.amount - orcamento.spent))}</strong></div>
            <div><span>Utilizado</span><strong>{spentPct.toFixed(1)}%</strong></div>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${spentPct}%`, backgroundColor: spentPct > 85 ? '#ef4444' : spentPct > 65 ? '#f59e0b' : '#0f766e' }} />
          </div>
          {spentPct > 80 && <div className="alert alert-warning">⚠️ Atenção: o orçamento está {spentPct.toFixed(0)}% utilizado!</div>}
        </div>
      )}

      {/* Custo por refeição */}
      {custo && (
        <div className="stats-grid mini">
          <div className="stat-card stat-purple"><div className="stat-info"><span className="stat-label">Gastos no período</span><strong className="stat-value">{formatCurrency(custo.totalExpenses)}</strong></div></div>
          <div className="stat-card stat-teal"><div className="stat-info"><span className="stat-label">Refeições servidas</span><strong className="stat-value">{custo.totalMeals}</strong></div></div>
          <div className="stat-card stat-green"><div className="stat-info"><span className="stat-label">Custo médio por refeição</span><strong className="stat-value">{formatCurrency(custo.costPerMeal)}</strong></div></div>
        </div>
      )}

      <div className="charts-grid two">
        <div className="card chart-card">
          <h3>Gastos por categoria</h3>
          <PieChart labels={Object.keys(byCategory)} data={Object.values(byCategory)} />
        </div>
        <div className="card chart-card">
          <h3>Despesas diárias</h3>
          <BarChart labels={custo?.dailyCost?.map((d) => formatDateBR(d.date)) || []} datasets={[{ label: 'Despesas (R$)', data: custo?.dailyCost?.map((d) => d.dayExpenses) || [], backgroundColor: '#8b5cf6' }]} />
        </div>
      </div>

      {/* Categorias orçamento */}
      {orcamento?.byCategory?.length > 0 && (
        <div className="card">
          <div className="card-header"><h3>Limites por categoria</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Categoria</th><th>Limite</th><th>Gasto no ano</th><th>%</th></tr></thead>
              <tbody>
                {orcamento.byCategory.map((c) => {
                  const catId = Number(c.period_value);
                  const spent = despesas.filter((d) => Number(d.category_id) === catId).reduce((a, b) => a + Number(b.amount), 0);
                  const pct = c.amount > 0 ? ((spent / c.amount) * 100) : 0;
                  return (
                    <tr key={c.id}>
                      <td>{categorias.find((x) => x.id === catId)?.name || '—'}</td>
                      <td>{formatCurrency(c.amount)}</td>
                      <td>{formatCurrency(spent)}</td>
                      <td>
                        <div className="progress-bar sm"><div className="progress-fill" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: pct > 85 ? '#ef4444' : pct > 65 ? '#f59e0b' : '#0f766e' }} /></div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Despesas */}
      <div className="card">
        <div className="card-header">
          <h3><Wallet size={18} /> Despesas do período</h3>
          <div className="row-actions">
            <input className="input" type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
            <span className="muted">até</span>
            <input className="input" type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Pagamento</th><th>Fornecedor</th>{can('financeiro', 'can_edit') && <th></th>}</tr>
            </thead>
            <tbody>
              {despesas.map((d) => (
                <tr key={d.id}>
                  <td>{formatDateBR(d.expense_date)}</td>
                  <td><strong>{d.description}</strong></td>
                  <td><Badge tone="teal">{d.category_name || '—'}</Badge></td>
                  <td><strong>{formatCurrency(d.amount)}</strong></td>
                  <td><small>{d.payment_method || '—'}</small></td>
                  <td><small>{d.supplier_name || '—'}</small></td>
                  {can('financeiro', 'can_edit') && (
                    <td className="ta-right">
                      <button className="icon-btn" onClick={() => openEdit(d)}><Pencil size={14} /></button>
                      {can('financeiro', 'can_delete') && <button className="icon-btn danger" onClick={async () => { if (confirm('Excluir despesa?')) { await api.delete(`/despesas/${d.id}`); load(); } }}><Trash2 size={14} /></button>}
                    </td>
                  )}
                </tr>
              ))}
              {despesas.length === 0 && <tr><td colSpan="7" className="empty-cell">Nenhuma despesa no período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar despesa' : 'Nova despesa'} size="lg">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={save} className="form-grid">
          <label className="full">Descrição
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </label>
          <label>Categoria
            <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} required>
              <option value="">—</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Valor (R$)
            <input className="input" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </label>
          <label>Data
            <input className="input" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          </label>
          <label>Fornecedor
            <select className="input" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Forma de pagamento
            <input className="input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} />
          </label>
          <label>Responsável
            <input className="input" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
          </label>
          <label className="full">Observações
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="form-actions full">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary"><Calculator size={16} /> Salvar</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

