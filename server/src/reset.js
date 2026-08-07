// ============================================================
// Reset — Remove TODOS os dados fictícios/demo do banco,
// mantendo apenas a estrutura (roles/permissions) e criando
// um único usuário admin real.
//
// Uso:
//   node src/reset.js "admin@dominio.com" "SenhaForte123"
//
// Ou via variáveis de ambiente:
//   ADMIN_EMAIL=admin@dominio.com ADMIN_PASSWORD=SenhaForte123 node src/reset.js
// ============================================================
import { db, run } from './db.js';
import { hashPassword } from './auth.js';

const email = process.argv[2] || process.env.ADMIN_EMAIL;
const password = process.argv[3] || process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('❌ Informe e-mail e senha do admin.');
  console.error('   Uso: node src/reset.js "admin@dominio.com" "SenhaForte123"');
  process.exit(1);
}

if (password.length < 6) {
  console.error('❌ A senha deve ter ao menos 6 caracteres.');
  process.exit(1);
}

// Tabelas na ordem correta (filhas antes das mães, respeitando FKs).
// roles e permissions NÃO entram aqui — são estrutura do sistema, não dado fictício.
const TABLES_TO_CLEAR = [
  'login_attempts',
  'audit_logs',
  'ai_conversations',
  'notifications',
  'budgets',
  'expenses',
  'expense_categories',
  'leftovers',
  'waste',
  'meal_consumption',
  'meals',
  'recipe_ingredients',
  'recipes',
  'menu_items',
  'menus',
  'meal_types',
  'shopping_list',
  'purchase_items',
  'purchases',
  'supplier_prices',
  'suppliers',
  'stock_movements',
  'stock',
  'food_batches',
  'foods',
  'food_categories',
  'school_calendar',
  'students_summary',
  'school_profile',
  'users',
];

console.log('🧹 Limpando dados fictícios...');

// Desliga a checagem de foreign keys durante a limpeza (precisa ser fora de uma
// transação — o SQLite não permite mudar esse pragma dentro de BEGIN/COMMIT).
// Isso evita falhas de ordem entre tabelas por causa de dados reais criados
// depois do seed original (ex: uso real do sistema, tentativas de login, etc).
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('BEGIN');
try {
  for (const table of TABLES_TO_CLEAR) {
    run(`DELETE FROM ${table}`);
    // Reinicia o autoincrement da tabela
    run(`DELETE FROM sqlite_sequence WHERE name = ?`, [table]);
  }

  // Cria o admin real (role_id 1 = Administrador, já existente em roles)
  const passwordHash = hashPassword(password);
  run(
    `INSERT INTO users (name, email, password_hash, role_id, active) VALUES (?, ?, ?, 1, 1)`,
    ['Administrador', email.toLowerCase().trim(), passwordHash]
  );

  db.exec('COMMIT');
  db.exec('PRAGMA foreign_keys = ON;');
} catch (err) {
  db.exec('ROLLBACK');
  db.exec('PRAGMA foreign_keys = ON;');
  console.error('❌ Erro ao resetar banco:', err.message);
  process.exit(1);
}

console.log('✅ Reset concluído! Todos os dados fictícios foram removidos.');
console.log(`   Login admin: ${email} / (a senha que você definiu)`);
