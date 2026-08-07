import React, { useEffect, useState } from 'react';
import { Layers, Package } from 'lucide-react';
import api from '../api.js';
import { getErrMsg, formatDateBR, formatNumber } from '../utils.js';
import { PageHeader, Badge } from '../components/ui.jsx';

const STATUS_CONFIG = {
  vencido: { label: 'Vencido', tone: 'danger' },
  vence_7d: { label: 'Vence em 7 dias', tone: 'orange' },
  vence_30d: { label: 'Vence em 30 dias', tone: 'warning' },
  ok: { label: 'Válido', tone: 'green' },
  sem_validade: { label: 'Sem validade', tone: 'neutral' },
};

export default function Lotes() {
  const [batches, setBatches] = useState([]);
  const [foods, setFoods] = useState([]);
  const [foodFilter, setFoodFilter] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const [lotRes, foodRes] = await Promise.all([api.get('/lotes'), api.get('/alimentos')]);
      setBatches(lotRes.data);
      setFoods(foodRes.data);
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao carregar lotes.'));
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = foodFilter ? batches.filter((b) => b.food_id === Number(foodFilter)) : batches;

  return (
    <div>
      <PageHeader
        title="Lotes e Validade"
        subtitle="Controle FEFO — utilize primeiro os lotes com validade mais próxima"
        actions={
          <select className="input" value={foodFilter} onChange={(e) => setFoodFilter(e.target.value)}>
            <option value="">Todos os alimentos</option>
            {foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <div className="card-header"><h3><Layers size={18} /> {filtered.length} lotes ativos</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Alimento</th><th>Lote</th><th>Quantidade</th><th>Entrada</th><th>Validade</th><th>Status</th><th>Prioridade FEFO</th></tr>
            </thead>
            <tbody>
              {filtered.map((b, idx) => {
                const cfg = STATUS_CONFIG[b.validity_status] || STATUS_CONFIG.ok;
                return (
                  <tr key={b.id}>
                    <td><strong>{b.food_name}</strong></td>
                    <td className="mono">{b.batch_number}</td>
                    <td>{formatNumber(b.quantity)} {b.unit}</td>
                    <td>{formatDateBR(b.entry_date)}</td>
                    <td>{formatDateBR(b.expiry_date)}</td>
                    <td><Badge tone={cfg.tone}>{cfg.label}</Badge></td>
                    <td>
                      <span className={`fefo-priority fefo-${idx < 3 ? 'high' : 'normal'}`}>
                        {idx + 1}º
                      </span>
                      {idx === 0 && <Badge tone="orange">Usar primeiro</Badge>}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan="7" className="empty-cell">Nenhum lote ativo.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card info-tip">
        <Package size={18} />
        <p><strong>Princípio FEFO (First Expire, First Out):</strong> as saídas de estoque debitam automaticamente os lotes com menor prazo de validade, reduzindo desperdícios. Os lotes vencidos devem ser descartados e registrados como desperdício.</p>
      </div>
    </div>
  );
}

