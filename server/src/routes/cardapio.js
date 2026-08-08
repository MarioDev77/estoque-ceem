import { Router } from 'express';
import { get, query, run, transaction, lastId } from '../db.js';
import { requireAuth, requirePermission } from '../auth.js';
import { audit, str, num } from './helpers.js';
import { calcTotalQuantity, formatDateBR } from '../utils.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// TIPOS DE REFEIÇÃO
// ============================================================
router.get('/tipos-refeicao', requirePermission('cardapio'), async (req, res, next) => {
  try {
    res.json(await query('SELECT * FROM meal_types ORDER BY id'));
  } catch (err) { next(err); }
});

// ============================================================
// FICHAS TÉCNICAS (RECEITAS)
// ============================================================
router.get('/fichas', requirePermission('fichas'), async (req, res, next) => {
  try {
    const recipeId = req.query.id ? num(req.query.id) : null;
    const rows = await query(`
      SELECT r.*, mt.name AS meal_type_name
      FROM recipes r LEFT JOIN meal_types mt ON mt.id = r.meal_type_id
      ORDER BY r.name
    `);
    if (recipeId) {
      const recipe = rows.find((r) => r.id === recipeId);
      if (!recipe) return res.status(404).json({ error: 'Ficha não encontrada.' });
      recipe.ingredients = await query(`
        SELECT ri.*, f.name AS food_name, f.unit AS food_unit
        FROM recipe_ingredients ri JOIN foods f ON f.id = ri.food_id
        WHERE ri.recipe_id = ? ORDER BY ri.id
      `, [recipeId]);
      return res.json(recipe);
    }
    // Inclui ingredientes de cada ficha
    const withIng = [];
    for (const r of rows) {
      withIng.push({
        ...r,
        ingredients: await query('SELECT ri.*, f.name AS food_name, f.unit AS food_unit FROM recipe_ingredients ri JOIN foods f ON f.id = ri.food_id WHERE ri.recipe_id = ?', [r.id]),
      });
    }
    res.json(withIng);
  } catch (err) { next(err); }
});

router.post('/fichas', requirePermission('fichas', 'can_create'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { name, meal_type_id, ingredients = [], instructions, observations, servings } = b;
    if (!name) return res.status(400).json({ error: 'Informe o nome da ficha técnica.' });

    await transaction(async (conn) => {
      await conn.query(`INSERT INTO recipes (name, meal_type_id, servings, yield_amount, yield_unit, instructions, observations)
         VALUES (?,?,?,?,?,?,?)`,
        [str(name), num(meal_type_id) || null, num(servings, 1) || 1, num(servings, 1), 'porções', str(instructions, 3000), str(observations, 1000)]);
      const recipeId = await lastId(conn);
      for (const ing of ingredients) {
        if (!ing.food_id || !ing.quantity_per_serving) continue;
        await conn.query(`INSERT INTO recipe_ingredients (recipe_id, food_id, quantity_per_serving, unit, notes)
           VALUES (?,?,?,?,?)`,
          [recipeId, num(ing.food_id), num(ing.quantity_per_serving), str(ing.unit, 10) || 'kg', str(ing.notes, 300)]);
      }
      await audit({ userId: req.user.id, action: 'criar', module: 'fichas', entityType: 'recipe', entityId: recipeId, newValue: b });
      res.json({ ok: true, id: recipeId });
    });
  } catch (err) { next(err); }
});

