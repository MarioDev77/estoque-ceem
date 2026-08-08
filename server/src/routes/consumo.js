import { Router } from 'express';
import { get, query, run, transaction, lastId } from '../db.js';
import { requireAuth, requirePermission } from '../auth.js';
import { audit, str, num } from './helpers.js';
import { calcTotalQuantity, today, addDays } from '../utils.js';
import { notifyLowStock } from '../services/notifications.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// SIMULAÇÃO: quanto uma refeição consumirá?
// ============================================================
router.post('/consumo/simular', requirePermission('consumo'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { recipe_id, students } = b;
    const people = num(students);
    const recipe = await get('SELECT * FROM recipes WHERE id = ?', [recipe_id]);
    if (!recipe) return res.status(404).json({ error: 'Ficha técnica não encontrada.' });
    const ingredients = await query('SELECT ri.*, f.name AS food_name, f.unit FROM recipe_ingredients ri JOIN foods f ON f.id = ri.food_id WHERE ri.recipe_id = ?', [recipe_id]);

    const items = [];
    for (const ing of ingredients) {
      const qty = calcTotalQuantity(ing.quantity_per_serving, ing.unit, people);
      const stock = await get('SELECT quantity FROM stock WHERE food_id = ?', [ing.food_id]);
      const available = stock ? stock.quantity : 0;
      items.push({
        food_id: ing.food_id,
        food_name: ing.food_name,
        unit: ing.unit,
        quantity: qty,
        available,
        sufficient: available >= qty,
      });
    }

    let totalCost = 0;
    for (const it of items) {
      const food = await get('SELECT avg_price FROM foods WHERE id = ?', [it.food_id]);
      totalCost += it.quantity * (food ? food.avg_price : 0);
    }

    res.json({ recipe, students: people, items, totalCost });
  } catch (err) { next(err); }
});

// Pré-visualização para refeição direta (sem ficha técnica)
router.post('/consumo/preview', requirePermission('consumo'), async (req, res, next) => {
  try {
    const { meal_type_id, students, items = [] } = req.body || {};
    const people = num(students);
    const rows = [];
    for (const it of items) {
      const food = await get('SELECT * FROM foods WHERE id = ?', [num(it.food_id)]);
      if (!food) continue;
      const shouldConvert = it.portion_in_g === true || (it.unit && it.unit === 'g');
      const qty = calcTotalQuantity(it.portion_per_student, it.unit || food.unit, people);
      const stock = await get('SELECT quantity FROM stock WHERE food_id = ?', [food.id]);
      rows.push({
        food_id: food.id, food_name: food.name, unit: food.unit,
        portion_per_student: it.portion_per_student, quantity: qty,
        available: stock ? stock.quantity : 0,
        sufficient: (stock ? stock.quantity : 0) >= qty,
      });
    }
    res.json({ students: people, items: rows });
  } catch (err) { next(err); }
});

