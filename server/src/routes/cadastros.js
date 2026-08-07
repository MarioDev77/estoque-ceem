import { Router } from 'express';
import { get, query, run } from '../db.js';
import { requireAuth, requirePermission, hashPassword } from '../auth.js';
import { audit, str, num, validEmail, validCNPJ } from './helpers.js';
import { today } from '../utils.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// CADASTRO DE ALUNOS
// ============================================================
router.get('/alunos', requirePermission('alunos'), (req, res) => {
  const rows = query('SELECT * FROM students_summary ORDER BY school_year DESC, shift');
  const totals = query(`
    SELECT school_year, SUM(total_students) AS total, SUM(estimated_meals_per_day) AS meals
    FROM students_summary GROUP BY school_year ORDER BY school_year DESC
  `);
  res.json({ rows, totals });
});

router.post('/alunos', requirePermission('alunos', 'can_create'), (req, res) => {
  const { school_year, shift, total_students, estimated_meals_per_day, notes } = req.body || {};
  const year = num(school_year, new Date().getFullYear());
  run(`INSERT INTO students_summary (school_year, shift, total_students, estimated_meals_per_day, notes)
       VALUES (?,?,?,?,?)`,
    [year, str(shift), num(total_students), num(estimated_meals_per_day), str(notes, 500)]);
  const id = get('SELECT last_insert_rowid() AS id').id;
  audit({ userId: req.user.id, action: 'criar', module: 'alunos', entityType: 'students_summary', entityId: id, newValue: { shift, total_students } });
  res.json({ ok: true, id });
});

router.put('/alunos/:id', requirePermission('alunos', 'can_edit'), (req, res) => {
  const { total_students, estimated_meals_per_day, notes } = req.body || {};
  const old = get('SELECT * FROM students_summary WHERE id = ?', [req.params.id]);
  if (!old) return res.status(404).json({ error: 'Registro não encontrado.' });
  run(`UPDATE students_summary SET total_students = ?, estimated_meals_per_day = ?, notes = ? WHERE id = ?`,
    [num(total_students), num(estimated_meals_per_day), str(notes, 500), req.params.id]);
  audit({ userId: req.user.id, action: 'editar', module: 'alunos', entityType: 'students_summary', entityId: Number(req.params.id), oldValue: old, newValue: { total_students, estimated_meals_per_day } });
  res.json({ ok: true });
});

// ============================================================
// CALENDÁRIO ESCOLAR
// ============================================================
router.get('/calendario', requirePermission('calendario'), (req, res) => {
  const year = num(req.query.year, new Date().getFullYear());
  const rows = query('SELECT * FROM school_calendar WHERE school_year = ? ORDER BY date', [year]);
  const summary = query(`SELECT day_type, COUNT(*) AS count FROM school_calendar WHERE school_year = ? GROUP BY day_type`, [year]);
  res.json({ rows, summary, year });
});

router.post('/calendario', requirePermission('calendario', 'can_create'), (req, res) => {
  const { school_year, date, day_type, description } = req.body || {};
  run(`INSERT OR REPLACE INTO school_calendar (school_year, date, day_type, description) VALUES (?,?,?,?)`,
    [num(school_year, new Date().getFullYear()), str(date), str(day_type, 30) || 'letivo', str(description, 300)]);
  audit({ userId: req.user.id, action: 'criar', module: 'calendario', entityType: 'school_calendar', newValue: { date, day_type } });
  res.json({ ok: true });
});

router.put('/calendario/:id', requirePermission('calendario', 'can_edit'), (req, res) => {
  const { day_type, description } = req.body || {};
  const old = get('SELECT * FROM school_calendar WHERE id = ?', [req.params.id]);
  if (!old) return res.status(404).json({ error: 'Registro não encontrado.' });
  run(`UPDATE school_calendar SET day_type = ?, description = ? WHERE id = ?`, [str(day_type, 30), str(description, 300), req.params.id]);
  audit({ userId: req.user.id, action: 'editar', module: 'calendario', entityType: 'school_calendar', entityId: Number(req.params.id), oldValue: old, newValue: { day_type } });
  res.json({ ok: true });
});

router.delete('/calendario/:id', requirePermission('calendario', 'can_delete'), (req, res) => {
  run('DELETE FROM school_calendar WHERE id = ?', [req.params.id]);
  audit({ userId: req.user.id, action: 'excluir', module: 'calendario', entityType: 'school_calendar', entityId: Number(req.params.id) });
  res.json({ ok: true });
});

// ============================================================
// CATEGORIAS E ALIMENTOS
// ============================================================
router.get('/categorias', requirePermission('alimentos'), (req, res) => {
  res.json(query('SELECT * FROM food_categories ORDER BY id'));
});

