import { Router } from 'express';
import { get, query, run } from '../db.js';
import { verifyPassword, signToken, loadUser, requireAuth, hashPassword, isAccountLocked, recordLoginAttempt, loginDelay } from '../auth.js';
import { auditLog } from '../services/audit.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const ip = req.ip || req.headers['x-forwarded-for'] || '';

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha.' });
    }

    // Anti brute-force: conta temporariamente bloqueada após muitas falhas
    if (await isAccountLocked(normalizedEmail)) {
      await loginDelay();
      return res.status(429).json({ error: 'Muitas tentativas de login. Aguarde alguns minutos.' });
    }

    const user = await get('SELECT * FROM users WHERE email = ? AND active = 1', [normalizedEmail]);
    const valid = user && verifyPassword(password, user.password_hash);

    // Atraso consignado para igualar resposta e dificultar timing attack
    await loginDelay();

    if (!valid) {
      await recordLoginAttempt(normalizedEmail, ip, false);
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    await recordLoginAttempt(normalizedEmail, ip, true);

    const perms = await query('SELECT module, can_view, can_create, can_edit, can_delete FROM permissions WHERE role_id = ?', [user.role_id]);
    const token = signToken(user);
    const payload = await loadUser(user.id);

    await auditLog({ userId: user.id, user_name: user.name, action: 'login', module: 'auth', entityType: 'user', entityId: user.id });

    return res.json({
      token,
      user: payload,
      permissions: perms,
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const perms = await query('SELECT module, can_view, can_create, can_edit, can_delete FROM permissions WHERE role_id = ?', [req.user.role_id]);
    return res.json({ user: req.user, permissions: perms });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter ao menos 6 caracteres.' });
    }
    const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Senha atual incorreta.' });
    }
    const newHash = hashPassword(newPassword);
    await run('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [newHash, req.user.id]);
    await auditLog({ userId: req.user.id, user_name: req.user.name, action: 'alterar_senha', module: 'auth', entityType: 'user', entityId: req.user.id });
    return res.json({ ok: true, message: 'Senha alterada com sucesso.' });
  } catch (err) {
    return next(err);
  }
});

export default router;
