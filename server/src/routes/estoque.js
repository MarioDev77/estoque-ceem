import { Router } from 'express';
import { get, query, run, transaction, lastId } from '../db.js';
import { requireAuth, requirePermission } from '../auth.js';
import { audit, str, num } from './helpers.js';
import { today, addDays } from '../utils.js';
import { notify, notifyLowStock, notifyExpiring } from '../services/notifications.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// ESTOQUE GERAL
// ============================================================
router.get('/estoque', requirePermission('estoque'), async (req, res, next) => {
  try {
    const category = req.query.category ? num(req.query.category) : null;
    const lowOnly = req.query.low === '1';
    let sql = `
      SELECT f.id, f.name, f.unit, f.avg_price, f.min_stock, f.ideal_stock, f.brand, f.barcode,
             f.storage_location, COALESCE(s.quantity,0) AS quantity, c.name AS category_name,
             CASE
               WHEN s.quantity <= 0 THEN 'falta'
               WHEN s.quantity <= f.min_stock THEN 'baixo'
               ELSE 'adequado'
             END AS status
      FROM foods f
      LEFT JOIN stock s ON s.food_id = f.id
      LEFT JOIN food_categories c ON c.id = f.category_id
      WHERE f.active = 1
    `;
    const params = [];
    if (category) { sql += ` AND f.category_id = ?`; params.push(category); }
    if (lowOnly) { sql += ` AND (s.quantity <= 0 OR s.quantity <= f.min_stock)`; }
    sql += ` ORDER BY status ASC, f.name`;
    res.json(await query(sql, params));
  } catch (err) { next(err); }
});

// ============================================================
// LOTES (FEFO)
// ============================================================
router.get('/lotes', requirePermission('estoque'), async (req, res, next) => {
  try {
    const foodId = req.query.food_id ? num(req.query.food_id) : null;
    const onlyValid = req.query.valid === '1';
    let sql = `
      SELECT fb.*, f.name AS food_name, f.unit, s.name AS supplier_name,
             CASE
               WHEN fb.expiry_date IS NULL THEN 'sem_validade'
               WHEN fb.expiry_date < CURDATE() THEN 'vencido'
               WHEN fb.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'vence_7d'
               WHEN fb.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'vence_30d'
               ELSE 'ok'
             END AS validity_status
      FROM food_batches fb
      JOIN foods f ON f.id = fb.food_id
      LEFT JOIN suppliers s ON s.id = fb.supplier_id
      WHERE fb.quantity > 0
    `;
    const params = [];
    if (foodId) { sql += ` AND fb.food_id = ?`; params.push(foodId); }
    if (onlyValid) { sql += ` AND fb.expiry_date >= CURDATE()`; }
    sql += ` ORDER BY fb.expiry_date ASC, fb.id DESC`;
    res.json(await query(sql, params));
  } catch (err) { next(err); }
});

// Estoque detalhado por alimento inclui lotes FEFO
router.get('/estoque/:foodId/lotes', requirePermission('estoque'), async (req, res, next) => {
  try {
    res.json(await query(`
      SELECT fb.*, s.name AS supplier_name
      FROM food_batches fb LEFT JOIN suppliers s ON s.id = fb.supplier_id
      WHERE fb.food_id = ? AND fb.quantity > 0
      ORDER BY fb.expiry_date ASC
    `, [req.params.foodId]));
  } catch (err) { next(err); }
});

