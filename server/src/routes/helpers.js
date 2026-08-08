import auditLog from '../services/audit.js';

export function ok(res, data, status = 200) {
  return res.status(status).json(data);
}

export function fail(res, message, status = 400, detail = '') {
  return res.status(status).json({ error: message, detail });
}

// Registra auditoria com o usuário autenticado
// Suporta dois formatos:
//   audit(req, { action, module, ... })           -> usa req.user
//   audit({ userId, action, module, ... })        -> já inclui userId
export async function audit(req, opts) {
  if (opts && opts.action !== undefined && !req) {
    // Formato 2: primeiro argumento é o objeto completo
    return auditLog({
      userId: opts.userId || null,
      user_name: opts.user_name || null,
      action: opts.action,
      module: opts.module,
      entityType: opts.entityType || null,
      entityId: opts.entityId || null,
      oldValue: opts.oldValue || null,
      newValue: opts.newValue || null,
    });
  }
  const { action, module, entityType = null, entityId = null, oldValue = null, newValue = null } = opts || {};
  return auditLog({
    userId: req.user ? req.user.id : null,
    user_name: req.user ? req.user.name : null,
    action: action || (req && req.action) || 'acao',
    module: module || 'geral',
    entityType,
    entityId,
    oldValue,
    newValue,
  });
}

// Wrapper para rotas assíncronas
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Extrai número seguro
export function num(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return isNaN(n) ? fallback : n;
}

export function str(value, max = 255) {
  if (value == null) return '';
  return String(value).replace(/[<>]/g, '').trim().slice(0, max);
}

// Sanitiza string para saída segura (evita XSS armazenado/refletido)
export function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}

// Valida e-mail simples
export function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

// Valida CNPJ (somente dígitos, comprimento 14)
export function validCNPJ(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 14;
}

export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
}