// ============================================================
// REGISTRAR REFEIÇÃO REALIZADA (CONSUMO AUTOMÁTICO)
// ============================================================
router.post('/consumo', requirePermission('consumo', 'can_create'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { date, meal_type_id, served_students, recipe_id, menu_id, items, notes, leftovers } = b;
    const people = num(served_students);
    if (!people) return res.status(400).json({ error: 'Informe a quantidade de refeições servidas.' });
    const mealDate = str(date, 10) || today();
    const mt = num(meal_type_id);
    if (!mt) return res.status(400).json({ error: 'Informe o tipo de refeição.' });

    // Determina os itens consumidos: pela ficha técnica OU itens diretos
    let consumptionItems = [];
    if (recipe_id) {
      const ingredients = await query('SELECT ri.*, f.unit FROM recipe_ingredients ri JOIN foods f ON f.id = ri.food_id WHERE ri.recipe_id = ?', [recipe_id]);
      consumptionItems = ingredients.map((ing) => ({
        food_id: ing.food_id,
        portion: ing.quantity_per_serving,
        unit: ing.unit,
      }));
    } else if (Array.isArray(items) && items.length) {
      consumptionItems = items.map((it) => ({ food_id: num(it.food_id), portion: num(it.portion_per_student), unit: it.unit }));
    } else {
      return res.status(400).json({ error: 'Informe uma ficha técnica ou os alimentos da refeição.' });
    }

    // Verifica estoque antes de confirmar
    const preview = [];
    for (const ci of consumptionItems) {
      const qty = calcTotalQuantity(ci.portion, ci.unit, people);
      const stock = await get('SELECT quantity FROM stock WHERE food_id = ?', [ci.food_id]);
      preview.push({ food_id: ci.food_id, qty, available: stock ? stock.quantity : 0, unit: ci.unit });
    }
    const insufficient = preview.filter((p) => p.available < p.qty);
    if (insufficient.length) {
      return res.status(400).json({
        error: 'Estoque insuficiente para registrar a refeição.',
        insufficient,
      });
    }

    await transaction(async (conn) => {
      // atualiza menu se vinculado
      if (menu_id) {
        await conn.query(`UPDATE menus SET status='realizado', expected_students=? WHERE id=?`, [people, menu_id]);
      }

      // cria refeição
      await conn.query(`INSERT INTO meals (menu_id, meal_type_id, date, planned_students, served_students, recipe_id, status, registered_by, notes)
         VALUES (?,?,?,?,?,?,'realizado',?,?)`,
        [menu_id ? num(menu_id) : null, mt, mealDate, people, people, recipe_id ? num(recipe_id) : null, req.user.id, str(notes, 500)]);
      const mealId = await lastId(conn);

      // consome ingredientes FEFO
      for (const ci of consumptionItems) {
        const qty = calcTotalQuantity(ci.portion, ci.unit, people);
        // debita lotes FEFO
        let remaining = qty;
        const batchesRes = await conn.query('SELECT * FROM food_batches WHERE food_id = ? AND quantity > 0 ORDER BY expiry_date ASC, id ASC', [ci.food_id]);
        const batches = batchesRes[0];
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, batch.quantity);
          await conn.query('UPDATE food_batches SET quantity = quantity - ? WHERE id = ?', [take, batch.id]);
          await conn.query(`INSERT INTO stock_movements (food_id, batch_id, movement_type, reason, quantity, unit_cost, total_cost, reference_type, reference_id, responsible)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [ci.food_id, batch.id, 'saida', 'utilizacao_refeicao', take, batch.unit_cost || 0, take * (batch.unit_cost || 0), 'meal', mealId, req.user.name]);
          remaining -= take;
        }
        // ajusta estoque
        await conn.query('UPDATE stock SET quantity = GREATEST(0, quantity - ?), updated_at = NOW() WHERE food_id = ?', [qty, ci.food_id]);
        // registra consumo
        const plannedRes = await conn.query('SELECT total_quantity FROM menu_items WHERE menu_id = ? AND food_id = ?', [menu_id, ci.food_id]);
        const planned = plannedRes[0][0];
        await conn.query(`INSERT INTO meal_consumption (meal_id, food_id, quantity, unit, planned_quantity)
           VALUES (?,?,?,?,?)`,
          [mealId, ci.food_id, qty, ci.unit || 'kg', planned ? planned.total_quantity : 0]);
      }

      // registra sobras se informado
      if (leftovers) {
        await conn.query(`INSERT INTO leftovers (meal_id, date, meal_type_id, prepared_quantity, served_quantity, remaining_quantity, discarded_quantity, notes)
           VALUES (?,?,?,?,?,?,?,?)`,
          [mealId, mealDate, mt, num(leftovers.prepared_quantity), people, num(leftovers.remaining_quantity), num(leftovers.discarded_quantity), str(leftovers.notes, 300)]);
      }
    });

    await audit({ userId: req.user.id, action: 'registrar_consumo', module: 'consumo', entityType: 'meal', newValue: { date: mealDate, meal_type_id: mt, served_students: people, recipe_id } });
    await notifyLowStock();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Lista refeições realizadas
router.get('/consumo', requirePermission('consumo'), async (req, res, next) => {
  try {
    const start = str(req.query.start, 10) || '1900-01-01';
    const end = str(req.query.end, 10) || '2100-12-31';
    const rows = await query(`
      SELECT m.*, mt.name AS meal_type_name, r.name AS recipe_name, u.name AS registered_by_name,
             (SELECT SUM(mc.quantity) FROM meal_consumption mc WHERE mc.meal_id = m.id) AS total_kg,
             (SELECT COUNT(*) FROM meal_consumption mc WHERE mc.meal_id = m.id) AS items_count
      FROM meals m
      JOIN meal_types mt ON mt.id = m.meal_type_id
      LEFT JOIN recipes r ON r.id = m.recipe_id
      LEFT JOIN users u ON u.id = m.registered_by
      WHERE m.date BETWEEN ? AND ?
      ORDER BY m.date DESC, m.id DESC
    `, [start, end]);

    const withDetails = [];
    for (const r of rows) {
      withDetails.push({
        ...r,
        consumption: await query(`SELECT mc.*, f.name AS food_name, f.unit FROM meal_consumption mc JOIN foods f ON f.id = mc.food_id WHERE mc.meal_id = ?`, [r.id]),
      });
    }

    res.json(withDetails);
  } catch (err) { next(err); }
});

// ============================================================
// SOBRAS
// ============================================================
router.get('/sobras', requirePermission('sobras'), async (req, res, next) => {
  try {
    const days = Math.min(num(req.query.days, 30), 365);
    const start = addDays(today(), -days);
    res.json(await query(`
      SELECT l.*, mt.name AS meal_type_name, m.served_students
      FROM leftovers l
      LEFT JOIN meal_types mt ON mt.id = l.meal_type_id
      LEFT JOIN meals m ON m.id = l.meal_id
      WHERE l.date >= ? ORDER BY l.date DESC
    `, [start]));
  } catch (err) { next(err); }
});

router.post('/sobras', requirePermission('sobras', 'can_create'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { date, meal_type_id, prepared_quantity, served_quantity, remaining_quantity, discarded_quantity, meal_id, notes } = b;
    await run(`INSERT INTO leftovers (meal_id, date, meal_type_id, prepared_quantity, served_quantity, remaining_quantity, discarded_quantity, notes)
       VALUES (?,?,?,?,?,?,?,?)`,
      [meal_id ? num(meal_id) : null, str(date, 10) || today(), num(meal_type_id) || null, num(prepared_quantity), num(served_quantity), num(remaining_quantity), num(discarded_quantity), str(notes, 300)]);
    await audit({ userId: req.user.id, action: 'registrar', module: 'sobras', entityType: 'leftover', newValue: b });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ============================================================
// CONSUMO REAL X PLANEJADO
// ============================================================
router.get('/consumo/comparativo', requirePermission('consumo'), async (req, res, next) => {
  try {
    const start = str(req.query.start, 10) || '1900-01-01';
    const end = str(req.query.end, 10) || '2100-12-31';
    res.json(await query(`
      SELECT f.name, f.unit, f.avg_price,
             SUM(mc.planned_quantity) AS planned,
             SUM(mc.quantity) AS real_qty,
             SUM(mc.quantity) - SUM(mc.planned_quantity) AS difference
      FROM meal_consumption mc
      JOIN meals m ON m.id = mc.meal_id
      JOIN foods f ON f.id = mc.food_id
      WHERE m.date BETWEEN ? AND ?
      GROUP BY f.id
      HAVING planned > 0 OR real_qty > 0
      ORDER BY ABS(difference) DESC
    `, [start, end]));
  } catch (err) { next(err); }
});

export default router;