router.post('/categorias', requirePermission('alimentos', 'can_create'), (req, res) => {
  const { name, description } = req.body || {};
  run(`INSERT INTO food_categories (name, description) VALUES (?,?)`, [str(name), str(description, 300)]);
  audit({ userId: req.user.id, action: 'criar', module: 'alimentos', entityType: 'food_categories', newValue: { name } });
  res.json({ ok: true });
});

router.get('/alimentos', requirePermission('alimentos'), (req, res) => {
  const search = str(req.query.search, 100);
  let sql = `SELECT f.*, c.name AS category_name,
             COALESCE(s.quantity,0) AS stock_quantity
             FROM foods f
             LEFT JOIN food_categories c ON c.id = f.category_id
             LEFT JOIN stock s ON s.food_id = f.id
             WHERE f.active = 1`;
  const params = [];
  if (search) {
    sql += ` AND (f.name LIKE ? OR f.barcode LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ` ORDER BY f.name`;
  res.json(query(sql, params));
});

router.post('/alimentos', requirePermission('alimentos', 'can_create'), (req, res) => {
  const b = req.body || {};
  const barcode = str(b.barcode);
  const dup = barcode ? get('SELECT id FROM foods WHERE barcode = ?', [barcode]) : null;
  if (dup) return res.status(400).json({ error: 'Já existe alimento com este código de barras.' });
  run(`INSERT INTO foods (name, category_id, unit, photo, barcode, brand, storage_location, avg_price, min_stock, ideal_stock, active)
       VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
    [str(b.name), num(b.category_id) || null, str(b.unit, 10) || 'kg', str(b.photo, 500), barcode, str(b.brand), str(b.storage_location), num(b.avg_price), num(b.min_stock), num(b.ideal_stock)]);
  const id = get('SELECT last_insert_rowid() AS id').id;
  run('INSERT OR IGNORE INTO stock (food_id, quantity) VALUES (?,0)', [id]);
  audit({ userId: req.user.id, action: 'criar', module: 'alimentos', entityType: 'food', entityId: id, newValue: b });
  res.json({ ok: true, id });
});

router.put('/alimentos/:id', requirePermission('alimentos', 'can_edit'), (req, res) => {
  const b = req.body || {};
  const old = get('SELECT * FROM foods WHERE id = ?', [req.params.id]);
  if (!old) return res.status(404).json({ error: 'Alimento não encontrado.' });
  run(`UPDATE foods SET name=?, category_id=?, unit=?, photo=?, brand=?, storage_location=?, avg_price=?, min_stock=?, ideal_stock=?
       WHERE id=?`,
    [str(b.name), num(b.category_id) || null, str(b.unit, 10) || 'kg', str(b.photo, 500), str(b.brand), str(b.storage_location), num(b.avg_price), num(b.min_stock), num(b.ideal_stock), req.params.id]);
  audit({ userId: req.user.id, action: 'editar', module: 'alimentos', entityType: 'food', entityId: Number(req.params.id), oldValue: old, newValue: b });
  res.json({ ok: true });
});

router.delete('/alimentos/:id', requirePermission('alimentos', 'can_delete'), (req, res) => {
  run('UPDATE foods SET active = 0 WHERE id = ?', [req.params.id]);
  audit({ userId: req.user.id, action: 'excluir', module: 'alimentos', entityType: 'food', entityId: Number(req.params.id) });
  res.json({ ok: true });
});

// ============================================================
// FORNECEDORES
// ============================================================
router.get('/fornecedores', requirePermission('fornecedores'), (req, res) => {
  res.json(query('SELECT * FROM suppliers WHERE active = 1 ORDER BY name'));
});

