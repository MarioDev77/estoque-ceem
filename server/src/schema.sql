-- ============================================================
-- Sistema Web de Gestão da Alimentação Escolar
-- Banco de Dados SQLite — Schema Completo
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- USUÁRIOS, PAPÉIS E PERMISSÕES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  module TEXT NOT NULL,
  can_view INTEGER NOT NULL DEFAULT 1,
  can_create INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  UNIQUE(role_id, module)
);

-- ------------------------------------------------------------
-- ESCOLA E ALUNOS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS school_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  cnpj TEXT,
  phone TEXT,
  email TEXT,
  school_year INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_year INTEGER NOT NULL,
  shift TEXT NOT NULL,               -- manha | tarde | integral
  total_students INTEGER NOT NULL DEFAULT 0,
  estimated_meals_per_day INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE(school_year, shift)
);

-- ------------------------------------------------------------
-- CALENDÁRIO ESCOLAR
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS school_calendar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_year INTEGER NOT NULL,
  date TEXT NOT NULL,                -- YYYY-MM-DD
  day_type TEXT NOT NULL DEFAULT 'letivo',  -- letivo | ferias | feriado | recesso | evento | sem_alimentacao
  description TEXT,
  UNIQUE(school_year, date)
);

-- ------------------------------------------------------------
-- CATEGORIAS E ALIMENTOS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS food_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES food_categories(id),
  unit TEXT NOT NULL DEFAULT 'kg',   -- kg | g | L | mL | un
  photo TEXT,
  barcode TEXT UNIQUE,
  brand TEXT,
  storage_location TEXT,
  avg_price REAL DEFAULT 0,
  min_stock REAL DEFAULT 0,
  ideal_stock REAL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- ESTOQUE E LOTES (FEFO)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS food_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  food_id INTEGER NOT NULL REFERENCES foods(id),
  batch_number TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  entry_date TEXT NOT NULL DEFAULT (date('now')),
  expiry_date TEXT,
  supplier_id INTEGER,
  cost REAL DEFAULT 0,
  unit_cost REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  food_id INTEGER NOT NULL REFERENCES foods(id),
  quantity REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(food_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  food_id INTEGER NOT NULL REFERENCES foods(id),
  batch_id INTEGER REFERENCES food_batches(id),
  movement_type TEXT NOT NULL,       -- entrada | saida | ajuste
  reason TEXT NOT NULL,              -- compra | doacao | transferencia | reposicao | outro | refeicao | perda | desperdicio | vencido | danificado | ajuste
  quantity REAL NOT NULL,
  unit_cost REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  reference_type TEXT,
  reference_id INTEGER,
  responsible TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- FORNECEDORES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cnpj TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  products_supplied TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS supplier_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  food_id INTEGER NOT NULL REFERENCES foods(id),
  price REAL NOT NULL,
  date TEXT NOT NULL DEFAULT (date('now')),
  notes TEXT
);

-- ------------------------------------------------------------
-- COMPRAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER REFERENCES suppliers(id),
  purchase_date TEXT NOT NULL DEFAULT (date('now')),
  invoice_number TEXT,
  total REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'concluida',  -- planejada | pedida | concluida
  notes TEXT,
  responsible TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  food_id INTEGER NOT NULL REFERENCES foods(id),
  quantity REAL NOT NULL,
  unit_cost REAL DEFAULT 0,
  total REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shopping_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  food_id INTEGER NOT NULL REFERENCES foods(id),
  quantity REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',  -- pendente | comprado | descartado
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(food_id, status)
);

-- ------------------------------------------------------------
-- CARDÁPIOS E REFEIÇÕES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,          -- lanche_manha | almoco | lanche_tarde | jantar
  description TEXT
);

CREATE TABLE IF NOT EXISTS menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  meal_type_id INTEGER NOT NULL REFERENCES meal_types(id),
  title TEXT,
  expected_students INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planejado',  -- planejado | confirmado | realizado | cancelado
  planned_cost REAL DEFAULT 0,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  food_id INTEGER NOT NULL REFERENCES foods(id),
  portion_per_student REAL DEFAULT 0,  -- em unidades do alimento (kg, g, un...)
  total_quantity REAL DEFAULT 0
);

