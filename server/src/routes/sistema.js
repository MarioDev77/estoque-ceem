import { Router } from 'express';
import { get, query, run } from '../db.js';
import { requireAuth, requirePermission } from '../auth.js';
import { audit } from './helpers.js';
import { generateAll } from '../services/notifications.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// NOTIFICAÇÕES
// ============================================================
router.get('/notificacoes', async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT * FROM notifications
      ORDER BY CASE severity WHEN 'danger' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC
      LIMIT 50
    `);
    const unread = rows.filter((r) => !r.read).length;
    res.json({ rows, unread });
  } catch (err) { next(err); }
});

router.post('/notificacoes/:id/read', async (req, res, next) => {
  try {
    await run('UPDATE notifications SET `read` = 1 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/notificacoes/read-all', async (req, res, next) => {
  try {
    await run('UPDATE notifications SET `read` = 1');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Regenera alertas (estoque + validade) com base na data atual
router.post('/notificacoes/regenerar', requirePermission('estoque'), async (req, res, next) => {
  try {
    await run('DELETE FROM notifications');
    await generateAll();
    await audit({ userId: req.user.id, action: 'regenerar_alertas', module: 'estoque' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ============================================================
// AUDITORIA
// ============================================================
router.get('/auditoria', requirePermission('auditoria'), async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT * FROM audit_logs
      ORDER BY id DESC LIMIT 300
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// ============================================================
// PERFIL DA ESCOLA
// ============================================================
router.get('/escola', async (req, res, next) => {
  try {
    res.json(await get('SELECT * FROM school_profile LIMIT 1'));
  } catch (err) { next(err); }
});

router.put('/escola', requirePermission('usuarios', 'can_edit'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const current = await get('SELECT * FROM school_profile LIMIT 1');
    if (!current) return res.status(404).json({ error: 'Perfil da escola não encontrado.' });
    await run(`UPDATE school_profile SET name=?, address=?, city=?, state=?, cnpj=?, phone=?, email=?, school_year=?, updated_at=NOW() WHERE id=?`,
      [String(b.name || current.name).slice(0, 200), String(b.address || '').slice(0, 300), String(b.city || '').slice(0, 100), String(b.state || '').slice(0, 2), String(b.cnpj || '').slice(0, 20), String(b.phone || '').slice(0, 30), String(b.email || '').slice(0, 100), Number(b.school_year || current.school_year), current.id]);
    await audit({ userId: req.user.id, action: 'editar', module: 'escola', entityType: 'school_profile', entityId: current.id, oldValue: current, newValue: b });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
