import { Router } from 'express';
import { get, query, run, transaction, lastId } from '../db.js';
import { requireAuth, requirePermission } from '../auth.js';
import { audit, str, num } from './helpers.js';
import { today, addDays } from '../utils.js';
import { notifyLowStock } from '../services/notifications.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// LISTA DE COMPRAS INTELIGENTE
// ============================================================
router.get('/compras/sugestao', requirePermission('compras'), async (req, res, next) => {
  try {
    const days = Math.min(num(req.query.days, 15), 90);
    const start = today();
    const end = addDays(start, days);

    // Consumo médio dos últimos 30 dias
    const avgConsumption = await query(`
      SELECT food_id, SUM(quantity) / 30.0 AS daily_avg, unit
      FROM meal_consumption mc JOIN meals m ON m.id = mc.meal_id
      WHERE m.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY food_id
    `);

    // Cardápio futuro
    const futureMenus = await query(`
      SELECT mi.food_id, f.name, f.unit, f.avg_price, SUM(mi.total_quantity) AS needed
      FROM menu_items mi
      JOIN menus m ON m.id = mi.menu_id
      JOIN foods f ON f.id = mi.food_id
      WHERE m.date BETWEEN ? AND ? AND m.status != 'cancelado'
      GROUP BY mi.food_id
    `, [start, end]);

    // Consumo real dos últimos 30 dias (base para previsão)
    const real30 = await query(`
      SELECT mc.food_id, SUM(mc.quantity) AS total
      FROM meal_consumption mc JOIN meals m ON m.id = mc.meal_id
      WHERE m.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY mc.food_id
    `);

    // Estoque atual
    const stock = await query('SELECT food_id, quantity FROM stock');

    const stockMap = {};
    for (const s of stock) stockMap[s.food_id] = s.quantity;
    const avgMap = {};
    for (const a of avgConsumption) avgMap[a.food_id] = a.daily_avg;
    const realMap = {};
    for (const r of real30) realMap[r.food_id] = r.total;

    // Une todos os alimentos relevantes
    const foods = await query(`
      SELECT f.*, c.name AS category_name FROM foods f
      LEFT JOIN food_categories c ON c.id = f.category_id
      WHERE f.active = 1 ORDER BY f.name
    `);

    const rows = [];
    for (const f of foods) {
      const needed = futureMenus.find((m) => m.food_id === f.id)?.needed || 0;
      // Previsão por consumo: média diária * dias
      const forecast = (avgMap[f.id] || 0) * days;
      const requirement = Math.max(needed, forecast);
      const have = stockMap[f.id] || 0;
      const margin = f.min_stock || 0;
      const toBuy = Math.max(0, requirement - have + margin);
      rows.push({
        food_id: f.id,
        name: f.name,
        unit: f.unit,
        category: f.category_name,
        avg_price: f.avg_price,
        min_stock: f.min_stock,
        ideal_stock: f.ideal_stock,
        stock: have,
        needed_from_menu: needed,
        forecast_consumption: Math.round(forecast * 100) / 100,
        requirement: Math.round(requirement * 100) / 100,
        to_buy: Math.round(toBuy * 100) / 100,
        total_cost: Math.round(toBuy * (f.avg_price || 0) * 100) / 100,
      });
    }

    const toBuyList = rows.filter((r) => r.to_buy > 0.001);
    const summary = {
      days,
      items: toBuyList.length,
      total_cost: toBuyList.reduce((a, b) => a + b.total_cost, 0),
    };

    res.json({ rows, toBuyList, summary });
  } catch (err) { next(err); }
});