-- ------------------------------------------------------------
-- FICHAS TÉCNICAS (RECEITAS)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  meal_type_id INTEGER REFERENCES meal_types(id),
  servings INTEGER DEFAULT 1,
  yield_amount REAL DEFAULT 0,
  yield_unit TEXT,
  instructions TEXT,
  observations TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  food_id INTEGER NOT NULL REFERENCES foods(id),
  quantity_per_serving REAL DEFAULT 0,   -- por porção/pessoa
  unit TEXT DEFAULT 'kg',
  notes TEXT
);

-- ------------------------------------------------------------
-- REFEIÇÕES REALIZADAS (CONSUMO)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id INTEGER REFERENCES menus(id),
  meal_type_id INTEGER NOT NULL REFERENCES meal_types(id),
  date TEXT NOT NULL DEFAULT (date('now')),
  planned_students INTEGER DEFAULT 0,
  served_students INTEGER DEFAULT 0,
  recipe_id INTEGER REFERENCES recipes(id),
  status TEXT NOT NULL DEFAULT 'realizado',
  notes TEXT,
  registered_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meal_consumption (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  food_id INTEGER NOT NULL REFERENCES foods(id),
  quantity REAL NOT NULL,
  unit TEXT DEFAULT 'kg',
  planned_quantity REAL DEFAULT 0,
  batch_id INTEGER REFERENCES food_batches(id)
);

-- ------------------------------------------------------------
-- DESPERDÍCIO E SOBRAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waste (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  food_id INTEGER NOT NULL REFERENCES foods(id),
  quantity REAL NOT NULL,
  unit TEXT DEFAULT 'kg',
  reason TEXT NOT NULL,   -- excesso_producao | vencimento | preparo | armazenamento | sobras | danificado
  date TEXT NOT NULL DEFAULT (date('now')),
  meal_id INTEGER REFERENCES meals(id),
  estimated_cost REAL DEFAULT 0,
  responsible TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leftovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id INTEGER REFERENCES meals(id),
  date TEXT NOT NULL DEFAULT (date('now')),
  meal_type_id INTEGER REFERENCES meal_types(id),
  prepared_quantity INTEGER DEFAULT 0,
  served_quantity INTEGER DEFAULT 0,
  remaining_quantity INTEGER DEFAULT 0,
  discarded_quantity INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- FINANCEIRO E ORÇAMENTO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,  -- alimentos | bebidas | gas | materiais_cozinha | produtos_limpeza | equipamentos | transporte | outros
  description TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL DEFAULT (date('now')),
  supplier_id INTEGER REFERENCES suppliers(id),
  payment_method TEXT,
  responsible TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_year INTEGER NOT NULL,
  period TEXT NOT NULL DEFAULT 'ano',  -- ano | mes | categoria
  period_value TEXT,                    -- YYYY ou YYYY-MM ou id categoria
  amount REAL NOT NULL,
  notes TEXT,
  UNIQUE(school_year, period, period_value)
);

-- ------------------------------------------------------------
-- NOTIFICAÇÕES E ALERTAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,               -- estoque | validade | planejamento | financeiro
  severity TEXT NOT NULL DEFAULT 'info',  -- info | warning | danger
  title TEXT NOT NULL,
  message TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- AUDITORIA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  user_name TEXT,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- CONVERSAS COM IA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  context TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- TENTATIVAS DE LOGIN (anti brute-force)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);

-- ------------------------------------------------------------
-- ÍNDICES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_food_batches_food ON food_batches(food_id);
CREATE INDEX IF NOT EXISTS idx_food_batches_expiry ON food_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_movements_food ON stock_movements(food_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_menus_date ON menus(date);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
CREATE INDEX IF NOT EXISTS idx_waste_date ON waste(date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_user ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_year ON school_calendar(school_year);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

