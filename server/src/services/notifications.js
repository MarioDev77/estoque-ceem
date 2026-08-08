import { run, get, query, today } from '../db.js';
import { addDays } from '../utils.js';

export async function notify({ type, severity = 'info', title, message, referenceType = null, referenceId = null }) {
  await run(
    `INSERT INTO notifications (type, severity, title, message, reference_type, reference_id)
     VALUES (?,?,?,?,?,?)`,
    [type, severity, title, message, referenceType, referenceId]
  );
}

export async function notifyLowStock() {
  const lows = await query(`
    SELECT f.id, f.name, f.unit, f.min_stock, s.quantity
    FROM stock s JOIN foods f ON f.id = s.food_id
    WHERE s.quantity <= f.min_stock
  `);
  for (const r of lows) {
    if (r.quantity <= 0) {
      await notify({ type: 'estoque', severity: 'danger', title: 'Alimento em falta', message: `${r.name} está em falta no estoque.`, referenceType: 'food', referenceId: r.id });
    } else {
      await notify({ type: 'estoque', severity: 'warning', title: 'Estoque abaixo do mínimo', message: `${r.name}: estoque de ${r.quantity} ${r.unit} (mínimo ${r.min_stock} ${r.unit}).`, referenceType: 'food', referenceId: r.id });
    }
  }
}

export async function notifyExpiring() {
  const todayStr = today();
  const in7 = addDays(todayStr, 7);
  const in30 = addDays(todayStr, 30);
  const batches = await query(`
    SELECT fb.id, fb.food_id, f.name, fb.batch_number, fb.expiry_date, fb.quantity, f.unit
    FROM food_batches fb JOIN foods f ON f.id = fb.food_id
    WHERE fb.quantity > 0
  `);
  for (const b of batches) {
    if (!b.expiry_date) continue;
    if (b.expiry_date < todayStr) {
      await notify({ type: 'validade', severity: 'danger', title: 'Alimento vencido', message: `${b.name} (lote ${b.batch_number}) venceu em ${b.expiry_date}.`, referenceType: 'batch', referenceId: b.id });
    } else if (b.expiry_date <= in7) {
      await notify({ type: 'validade', severity: 'warning', title: 'Vence em até 7 dias', message: `${b.name} (lote ${b.batch_number}) vence em ${b.expiry_date}. Utilize primeiro (FEFO).`, referenceType: 'batch', referenceId: b.id });
    } else if (b.expiry_date <= in30) {
      await notify({ type: 'validade', severity: 'info', title: 'Vence em até 30 dias', message: `${b.name} (lote ${b.batch_number}) vence em ${b.expiry_date}.`, referenceType: 'batch', referenceId: b.id });
    }
  }
}

export async function clearOldNotifications() {
  await run(`DELETE FROM notifications WHERE read = 1 AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`);
}

export async function generateAll() {
  await clearOldNotifications();
  await notifyLowStock();
  await notifyExpiring();
}

export default { notify, notifyLowStock, notifyExpiring, generateAll };
