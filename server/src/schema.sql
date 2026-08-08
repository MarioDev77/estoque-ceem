-- ============================================================
-- Sistema Web de Gestão da Alimentação Escolar
-- Banco de Dados MySQL — Schema Completo
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- USUÁRIOS, PAPÉIS E PERMISSÕES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_users_role (role_id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_id INT NOT NULL,
  module VARCHAR(100) NOT NULL,
  can_view TINYINT NOT NULL DEFAULT 1,
  can_create TINYINT NOT NULL DEFAULT 0,
  can_edit TINYINT NOT NULL DEFAULT 0,
  can_delete TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_permissions_role_module (role_id, module),
  CONSTRAINT fk_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- ESCOLA E ALUNOS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS school_profile (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  address VARCHAR(300),
  city VARCHAR(100),
  state VARCHAR(2),
  cnpj VARCHAR(20),
  phone VARCHAR(30),
  email VARCHAR(100),
  school_year INT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS students_summary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_year INT NOT NULL,
  shift VARCHAR(20) NOT NULL,
  total_students INT NOT NULL DEFAULT 0,
  estimated_meals_per_day INT NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE KEY uq_students_year_shift (school_year, shift)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- CALENDÁRIO ESCOLAR
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS school_calendar (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_year INT NOT NULL,
  date DATE NOT NULL,
  day_type VARCHAR(30) NOT NULL DEFAULT 'letivo',
  description VARCHAR(300),
  UNIQUE KEY uq_calendar_year_date (school_year, date),
  KEY idx_calendar_year (school_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- CATEGORIAS E ALIMENTOS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS food_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS foods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category_id INT NULL,
  unit VARCHAR(10) NOT NULL DEFAULT 'kg',
  photo VARCHAR(500),
  barcode VARCHAR(100) NULL UNIQUE,
  brand VARCHAR(200),
  storage_location VARCHAR(200),
  avg_price DECIMAL(12,2) DEFAULT 0,
  min_stock DECIMAL(12,3) DEFAULT 0,
  ideal_stock DECIMAL(12,3) DEFAULT 0,
  active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_foods_category FOREIGN KEY (category_id) REFERENCES food_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- FORNECEDORES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  cnpj VARCHAR(20),
  phone VARCHAR(30),
  email VARCHAR(100),
  address VARCHAR(300),
  products_supplied VARCHAR(500),
  active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- ESTOQUE E LOTES (FEFO)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS food_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  food_id INT NOT NULL,
  batch_number VARCHAR(100),
  quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  entry_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  expiry_date DATE NULL,
  supplier_id INT NULL,
  cost DECIMAL(12,2) DEFAULT 0,
  unit_cost DECIMAL(12,2) DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_food_batches_food (food_id),
  KEY idx_food_batches_expiry (expiry_date),
  CONSTRAINT fk_batches_food FOREIGN KEY (food_id) REFERENCES foods(id),
  CONSTRAINT fk_batches_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  food_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_stock_food (food_id),
  CONSTRAINT fk_stock_food FOREIGN KEY (food_id) REFERENCES foods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  food_id INT NOT NULL,
  batch_id INT NULL,
  movement_type VARCHAR(20) NOT NULL,
  reason VARCHAR(40) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(12,2) DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  reference_type VARCHAR(40),
  reference_id INT NULL,
  responsible VARCHAR(200),
  notes VARCHAR(300),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_movements_food (food_id),
  KEY idx_movements_created (created_at),
  CONSTRAINT fk_movements_food FOREIGN KEY (food_id) REFERENCES foods(id),
  CONSTRAINT fk_movements_batch FOREIGN KEY (batch_id) REFERENCES food_batches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supplier_prices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  food_id INT NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  date DATE NOT NULL DEFAULT (CURRENT_DATE),
  notes TEXT,
  CONSTRAINT fk_sprices_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_sprices_food FOREIGN KEY (food_id) REFERENCES foods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- COMPRAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NULL,
  purchase_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  invoice_number VARCHAR(50),
  total DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'concluida',
  notes VARCHAR(300),
  responsible VARCHAR(200),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_purchases_date (purchase_date),
  CONSTRAINT fk_purchases_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT NOT NULL,
  food_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  CONSTRAINT fk_pitems_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT fk_pitems_food FOREIGN KEY (food_id) REFERENCES foods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shopping_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  food_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  reason VARCHAR(300),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shopping_food_status (food_id, status),
  CONSTRAINT fk_shopping_food FOREIGN KEY (food_id) REFERENCES foods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- CARDÁPIOS E REFEIÇÕES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL,
  meal_type_id INT NOT NULL,
  title VARCHAR(200),
  expected_students INT DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'planejado',
  planned_cost DECIMAL(12,2) DEFAULT 0,
  notes VARCHAR(300),
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_menus_date (date),
  CONSTRAINT fk_menus_mealtype FOREIGN KEY (meal_type_id) REFERENCES meal_types(id),
  CONSTRAINT fk_menus_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menu_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  menu_id INT NOT NULL,
  food_id INT NOT NULL,
  portion_per_student DECIMAL(12,4) DEFAULT 0,
  total_quantity DECIMAL(12,3) DEFAULT 0,
  CONSTRAINT fk_menuitems_menu FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE,
  CONSTRAINT fk_menuitems_food FOREIGN KEY (food_id) REFERENCES foods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- FICHAS TÉCNICAS (RECEITAS)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  meal_type_id INT NULL,
  servings INT DEFAULT 1,
  yield_amount DECIMAL(12,3) DEFAULT 0,
  yield_unit VARCHAR(20),
  instructions TEXT,
  observations TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_recipes_mealtype FOREIGN KEY (meal_type_id) REFERENCES meal_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recipe_id INT NOT NULL,
  food_id INT NOT NULL,
  quantity_per_serving DECIMAL(12,4) DEFAULT 0,
  unit VARCHAR(10) DEFAULT 'kg',
  notes VARCHAR(300),
  CONSTRAINT fk_ringredients_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT fk_ringredients_food FOREIGN KEY (food_id) REFERENCES foods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- REFEIÇÕES REALIZADAS (CONSUMO)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  menu_id INT NULL,
  meal_type_id INT NOT NULL,
  date DATE NOT NULL DEFAULT (CURRENT_DATE),
  planned_students INT DEFAULT 0,
  served_students INT DEFAULT 0,
  recipe_id INT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'realizado',
  notes VARCHAR(500),
  registered_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_meals_date (date),
  CONSTRAINT fk_meals_menu FOREIGN KEY (menu_id) REFERENCES menus(id),
  CONSTRAINT fk_meals_mealtype FOREIGN KEY (meal_type_id) REFERENCES meal_types(id),
  CONSTRAINT fk_meals_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id),
  CONSTRAINT fk_meals_user FOREIGN KEY (registered_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS meal_consumption (
  id INT AUTO_INCREMENT PRIMARY KEY,
  meal_id INT NOT NULL,
  food_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit VARCHAR(10) DEFAULT 'kg',
  planned_quantity DECIMAL(12,3) DEFAULT 0,
  batch_id INT NULL,
  CONSTRAINT fk_mconsumption_meal FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
  CONSTRAINT fk_mconsumption_food FOREIGN KEY (food_id) REFERENCES foods(id),
  CONSTRAINT fk_mconsumption_batch FOREIGN KEY (batch_id) REFERENCES food_batches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- DESPERDÍCIO E SOBRAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waste (
  id INT AUTO_INCREMENT PRIMARY KEY,
  food_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit VARCHAR(10) DEFAULT 'kg',
  reason VARCHAR(40) NOT NULL,
  date DATE NOT NULL DEFAULT (CURRENT_DATE),
  meal_id INT NULL,
  estimated_cost DECIMAL(12,2) DEFAULT 0,
  responsible VARCHAR(200),
  notes VARCHAR(300),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_waste_date (date),
  CONSTRAINT fk_waste_food FOREIGN KEY (food_id) REFERENCES foods(id),
  CONSTRAINT fk_waste_meal FOREIGN KEY (meal_id) REFERENCES meals(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leftovers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  meal_id INT NULL,
  date DATE NOT NULL DEFAULT (CURRENT_DATE),
  meal_type_id INT NULL,
  prepared_quantity INT DEFAULT 0,
  served_quantity INT DEFAULT 0,
  remaining_quantity INT DEFAULT 0,
  discarded_quantity INT DEFAULT 0,
  notes VARCHAR(300),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_leftovers_meal FOREIGN KEY (meal_id) REFERENCES meals(id),
  CONSTRAINT fk_leftovers_mealtype FOREIGN KEY (meal_type_id) REFERENCES meal_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- FINANCEIRO E ORÇAMENTO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  description VARCHAR(300) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  supplier_id INT NULL,
  payment_method VARCHAR(30),
  responsible VARCHAR(200),
  notes VARCHAR(300),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_expenses_date (expense_date),
  CONSTRAINT fk_expenses_category FOREIGN KEY (category_id) REFERENCES expense_categories(id),
  CONSTRAINT fk_expenses_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS budgets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_year INT NOT NULL,
  period VARCHAR(20) NOT NULL DEFAULT 'ano',
  period_value VARCHAR(20),
  amount DECIMAL(12,2) NOT NULL,
  notes VARCHAR(300),
  UNIQUE KEY uq_budgets (school_year, period, period_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- NOTIFICAÇÕES E ALERTAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(30) NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'info',
  title VARCHAR(200) NOT NULL,
  message TEXT,
  reference_type VARCHAR(40),
  reference_id INT NULL,
  read TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notifications_read (read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- AUDITORIA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  user_name VARCHAR(200),
  action VARCHAR(50) NOT NULL,
  module VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- CONVERSAS COM IA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  context TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ai_user (user_id),
  CONSTRAINT fk_ai_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- TENTATIVAS DE LOGIN (anti brute-force)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(200) NOT NULL,
  ip VARCHAR(100),
  success TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_login_attempts_email (email),
  KEY idx_login_attempts_ip (ip),
  KEY idx_login_attempts_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
