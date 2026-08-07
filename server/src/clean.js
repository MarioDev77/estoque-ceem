// ============================================================
// Limpeza do banco — remove TODOS os dados de demonstração
// Mantém apenas a estrutura essencial para o sistema funcionar:
//   - papéis (roles) e permissões (permissions)
//   - tipos de refeição (meal_types)
//   - categorias de despesa (expense_categories)
//   - categorias de alimentos (food_categories)
//   - usuários (para permitir login)
// Deixa o sistema ZERADO para ir preenchendo conforme o uso real.
// ============================================================
import { db, run } from './db.js';

const TABLES_TO_CLEAR = [
  'ai_conversations',
  'audit_logs',
  'notifications',
  'leftovers',
  'waste',
  'meal_consumption',
  'meals',
  'menu_items',
  'menus',
  'recipe_ingredients',
  'recipes',
  'shopping_list',
  'purchase_items',
  'purchases',
  'supplier_prices',
  'suppliers',
  'food_batches',
  'stock_movements',
  'stock',
  'foods',
  'budgets',
  'expenses',
  'school_calendar',
  'students_summary',
  'school_profile',
];

try {
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN');
  for (const table of TABLES_TO_CLEAR) {
    try {
      run(`DELETE FROM ${table}`);
      // Reseta o autoincrement para os ids recomeçarem de 1
      try { run(`DELETE FROM sqlite_sequence WHERE name = '${table}'`); } catch (_) { }
      console.log(`  ✓ ${table} limpa`);
    } catch (e) {
      console.log(`  - ${table}: ${e.message}`);
    }
  }

  // Mantém apenas o usuário administrador para login
  run(`DELETE FROM users WHERE id != 1`);
  run(`DELETE FROM sqlite_sequence WHERE name = 'users'`);

  db.exec('COMMIT');
  db.exec('PRAGMA foreign_keys = ON;');
  console.log('\n✅ Banco zerado! Dados de demonstração removidos.');
  console.log('   Mantidos: papéis, permissões, tipos de refeição, categorias');
  console.log('            e o usuário administrador (admin@escola.edu.br).');
} catch (err) {
  db.exec('ROLLBACK');
  db.exec('PRAGMA foreign_keys = ON;');
  console.error('❌ Erro ao limpar o banco:', err.message);
  process.exit(1);
}
