import { Router } from 'express';
import { get, query } from '../db.js';
import { requireAuth, requirePermission } from '../auth.js';
import { num, str } from './helpers.js';
import { today, addDays, monthKey, yearKey, startOfMonth, endOfMonth, resolvePeriod } from '../utils.js';

const router = Router();
router.use(requireAuth);

router.get('/dashboard', requirePermission('dashboard'), async (req, res, next) => {
  try {
    const period = str(req.query.period, 20) || 'mes';
    const value = str(req.query.value, 10) || null;
    const customStart = str(req.query.start, 10) || null;
    const customEnd = str(req.query.end, 10) || null;
    const { start, end } = resolvePeriod(period, value, customStart, customEnd);
    const year = yearKey(start);

    // ---------- Indicadores ----------
    const totalStudents = (await get(`SELECT COALESCE(SUM(total_students),0) AS total FROM students_summary WHERE school_year=?`, [year])).total;

    const refeicoesPlanejadas = (await get(`SELECT COUNT(*) AS count FROM menus WHERE date BETWEEN ? AND ? AND status != 'cancelado'`, [start, end])).count;
    const refeicoesRealizadas = (await get(`SELECT COUNT(*) AS count FROM meals WHERE date BETWEEN ? AND ? AND status='realizado'`, [start, end])).count;
    const alunosServidos = (await get(`SELECT COALESCE(SUM(served_students),0) AS total FROM meals WHERE date BETWEEN ? AND ? AND status='realizado'`, [start, end])).total;

    const cardapiosPlanejados = (await get(`SELECT COUNT(DISTINCT date) AS count FROM menus WHERE date BETWEEN ? AND ? AND status != 'cancelado'`, [start, end])).count;

    const alimentosEstoque = (await get(`SELECT COUNT(*) AS count FROM stock WHERE quantity > 0`)).count;
    const estoqueBaixo = (await get(`SELECT COUNT(*) AS count FROM stock s JOIN foods f ON f.id = s.food_id WHERE s.quantity > 0 AND s.quantity <= f.min_stock`)).count;
    const alimentosFalta = (await get(`SELECT COUNT(*) AS count FROM stock WHERE quantity <= 0`)).count;
    const vencidos = (await get(`SELECT COUNT(*) AS count FROM food_batches WHERE quantity > 0 AND expiry_date < CURDATE()`)).count;
    const vence7 = (await get(`SELECT COUNT(*) AS count FROM food_batches WHERE quantity > 0 AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`)).count;

    const comprasRealizadas = (await get(`SELECT COUNT(*) AS count FROM purchases WHERE purchase_date BETWEEN ? AND ?`, [start, end])).count;
    const gastosMes = (await get(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date BETWEEN ? AND ?`, [start, end])).total;
    const gastosAno = (await get(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE substr(expense_date,1,4)=?`, [year])).total;

    const orcamentoAnual = await get(`SELECT amount FROM budgets WHERE period='ano' AND period_value=?`, [String(year)]);
    const orcamentoDisponivel = orcamentoAnual ? Math.max(0, orcamentoAnual.amount - gastosAno) : 0;

    const desperdicioMes = (await get(`SELECT COALESCE(SUM(estimated_cost),0) AS cost FROM waste WHERE date BETWEEN ? AND ?`, [start, end])).cost;

    // ---------- Gráficos ----------
    // 1. Consumo de alimentos por mês
    const consumoPorMes = await query(`
      SELECT DATE_FORMAT(m.date, '%Y-%m') AS month, SUM(mc.quantity) AS qty
      FROM meal_consumption mc JOIN meals m ON m.id = mc.meal_id
      WHERE DATE_FORMAT(m.date, '%Y') = ? AND m.status='realizado'
      GROUP BY month ORDER BY month
    `, [String(year)]);

    // 2. Gasto por mês
    const gastoPorMes = await query(`
      SELECT DATE_FORMAT(expense_date, '%Y-%m') AS month, SUM(amount) AS amount
      FROM expenses WHERE DATE_FORMAT(expense_date, '%Y') = ?
      GROUP BY month ORDER BY month
    `, [String(year)]);

    // 3. Refeições por mês
    const refeicoesPorMes = await query(`
      SELECT DATE_FORMAT(date, '%Y-%m') AS month, SUM(served_students) AS total
      FROM meals WHERE DATE_FORMAT(date, '%Y') = ? AND status='realizado'
      GROUP BY month ORDER BY month
    `, [String(year)]);

    // 4. Alimentos mais utilizados
    const alimentosMais = await query(`
      SELECT f.name, SUM(mc.quantity) AS qty, f.unit
      FROM meal_consumption mc JOIN foods f ON f.id = mc.food_id
      JOIN meals m ON m.id = mc.meal_id
      WHERE DATE_FORMAT(m.date, '%Y') = ? AND m.status='realizado'
      GROUP BY f.id ORDER BY qty DESC LIMIT 10
    `, [String(year)]);

    // 5. Alimentos menos utilizados
    const alimentosMenos = await query(`
      SELECT f.name, COALESCE(SUM(mc.quantity),0) AS qty, f.unit
      FROM foods f LEFT JOIN meal_consumption mc ON mc.food_id = f.id
      LEFT JOIN meals m ON m.id = mc.meal_id AND DATE_FORMAT(m.date, '%Y') = ? AND m.status='realizado'
      WHERE f.active = 1
      GROUP BY f.id HAVING qty >= 0 ORDER BY qty ASC LIMIT 10
    `, [String(year)]);

    // 6. Desperdício por mês
    const desperdicioPorMes = await query(`
      SELECT DATE_FORMAT(date, '%Y-%m') AS month, SUM(quantity) AS qty, SUM(estimated_cost) AS cost
      FROM waste WHERE DATE_FORMAT(date, '%Y') = ?
      GROUP BY month ORDER BY month
    `, [String(year)]);

    // 7. Gastos por categoria
    const gastosPorCategoria = await query(`
      SELECT ec.name, SUM(e.amount) AS amount
      FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
      WHERE DATE_FORMAT(e.expense_date, '%Y') = ?
      GROUP BY e.category_id ORDER BY amount DESC
    `, [String(year)]);

    // 8. Compras por mês
    const comprasPorMes = await query(`
      SELECT DATE_FORMAT(purchase_date, '%Y-%m') AS month, COUNT(*) AS count, SUM(total) AS total
      FROM purchases WHERE DATE_FORMAT(purchase_date, '%Y') = ?
      GROUP BY month ORDER BY month
    `, [String(year)]);

    // 9. Consumo por tipo de refeição
    const consumoPorTipo = await query(`
      SELECT mt.name, SUM(mc.quantity) AS qty
      FROM meal_consumption mc JOIN meals m ON m.id = mc.meal_id
      JOIN meal_types mt ON mt.id = m.meal_type_id
      WHERE DATE_FORMAT(m.date, '%Y') = ? AND m.status='realizado'
      GROUP BY mt.id ORDER BY qty DESC
    `, [String(year)]);

    // 10. Comparação planejado x real (consumo)
    const comparativo = await query(`
      SELECT f.name, f.unit,
             COALESCE(SUM(mc.planned_quantity),0) AS planned,
             COALESCE(SUM(mc.quantity),0) AS real_qty
      FROM meals m
      JOIN meal_consumption mc ON mc.meal_id = m.id
      JOIN foods f ON f.id = mc.food_id
      WHERE DATE_FORMAT(m.date, '%Y') = ? AND m.status='realizado'
      GROUP BY f.id ORDER BY ABS(planned - real_qty) DESC LIMIT 10
    `, [String(year)]);

    // Notificações recentes
    const notifications = await query(`SELECT * FROM notifications WHERE read = 0 ORDER BY
      CASE severity WHEN 'danger' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC LIMIT 10`);

    res.json({
      period: { start, end, period },
      indicators: {
        totalStudents,
        refeicoesPlanejadas,
        refeicoesRealizadas,
        cardapiosPlanejados,
        alunosServidos,
        alimentosEstoque,
        estoqueBaixo,
        alimentosFalta,
        vencidos,
        vence7,
        comprasRealizadas,
        gastosMes,
        gastosAno,
        orcamentoDisponivel,
        desperdicioMes,
      },
      charts: {
        consumoPorMes,
        gastoPorMes,
        refeicoesPorMes,
        alimentosMais,
        alimentosMenos,
        desperdicioPorMes,
        gastosPorCategoria,
        comprasPorMes,
        consumoPorTipo,
        comparativo,
      },
      notifications,
    });
  } catch (err) { next(err); }
});

export default router;
