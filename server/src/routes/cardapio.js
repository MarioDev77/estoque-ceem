import { Router } from 'express';
import { get, query, run, transaction } from '../db.js';
import { requireAuth, requirePermission } from '../auth.js';
import { audit, str, num } from './helpers.js';
import { calcTotalQuantity, formatDateBR } from '../utils.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// TIPOS DE REFEIÇÃO
// ============================================================
router.get('/tipos-refeicao', requirePermission('cardapio'), (req, res) => {
  res.json(query('SELECT * FROM meal_types ORDER BY id'));
});

// ============================================================
// FICHAS TÉCNICAS (RECEITAS)
// ============================================================
router.get('/fichas', requirePermission('fichas'), (req, res) => {
  const recipeId = req.query.id ? num(req.query.id) : null;
  const rows = query(`
    SELECT r.*, mt.name AS meal_type_name
    FROM recipes r LEFT JOIN meal_types mt ON mt.id = r.meal_type_id
    ORDER BY r.name
  `);
  if (recipeId) {
    const recipe = rows.find((r) => r.id === recipeId);
    if (!recipe) return res.status(404).json({ error: 'Ficha não encontrada.' });
    recipe.ingredients = query(`
      SELECT ri.*, f.name AS food_name, f.unit AS food_unit
      FROM recipe_ingredients ri JOIN foods f ON f.id = ri.food_id
      WHERE ri.recipe_id = ? ORDER BY ri.id
    `, [recipeId]);
    return res.json(recipe);
  }
  // Inclui ingredientes de cada ficha
  const withIng = rows.map((r) => ({
    ...r,
    ingredients: query('SELECT ri.*, f.name AS food_name, f.unit AS food_unit FROM recipe_ingredients ri JOIN foods f ON f.id = ri.food_id WHERE ri.recipe_id = ?', [r.id]),
  }));
  res.json(withIng);
});

router.post('/fichas', requirePermission('fichas', 'can_create'), (req, res) => {
  const b = req.body || {};
  const { name, meal_type_id, ingredients = [], instructions, observations, servings } = b;
  if (!name) return res.status(400).json({ error: 'Informe o nome da ficha técnica.' });

  transaction(() => {
    run(`INSERT INTO recipes (name, meal_type_id, servings, yield_amount, yield_unit, instructions, observations)
         VALUES (?,?,?,?,?,?,?)`,
      [str(name), num(meal_type_id) || null, num(servings, 1) || 1, num(servings, 1), 'porções', str(instructions, 3000), str(observations, 1000)]);
    const recipeId = get('SELECT last_insert_rowid() AS id').id;
    for (const ing of ingredients) {
      if (!ing.food_id || !ing.quantity_per_serving) continue;
      run(`INSERT INTO recipe_ingredients (recipe_id, food_id, quantity_per_serving, unit, notes)
           VALUES (?,?,?,?,?)`,
        [recipeId, num(ing.food_id), num(ing.quantity_per_serving), str(ing.unit, 10) || 'kg', str(ing.notes, 300)]);
    }
    audit({ userId: req.user.id, action: 'criar', module: 'fichas', entityType: 'recipe', entityId: recipeId, newValue: b });
    res.json({ ok: true, id: recipeId });
  });
});

router.put('/fichas/:id', requirePermission('fichas', 'can_edit'), (req, res) => {
  const b = req.body || {};
  const old = get('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
  if (!old) return res.status(404).json({ error: 'Ficha não encontrada.' });
  transaction(() => {
    run(`UPDATE recipes SET name=?, meal_type_id=?, servings=?, instructions=?, observations=?, updated_at=datetime('now')
         WHERE id=?`,
      [str(b.name), num(b.meal_type_id) || null, num(b.servings, 1) || 1, str(b.instructions, 3000), str(b.observations, 1000), req.params.id]);
    // substitui ingredientes
    run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [req.params.id]);
    for (const ing of (b.ingredients || [])) {
      if (!ing.food_id || !ing.quantity_per_serving) continue;
      run(`INSERT INTO recipe_ingredients (recipe_id, food_id, quantity_per_serving, unit, notes)
           VALUES (?,?,?,?,?)`,
        [req.params.id, num(ing.food_id), num(ing.quantity_per_serving), str(ing.unit, 10) || 'kg', str(ing.notes, 300)]);
    }
    audit({ userId: req.user.id, action: 'editar', module: 'fichas', entityType: 'recipe', entityId: Number(req.params.id), oldValue: old, newValue: b });
    res.json({ ok: true });
  });
});

router.delete('/fichas/:id', requirePermission('fichas', 'can_delete'), (req, res) => {
  run('DELETE FROM recipes WHERE id = ?', [req.params.id]);
  audit({ userId: req.user.id, action: 'excluir', module: 'fichas', entityType: 'recipe', entityId: Number(req.params.id) });
  res.json({ ok: true });
});

