import { Router } from 'express';
import { get, query } from '../db.js';
import { requireAuth, requirePermission } from '../auth.js';
import { num, str } from './helpers.js';
import { today, startOfMonth, endOfMonth, monthKey, formatCurrency, formatNumber } from '../utils.js';

const router = Router();
router.use(requireAuth);

// Relatório anual completo
router.get('/relatorio-anual', requirePermission('relatorios'), (req, res) => {
  const year = num(req.query.year, new Date().getFullYear());
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const school = get('SELECT * FROM school_profile LIMIT 1');

  const refeicoes = get(`
    SELECT COUNT(*) AS meals, COALESCE(SUM(served_students),0) AS students
    FROM meals WHERE date BETWEEN ? AND ? AND status='realizado'
  `, [start, end]);

  const totalGasto = get(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date BETWEEN ? AND ?`, [start, end]).total;
  const custoMedio = refeicoes.students > 0 ? Math.round(totalGasto / refeicoes.students * 100) / 100 : 0;

  const alimentosConsumidos = get(`SELECT COALESCE(SUM(mc.quantity),0) AS total FROM meal_consumption mc JOIN meals m ON m.id = mc.meal_id WHERE m.date BETWEEN ? AND ?`, [start, end]).total;

  const compras = get(`
    SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total
    FROM purchases WHERE purchase_date BETWEEN ? AND ?
  `, [start, end]);

  const desperdicio = get(`
    SELECT COALESCE(SUM(quantity),0) AS qty, COALESCE(SUM(estimated_cost),0) AS cost
    FROM waste WHERE date BETWEEN ? AND ?
  `, [start, end]);

  const maisUtilizados = query(`
    SELECT f.name, f.unit, SUM(mc.quantity) AS qty
    FROM meal_consumption mc JOIN foods f ON f.id = mc.food_id JOIN meals m ON m.id = mc.meal_id
    WHERE m.date BETWEEN ? AND ? GROUP BY f.id ORDER BY qty DESC LIMIT 10
  `, [start, end]);

  const maisDesperdicados = query(`
    SELECT f.name, f.unit, SUM(w.quantity) AS qty, SUM(w.estimated_cost) AS cost
    FROM waste w JOIN foods f ON f.id = w.food_id
    WHERE w.date BETWEEN ? AND ? GROUP BY f.id ORDER BY qty DESC LIMIT 10
  `, [start, end]);

  const evolucaoGastos = query(`
    SELECT substr(expense_date,1,7) AS month, SUM(amount) AS amount
    FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY month ORDER BY month
  `, [start, end]);

  const evolucaoConsumo = query(`
    SELECT substr(m.date,1,7) AS month, SUM(m.served_students) AS meals
    FROM meals m WHERE m.date BETWEEN ? AND ? AND m.status='realizado' GROUP BY month ORDER BY month
  `, [start, end]);

  const diasLetivos = get(`SELECT COUNT(*) AS count FROM school_calendar WHERE school_year = ? AND day_type = 'letivo'`, [year]).count;
  const totalAlunos = get(`SELECT COALESCE(SUM(total_students),0) AS total FROM students_summary WHERE school_year = ?`, [year]).total;

  res.json({
    year,
    school,
    indicators: {
      totalRefeicoes: refeicoes.meals,
      totalAlunosServidos: refeicoes.students,
      totalAlunos,
      diasLetivos,
      totalGasto,
      custoMedio,
      alimentosConsumidos,
      comprasRealizadas: compras.count,
      totalCompras: compras.total,
      totalDesperdicio: desperdicio.qty,
      totalDesperdicioCost: desperdicio.cost,
    },
    maisUtilizados,
    maisDesperdicados,
    evolucaoGastos,
    evolucaoConsumo,
  });
});

// Relatórios por categoria
function reportData(type, start, end) {
  switch (type) {
    case 'consumo': {
      return query(`
        SELECT m.date, mt.name AS meal_type, f.name AS food, f.unit, mc.quantity
        FROM meal_consumption mc
        JOIN meals m ON m.id = mc.meal_id
        JOIN meal_types mt ON mt.id = m.meal_type_id
        JOIN foods f ON f.id = mc.food_id
        WHERE m.date BETWEEN ? AND ? AND m.status='realizado'
        ORDER BY m.date DESC, m.id DESC
      `, [start, end]);
    }
    case 'estoque': {
      return query(`
        SELECT f.name, f.unit, COALESCE(s.quantity,0) AS quantity, f.min_stock, f.ideal_stock,
               f.storage_location, fb.batch_number, fb.expiry_date
        FROM foods f
        LEFT JOIN stock s ON s.food_id = f.id
        LEFT JOIN food_batches fb ON fb.food_id = f.id AND fb.quantity > 0
        WHERE f.active = 1
        ORDER BY f.name
      `);
    }
    case 'compras': {
      return query(`
        SELECT p.purchase_date, s.name AS supplier, p.invoice_number, p.total,
               pi.food_name, pi.quantity, pi.unit_cost
        FROM purchases p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        LEFT JOIN (
          SELECT pi.purchase_id, f.name AS food_name, pi.quantity, pi.unit_cost
          FROM purchase_items pi JOIN foods f ON f.id = pi.food_id
        ) pi ON pi.purchase_id = p.id
        WHERE p.purchase_date BETWEEN ? AND ?
        ORDER BY p.purchase_date DESC
      `, [start, end]);
    }
    case 'gastos': {
      return query(`
        SELECT e.expense_date, ec.name AS category, e.description, e.amount, e.payment_method
        FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
        WHERE e.expense_date BETWEEN ? AND ?
        ORDER BY e.expense_date DESC
      `, [start, end]);
    }
    case 'desperdicio': {
      return query(`
        SELECT w.date, f.name AS food, w.quantity, w.unit, w.reason, w.estimated_cost, w.responsible
        FROM waste w JOIN foods f ON f.id = w.food_id
        WHERE w.date BETWEEN ? AND ?
        ORDER BY w.date DESC
      `, [start, end]);
    }
    case 'validade': {
      return query(`
        SELECT f.name, fb.batch_number, fb.quantity, f.unit, fb.entry_date, fb.expiry_date,
               CASE WHEN fb.expiry_date < date('now') THEN 'vencido'
                    WHEN fb.expiry_date <= date('now','+7 days') THEN 'vence 7 dias'
                    WHEN fb.expiry_date <= date('now','+30 days') THEN 'vence 30 dias'
                    ELSE 'ok' END AS status
        FROM food_batches fb JOIN foods f ON f.id = fb.food_id
        WHERE fb.quantity > 0 AND (fb.expiry_date IS NOT NULL AND fb.expiry_date < date('now','+30 days'))
        ORDER BY fb.expiry_date ASC
      `);
    }
    case 'refeicoes': {
      return query(`
        SELECT m.date, mt.name AS meal_type, m.served_students, m.planned_students, r.name AS recipe, m.notes
        FROM meals m
        JOIN meal_types mt ON mt.id = m.meal_type_id
        LEFT JOIN recipes r ON r.id = m.recipe_id
        WHERE m.date BETWEEN ? AND ? AND m.status='realizado'
        ORDER BY m.date DESC
      `, [start, end]);
    }
    case 'cardapios': {
      return query(`
        SELECT m.date, mt.name AS meal_type, m.title, m.expected_students, m.status,
               (SELECT GROUP_CONCAT(f.name,' + ') FROM menu_items mi JOIN foods f ON f.id = mi.food_id WHERE mi.menu_id = m.id) AS items
        FROM menus m JOIN meal_types mt ON mt.id = m.meal_type_id
        WHERE m.date BETWEEN ? AND ?
        ORDER BY m.date
      `, [start, end]);
    }
    case 'custo_refeicao': {
      const exp = get(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date BETWEEN ? AND ?`, [start, end]).total;
      const meals = get(`SELECT COALESCE(SUM(served_students),0) AS total FROM meals WHERE date BETWEEN ? AND ? AND status='realizado'`, [start, end]).total;
      return { totalExpenses: exp, totalMeals: meals, costPerMeal: meals > 0 ? exp / meals : 0 };
    }
    case 'consumo_alimento': {
      return query(`
        SELECT f.name, f.unit, SUM(mc.quantity) AS qty, COALESCE(SUM(mc.planned_quantity),0) AS planned
        FROM meal_consumption mc JOIN foods f ON f.id = mc.food_id JOIN meals m ON m.id = mc.meal_id
        WHERE m.date BETWEEN ? AND ? AND m.status='realizado'
        GROUP BY f.id ORDER BY qty DESC
      `, [start, end]);
    }
    default:
      return [];
  }
}

router.get('/relatorios', requirePermission('relatorios'), (req, res) => {
  const type = str(req.query.type, 20) || 'consumo';
  const start = str(req.query.start, 10) || startOfMonth(today());
  const end = str(req.query.end, 10) || endOfMonth(today());
  const data = reportData(type, start, end);
  res.json({ type, start, end, data });
});

export default router;
