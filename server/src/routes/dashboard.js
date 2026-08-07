import { Router } from 'express';
import { get, query } from '../db.js';
import { requireAuth, requirePermission } from '../auth.js';
import { num, str } from './helpers.js';
import { today, addDays, monthKey, yearKey, startOfMonth, endOfMonth, resolvePeriod } from '../utils.js';

const router = Router();
router.use(requireAuth);

router.get('/dashboard', requirePermission('dashboard'), (req, res) => {
  const period = str(req.query.period, 20) || 'mes';
  const value = str(req.query.value, 10) || null;
  const customStart = str(req.query.start, 10) || null;
  const customEnd = str(req.query.end, 10) || null;
  const { start, end } = resolvePeriod(period, value, customStart, customEnd);
  const year = yearKey(start);

  // ---------- Indicadores ----------
  const totalStudents = get(`SELECT COALESCE(SUM(total_students),0) AS total FROM students_summary WHERE school_year=?`, [year]).total;

  const refeicoesPlanejadas = get(`SELECT COUNT(*) AS count FROM menus WHERE date BETWEEN ? AND ? AND status != 'cancelado'`, [start, end]).count;
  const refeicoesRealizadas = get(`SELECT COUNT(*) AS count FROM meals WHERE date BETWEEN ? AND ? AND status='realizado'`, [start, end]).count;
  const alunosServidos = get(`SELECT COALESCE(SUM(served_students),0) AS total FROM meals WHERE date BETWEEN ? AND ? AND status='realizado'`, [start, end]).total;

  const cardapiosPlanejados = get(`SELECT COUNT(DISTINCT date) AS count FROM menus WHERE date BETWEEN ? AND ? AND status != 'cancelado'`, [start, end]).count;

  const alimentosEstoque = get(`SELECT COUNT(*) AS count FROM stock WHERE quantity > 0`).count;
  const estoqueBaixo = get(`SELECT COUNT(*) AS count FROM stock s JOIN foods f ON f.id = s.food_id WHERE s.quantity > 0 AND s.quantity <= f.min_stock`).count;
  const alimentosFalta = get(`SELECT COUNT(*) AS count FROM stock WHERE quantity <= 0`).count;
  const vencidos = get(`SELECT COUNT(*) AS count FROM food_batches WHERE quantity > 0 AND expiry_date < date('now')`).count;
  const vence7 = get(`SELECT COUNT(*) AS count FROM food_batches WHERE quantity > 0 AND expiry_date BETWEEN date('now') AND date('now', '+7 days')`).count;

  const comprasRealizadas = get(`SELECT COUNT(*) AS count FROM purchases WHERE purchase_date BETWEEN ? AND ?`, [start, end]).count;
  const gastosMes = get(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date BETWEEN ? AND ?`, [start, end]).total;
  const gastosAno = get(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE substr(expense_date,1,4)=?`, [year]).total;

  const orcamentoAnual = get(`SELECT amount FROM budgets WHERE period='ano' AND period_value=?`, [String(year)]);
  const orcamentoDisponivel = orcamentoAnual ? Math.max(0, orcamentoAnual.amount - gastosAno) : 0;

  const desperdicioMes = get(`SELECT COALESCE(SUM(estimated_cost),0) AS cost FROM waste WHERE date BETWEEN ? AND ?`, [start, end]).cost;

  // ---------- Gráficos ----------
  // 1. Consumo de alimentos por mês
  const consumoPorMes = query(`
    SELECT substr(m.date,1,7) AS month, SUM(mc.quantity) AS qty
    FROM meal_consumption mc JOIN meals m ON m.id = mc.meal_id
    WHERE substr(m.date,1,4) = ? AND m.status='realizado'
    GROUP BY month ORDER BY month
  `, [year]);

  // 2. Gasto por mês
  const gastoPorMes = query(`
    SELECT substr(expense_date,1,7) AS month, SUM(amount) AS amount
    FROM expenses WHERE substr(expense_date,1,4) = ?
    GROUP BY month ORDER BY month
  `, [year]);

  // 3. Refeições por mês
  const refeicoesPorMes = query(`
    SELECT substr(date,1,7) AS month, SUM(served_students) AS total
    FROM meals WHERE substr(date,1,4) = ? AND status='realizado'
    GROUP BY month ORDER BY month
  `, [year]);

  // 4. Alimentos mais utilizados
  const alimentosMais = query(`
    SELECT f.name, SUM(mc.quantity) AS qty, f.unit
    FROM meal_consumption mc JOIN foods f ON f.id = mc.food_id
    JOIN meals m ON m.id = mc.meal_id
    WHERE substr(m.date,1,4) = ? AND m.status='realizado'
    GROUP BY f.id ORDER BY qty DESC LIMIT 10
  `, [year]);

  // 5. Alimentos menos utilizados
  const alimentosMenos = query(`
    SELECT f.name, COALESCE(SUM(mc.quantity),0) AS qty, f.unit
    FROM foods f LEFT JOIN meal_consumption mc ON mc.food_id = f.id
    LEFT JOIN meals m ON m.id = mc.meal_id AND substr(m.date,1,4) = ? AND m.status='realizado'
    WHERE f.active = 1
    GROUP BY f.id HAVING qty >= 0 ORDER BY qty ASC LIMIT 10
  `, [year]);

  // 6. Desperdício por mês
  const desperdicioPorMes = query(`
    SELECT substr(date,1,7) AS month, SUM(quantity) AS qty, SUM(estimated_cost) AS cost
    FROM waste WHERE substr(date,1,4) = ?
    GROUP BY month ORDER BY month
  `, [year]);

  // 7. Gastos por categoria
  const gastosPorCategoria = query(`
    SELECT ec.name, SUM(e.amount) AS amount
    FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
    WHERE substr(e.expense_date,1,4) = ?
    GROUP BY e.category_id ORDER BY amount DESC
  `, [year]);

  // 8. Compras por mês
  const comprasPorMes = query(`
    SELECT substr(purchase_date,1,7) AS month, COUNT(*) AS count, SUM(total) AS total
    FROM purchases WHERE substr(purchase_date,1,4) = ?
    GROUP BY month ORDER BY month
  `, [year]);

  // 9. Consumo por tipo de refeição
  const consumoPorTipo = query(`
    SELECT mt.name, SUM(mc.quantity) AS qty
    FROM meal_consumption mc JOIN meals m ON m.id = mc.meal_id
    JOIN meal_types mt ON mt.id = m.meal_type_id
    WHERE substr(m.date,1,4) = ? AND m.status='realizado'
    GROUP BY mt.id ORDER BY qty DESC
  `, [year]);

  // 10. Comparação planejado x real (consumo)
  const comparativo = query(`
    SELECT f.name, f.unit,
           COALESCE(SUM(mc.planned_quantity),0) AS planned,
           COALESCE(SUM(mc.quantity),0) AS real_qty
    FROM meals m
    JOIN meal_consumption mc ON mc.meal_id = m.id
    JOIN foods f ON f.id = mc.food_id
    WHERE substr(m.date,1,4) = ? AND m.status='realizado'
    GROUP BY f.id ORDER BY ABS(planned - real_qty) DESC LIMIT 10
  `, [year]);

  // Notificações recentes
  const notifications = query(`SELECT * FROM notifications WHERE read = 0 ORDER BY
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
});

export default router;
