// ============================================================
// Seed — Dados de demonstração realistas
// Gera dados relativos à data atual para que o dashboard
// sempre exiba gráficos e indicadores com dados reais.
// ============================================================
import { transaction, run, get, query, today, lastId } from './db.js';
import { hashPassword } from './auth.js';
import { addDays } from './utils.js';

const YEAR = new Date().getFullYear();
const NOW = today();

// Pseudo-random determinístico
function makeRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const rnd = makeRng();

function between(min, max) {
  return Math.round(min + rnd() * (max - min));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ------------------------------------------------------------
async function seedRoles(conn) {
  await conn.query(`INSERT IGNORE INTO roles (id, name, description) VALUES (1, 'Administrador', 'Acesso completo')`);
  await conn.query(`INSERT IGNORE INTO roles (id, name, description) VALUES (2, 'Nutrição', 'Cardápio, fichas, consumo, estoque, relatórios')`);
  await conn.query(`INSERT IGNORE INTO roles (id, name, description) VALUES (3, 'Cantina', 'Estoque, entrada, saída, consumo, scanner')`);
  await conn.query(`INSERT IGNORE INTO roles (id, name, description) VALUES (4, 'Direção', 'Dashboard, financeiro, relatórios, indicadores')`);
}

const PERM_MATRIX = {
  // module: [view, create, edit, delete] 0=role 1, 1=role2, 2=role3, 3=role4
  dashboard: [[1,1,0,0],[1,1,0,0],[1,0,0,0],[1,1,0,0]],
  alunos: [[1,1,1,1],[1,1,1,0],[0,0,0,0],[1,0,0,0]],
  calendario: [[1,1,1,1],[1,1,1,0],[0,0,0,0],[1,0,0,0]],
  cardapio: [[1,1,1,1],[1,1,1,0],[0,0,0,0],[1,0,0,0]],
  fichas: [[1,1,1,1],[1,1,1,0],[0,0,0,0],[1,0,0,0]],
  alimentos: [[1,1,1,1],[1,1,1,0],[1,1,0,0],[1,0,0,0]],
  estoque: [[1,1,1,1],[1,1,1,0],[1,1,1,1],[1,0,0,0]],
  entradas: [[1,1,1,1],[1,1,1,0],[1,1,1,0],[1,0,0,0]],
  consumo: [[1,1,1,1],[1,1,1,0],[1,1,1,0],[1,0,0,0]],
  scanner: [[1,1,0,0],[1,1,0,0],[1,1,0,0],[1,0,0,0]],
  compras: [[1,1,1,1],[1,1,1,0],[1,1,0,0],[1,1,0,0]],
  fornecedores: [[1,1,1,1],[1,1,1,0],[0,0,0,0],[1,0,0,0]],
  financeiro: [[1,1,1,1],[1,0,0,0],[0,0,0,0],[1,1,0,0]],
  orcamento: [[1,1,1,1],[1,0,0,0],[0,0,0,0],[1,1,0,0]],
  desperdicio: [[1,1,1,1],[1,1,1,0],[1,1,0,0],[1,0,0,0]],
  relatorios: [[1,1,0,0],[1,1,0,0],[1,0,0,0],[1,1,0,0]],
  ia: [[1,1,0,0],[1,1,0,0],[1,0,0,0],[1,1,0,0]],
  usuarios: [[1,1,1,1],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
  auditoria: [[1,0,0,0],[0,0,0,0],[0,0,0,0],[1,0,0,0]],
  sobras: [[1,1,1,1],[1,1,1,0],[1,1,0,0],[1,0,0,0]],
};

async function seedPermissions(conn) {
  for (const [module, matrix] of Object.entries(PERM_MATRIX)) {
    for (let idx = 0; idx < matrix.length; idx++) {
      const perm = matrix[idx];
      const roleId = idx + 1;
      await conn.query(
        `INSERT IGNORE INTO permissions (role_id, module, can_view, can_create, can_edit, can_delete)
         VALUES (?,?,?,?,?,?)`,
        [roleId, module, perm[0], perm[1], perm[2], perm[3]]
      );
    }
  }
}

async function seedUsers(conn) {
  const adminPass = hashPassword('admin123');
  await conn.query(`INSERT IGNORE INTO users (id, name, email, password_hash, role_id, active) VALUES (1, 'Administrador', 'admin@escola.edu.br', ?, 1, 1)`, [adminPass]);
  await conn.query(`INSERT IGNORE INTO users (id, name, email, password_hash, role_id, active) VALUES (2, 'Maria Nutrição', 'nutricao@escola.edu.br', ?, 2, 1)`, [hashPassword('nutricao123')]);
  await conn.query(`INSERT IGNORE INTO users (id, name, email, password_hash, role_id, active) VALUES (3, 'João Cantina', 'cantina@escola.edu.br', ?, 3, 1)`, [hashPassword('cantina123')]);
  await conn.query(`INSERT IGNORE INTO users (id, name, email, password_hash, role_id, active) VALUES (4, 'Diretor Carlos', 'direcao@escola.edu.br', ?, 4, 1)`, [hashPassword('direcao123')]);
}

async function seedSchool(conn) {
  await conn.query(`INSERT INTO school_profile (id, name, address, city, state, cnpj, phone, email, school_year)
       VALUES (1, 'EMEIEF Pequeno Saber', 'Rua das Flores, 123', 'São Paulo', 'SP', '12.345.678/0001-90', '(11) 4002-8922', 'contato@escola.edu.br', ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`, [YEAR]);

  const shifts = [
    ['manha', 350, 350],
    ['tarde', 280, 280],
    ['integral', 120, 300],
  ];
  for (const [shift, total, meals] of shifts) {
    await conn.query(`INSERT INTO students_summary (school_year, shift, total_students, estimated_meals_per_day)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE total_students = VALUES(total_students), estimated_meals_per_day = VALUES(estimated_meals_per_day)`, [YEAR, shift, total, meals]);
  }
}

async function seedCalendar(conn) {
  // Gera o calendário do ano: letivo de fev a dez, com férias em janeiro e julho,
  // recessos e feriados nacionais.
  const holidays = [
    '01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25',
  ];
  const d = new Date(YEAR, 0, 1);
  const end = new Date(YEAR, 11, 31);
  let inserted = 0;
  while (d <= end) {
    const ds = d.toISOString().slice(0, 10);
    const month = d.getMonth() + 1;
    const md = ds.slice(5);
    let dayType = 'letivo';
    let desc = '';
    // Férias escolares: janeiro inteiro e julho inteiro
    if (month === 1) { dayType = 'ferias'; desc = 'Férias escolares — janeiro'; }
    if (month === 7) { dayType = 'ferias'; desc = 'Férias escolares — julho'; }
    // Finais de semana são dias sem alimentação
    const dow = d.getDay();
    if (dow === 0 || dow === 6) { dayType = 'sem_alimentacao'; desc = 'Final de semana'; }
    if (holidays.includes(md)) { dayType = 'feriado'; desc = 'Feriado nacional'; }
    // Recessos de carnaval e semana santa
    if ((md >= '02-16' && md <= '02-18')) { dayType = 'recesso'; desc = 'Recesso de carnaval'; }

    if (dayType === 'letivo' || dayType === 'feriado' || dayType === 'recesso') {
      await conn.query(`INSERT INTO school_calendar (school_year, date, day_type, description) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE day_type = VALUES(day_type), description = VALUES(description)`,
        [YEAR, ds, dayType, desc]);
      inserted++;
    }
    d.setDate(d.getDate() + 1);
  }
  return inserted;
}

async function seedCategories(conn) {
  const cats = [
    'Cereais', 'Carnes', 'Frutas', 'Verduras', 'Legumes', 'Laticínios',
    'Bebidas', 'Temperos', 'Massas', 'Enlatados', 'Outros',
  ];
  for (let i = 0; i < cats.length; i++) {
    await conn.query(`INSERT IGNORE INTO food_categories (id, name) VALUES (?,?)`, [i + 1, cats[i]]);
  }
}

async function seedFoods(conn) {
  const foods = [
    ['Arroz branco', 1, 'kg', '7891000100103', 'Tio João', 'Despensa A1', 6.5, 20, 80],
    ['Feijão carioca', 1, 'kg', '7891000100202', 'Camil', 'Despensa A2', 8.2, 15, 60],
    ['Frango congelado', 2, 'kg', '7891000100301', 'Sadia', 'Freezer 1', 12.5, 15, 70],
    ['Carne moída', 2, 'kg', '7891000100400', 'Friboi', 'Freezer 2', 28.0, 10, 40],
    ['Banana', 3, 'kg', '7891000100509', 'CEAGESP', 'Câmara 1', 4.5, 30, 100],
    ['Maçã', 3, 'kg', '7891000100608', 'CEAGESP', 'Câmara 1', 6.0, 15, 50],
    ['Alface', 4, 'kg', '7891000100707', 'CEAGESP', 'Câmara 2', 5.0, 5, 20],
    ['Tomate', 5, 'kg', '7891000100806', 'CEAGESP', 'Câmara 2', 6.8, 10, 40],
    ['Cenoura', 5, 'kg', '7891000100905', 'CEAGESP', 'Câmara 2', 4.2, 10, 30],
    ['Leite integral', 6, 'L', '7891000101001', 'Itambé', 'Geladeira 1', 5.8, 40, 150],
    ['Iogurte natural', 6, 'un', '7891000101100', 'Danone', 'Geladeira 2', 2.5, 60, 200],
    ['Pão de forma', 8, 'un', '7891000101209', 'Pullman', 'Despensa B1', 7.0, 20, 80],
    ['Biscoito integral', 8, 'un', '7891000101308', 'Marilan', 'Despensa B2', 3.2, 50, 180],
    ['Suco de laranja', 7, 'L', '7891000101407', 'Del Vale', 'Despensa B3', 8.0, 15, 60],
    ['Óleo de soja', 1, 'L', '7891000101506', 'Soya', 'Despensa C1', 7.5, 5, 25],
    ['Cebola', 5, 'kg', '7891000101605', 'CEAGESP', 'Câmara 2', 4.0, 8, 25],
    ['Alho', 10, 'kg', '7891000101704', 'CEAGESP', 'Câmara 2', 18.0, 2, 8],
    ['Sal', 10, 'kg', '7891000101803', 'Cisne', 'Despensa C2', 1.8, 5, 20],
    ['Macarrão parafuso', 9, 'kg', '7891000101902', 'Adria', 'Despensa A3', 7.5, 10, 40],
    ['Milho enlatado', 10, 'un', '7891000102008', 'Sadia', 'Despensa C3', 4.0, 12, 40],
    ['Molho de tomate', 10, 'un', '7891000102107', 'Pomarola', 'Despensa C3', 3.5, 20, 60],
    ['Gás de cozinha', 11, 'un', '7891000102206', 'Ultragaz', 'Depósito', 110.0, 1, 3],
  ];
  for (let i = 0; i < foods.length; i++) {
    const f = foods[i];
    await conn.query(`INSERT IGNORE INTO foods (id, name, category_id, unit, barcode, brand, storage_location, avg_price, min_stock, ideal_stock)
         VALUES (?,?,?,?,?,?,?,?,?,?)`, [i + 1, ...f]);
  }
}

async function seedSuppliers(conn) {
  const suppliers = [
    ['CEAGESP', '00.000.000/0001-01', '(11) 3311-4000', 'compras@ceagesp.gov.br', 'Av. Miguel Estéfano, 4000 — SP', 'Frutas, verduras, legumes'],
    ['Distribuidora Alimentar São Paulo', '11.222.333/0001-44', '(11) 2233-4455', 'vendas@distalim.com.br', 'Rua dos Cereais, 500 — Guarulhos', 'Cereais, massas, enlatados, temperos'],
    ['Frigorífico Boi Bom', '22.333.444/0001-55', '(11) 3344-5566', 'comercial@boibom.com.br', 'Rod. Anhanguera km 30 — SP', 'Carnes'],
    ['Laticínios Vale Verde', '33.444.555/0001-66', '(11) 4455-6677', 'contato@valeverde.com.br', 'Rua do Queijo, 80 — Itatiba', 'Leite, iogurte, laticínios'],
    ['Panificadora Pão Dourado', '44.555.666/0001-77', '(11) 5566-7788', 'pao@paodourado.com.br', 'Rua do Pão, 15 — SP', 'Pães, biscoitos'],
    ['Ultragaz', '55.666.777/0001-88', '(11) 4002-5300', 'comercial@ultragaz.com.br', 'Av. do Gás, 1000 — SP', 'Gás de cozinha'],
  ];
  for (let i = 0; i < suppliers.length; i++) {
    const s = suppliers[i];
    await conn.query(`INSERT IGNORE INTO suppliers (id, name, cnpj, phone, email, address, products_supplied)
         VALUES (?,?,?,?,?,?,?)`, [i + 1, ...s]);
  }
}

async function seedBatchesAndStock(conn) {
  // Define estoque inicial com alguns itens baixos, alguns vencendo e um vencido
  const batches = [
    // foodId, lote, quantidade, entrada(dias atrás), validade(dias à frente), supplierId, custo unit
    [1, 'L2025-AR01', 45, 90, 210, 2, 6.0],
    [1, 'L2026-AR01', 10, 5, 180, 2, 6.8],
    [2, 'L2025-FE01', 12, 80, 200, 2, 7.9],
    [2, 'L2026-FE01', 5, 3, 240, 2, 8.4],
    [3, 'L2025-FR01', 22, 45, 150, 3, 11.8],
    [3, 'L2026-FR02', 8, 2, 90, 3, 12.9],
    [4, 'L2025-CM01', 12, 30, 100, 3, 27.0],
    [5, 'L2026-BN01', 28, 4, 8, 1, 4.2],
    [5, 'L2026-BN02', 15, 2, 6, 1, 4.6],
    [6, 'L2026-MA01', 18, 10, 25, 1, 5.8],
    [7, 'L2026-AL01', 6, 6, 5, 1, 4.8],
    [8, 'L2026-TO01', 14, 8, 10, 1, 6.5],
    [9, 'L2026-CE01', 16, 12, 15, 1, 4.0],
    [10, 'L2026-LE01', 60, 6, 20, 4, 5.5],
    [11, 'L2026-IO01', 80, 9, 30, 4, 2.3],
    [12, 'L2026-PA01', 30, 7, 12, 5, 6.8],
    [13, 'L2026-BI01', 60, 11, 45, 5, 3.0],
    [14, 'L2026-SU01', 18, 5, 18, 2, 7.8],
    [15, 'L2026-OL01', 8, 15, 365, 2, 7.2],
    [16, 'L2026-CB01', 10, 4, 9, 1, 3.8],
    [17, 'L2026-AL01', 3, 20, 365, 1, 17.5],
    [18, 'L2025-SL01', 8, 100, -3, 2, 1.6], // VENCIDO
    [19, 'L2026-MA01', 12, 6, 90, 2, 7.2],
    [20, 'L2026-MI01', 18, 5, 200, 2, 3.8],
    [21, 'L2026-MT01', 30, 4, 210, 2, 3.2],
    [22, 'L2026-GA01', 2, 10, 0, 6, 108.0], // vence hoje
  ];

  for (let i = 0; i < batches.length; i++) {
    const [foodId, batch, qty, daysAgo, daysFwd, sup, cost] = batches[i];
    const entry = addDays(NOW, -daysAgo);
    const expiry = addDays(NOW, daysFwd);
    await conn.query(`INSERT IGNORE INTO food_batches (id, food_id, batch_number, quantity, entry_date, expiry_date, supplier_id, cost, unit_cost)
         VALUES (?,?,?,?,?,?,?,?,?)`, [i + 1, foodId, batch, qty, entry, expiry, sup, round1(qty * cost), cost]);
    // atualiza/insere stock
    const stRes = await conn.query('SELECT id FROM stock WHERE food_id = ?', [foodId]);
    const st = stRes[0][0];
    if (st) {
      await conn.query('UPDATE stock SET quantity = quantity + ? WHERE food_id = ?', [qty, foodId]);
    } else {
      await conn.query('INSERT INTO stock (food_id, quantity) VALUES (?,?)', [foodId, qty]);
    }
  }
}

async function seedRecipes(conn) {
  const recipes = [
    { id: 1, name: 'Arroz com frango', mealType: 2, servings: 100, instructions: 'Tempere o frango com alho, cebola e sal. Refogue o arroz no óleo com cebola, adicione água e cozinhe. Prepare o frango em forno ou panela. Sirva com arroz.', observations: 'Rendimento aproximado para 100 porções de 250g.' },
    { id: 2, name: 'Feijão temperado', mealType: 2, servings: 100, instructions: 'Deixe o feijão de molho, cozinhe na panela de pressão com cebola, alho e sal.', observations: '' },
    { id: 3, name: 'Salada de alface e tomate', mealType: 2, servings: 100, instructions: 'Higienize, corte e tempere com sal e limão.', observations: '' },
    { id: 4, name: 'Lanche da manhã: banana e leite', mealType: 1, servings: 100, instructions: 'Lave as bananas e distribua com o leite.', observations: '' },
    { id: 5, name: 'Lanche da tarde: pão com suco', mealType: 3, servings: 100, instructions: 'Distribua pão de forma com suco de laranja.', observations: '' },
  ];
  for (const r of recipes) {
    await conn.query(`INSERT IGNORE INTO recipes (id, name, meal_type_id, servings, yield_amount, yield_unit, instructions, observations)
         VALUES (?,?,?,?,?,?,?,?)`, [r.id, r.name, r.mealType, r.servings, r.servings, 'porções', r.instructions, r.observations]);
  }

  // Ingredientes por porção (100g por pessoa p/ arroz etc.)
  const ing = [
    // recipeId, foodId, quantityPerServing(kg por pessoa), unit
    [1, 1, 0.1, 'kg'],   // 100g arroz
    [1, 3, 0.1, 'kg'],   // 100g frango
    [1, 16, 0.012, 'kg'],// cebola
    [1, 15, 0.006, 'L'], // óleo
    [1, 17, 0.002, 'kg'],// alho
    [1, 18, 0.002, 'kg'],// sal
    [2, 2, 0.05, 'kg'],  // feijão
    [2, 16, 0.01, 'kg'],
    [2, 17, 0.001, 'kg'],
    [2, 18, 0.002, 'kg'],
    [3, 7, 0.03, 'kg'],  // alface
    [3, 8, 0.04, 'kg'],  // tomate
    [3, 18, 0.001, 'kg'],
    [4, 5, 0.12, 'kg'],  // banana
    [4, 10, 0.2, 'L'],   // leite
    [5, 12, 1, 'un'],    // pão (1 un por pessoa)
    [5, 14, 0.25, 'L'],  // suco
  ];
  for (let i = 0; i < ing.length; i++) {
    const r = ing[i];
    await conn.query(`INSERT IGNORE INTO recipe_ingredients (id, recipe_id, food_id, quantity_per_serving, unit)
         VALUES (?,?,?,?,?)`, [i + 1, ...r]);
  }
}

async function seedMealTypes(conn) {
  await conn.query(`INSERT IGNORE INTO meal_types (id, name, description) VALUES (1, 'Lanche da manhã', 'Lanche servido no período da manhã')`);
  await conn.query(`INSERT IGNORE INTO meal_types (id, name, description) VALUES (2, 'Almoço', 'Refeição principal')`);
  await conn.query(`INSERT IGNORE INTO meal_types (id, name, description) VALUES (3, 'Lanche da tarde', 'Lanche servido no período da tarde')`);
  await conn.query(`INSERT IGNORE INTO meal_types (id, name, description) VALUES (4, 'Jantar', 'Refeição da noite — integral')`);
}

async function seedMenus(conn) {
  // Cardápio: próximos 20 dias letivos (ignora fins de semana)
  const students = 750;
  let menuId = 0;
  let itemId = 0;
  for (let i = 0; i < 30; i++) {
    const d = addDays(NOW, i);
    const dow = new Date(`${d}T00:00:00`).getDay();
    if (dow === 0 || dow === 6) continue;
    const meals = [
      { mt: 1, title: 'Lanche da manhã', items: [[5, 0.12, 'kg', 750], [10, 0.2, 'L', 750]] },
      { mt: 2, title: 'Almoço', items: [[1, 0.1, 'kg', 750], [2, 0.05, 'kg', 750], [3, 0.1, 'kg', 750], [7, 0.03, 'kg', 750], [8, 0.04, 'kg', 750], [9, 0.03, 'kg', 750]] },
      { mt: 3, title: 'Lanche da tarde', items: [[12, 1, 'un', 750], [14, 0.25, 'L', 750]] },
    ];
    for (const m of meals) {
      menuId++;
      const totalQty = m.items.reduce((acc, it) => acc + (it[1] * it[3] * (it[2] === 'kg' || it[2] === 'L' ? 1 : 1)), 0);
      await conn.query(`INSERT INTO menus (id, date, meal_type_id, title, expected_students, status, planned_cost, created_by)
           VALUES (?,?,?,?,?,'planejado',?,1)`, [menuId, d, m.mt, m.title, students, round1(totalQty * 8)]);
      for (const it of m.items) {
        itemId++;
        await conn.query(`INSERT INTO menu_items (id, menu_id, food_id, portion_per_student, total_quantity)
             VALUES (?,?,?,?,?)`, [itemId, menuId, it[0], it[1], round1(it[1] * it[3])]);
      }
    }
  }
}

async function seedMealsAndConsumption(conn) {
  // Gera refeições realizadas nos últimos 6 meses com consumo real (FEFO)
  const mealTypes = [1, 2, 3];
  const students = 750;
  let mealId = 0;
  let consId = 0;
  let movId = 0;

  const ingByType = {
    1: [[5, 0.12, 'kg', 350], [10, 0.2, 'L', 350]],
    2: [[1, 0.1, 'kg', 400], [2, 0.05, 'kg', 400], [3, 0.1, 'kg', 400], [7, 0.03, 'kg', 300], [8, 0.04, 'kg', 300], [9, 0.03, 'kg', 300]],
    3: [[12, 1, 'un', 400], [14, 0.25, 'L', 400]],
  };

  for (let back = 180; back >= 0; back -= 1) {
    const d = addDays(NOW, -back);
    const dow = new Date(`${d}T00:00:00`).getDay();
    if (dow === 0 || dow === 6) continue;
    if (back > 0 && rnd() < 0.15) continue;

    for (const mt of mealTypes) {
      const served = mt === 1 ? between(320, 360) : between(380, 420);
      mealId++;
      await conn.query(`INSERT INTO meals (id, menu_id, meal_type_id, date, planned_students, served_students, recipe_id, status, registered_by)
           VALUES (?,NULL,?,?,?,?,?, 'realizado', 3)`, [mealId, mt, d, students, served, mt === 2 ? 1 : mt === 1 ? 4 : 5]);
      const ing = ingByType[mt];
      for (const it of ing) {
        consId++;
        const qty = round1(it[1] * served * (it[2] === 'L' ? 1 : 1));
        await conn.query(`INSERT INTO meal_consumption (id, meal_id, food_id, quantity, unit, planned_quantity)
             VALUES (?,?,?,?,?,?)`, [consId, mealId, it[0], qty, it[2], round1(it[1] * students)]);
        movId++;
        await conn.query(`INSERT INTO stock_movements (food_id, movement_type, reason, quantity, reference_type, reference_id, responsible)
             VALUES (?,'saida','refeicao',?, 'meal', ?, 'João Cantina')`, [it[0], qty, mealId]);
        await conn.query('UPDATE stock SET quantity = GREATEST(0, quantity - ?) WHERE food_id = ?', [qty, it[0]]);
        // debita lotes FEFO
        const batchRes = await conn.query('SELECT * FROM food_batches WHERE food_id = ? AND quantity > 0 ORDER BY expiry_date LIMIT 1', [it[0]]);
        const batch = batchRes[0][0];
        if (batch) {
          await conn.query('UPDATE food_batches SET quantity = GREATEST(0, quantity - ?) WHERE id = ?', [qty, batch.id]);
        }
      }
    }
  }

  // Sobras recentes (últimos 15 dias)
  for (let back = 14; back >= 1; back--) {
    const d = addDays(NOW, -back);
    const dow = new Date(`${d}T00:00:00`).getDay();
    if (dow === 0 || dow === 6) continue;
    const prepared = 400;
    const served = between(350, 395);
    const remaining = prepared - served;
    const discarded = between(0, Math.round(remaining * 0.5));
    await conn.query(`INSERT INTO leftovers (date, meal_type_id, prepared_quantity, served_quantity, remaining_quantity, discarded_quantity)
         VALUES (?,2,?,?,?,?)`, [d, prepared, served, remaining, discarded]);
  }
}

async function seedWaste(conn) {
  // Registros de desperdício nos últimos 6 meses
  const reasons = ['excesso_producao', 'vencimento', 'preparo', 'armazenamento', 'sobras', 'danificado'];
  const foods = [1, 2, 3, 5, 7, 8, 9, 12, 14];
  for (let back = 180; back >= 0; back -= between(3, 10)) {
    const d = addDays(NOW, -back);
    const foodId = foods[between(0, foods.length - 1)];
    const qty = round1(between(1, 15));
    const avgRes = await conn.query('SELECT avg_price FROM foods WHERE id = ?', [foodId]);
    const avgRow = avgRes[0][0];
    const avg = avgRow ? avgRow.avg_price : 5;
    await conn.query(`INSERT INTO waste (food_id, quantity, unit, reason, date, estimated_cost, responsible, notes)
         VALUES (?,?, 'kg', ?, ?, ?, 'João Cantina', 'Registro de sobra/perda')`,
      [foodId, qty, reasons[between(0, reasons.length - 1)], d, round1(qty * avg)]);
  }
}

async function seedExpenses(conn) {
  // Despesas mensais dos últimos 12 meses + categorias
  await conn.query(`INSERT IGNORE INTO expense_categories (id, name) VALUES (1,'Alimentos')`);
  await conn.query(`INSERT IGNORE INTO expense_categories (id, name) VALUES (2,'Bebidas')`);
  await conn.query(`INSERT IGNORE INTO expense_categories (id, name) VALUES (3,'Gás')`);
  await conn.query(`INSERT IGNORE INTO expense_categories (id, name) VALUES (4,'Materiais de cozinha')`);
  await conn.query(`INSERT IGNORE INTO expense_categories (id, name) VALUES (5,'Produtos de limpeza')`);
  await conn.query(`INSERT IGNORE INTO expense_categories (id, name) VALUES (6,'Equipamentos')`);
  await conn.query(`INSERT IGNORE INTO expense_categories (id, name) VALUES (7,'Transporte')`);
  await conn.query(`INSERT IGNORE INTO expense_categories (id, name) VALUES (8,'Outros')`);

  let expId = 0;
  for (let m = 11; m >= 0; m--) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    const monthPrefix = d.toISOString().slice(0, 7);
    const n = between(4, 6);
    for (let i = 0; i < n; i++) {
      const day = between(1, 27);
      const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
      const cat = between(1, 8);
      const desc = [
        'Compra de alimentos', 'Compra de bebidas', 'Recarga de gás', 'Utensílios de cozinha',
        'Produtos de limpeza', 'Manutenção de equipamento', 'Frete/transporte', 'Despesas diversas',
      ][cat - 1];
      const amount = cat === 1 ? between(3000, 9000) : cat === 2 ? between(300, 900) : cat === 3 ? between(110, 330) : between(50, 600);
      expId++;
      await conn.query(`INSERT INTO expenses (id, category_id, description, amount, expense_date, payment_method, responsible)
           VALUES (?,?,?,?,?, 'transferencia', 'Financeiro')`, [expId, cat, desc, amount, date]);
    }
  }
}

async function seedBudgets(conn) {
  // Orçamento anual e mensal
  await conn.query(`INSERT IGNORE INTO budgets (school_year, period, period_value, amount, notes)
       VALUES (?, 'ano', ?, 100000, 'Orçamento anual da alimentação escolar')`, [YEAR, String(YEAR)]);
  for (let m = 1; m <= 12; m++) {
    const pv = `${YEAR}-${String(m).padStart(2, '0')}`;
    await conn.query(`INSERT IGNORE INTO budgets (school_year, period, period_value, amount, notes)
         VALUES (?, 'mes', ?, ?, 'Orçamento mensal')`, [YEAR, pv, 8300]);
  }
  // Limites por categoria
  const cats = [
    [1, 60000, 'Alimentos'], [2, 8000, 'Bebidas'], [3, 2500, 'Gás'],
    [4, 5000, 'Materiais de cozinha'], [5, 3000, 'Produtos de limpeza'],
    [6, 4000, 'Equipamentos'], [7, 3000, 'Transporte'], [8, 2000, 'Outros'],
  ];
  for (const [catId, amount] of cats) {
    await conn.query(`INSERT IGNORE INTO budgets (school_year, period, period_value, amount, notes)
         VALUES (?, 'categoria', ?, ?, 'Limite por categoria')`, [YEAR, String(catId), amount]);
  }
}

async function seedPurchases(conn) {
  // Compras dos últimos 12 meses, com itens
  let purId = 0;
  let itemId = 0;
  for (let m = 11; m >= 0; m--) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    const monthPrefix = d.toISOString().slice(0, 7);
    const n = between(2, 4);
    for (let i = 0; i < n; i++) {
      const day = between(1, 27);
      const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
      const sup = between(1, 5);
      purId++;
      const foods = [[1, between(30, 80), 6.5], [2, between(20, 60), 8.2], [3, between(15, 50), 12.5], [5, between(20, 60), 4.5], [10, between(30, 80), 5.8], [12, between(10, 40), 7.0], [14, between(10, 30), 8.0]];
      const chosen = foods.slice(0, between(2, 4));
      let total = 0;
      for (const [fid, qty, cost] of chosen) {
        const t = round1(qty * cost);
        total += t;
      }
      await conn.query(`INSERT INTO purchases (id, supplier_id, purchase_date, invoice_number, total, status, responsible)
           VALUES (?,?,?,?,?, 'concluida', 'Financeiro')`, [purId, sup, date, `NF-${purId}`, round1(total)]);
      for (const [fid, qty, cost] of chosen) {
        itemId++;
        const t = round1(qty * cost);
        await conn.query(`INSERT INTO purchase_items (id, purchase_id, food_id, quantity, unit_cost, total)
             VALUES (?,?,?,?,?,?)`, [itemId, purId, fid, qty, cost, t]);
      }
    }
  }
}