router.put('/fichas/:id', requirePermission('fichas', 'can_edit'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const old = await get('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
    if (!old) return res.status(404).json({ error: 'Ficha não encontrada.' });
    await transaction(async (conn) => {
      await conn.query(`UPDATE recipes SET name=?, meal_type_id=?, servings=?, instructions=?, observations=?, updated_at=NOW()
         WHERE id=?`,
        [str(b.name), num(b.meal_type_id) || null, num(b.servings, 1) || 1, str(b.instructions, 3000), str(b.observations, 1000), req.params.id]);
      // substitui ingredientes
      await conn.query('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [req.params.id]);
      for (const ing of (b.ingredients || [])) {
        if (!ing.food_id || !ing.quantity_per_serving) continue;
        await conn.query(`INSERT INTO recipe_ingredients (recipe_id, food_id, quantity_per_serving, unit, notes)
           VALUES (?,?,?,?,?)`,
          [req.params.id, num(ing.food_id), num(ing.quantity_per_serving), str(ing.unit, 10) || 'kg', str(ing.notes, 300)]);
      }
      await audit({ userId: req.user.id, action: 'editar', module: 'fichas', entityType: 'recipe', entityId: Number(req.params.id), oldValue: old, newValue: b });
      res.json({ ok: true });
    });
  } catch (err) { next(err); }
});

router.delete('/fichas/:id', requirePermission('fichas', 'can_delete'), async (req, res, next) => {
  try {
    await run('DELETE FROM recipes WHERE id = ?', [req.params.id]);
    await audit({ userId: req.user.id, action: 'excluir', module: 'fichas', entityType: 'recipe', entityId: Number(req.params.id) });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ============================================================
// CARDÁPIOS (refeições planejadas)
// ============================================================
router.get('/cardapios', requirePermission('cardapio'), async (req, res, next) => {
  try {
    const start = str(req.query.start, 10) || '1900-01-01';
    const end = str(req.query.end, 10) || '2100-12-31';

    const menus = await query(`
      SELECT m.*, m.notes AS description, mt.name AS meal_type_name,
             (SELECT GROUP_CONCAT(f.name SEPARATOR ' + ') FROM menu_items mi JOIN foods f ON f.id = mi.food_id WHERE mi.menu_id = m.id) AS items_summary,
             (SELECT GROUP_CONCAT(CONCAT(mi.total_quantity, ' ', f.unit) SEPARATOR '; ') FROM menu_items mi JOIN foods f ON f.id = mi.food_id WHERE mi.menu_id = m.id) AS quantities_summary
      FROM menus m
      JOIN meal_types mt ON mt.id = m.meal_type_id
      WHERE m.date BETWEEN ? AND ?
      ORDER BY m.date, m.meal_type_id
    `, [start, end]);

    const menusWithItems = [];
    for (const m of menus) {
      menusWithItems.push({
        ...m,
        items: await query(`
          SELECT mi.*, f.name AS food_name, f.unit, COALESCE(s.quantity,0) AS stock_quantity
          FROM menu_items mi
          JOIN foods f ON f.id = mi.food_id
          LEFT JOIN stock s ON s.food_id = mi.food_id
          WHERE mi.menu_id = ?
        `, [m.id]),
      });
    }

    res.json(menusWithItems);
  } catch (err) { next(err); }
});

// Criar/atualizar cardápio de um dia: substitui todas as refeições do dia
router.post('/cardapios', requirePermission('cardapio', 'can_create'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { date, meals = [] } = b; // meals: [{meal_type_id, title, description, expected_students, items:[{food_id,portion_per_student}]}]
    if (!date) return res.status(400).json({ error: 'Informe a data.' });

    await transaction(async (conn) => {
      await conn.query('DELETE FROM menus WHERE date = ?', [date]);
      for (const meal of meals) {
        const mealTypeId = num(meal.meal_type_id);
        if (!mealTypeId) continue;
        const expectedStudents = num(meal.expected_students, 0);
        await conn.query(`INSERT INTO menus (date, meal_type_id, title, expected_students, status, notes, created_by)
           VALUES (?,?,?,?,'planejado',?,?)`,
          [str(date), mealTypeId, str(meal.title, 200), expectedStudents, str(meal.description, 300), req.user.id]);
        const menuId = await lastId(conn);
        for (const item of (meal.items || [])) {
          const food = await conn.query('SELECT * FROM foods WHERE id = ?', [num(item.food_id)]);
          if (!food[0] || !food[0][0]) continue;
          const f = food[0][0];
          const portion = num(item.portion_per_student);
          const total = calcTotalQuantity(portion, f.unit, expectedStudents);
          await conn.query(`INSERT INTO menu_items (menu_id, food_id, portion_per_student, total_quantity)
             VALUES (?,?,?,?)`, [menuId, f.id, portion, total]);
        }
      }
      await audit({ userId: req.user.id, action: 'criar', module: 'cardapio', entityType: 'menu', newValue: { date, meals } });
      res.json({ ok: true, date });
    });
  } catch (err) { next(err); }
});

// Planejar cardápio de um período a partir de uma ficha técnica (ou de um texto livre)
router.post('/cardapios/planejar', requirePermission('cardapio', 'can_create'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { start, end, recipe_id, meal_type_id, students, title, description } = b;
    if (!start || !end) return res.status(400).json({ error: 'Informe o período.' });
    if (!recipe_id && !str(title)) return res.status(400).json({ error: 'Selecione uma ficha técnica ou escreva o cardápio.' });

    const people = num(students, 0);
    let recipe = null;
    let ingredients = [];
    if (recipe_id) {
      recipe = await get('SELECT * FROM recipes WHERE id = ?', [recipe_id]);
      if (!recipe) return res.status(404).json({ error: 'Ficha técnica não encontrada.' });
      ingredients = await query('SELECT * FROM recipe_ingredients WHERE recipe_id = ?', [recipe_id]);
    }
    const menuTitle = recipe ? 'Cardápio do dia — ' + recipe.name : str(title, 200);
    const menuDescription = str(description, 300) || (recipe ? '' : str(title, 300));

    await transaction(async (conn) => {
      // gera em dias letivos (seg-sex)
      let cur = str(start);
      let created = 0;
      let guard = 0;
      while (cur <= str(end) && guard < 400) {
        const dow = new Date(`${cur}T00:00:00`).getDay();
        if (dow !== 0 && dow !== 6) {
          // verifica calendário
          const calRes = await conn.query(`SELECT day_type FROM school_calendar WHERE date = ?`, [cur]);
          const cal = calRes[0][0];
          const dayType = cal ? cal.day_type : 'letivo';
          if (dayType === 'letivo' || dayType === 'evento') {
            await conn.query(`INSERT INTO menus (date, meal_type_id, title, expected_students, status, notes, created_by)
               VALUES (?,?,?,?,'planejado',?,?)`,
              [cur, num(meal_type_id) || (recipe && recipe.meal_type_id) || 2, menuTitle, people, menuDescription, req.user.id]);
            const menuId = await lastId(conn);
            for (const ing of ingredients) {
              const total = calcTotalQuantity(ing.quantity_per_serving, ing.unit, people);
              await conn.query(`INSERT INTO menu_items (menu_id, food_id, portion_per_student, total_quantity)
                 VALUES (?,?,?,?)`, [menuId, ing.food_id, ing.quantity_per_serving, total]);
            }
            created++;
          }
        }
        // avança 1 dia
        const nd = new Date(`${cur}T00:00:00`);
        nd.setDate(nd.getDate() + 1);
        cur = nd.toISOString().slice(0, 10);
        guard++;
      }
      await audit({ userId: req.user.id, action: 'planejar', module: 'cardapio', entityType: 'menu', newValue: { start, end, recipe_id, title: menuTitle, students: people, created } });
      res.json({ ok: true, created });
    });
  } catch (err) { next(err); }
});

// ============================================================
// CALENDÁRIO DE REFEIÇÕES (visão mensal)
// ============================================================
router.get('/cardapios/mes', requirePermission('cardapio'), async (req, res, next) => {
  try {
    const year = num(req.query.year, new Date().getFullYear());
    const month = num(req.query.month, new Date().getMonth() + 1);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const menus = await query(`
      SELECT m.date, m.id, m.meal_type_id, mt.name AS meal_type_name, m.title,
             m.expected_students, m.status, m.notes AS description,
             (SELECT GROUP_CONCAT(f.name SEPARATOR ' + ') FROM menu_items mi JOIN foods f ON f.id = mi.food_id WHERE mi.menu_id = m.id) AS items
      FROM menus m JOIN meal_types mt ON mt.id = m.meal_type_id
      WHERE m.date BETWEEN ? AND ?
      ORDER BY m.date, m.meal_type_id
    `, [start, end]);

    const calendar = await query('SELECT * FROM school_calendar WHERE date BETWEEN ? AND ?', [start, end]);
    const school = await get('SELECT * FROM school_profile LIMIT 1');

    res.json({ menus, calendar, school, year, month });
  } catch (err) { next(err); }
});

export default router;