// ============================================================
// ENTRADAS DE ALIMENTOS
// ============================================================
router.post('/estoque/entrada', requirePermission('estoque', 'can_create'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { food_id, quantity, batch_number, expiry_date, supplier_id, unit_cost, reason, responsible, notes, barcode } = b;
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Informe o alimento e uma quantidade válida.' });
    }
    // Permite localizar o alimento pelo código de barras (leitor USB/câmera)
    let food = null;
    if (barcode) {
      food = await get('SELECT * FROM foods WHERE barcode = ? AND active = 1', [str(barcode)]);
      if (!food) return res.status(404).json({ error: 'Alimento não encontrado para este código de barras.' });
    } else {
      if (!food_id) return res.status(400).json({ error: 'Informe o alimento e uma quantidade válida.' });
      food = await get('SELECT * FROM foods WHERE id = ?', [food_id]);
      if (!food) return res.status(404).json({ error: 'Alimento não encontrado.' });
    }
    const foodId = Number(food.id);

    const existing = await get('SELECT id, quantity FROM stock WHERE food_id = ?', [foodId]);
    const qty = num(quantity);
    const cost = num(unit_cost);
    const totalCost = qty * (cost || food.avg_price || 0);

    await transaction(async (conn) => {
      // Cria novo lote
      await conn.query(`INSERT INTO food_batches (food_id, batch_number, quantity, entry_date, expiry_date, supplier_id, cost, unit_cost)
         VALUES (?,?,?,?,?,?,?,?)`,
        [foodId, str(batch_number, 60), qty, today(), expiry_date ? str(expiry_date) : null, supplier_id ? num(supplier_id) : null, totalCost, cost || food.avg_price || 0]);
      const batchId = await lastId(conn);

      // Atualiza estoque
      if (existing) {
        await conn.query('UPDATE stock SET quantity = quantity + ?, updated_at = NOW() WHERE food_id = ?', [qty, foodId]);
      } else {
        await conn.query('INSERT INTO stock (food_id, quantity) VALUES (?,?)', [foodId, qty]);
      }

      // Movimentação
      await conn.query(`INSERT INTO stock_movements (food_id, batch_id, movement_type, reason, quantity, unit_cost, total_cost, reference_type, responsible, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [foodId, batchId, 'entrada', str(reason, 40) || 'compra', qty, cost || food.avg_price || 0, totalCost, str(reason, 40) || 'compra', str(responsible) || req.user.name, str(notes, 300)]);

      // Atualiza preço médio
      await conn.query(`UPDATE foods SET avg_price = ?, updated_at = NOW() WHERE id = ?`, [cost || food.avg_price || 0, foodId]);
    });

    await audit({ userId: req.user.id, action: 'entrada', module: 'estoque', entityType: 'food', entityId: foodId, newValue: { quantity: qty, batch_number, expiry_date } });
    await notify({ type: 'estoque', severity: 'info', title: 'Entrada registrada', message: `Entrada de ${qty} ${food.unit} de ${food.name}.`, referenceType: 'food', referenceId: foodId });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ============================================================
// SAÍDAS DE ALIMENTOS
// ============================================================
router.post('/estoque/saida', requirePermission('estoque', 'can_create'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { food_id, quantity, reason, batch_id, responsible, notes } = b;
    if (!food_id || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Informe o alimento e uma quantidade válida.' });
    }
    const food = await get('SELECT * FROM foods WHERE id = ?', [food_id]);
    if (!food) return res.status(404).json({ error: 'Alimento não encontrado.' });
    const qty = num(quantity);

    const stockRow = await get('SELECT quantity FROM stock WHERE food_id = ?', [food_id]);
    if (!stockRow || stockRow.quantity < qty) {
      return res.status(400).json({ error: `Estoque insuficiente. Disponível: ${stockRow ? stockRow.quantity : 0} ${food.unit}.` });
    }

    await transaction(async (conn) => {
      // Se lote especificado, debita dele; senão FEFO
      if (batch_id) {
        const batch = await conn.query('SELECT * FROM food_batches WHERE id = ? AND quantity >= ?', [batch_id, qty]);
        if (!batch[0] || !batch[0][0]) return res.status(400).json({ error: 'Lote informado sem quantidade suficiente.' });
        const b = batch[0][0];
        await conn.query('UPDATE food_batches SET quantity = quantity - ? WHERE id = ?', [qty, batch_id]);
        await conn.query(`INSERT INTO stock_movements (food_id, batch_id, movement_type, reason, quantity, unit_cost, total_cost, responsible, notes)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [food_id, batch_id, 'saida', str(reason, 40), qty, b.unit_cost || food.avg_price || 0, qty * (b.unit_cost || food.avg_price || 0), str(responsible) || req.user.name, str(notes, 300)]);
      } else {
        // FEFO: debita lotes mais próximos do vencimento
        let remaining = qty;
        const batchesRes = await conn.query('SELECT * FROM food_batches WHERE food_id = ? AND quantity > 0 ORDER BY expiry_date ASC, id ASC', [food_id]);
        const batches = batchesRes[0];
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, batch.quantity);
          await conn.query('UPDATE food_batches SET quantity = quantity - ? WHERE id = ?', [take, batch.id]);
          await conn.query(`INSERT INTO stock_movements (food_id, batch_id, movement_type, reason, quantity, unit_cost, total_cost, responsible, notes)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [food_id, batch.id, 'saida', str(reason, 40), take, batch.unit_cost || food.avg_price || 0, take * (batch.unit_cost || food.avg_price || 0), str(responsible) || req.user.name, str(notes, 300)]);
          remaining -= take;
        }
      }

      await conn.query('UPDATE stock SET quantity = quantity - ?, updated_at = NOW() WHERE food_id = ?', [qty, food_id]);
    });

    await audit({ userId: req.user.id, action: 'saida', module: 'estoque', entityType: 'food', entityId: Number(food_id), newValue: { quantity: qty, reason } });
    await notify({ type: 'estoque', severity: 'info', title: 'Saída registrada', message: `Saída de ${qty} ${food.unit} de ${food.name} (${reason}).`, referenceType: 'food', referenceId: Number(food_id) });
    await notifyLowStock();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ============================================================
// AJUSTE DE ESTOQUE
// ============================================================
router.post('/estoque/ajuste', requirePermission('estoque', 'can_create'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { food_id, quantity, notes } = b;
    if (!food_id || quantity == null) return res.status(400).json({ error: 'Informe alimento e nova quantidade.' });
    const food = await get('SELECT * FROM foods WHERE id = ?', [food_id]);
    if (!food) return res.status(404).json({ error: 'Alimento não encontrado.' });
    const newQty = num(quantity);
    const current = await get('SELECT quantity FROM stock WHERE food_id = ?', [food_id]);

    await transaction(async (conn) => {
      if (current) {
        const diff = newQty - current.quantity;
        await conn.query('UPDATE stock SET quantity = ?, updated_at = NOW() WHERE food_id = ?', [newQty, food_id]);
        if (diff !== 0) {
          await conn.query(`INSERT INTO stock_movements (food_id, movement_type, reason, quantity, responsible, notes)
             VALUES (?,?,?,?,?,?)`,
            [food_id, 'ajuste', 'ajuste', newQty, str(b.responsible) || req.user.name, str(notes, 300) + ` (era ${current.quantity})`]);
        }
      } else {
        await conn.query('INSERT INTO stock (food_id, quantity) VALUES (?,?)', [food_id, newQty]);
      }
    });

    await audit({ userId: req.user.id, action: 'ajuste', module: 'estoque', entityType: 'food', entityId: Number(food_id), oldValue: current ? current.quantity : 0, newValue: newQty });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ============================================================
// MOVIMENTAÇÕES
// ============================================================
router.get('/estoque/movimentos', requirePermission('estoque'), async (req, res, next) => {
  try {
    const limit = Math.min(num(req.query.limit, 200), 1000);
    res.json(await query(`
      SELECT sm.*, f.name AS food_name, f.unit, fb.batch_number
      FROM stock_movements sm
      JOIN foods f ON f.id = sm.food_id
      LEFT JOIN food_batches fb ON fb.id = sm.batch_id
      ORDER BY sm.id DESC LIMIT ?
    `, [limit]));
  } catch (err) { next(err); }
});

// ============================================================
// ALERTAS DE ESTOQUE E VALIDADE
// ============================================================
router.get('/alertas', requirePermission('estoque'), async (req, res, next) => {
  try {
    const t = today();
    const in7 = addDays(t, 7);
    const in30 = addDays(t, 30);

    const estoqueBaixo = await query(`
      SELECT f.id, f.name, f.unit, f.min_stock, COALESCE(s.quantity,0) AS quantity
      FROM foods f LEFT JOIN stock s ON s.food_id = f.id
      WHERE f.active = 1 AND (s.quantity <= 0 OR s.quantity <= f.min_stock)
      ORDER BY (s.quantity / NULLIF(f.min_stock,0)) ASC
    `);

    const lotes = await query(`
      SELECT fb.id, fb.batch_number, fb.expiry_date, fb.quantity, f.name, f.unit
      FROM food_batches fb JOIN foods f ON f.id = fb.food_id
      WHERE fb.quantity > 0 AND fb.expiry_date IS NOT NULL
      ORDER BY fb.expiry_date ASC
    `);

    const vencidos = lotes.filter((l) => l.expiry_date < t);
    const vence7 = lotes.filter((l) => l.expiry_date >= t && l.expiry_date <= in7);
    const vence30 = lotes.filter((l) => l.expiry_date > in7 && l.expiry_date <= in30);

    res.json({ estoqueBaixo, vencidos, vence7, vence30 });
  } catch (err) { next(err); }
});

// ============================================================
// LEITOR DE CÓDIGO DE BARRAS
// ============================================================
router.get('/barcode/:code', requirePermission('estoque'), async (req, res, next) => {
  try {
    const food = await get(`
      SELECT f.*, c.name AS category_name, COALESCE(s.quantity,0) AS stock_quantity,
             (SELECT fb.id FROM food_batches fb WHERE fb.food_id = f.id AND fb.quantity > 0
               AND (fb.expiry_date IS NULL OR fb.expiry_date >= CURDATE())
               ORDER BY fb.expiry_date ASC LIMIT 1) AS active_batch_id,
             (SELECT fb.batch_number FROM food_batches fb WHERE fb.food_id = f.id AND fb.quantity > 0
               AND (fb.expiry_date IS NULL OR fb.expiry_date >= CURDATE())
               ORDER BY fb.expiry_date ASC LIMIT 1) AS active_batch,
             (SELECT fb.expiry_date FROM food_batches fb WHERE fb.food_id = f.id AND fb.quantity > 0
               AND (fb.expiry_date IS NULL OR fb.expiry_date >= CURDATE())
               ORDER BY fb.expiry_date ASC LIMIT 1) AS active_expiry
      FROM foods f
      LEFT JOIN food_categories c ON c.id = f.category_id
      LEFT JOIN stock s ON s.food_id = f.id
      WHERE f.barcode = ? AND f.active = 1
    `, [str(req.params.code)]);
    if (!food) {
      return res.status(404).json({ error: 'Alimento não cadastrado.', cadastrar: true });
    }
    res.json(food);
  } catch (err) { next(err); }
});

export default router;