async function seedRecentPurchase(conn) {
  // Compra recente repõe o estoque até o nível ideal para que o sistema
  // abra com estoque saudável e lotes com validade futura (demonstração FEFO).
  const NOW2 = addDays(NOW, -2);
  const perfis = [
    [1, 60, 'L2026-AR07', 180],
    [2, 40, 'L2026-FE07', 240],
    [3, 35, 'L2026-FR07', 120],
    [5, 50, 'L2026-BN07', 10],
    [7, 12, 'L2026-AL07', 6],
    [8, 25, 'L2026-TO07', 12],
    [9, 20, 'L2026-CE07', 15],
    [10, 90, 'L2026-LE07', 25],
    [12, 40, 'L2026-PA07', 14],
    [14, 20, 'L2026-SU07', 20],
    [16, 15, 'L2026-CB07', 10],
    [19, 25, 'L2026-MA07', 90],
    [20, 25, 'L2026-MI07', 200],
  ];

  const items = [];
  for (const [foodId, qty, lot, validDays] of perfis) {
    const foodRes = await conn.query('SELECT * FROM foods WHERE id = ?', [foodId]);
    const food = foodRes[0][0];
    if (!food) continue;
    const stRes = await conn.query('SELECT quantity FROM stock WHERE food_id = ?', [foodId]);
    const st = stRes[0][0];
    const current = st ? Number(st.quantity) : 0;
    // só compra se estiver abaixo do ideal
    const need = Math.max(0, Number(food.ideal_stock) - current);
    if (need <= 0) continue;
    const q = Math.min(need, qty);
    items.push({ food, q, lot, validDays });
  }

  if (!items.length) return;

  const purchaseDate = NOW2;
  const supplierId = 2;
  await conn.query(`INSERT INTO purchases (supplier_id, purchase_date, invoice_number, total, status, responsible)
       VALUES (?,?,?,0,'concluida','Financeiro')`, [supplierId, purchaseDate, 'NF-REC-001']);
  const purchaseId = await lastId(conn);

  for (const it of items) {
    const itemTotal = round1(it.q * Number(it.food.avg_price));
    await conn.query(`INSERT INTO purchase_items (purchase_id, food_id, quantity, unit_cost, total)
         VALUES (?,?,?,?,?)`, [purchaseId, it.food.id, it.q, Number(it.food.avg_price), itemTotal]);
    const expiry = addDays(NOW, it.validDays);
    await conn.query(`INSERT INTO food_batches (food_id, batch_number, quantity, entry_date, expiry_date, supplier_id, cost, unit_cost)
         VALUES (?,?,?,?,?,?,?,?)`,
      [it.food.id, it.lot, it.q, purchaseDate, expiry, supplierId, itemTotal, Number(it.food.avg_price)]);
    const batchId = await lastId(conn);
    const stRes = await conn.query('SELECT id FROM stock WHERE food_id = ?', [it.food.id]);
    const st = stRes[0][0];
    if (st) await conn.query('UPDATE stock SET quantity = quantity + ? WHERE food_id = ?', [it.q, it.food.id]);
    else await conn.query('INSERT INTO stock (food_id, quantity) VALUES (?,?)', [it.food.id, it.q]);
    await conn.query(`INSERT INTO stock_movements (food_id, batch_id, movement_type, reason, quantity, unit_cost, total_cost, reference_type, reference_id, responsible)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [it.food.id, batchId, 'entrada', 'compra', it.q, Number(it.food.avg_price), itemTotal, 'purchase', purchaseId, 'Financeiro']);
  }
  await conn.query('UPDATE purchases SET total = ? WHERE id = ?', [items.reduce((a, b) => a + round1(b.q * Number(b.food.avg_price)), 0), purchaseId]);
}

async function seedNotifications(conn) {
  // Verifica estoques baixos e validades para gerar alertas reais
  const low = await conn.query(`
    SELECT f.id, f.name, f.min_stock, s.quantity FROM stock s JOIN foods f ON f.id = s.food_id
    WHERE s.quantity <= f.min_stock ORDER BY (s.quantity / f.min_stock) LIMIT 8
  `);
  for (const r of low[0]) {
    await conn.query(`INSERT INTO notifications (type, severity, title, message, reference_type, reference_id)
         VALUES ('estoque','warning', 'Estoque abaixo do mínimo', ?, 'food', ?)`, [`${r.name}: estoque de ${r.quantity} (mínimo ${r.min_stock}).`, r.id]);
  }
}

export async function seedAll({ force = false } = {}) {
  const countRow = await get('SELECT COUNT(*) AS c FROM users');
  const count = countRow ? countRow.c : 0;
  if (count > 0 && !force) {
    console.log('Banco já populado. Use --force para recriar.');
    return;
  }
  await transaction(async (conn) => {
    if (force) {
      // Desliga FK checks temporariamente para DROP
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      await conn.query(`DROP TABLE IF EXISTS ai_conversations`);
      await conn.query(`DROP TABLE IF EXISTS audit_logs`);
      await conn.query(`DROP TABLE IF EXISTS notifications`);
      await conn.query(`DROP TABLE IF EXISTS leftovers`);
      await conn.query(`DROP TABLE IF EXISTS waste`);
      await conn.query(`DROP TABLE IF EXISTS meal_consumption`);
      await conn.query(`DROP TABLE IF EXISTS meals`);
      await conn.query(`DROP TABLE IF EXISTS menu_items`);
      await conn.query(`DROP TABLE IF EXISTS menus`);
      await conn.query(`DROP TABLE IF EXISTS recipe_ingredients`);
      await conn.query(`DROP TABLE IF EXISTS recipes`);
      await conn.query(`DROP TABLE IF EXISTS shopping_list`);
      await conn.query(`DROP TABLE IF EXISTS purchase_items`);
      await conn.query(`DROP TABLE IF EXISTS purchases`);
      await conn.query(`DROP TABLE IF EXISTS supplier_prices`);
      await conn.query(`DROP TABLE IF EXISTS suppliers`);
      await conn.query(`DROP TABLE IF EXISTS food_batches`);
      await conn.query(`DROP TABLE IF EXISTS stock_movements`);
      await conn.query(`DROP TABLE IF EXISTS stock`);
      await conn.query(`DROP TABLE IF EXISTS foods`);
      await conn.query(`DROP TABLE IF EXISTS food_categories`);
      await conn.query(`DROP TABLE IF EXISTS budgets`);
      await conn.query(`DROP TABLE IF EXISTS expenses`);
      await conn.query(`DROP TABLE IF EXISTS expense_categories`);
      await conn.query(`DROP TABLE IF EXISTS school_calendar`);
      await conn.query(`DROP TABLE IF EXISTS students_summary`);
      await conn.query(`DROP TABLE IF EXISTS school_profile`);
      await conn.query(`DROP TABLE IF EXISTS permissions`);
      await conn.query(`DROP TABLE IF EXISTS users`);
      await conn.query(`DROP TABLE IF EXISTS roles`);
      await conn.query(`DROP TABLE IF EXISTS meal_types`);
      await conn.query(`DROP TABLE IF EXISTS login_attempts`);
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');

      // Recria o schema
      const { readFileSync } = await import('node:fs');
      const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf-8');
      await conn.query(schema);
    }

    await seedRoles(conn);
    await seedPermissions(conn);
    await seedUsers(conn);
    await seedSchool(conn);
    await seedCalendar(conn);
    await seedCategories(conn);
    await seedFoods(conn);
    await seedSuppliers(conn);
    await seedBatchesAndStock(conn);
    await seedMealTypes(conn);
    await seedRecipes(conn);
    await seedMenus(conn);
    await seedMealsAndConsumption(conn);
    await seedWaste(conn);
    await seedExpenses(conn);
    await seedBudgets(conn);
    await seedPurchases(conn);
    await seedRecentPurchase(conn);
    await seedNotifications(conn);
  });
  console.log('✅ Seed concluído! Dados de demonstração criados.');
  console.log('   Login admin: admin@escola.edu.br / admin123');
}

// Executa seed se chamado diretamente
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedAll({ force: process.argv.includes('--force') }).catch((e) => {
    console.error('❌ Erro no seed:', e.message);
    process.exit(1);
  });
}

export default { seedAll };
