import { run, get } from '../db.js';

/**
 * Registra uma ação de auditoria.
 * @param {object} opts
 * @param {number|string|null} opts.userId
 * @param {string} opts.action   ex.: 'criar', 'editar', 'excluir', 'entrada', 'saida'
 * @param {string} opts.module   ex.: 'estoque', 'cardapio', 'financeiro'
 * @param {string} opts.entityType ex.: 'food', 'menu', 'expense'
 * @param {number} opts.entityId
 * @param {any} opts.oldValue
 * @param {any} opts.newValue
 */
export async function auditLog({ userId = null, user_name = null, action, module, entityType = null, entityId = null, oldValue = null, newValue = null }) {
  try {
    let name = user_name;
    if (!name && userId) {
      const u = await get('SELECT name FROM users WHERE id = ?', [userId]);
      name = u ? u.name : null;
    }
    const serialize = (v) => {
      if (v == null) return null;
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    };
    await run(
      `INSERT INTO audit_logs (user_id, user_name, action, module, entity_type, entity_id, old_value, new_value)
       VALUES (?,?,?,?,?,?,?,?)`,
      [userId, name, action, module, entityType, entityId, serialize(oldValue), serialize(newValue)]
    );
  } catch (e) {
    // auditoria nunca deve quebrar a aplicação
    console.error('Erro ao registrar auditoria:', e.message);
  }
}

export default auditLog;