router.post('/fornecedores', requirePermission('fornecedores', 'can_create'), (req, res) => {
  const b = req.body || {};
  if (b.email && !validEmail(b.email)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (b.cnpj && !validCNPJ(b.cnpj)) return res.status(400).json({ error: 'CNPJ inválido.' });
  run(`INSERT INTO suppliers (name, cnpj, phone, email, address, products_supplied, active)
       VALUES (?,?,?,?,?,?,1)`,
    [str(b.name), str(b.cnpj), str(b.phone), str(b.email), str(b.address, 300), str(b.products_supplied, 500)]);
  const id = get('SELECT last_insert_rowid() AS id').id;
  audit({ userId: req.user.id, action: 'criar', module: 'fornecedores', entityType: 'supplier', entityId: id, newValue: b });
  res.json({ ok: true, id });
});

router.put('/fornecedores/:id', requirePermission('fornecedores', 'can_edit'), (req, res) => {
  const b = req.body || {};
  const old = get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
  if (!old) return res.status(404).json({ error: 'Fornecedor não encontrado.' });
  if (b.email && !validEmail(b.email)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (b.cnpj && !validCNPJ(b.cnpj)) return res.status(400).json({ error: 'CNPJ inválido.' });
  run(`UPDATE suppliers SET name=?, cnpj=?, phone=?, email=?, address=?, products_supplied=? WHERE id=?`,
    [str(b.name), str(b.cnpj), str(b.phone), str(b.email), str(b.address, 300), str(b.products_supplied, 500), req.params.id]);
  audit({ userId: req.user.id, action: 'editar', module: 'fornecedores', entityType: 'supplier', entityId: Number(req.params.id), oldValue: old, newValue: b });
  res.json({ ok: true });
});

router.delete('/fornecedores/:id', requirePermission('fornecedores', 'can_delete'), (req, res) => {
  run('UPDATE suppliers SET active = 0 WHERE id = ?', [req.params.id]);
  audit({ userId: req.user.id, action: 'excluir', module: 'fornecedores', entityType: 'supplier', entityId: Number(req.params.id) });
  res.json({ ok: true });
});

// Histórico de preços de fornecedor por alimento
router.get('/fornecedores/:id/precos', requirePermission('fornecedores'), (req, res) => {
  res.json(query(`
    SELECT sp.*, f.name AS food_name FROM supplier_prices sp
    JOIN foods f ON f.id = sp.food_id
    WHERE sp.supplier_id = ? ORDER BY sp.date DESC
  `, [req.params.id]));
});

router.post('/fornecedores/:id/precos', requirePermission('fornecedores', 'can_create'), (req, res) => {
  const { food_id, price, notes } = req.body || {};
  run(`INSERT INTO supplier_prices (supplier_id, food_id, price, date, notes) VALUES (?,?,?,?,?)`,
    [req.params.id, num(food_id), num(price), today(), str(notes, 300)]);
  audit({ userId: req.user.id, action: 'registrar_preco', module: 'fornecedores', entityType: 'supplier_prices', newValue: { supplier_id: req.params.id, food_id, price } });
  res.json({ ok: true });
});

// ============================================================
// USUÁRIOS (apenas Administrador)
// ============================================================
router.get('/usuarios', requirePermission('usuarios'), (req, res) => {
  const rows = query(`
    SELECT u.id, u.name, u.email, u.active, u.created_at, r.name AS role_name
    FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id
  `);
  res.json({ rows, roles: query('SELECT * FROM roles ORDER BY id') });
});

router.post('/usuarios', requirePermission('usuarios', 'can_create'), (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.email || !b.password) return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  if (!validEmail(b.email)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (String(b.password).length < 6) return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres.' });
  const email = String(b.email).toLowerCase().trim();
  const dup = get('SELECT id FROM users WHERE email = ?', [email]);
  if (dup) return res.status(400).json({ error: 'E-mail já cadastrado.' });
  const hash = hashPassword(str(b.password));
  run(`INSERT INTO users (name, email, password_hash, role_id, active) VALUES (?,?,?,?,?)`,
    [str(b.name), email, hash, num(b.role_id, 3), b.active === false ? 0 : 1]);
  const id = get('SELECT last_insert_rowid() AS id').id;
  audit({ userId: req.user.id, action: 'criar', module: 'usuarios', entityType: 'user', entityId: id, newValue: b });
  res.json({ ok: true, id });
});

router.put('/usuarios/:id', requirePermission('usuarios', 'can_edit'), (req, res) => {
  const b = req.body || {};
  const old = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!old) return res.status(404).json({ error: 'Usuário não encontrado.' });
  run(`UPDATE users SET name=?, email=?, role_id=?, active=? WHERE id=?`,
    [str(b.name), String(b.email || '').toLowerCase().trim(), num(b.role_id, old.role_id), b.active === false ? 0 : 1, req.params.id]);
  if (b.password) {
    run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(str(b.password)), req.params.id]);
  }
  audit({ userId: req.user.id, action: 'editar', module: 'usuarios', entityType: 'user', entityId: Number(req.params.id), oldValue: old, newValue: b });
  res.json({ ok: true });
});

router.delete('/usuarios/:id', requirePermission('usuarios', 'can_delete'), (req, res) => {
  if (Number(req.params.id) === Number(req.user.id)) return res.status(400).json({ error: 'Você não pode excluir a si mesmo.' });
  run('UPDATE users SET active = 0 WHERE id = ?', [req.params.id]);
  audit({ userId: req.user.id, action: 'excluir', module: 'usuarios', entityType: 'user', entityId: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;

