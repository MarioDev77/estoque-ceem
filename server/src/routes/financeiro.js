import { Router } from 'express';
import { get, query, run, lastId } from '../db.js';
import { requireAuth, requirePermission } from '../auth.js';
import { audit, str, num } from './helpers.js';
import { today, monthKey, yearKey, formatCurrency, startOfMonth, endOfMonth } from '../utils.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// DESPESAS
// ============================================================
router.get('/despesas', requirePermission('financeiro'), async (req, res, next) => {
  try {
    const start = str(req.query.start, 10) || '1900-01-01';
    const end = str(req.query.end, 10) || '2100-12-31';
    const rows = await query(`
      SELECT e.*, c.name AS category_name, s.name AS supplier_name
      FROM expenses e
      LEFT JOIN expense_categories c ON c.id = e.category_id
      LEFT JOIN suppliers s ON s.id = e.supplier_id
      WHERE e.expense_date BETWEEN ? AND ?
      ORDER BY e.expense_date DESC, e.id DESC
    `, [start, end]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/despesas/categorias', requirePermission('financeiro'), async (req, res, next) => {
  try {
    res.json(await query('SELECT * FROM expense_categories ORDER BY id'));
  } catch (err) { next(err); }
});

router.post('/despesas', requirePermission('financeiro', 'can_create'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { category_id, description, amount, expense_date, supplier_id, payment_method, responsible, notes } = b;
    if (!description || !amount) return res.status(400).json({ error: 'Informe descrição e valor.' });
    await run(`INSERT INTO expenses (category_id, description, amount, expense_date, supplier_id, payment_method, responsible, notes)
       VALUES (?,?,?,?,?,?,?,?)`,
      [num(category_id) || null, str(description, 300), num(amount), str(expense_date, 10) || today(), supplier_id ? num(supplier_id) : null, str(payment_method, 30), str(responsible) || req.user.name, str(notes, 300)]);
    const id = await lastId();
    await audit({ userId: req.user.id, action: 'criar', module: 'financeiro', entityType: 'expense', entityId: id, newValue: b });
    res.json({ ok: true, id });
  } catch (err) { next(err); }
});

router.put('/despesas/:id', requirePermission('financeiro', 'can_edit'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const old = await get('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
    if (!old) return res.status(404).json({ error: 'Despesa não encontrada.' });
    await run(`UPDATE expenses SET category_id=?, description=?, amount=?, expense_date=?, supplier_id=?, payment_method=?, notes=?
       WHERE id=?`,
      [num(b.category_id) || null, str(b.description, 300), num(b.amount), str(b.expense_date, 10) || today(), b.supplier_id ? num(b.supplier_id) : null, str(b.payment_method, 30), str(b.notes, 300), req.params.id]);
    await audit({ userId: req.user.id, action: 'editar', module: 'financeiro', entityType: 'expense', entityId: Number(req.params.id), oldValue: old, newValue: b });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/despesas/:id', requirePermission('financeiro', 'can_delete'), async (req, res, next) => {
  try {
    const old = await get('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
    if (!old) return res.status(404).json({ error: 'Despesa não encontrada.' });
    await run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    await audit({ userId: req.user.id, action: 'excluir', module: 'financeiro', entityType: 'expense', entityId: Number(req.params.id), oldValue: old });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ============================================================
// ORÇAMENTO
// ============================================================
router.get('/orcamento', requirePermission('orcamento'), async (req, res, next) => {
  try {
    const year = num(req.query.year, new Date().getFullYear());
    const budgets = await query('SELECT * FROM budgets WHERE school_year = ?', [year]);
    const spent = (await get(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE substr(expense_date,1,4)=?`, [String(year)])).total;

    res.json({
      year,
      budgets,
      spent,
      annual: budgets.find((b) => b.period === 'ano'),
      monthly: budgets.filter((b) => b.period === 'mes'),
      byCategory: budgets.filter((b) => b.period === 'categoria'),
    });
  } catch (err) { next(err); }
});

router.post('/orcamento', requirePermission('orcamento', 'can_create'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { school_year, period, period_value, amount, notes } = b;
    if (!period || !amount) return res.status(400).json({ error: 'Informe período e valor.' });
    await run(`INSERT INTO budgets (school_year, period, period_value, amount, notes)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount), notes = VALUES(notes)`,
      [num(school_year, new Date().getFullYear()), str(period, 20), str(period_value, 20), num(amount), str(notes, 300)]);
    await audit({ userId: req.user.id, action: 'criar', module: 'orcamento', entityType: 'budget', newValue: b });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ============================================================
// CUSTO POR REFEIÇÃO
// ============================================================
router.get('/custo-refeicao', requirePermission('financeiro'), async (req, res, next) => {
  try {
    const start = str(req.query.start, 10) || startOfMonth(today());
    const end = str(req.query.end, 10) || endOfMonth(today());

    const expenses = (await get(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date BETWEEN ? AND ?`, [start, end])).total;
    const meals = (await get(`SELECT COALESCE(SUM(served_students),0) AS count FROM meals WHERE date BETWEEN ? AND ? AND status='realizado'`, [start, end])).count;

    const daily = await query(`
      SELECT m.date, COALESCE(SUM(m.served_students),0) AS students, 0 AS day_expenses
      FROM meals m WHERE m.date BETWEEN ? AND ? AND m.status='realizado' GROUP BY m.date ORDER BY m.date
    `, [start, end]);

    // calcula despesas por dia (proporcional)
    const dayExpenses = await query(`
      SELECT expense_date, SUM(amount) AS amount FROM expenses
      WHERE expense_date BETWEEN ? AND ? GROUP BY expense_date
    `, [start, end]);
    const dayExpMap = {};
    for (const de of dayExpenses) dayExpMap[de.expense_date] = de.amount;

    const dailyCost = daily.map((d) => ({
      date: d.date,
      students: d.students,
      dayExpenses: dayExpMap[d.date] || 0,
      costPerStudent: d.students > 0 ? Math.round((dayExpMap[d.date] || 0) / d.students * 100) / 100 : 0,
    }));

    res.json({
      totalExpenses: expenses,
      totalMeals: meals,
      costPerMeal: meals > 0 ? Math.round(expenses / meals * 100) / 100 : 0,
      dailyCost,
    });
  } catch (err) { next(err); }
});

export default router;
