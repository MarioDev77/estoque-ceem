import { Router } from 'express';
import { get, query, run, transaction } from '../db.js';
import { requireAuth, requirePermission } from '../auth.js';
import { audit, str, num } from './helpers.js';
import { today, startOfMonth, endOfMonth } from '../utils.js';

const router = Router();
router.use(requireAuth);

const REASONS = ['excesso_producao', 'vencimento', 'preparo', 'armazenamento', 'sobras', 'danificado'];
const REASON_LABELS = {
  excesso_producao: 'Excesso de produção',
  vencimento: 'Vencimento',
  preparo: 'Erro no preparo',
  armazenamento: 'Armazenamento inadequado',
  sobras: 'Sobras',
  danificado: 'Alimento danificado',
};

// Lista desperdícios com filtros
router.get('/desperdicio', requirePermission('desperdicio'), (req, res) => {
  const start = str(req.query.start, 10) || '1900-01-01';
  const end = str(req.query.end, 10) || '2100-12-31';
  const rows = query(`
    SELECT w.*, f.name AS food_name, f.unit, mt.name AS meal_type_name
    FROM waste w
    JOIN foods f ON f.id = w.food_id
    LEFT JOIN meals m ON m.id = w.meal_id
    LEFT JOIN meal_types mt ON mt.id = m.meal_type_id
    WHERE w.date BETWEEN ? AND ?
    ORDER BY w.date DESC, w.id DESC
  `, [start, end]);
  res.json({ rows, reasonLabels: REASON_LABELS, reasons: REASONS });
});

// Indicadores de desperdício
router.get('/desperdicio/indicadores', requirePermission('desperdicio'), (req, res) => {
  const start = str(req.query.start, 10) || startOfMonth(today());
  const end = str(req.query.end, 10) || endOfMonth(today());

  const total = get(`
    SELECT COALESCE(SUM(quantity),0) AS qty, COALESCE(SUM(estimated_cost),0) AS cost
    FROM waste WHERE date BETWEEN ? AND ?
  `, [start, end]);

  const byFood = query(`
    SELECT f.name, f.unit, SUM(w.quantity) AS qty, SUM(w.estimated_cost) AS cost
    FROM waste w JOIN foods f ON f.id = w.food_id
    WHERE w.date BETWEEN ? AND ?
    GROUP BY f.id ORDER BY qty DESC
  `, [start, end]);

  const byReason = query(`
    SELECT reason, COUNT(*) AS count, SUM(quantity) AS qty
    FROM waste WHERE date BETWEEN ? AND ?
    GROUP BY reason ORDER BY qty DESC
  `, [start, end]);

  res.json({
    totalQty: total.qty,
    totalCost: total.cost,
    mostWasted: byFood[0] || null,
    byFood: byFood.slice(0, 10),
    byReason: byReason.map((r) => ({ ...r, label: REASON_LABELS[r.reason] || r.reason })),
    reasons: REASONS,
    reasonLabels: REASON_LABELS,
  });
});

// Registrar desperdício (também debita estoque)
router.post('/desperdicio', requirePermission('desperdicio', 'can_create'), (req, res) => {
  const b = req.body || {};
  const { food_id, quantity, reason, date, meal_id, responsible, notes } = b;
  if (!food_id || !quantity || quantity <= 0) return res.status(400).json({ error: 'Informe alimento e quantidade.' });

  const food = get('SELECT * FROM foods WHERE id = ?', [food_id]);
  if (!food) return res.status(404).json({ error: 'Alimento não encontrado.' });
  const qty = num(quantity);
  const cost = qty * (food.avg_price || 0);

  transaction(() => {
    run(`INSERT INTO waste (food_id, quantity, unit, reason, date, meal_id, estimated_cost, responsible, notes)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      [food_id, qty, food.unit, str(reason, 40) || 'sobras', str(date, 10) || today(), meal_id ? num(meal_id) : null, cost, str(responsible) || req.user.name, str(notes, 300)]);

    // debita estoque (FEFO)
    let remaining = qty;
    const batches = query('SELECT * FROM food_batches WHERE food_id = ? AND quantity > 0 ORDER BY expiry_date ASC', [food_id]);
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.quantity);
      run('UPDATE food_batches SET quantity = quantity - ? WHERE id = ?', [take, batch.id]);
      run(`INSERT INTO stock_movements (food_id, batch_id, movement_type, reason, quantity, unit_cost, total_cost, responsible, notes)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        [food_id, batch.id, 'saida', 'desperdicio', take, batch.unit_cost || food.avg_price || 0, take * (batch.unit_cost || food.avg_price || 0), str(responsible) || req.user.name, str(notes, 300)]);
      remaining -= take;
    }
    run('UPDATE stock SET quantity = MAX(0, quantity - ?) WHERE food_id = ?', [qty, food_id]);
  });

  audit({ userId: req.user.id, action: 'registrar', module: 'desperdicio', entityType: 'waste', newValue: { food_id, quantity: qty, reason } });
  res.json({ ok: true });
});

export default router;

