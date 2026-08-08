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
import { transaction, run } from './db.js';

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

(async () => {
  try {
    await transaction(async (conn) => {
      // Desliga as checagens de foreign key durante a limpeza
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const table of TABLES_TO_CLEAR) {
        try {
          await conn.query(`DELETE FROM ${table}`);
          // Reinicia o autoincrement (MySQL AUTO_INCREMENT)
          try {
            await conn.query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
          } catch (_) { }
          console.log(`  ✓ ${table} limpa`);
        } catch (e) {
          console.log(`  - ${table}: ${e.message}`);
        }
      }

      // Mantém apenas o usuário administrador para login
      await conn.query(`DELETE FROM users WHERE id != 1`);
      try { await conn.query(`ALTER TABLE users AUTO_INCREMENT = 1`); } catch (_) { }

      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    });
    console.log('\n✅ Banco zerado! Dados de demonstração removidos.');
    console.log('   Mantidos: papéis, permissões, tipos de refeição, categorias');
    console.log('            e o usuário administrador (admin@escola.edu.br).');
  } catch (err) {
    console.error('❌ Erro ao limpar o banco:', err.message);
    process.exit(1);
  }
})();
