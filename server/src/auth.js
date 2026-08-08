import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { get, query } from './db.js';
import 'dotenv/config';

// Gera um segredo JWT forte e persistente caso não esteja definido no .env.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

export const MAX_LOGIN_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS || 5);
export const LOGIN_LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 5);

// Verifica se a conta/email está temporariamente bloqueada por muitas tentativas
export async function isAccountLocked(email) {
  const row = await get(
    `SELECT COUNT(*) AS failed FROM login_attempts
     WHERE email = ? AND success = 0
       AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [email, LOGIN_LOCK_MINUTES]
  );
  return row && row.failed >= MAX_LOGIN_ATTEMPTS;
}

export async function recordLoginAttempt(email, ip, success) {
  try {
    await get('INSERT INTO login_attempts (email, ip, success) VALUES (?,?,?)', [email, ip, success ? 1 : 0]);
  } catch (e) {
    // nunca deve quebrar o fluxo de login
  }
}

// Pequeno atraso pseudo-aleatorio para dificultar ataques de tempo (timing) e brute-force
export function loginDelay() {
  return new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 350));
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role_name || user.role_id },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// Carrega o usuário completo com papel e permissões
export async function loadUser(userId) {
  return get(
    `SELECT u.*, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? AND u.active = 1`,
    [userId]
  );
}

export async function loadPermissions(userId) {
  const user = await loadUser(userId);
  if (!user) return null;
  const perms = await query(
    `SELECT module, can_view, can_create, can_edit, can_delete
     FROM permissions WHERE role_id = ?`,
    [user.role_id]
  );
  return { user, permissions: perms };
}

// Middleware: exige token válido
export function requireAuth(req, res, next) {
  (async () => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    const data = await loadPermissions(payload.id);
    if (!data) {
      return res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
    }
    req.user = data.user;
    req.permissions = data.permissions;
    next();
  })().catch(next);
}

// Middleware: exige papel
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    if (!roles.includes(req.user.role_name)) {
      return res.status(403).json({ error: 'Acesso negado para este perfil.' });
    }
    next();
  };
}

// Middleware: exige permissão de módulo
export function requirePermission(module, action = 'can_view') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    // Administrador tem acesso total
    if (req.user.role_name === 'Administrador') return next();
    const perm = (req.permissions || []).find((p) => p.module === module);
    if (!perm || !perm[action]) {
      return res.status(403).json({ error: `Permissão negada para ${module}.` });
    }
    next();
  };
}

export default { hashPassword, verifyPassword, signToken, verifyToken, requireAuth, requireRole, requirePermission, loadUser };
