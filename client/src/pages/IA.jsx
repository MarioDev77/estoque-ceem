import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, RefreshCw, Loader2, User, TrendingUp, ShoppingCart, AlertTriangle, PiggyBank, GraduationCap } from 'lucide-react';
import api from '../api.js';
import { getErrMsg, formatCurrency, formatNumber, monthLabel } from '../utils.js';
import { PageHeader, Badge } from '../components/ui.jsx';

const SUGGESTIONS = [
  'Quais alimentos estão acabando?',
  'O que preciso comprar para a próxima semana?',
  'Qual alimento está sendo mais desperdiçado?',
  'Quanto gastamos este mês?',
  'Qual foi o custo médio por refeição?',
  'Quais alimentos estão próximos do vencimento?',
  'Qual foi o mês com maior consumo?',
  'O cardápio da próxima semana pode ser realizado com o estoque atual?',
];

function renderMarkdown(text = '') {
  // Simplista renderização: **negrito** -> <strong>; quebras de linha -> <br/>
  const parts = text.split(/\*\*(.+?)\*\*/g);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) out.push(<strong key={i}>{parts[i]}</strong>);
    else if (parts[i]) out.push(<span key={i}>{parts[i]}</span>);
  }
  return <div className="ai-answer">{out.map((el) => el.props.children).reduce?.((acc, cur, i) => acc.length ? [...acc, <br key={`br${i}`} />, cur] : [cur], []) || out}</div>;
}

export default function IA() {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  async function ask(q) {
    const text = q || question;
    if (!text.trim() || busy) return;
    setError('');
    setBusy(true);
    setMessages((m) => [...m, { id: Date.now(), role: 'user', text }]);
    setQuestion('');
    try {
      const res = await api.post('/ia/ask', { question: text });
      setMessages((m) => [...m, { id: Date.now() + 1, role: 'ai', text: res.data.answer }]);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao consultar a IA.'));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const el = endRef.current;
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function analyzeNextMonth() {
    setAnalyzing(true);
    setError('');
    try {
      const res = await api.get('/ia/analisar-proximo-mes');
      setAnalysis(res.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao analisar próximo mês.'));
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => { analyzeNextMonth(); }, []);

  return (
    <div>
      <PageHeader
        title="Assistente de IA"
        subtitle="Análise inteligente dos dados da alimentação escolar — leitura e planejamento assistido"
      />

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="ai-layout">
        <div className="chat-panel">
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-welcome">
                <Bot size={40} />
                <h3>Olá! Sou o assistente da alimentação escolar.</h3>
                <p>Pergunte sobre estoque, cardápio, gastos, desperdício, validade e compras. Analiso os dados reais do sistema e explico os cálculos. Sou somente leitura — nunca altero dados sem sua confirmação.</p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.role}`}>
                <span className="chat-avatar">{m.role === 'user' ? <User size={14} /> : <Bot size={14} />}</span>
                <div className="chat-bubble">{m.text.split('\n').map((line, i) => <p key={i}>{line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').split(/<strong>(.+?)<\/strong>/g).map((seg, j) => j % 2 === 1 ? <strong key={j}>{seg}</strong> : seg)}</p>)}</div>
              </div>
            ))}
            {busy && (
              <div className="chat-msg ai">
                <span className="chat-avatar"><Bot size={14} /></span>
                <div className="chat-bubble"><Loader2 size={16} className="spin" /> Analisando dados…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="chat-input">
            <input
              className="input"
              placeholder="Pergunte sobre estoque, gastos, cardápio, compras…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask()}
            />
            <button className="btn btn-primary" onClick={() => ask()} disabled={busy}><Send size={16} /></button>
          </div>
        </div>

        <div className="ai-side">
          <div className="card">
            <div className="card-header">
              <h3><Sparkles size={18} /> Analisar próximo mês</h3>
              <button className="btn btn-outline" onClick={analyzeNextMonth} disabled={analyzing}><RefreshCw size={15} className={analyzing ? 'spin' : ''} /></button>
            </div>
            {analysis && (
              <div className="analysis-body">
                <p className="muted">Período: <strong>{analysis.label}</strong></p>

                <div className="stats-grid mini">
                  <div className="stat-card stat-teal"><div className="stat-info"><span className="stat-label"><GraduationCap size={13} /> Alunos</span><strong className="stat-value">{formatNumber(analysis.totalStudents)}</strong></div></div>
                  <div className="stat-card stat-blue"><div className="stat-info"><span className="stat-label"><TrendingUp size={13} /> Consumo médio diário</span><strong className="stat-value">{formatNumber(analysis.dailyAvgConsumption)}</strong></div></div>
                  <div className="stat-card stat-orange"><div className="stat-info"><span className="stat-label"><ShoppingCart size={13} /> Compras previstas</span><strong className="stat-value">{formatCurrency(analysis.estimatedCost)}</strong></div></div>
                </div>

                {analysis.shoppingList?.length > 0 && (
                  <div className="analysis-block">
                    <h4>Lista de compras recomendada (30 dias)</h4>
                    <table className="table">
                      <thead><tr><th>Alimento</th><th>Necessário</th><th>Estoque</th><th>Comprar</th><th>Custo</th></tr></thead>
                      <tbody>
                        {analysis.shoppingList.map((n) => (
                          <tr key={n.food_id}><td>{n.name}</td><td>{formatNumber(n.need)} {n.unit}</td><td>{formatNumber(n.stock)}</td><td><strong className="text-primary">{formatNumber(n.toBuy)}</strong></td><td>{formatCurrency(n.toBuy * (n.price || 0))}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {analysis.expiringCount > 0 && (
                  <div className="analysis-block risk">
                    <h4><AlertTriangle size={14} /> Validade</h4>
                    <p>{analysis.expiringCount} lote(s) vencendo ou próximos do vencimento. Priorize o uso FEFO.</p>
                  </div>
                )}

                {analysis.lowStockCount > 0 && (
                  <div className="analysis-block risk">
                    <h4>Estoque crítico</h4>
                    <p>{analysis.lowStockCount} alimento(s) abaixo do mínimo: {analysis.lowStock.map((l) => l.name).join(', ')}.</p>
                  </div>
                )}

                {analysis.budget && (
                  <div className="analysis-block">
                    <h4><PiggyBank size={14} /> Orçamento mensal</h4>
                    <p>Orçamento do próximo mês: <strong>{formatCurrency(analysis.budget)}</strong> · Gasto no mês anterior: {formatCurrency(analysis.lastMonthSpent)} · Custo por refeição atual: <strong>{analysis.costPerMeal ? formatCurrency(analysis.costPerMeal) : '—'}</strong></p>
                  </div>
                )}

                {(analysis.plannedMenus > 0) && (
                  <div className="analysis-block">
                    <h4>Planejamento</h4>
                    <p><strong>{analysis.plannedMenus}</strong> refeições já planejadas a partir de hoje.</p>
                  </div>
                )}
              </div>
            )}
            {!analysis && !analyzing && <p className="muted">Nenhuma análise disponível.</p>}
          </div>
          <div className="card info-tip">
            <p><strong>Importante:</strong> a IA apenas analisa e sugere. Nenhuma alteração de estoque, financeiro ou cardápio é feita sem sua confirmação.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