// ============================================================
// CARDÁPIOS (refeições planejadas)
// ============================================================
router.get('/cardapios', requirePermission('cardapio'), (req, res) => {
  const start = str(req.query.start, 10) || '1900-01-01';
  const end = str(req.query.end, 10) || '2100-12-31';

  const menus = query(`
    SELECT m.*, mt.name AS meal_type_name,
           (SELECT GROUP_CONCAT(f.name, ' + ') FROM menu_items mi JOIN foods f ON f.id = mi.food_id WHERE mi.menu_id = m.id) AS items_summary,
           (SELECT GROUP_CONCAT(mi.total_quantity || ' ' || f.unit, '; ') FROM menu_items mi JOIN foods f ON f.id = mi.food_id WHERE mi.menu_id = m.id) AS quantities_summary
    FROM menus m
    JOIN meal_types mt ON mt.id = m.meal_type_id
    WHERE m.date BETWEEN ? AND ?
    ORDER BY m.date, m.meal_type_id
  `, [start, end]);

  const menusWithItems = menus.map((m) => ({
    ...m,
    items: query(`
      SELECT mi.*, f.name AS food_name, f.unit, COALESCE(s.quantity,0) AS stock_quantity
      FROM menu_items mi
      JOIN foods f ON f.id = mi.food_id
      LEFT JOIN stock s ON s.food_id = mi.food_id
      WHERE mi.menu_id = ?
    `, [m.id]),
  }));

  res.json(menusWithItems);
});

// Criar/atualizar cardápio de um dia: substitui todas as refeições do dia
router.post('/cardapios', requirePermission('cardapio', 'can_create'), (req, res) => {
  const b = req.body || {};
  const { date, meals = [] } = b; // meals: [{meal_type_id, title, expected_students, items:[{food_id,portion_per_student}]}]
  if (!date) return res.status(400).json({ error: 'Informe a data.' });

  transaction(() => {
    run('DELETE FROM menus WHERE date = ?', [date]);
    for (const meal of meals) {
      const mealTypeId = num(meal.meal_type_id);
      if (!mealTypeId) continue;
      const expectedStudents = num(meal.expected_students, 0);
      run(`INSERT INTO menus (date, meal_type_id, title, expected_students, status, created_by)
           VALUES (?,?,?,?,'planejado',?)`,
        [str(date), mealTypeId, str(meal.title, 200), expectedStudents, req.user.id]);
      const menuId = get('SELECT last_insert_rowid() AS id').id;
      for (const item of (meal.items || [])) {
        const food = get('SELECT * FROM foods WHERE id = ?', [num(item.food_id)]);
        if (!food) continue;
        const portion = num(item.portion_per_student);
        const total = calcTotalQuantity(portion, food.unit, expectedStudents);
        run(`INSERT INTO menu_items (menu_id, food_id, portion_per_student, total_quantity)
             VALUES (?,?,?,?)`, [menuId, food.id, portion, total]);
      }
    }
    audit({ userId: req.user.id, action: 'criar', module: 'cardapio', entityType: 'menu', newValue: { date, meals } });
    res.json({ ok: true, date });
  });
});

// Planejar cardápio de um período a partir de uma ficha técnica
router.post('/cardapios/planejar', requirePermission('cardapio', 'can_create'), (req, res) => {
  const b = req.body || {};
  const { start, end, recipe_id, meal_type_id, students, days } = b;
  if (!start || !end || !recipe_id) return res.status(400).json({ error: 'Informe período e ficha técnica.' });

  const people = num(students, 0);
  const recipe = get('SELECT * FROM recipes WHERE id = ?', [recipe_id]);
  if (!recipe) return res.status(404).json({ error: 'Ficha técnica não encontrada.' });

  const ingredients = query('SELECT * FROM recipe_ingredients WHERE recipe_id = ?', [recipe_id]);

  transaction(() => {
    // gera em dias letivos (seg-sex)
    let cur = str(start);
    let created = 0;
    let guard = 0;
    const menusMap = {};
    while (cur <= str(end) && guard < 400) {
      const dow = new Date(`${cur}T00:00:00`).getDay();
      if (dow !== 0 && dow !== 6) {
        // verifica calendário
        const cal = get(`SELECT day_type FROM school_calendar WHERE date = ?`, [cur]);
        const dayType = cal ? cal.day_type : 'letivo';
        if (dayType === 'letivo' || dayType === 'evento') {
          run(`INSERT INTO menus (date, meal_type_id, title, expected_students, status, created_by)
               VALUES (?,?,?,?,'planejado',?)`,
            [cur, num(meal_type_id) || recipe.meal_type_id || 2, 'Cardápio do dia — ' + recipe.name, people, req.user.id]);
          const menuId = get('SELECT last_insert_rowid() AS id').id;
          for (const ing of ingredients) {
            const total = calcTotalQuantity(ing.quantity_per_serving, ing.unit, people);
            run(`INSERT INTO menu_items (menu_id, food_id, portion_per_student, total_quantity)
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
    audit({ userId: req.user.id, action: 'planejar', module: 'cardapio', entityType: 'menu', newValue: { start, end, recipe_id, students: people, created } });
    res.json({ ok: true, created });
  });
});

// ============================================================
// CALENDÁRIO DE REFEIÇÕES (visão mensal)
// ============================================================
router.get('/cardapios/mes', requirePermission('cardapio'), (req, res) => {
  const year = num(req.query.year, new Date().getFullYear());
  const month = num(req.query.month, new Date().getMonth() + 1);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const menus = query(`
    SELECT m.date, m.id, m.meal_type_id, mt.name AS meal_type_name, m.title,
           m.expected_students, m.status,
           (SELECT GROUP_CONCAT(f.name, ' + ') FROM menu_items mi JOIN foods f ON f.id = mi.food_id WHERE mi.menu_id = m.id) AS items
    FROM menus m JOIN meal_types mt ON mt.id = m.meal_type_id
    WHERE m.date BETWEEN ? AND ?
    ORDER BY m.date, m.meal_type_id
  `, [start, end]);

  const calendar = query('SELECT * FROM school_calendar WHERE date BETWEEN ? AND ?', [start, end]);
  const school = get('SELECT * FROM school_profile LIMIT 1');

  res.json({ menus, calendar, school, year, month });
});

export default router;