// Salvar sugestão como lista de compras
router.post('/compras/salvar', requirePermission('compras', 'can_create'), async (req, res, next) => {
  try {
    const { items = [] } = req.body || {};
    await transaction(async (conn) => {
      await conn.query('DELETE FROM shopping_list WHERE status = \'pendente\'');
      for (const it of items) {
        if (!it.food_id || it.quantity <= 0) continue;
        await conn.query(`INSERT INTO shopping_list (food_id, quantity, reason, status)
           VALUES (?,?,?, 'pendente')`,
          [num(it.food_id), num(it.quantity), str(it.reason, 300) || 'Sugestão inteligente']);
      }
    });
    await audit({ userId: req.user.id, action: 'salvar', module: 'compras', entityType: 'shopping_list', newValue: { items: items.length } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Ver lista de compras pendente
router.get('/compras/lista', requirePermission('compras'), async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT sl.*, f.name, f.unit, f.avg_price, f.barcode
      FROM shopping_list sl JOIN foods f ON f.id = sl.food_id
      ORDER BY sl.id
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// Marcar item como comprado
router.post('/compras/lista/item/:id/comprado', requirePermission('compras', 'can_edit'), async (req, res, next) => {
  try {
    await run(`UPDATE shopping_list SET status='comprado' WHERE id=?`, [req.params.id]);
    await audit({ userId: req.user.id, action: 'marcar_comprado', module: 'compras', entityType: 'shopping_list', entityId: Number(req.params.id) });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/compras/lista/:id', requirePermission('compras', 'can_delete'), async (req, res, next) => {
  try {
    await run('DELETE FROM shopping_list WHERE id = ?', [req.params.id]);
    await audit({ userId: req.user.id, action: 'excluir', module: 'compras', entityType: 'shopping_list', entityId: Number(req.params.id) });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ============================================================
// COMPRAS (registro)
// ============================================================
router.get('/compras', requirePermission('compras'), async (req, res, next) => {
  try {
    const start = str(req.query.start, 10) || '1900-01-01';
    const end = str(req.query.end, 10) || '2100-12-31';
    const rows = await query(`
      SELECT p.*, s.name AS supplier_name
      FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.purchase_date BETWEEN ? AND ?
      ORDER BY p.purchase_date DESC
    `, [start, end]);
    const withItems = [];
    for (const p of rows) {
      withItems.push({
        ...p,
        items: await query(`SELECT pi.*, f.name AS food_name, f.unit FROM purchase_items pi JOIN foods f ON f.id = pi.food_id WHERE pi.purchase_id = ?`, [p.id]),
      });
    }
    res.json(withItems);
  } catch (err) { next(err); }
});

router.post('/compras', requirePermission('compras', 'can_create'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { supplier_id, purchase_date, invoice_number, items = [], notes, responsible } = b;
    if (!items.length) return res.status(400).json({ error: 'Informe ao menos um item.' });
    const total = items.reduce((acc, it) => acc + num(it.quantity) * num(it.unit_cost), 0);

    await transaction(async (conn) => {
      await conn.query(`INSERT INTO purchases (supplier_id, purchase_date, invoice_number, total, status, notes, responsible)
         VALUES (?,?,?,?,?,?,?)`,
        [supplier_id ? num(supplier_id) : null, str(purchase_date, 10) || today(), str(invoice_number, 50), total, 'concluida', str(notes, 300), str(responsible) || req.user.name]);
      const purchaseId = await lastId(conn);

      for (const it of items) {
        const foodRes = await conn.query('SELECT * FROM foods WHERE id = ?', [num(it.food_id)]);
        const food = foodRes[0][0];
        if (!food) continue;
        const qty = num(it.quantity);
        const cost = num(it.unit_cost) || food.avg_price || 0;
        const itemTotal = qty * cost;
        await conn.query(`INSERT INTO purchase_items (purchase_id, food_id, quantity, unit_cost, total) VALUES (?,?,?,?,?)`,
          [purchaseId, food.id, qty, cost, itemTotal]);

        // entrada no estoque automaticamente
        await conn.query(`INSERT INTO food_batches (food_id, batch_number, quantity, entry_date, expiry_date, supplier_id, cost, unit_cost)
           VALUES (?,?,?,?,?,?,?,?)`,
          [food.id, str(it.batch_number, 60), qty, str(purchase_date, 10) || today(), it.expiry_date ? str(it.expiry_date, 10) : null, supplier_id ? num(supplier_id) : null, itemTotal, cost]);
        const batchId = await lastId(conn);
        const stRes = await conn.query('SELECT id FROM stock WHERE food_id = ?', [food.id]);
        const st = stRes[0][0];
        if (st) await conn.query('UPDATE stock SET quantity = quantity + ?, updated_at = NOW() WHERE food_id = ?', [qty, food.id]);
        else await conn.query('INSERT INTO stock (food_id, quantity) VALUES (?,?)', [food.id, qty]);

        await conn.query(`INSERT INTO stock_movements (food_id, batch_id, movement_type, reason, quantity, unit_cost, total_cost, reference_type, reference_id, responsible)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [food.id, batchId, 'entrada', 'compra', qty, cost, itemTotal, 'purchase', purchaseId, str(responsible) || req.user.name]);

        await conn.query('UPDATE foods SET avg_price = ? WHERE id = ?', [cost, food.id]);
      }
    });

    await audit({ userId: req.user.id, action: 'criar', module: 'compras', entityType: 'purchase', newValue: { supplier_id, total, items: items.length } });
    await notifyLowStock();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
