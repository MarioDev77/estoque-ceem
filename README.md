6# 🍎 Sistema Web de Gestão da Alimentação Escolar

Sistema completo, profissional e responsivo para o gerenciamento da alimentação de uma cantina escolar durante todo o ano letivo.

**Não é um sistema de vendas.** O foco é:
> **PLANEJAR → COMPRAR → ARMAZENAR → PREPARAR → SERVIR → REGISTRAR CONSUMO → ANALISAR → PLANEJAR NOVAMENTE**

---

## ✨ Funcionalidades

| Módulo | Descrição |
|---|---|
| 📊 **Dashboard** | Indicadores (alunos, refeições, estoque, gastos, orçamento, desperdício) + 10 gráficos interativos com filtros por semana/mês/bimestre/semestre/ano |
| 📅 **Calendário Escolar** | Ano letivo, férias, feriados, recessos, eventos e dias sem alimentação |
| 👨‍🎓 **Alunos** | Total de alunos por turno (manhã/tarde/integral) e refeições estimadas |
| 🍽️ **Cardápio** | Planejamento diário/semanal/mensal; lanche da manhã, almoço, lanche da tarde; cálculo automático de quantidades (ex.: 400 alunos × 100g = 40kg) |
| 📋 **Fichas Técnicas** | Receitas com ingredientes, quantidade por pessoa, modo de preparo e rendimento |
| 📦 **Estoque** | Controle por lote, validade, **FEFO** (First Expire, First Out), estoque mínimo/ideal, alertas automáticos |
| 🔄 **Entradas e Saídas** | Compra, doação, transferência, reposição, perda, desperdício, vencido, danificado — tudo com histórico |
| 🍛 **Consumo Automático** | Registrar "almoço para 400 alunos" debita automaticamente os ingredientes da ficha técnica (com prévia antes de confirmar) |
| 📷 **Leitor de Código de Barras** | Câmera do celular/computador **ou leitor USB** (como no mercado); consulta estoque, validade e lote; beep de confirmação, linha de escaneamento, cadastro de novo produto e entrada rápida |
| 🛒 **Compras Inteligentes** | Sugere a lista de compras com base no cardápio futuro, estoque atual, consumo médio e estoque mínimo |
| 🤝 **Fornecedores** | Cadastro, histórico de preços e identificação de aumento de custos |
| 💰 **Financeiro** | Despesas por categoria, gastos do dia/semana/mês/ano, orçamento anual com limite por categoria |
| 💵 **Custo por Refeição** | Cálculo automático (custo total ÷ alunos) |
| 🗑️ **Desperdício e Sobras** | Registro de motivos, indicadores e comparação do planejado × real |
| 🤖 **Assistente de IA** | Responde perguntas sobre os dados reais ("Quais alimentos estão acabando?", "O que comprar na próxima semana?") e gera o planejamento do próximo mês |
| 📄 **Relatórios** | Consumo, estoque, compras, gastos, desperdício, validade, refeições, custo por refeição — com exportação **PDF, Excel e CSV** |
| 📈 **Relatório Anual** | Resumo completo do ano letivo com gráficos e indicadores |
| 🔐 **Segurança** | Autenticação JWT, hash de senhas (bcrypt), controle de permissões por papel, validação e sanitização, rate limiting, auditoria de todas as alterações |

## 👥 Perfis de Acesso

| Perfil | Acesso |
|---|---|
| **Administrador** | Acesso completo |
| **Nutrição** | Cardápio, fichas, consumo, estoque, relatórios |
| **Cantina** | Estoque, entrada, saída, consumo, scanner |
| **Direção** | Dashboard, financeiro, relatórios, indicadores |

---

## 🚀 Como executar

### Pré-requisitos
- Node.js **20.19+** ou **22.12+** (usa o módulo nativo `node:sqlite` — Node 22+ recomendado)

### Instalação

```bash
# 1. Instalar dependências (server + client)
npm run setup

# 2. Banco de dados com dados de demonstração (opcional — já incluso ao iniciar)
npm run seed
```

> Se o banco já estiver populado e quiser recriar do zero:
> ```bash
> npm --prefix server run seed -- --force
> ```

### Executar (2 terminais)

```bash
# Terminal 1 — Backend (API)
npm run dev:server
# → http://localhost:3001  (health: http://localhost:3001/api/health)

# Terminal 2 — Frontend (React)
npm run dev:client
# → http://localhost:5173
```

### Acessos de demonstração

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@escola.edu.br | admin123 |
| Nutrição | nutricao@escola.edu.br | nutricao123 |
| Cantina | cantina@escola.edu.br | cantina123 |
| Direção | direcao@escola.edu.br | direcao123 |

---

## 🗄️ Banco de Dados

SQLite (`server/data/escola.db`), criado automaticamente com o schema completo:

`users`, `roles`, `permissions`, `students_summary`, `school_calendar`, `meals`, `menus`, `recipes`, `recipe_ingredients`, `foods`, `food_categories`, `food_batches`, `stock`, `stock_movements`, `suppliers`, `purchases`, `purchase_items`, `expenses`, `budgets`, `waste`, `leftovers`, `notifications`, `audit_logs`, `ai_conversations`.

Com chaves estrangeiras, índices, constraints e timestamps.

---

## 🛠️ Stack Técnica

- **Backend:** Node.js, Express, SQLite (`node:sqlite`), JWT, bcryptjs, helmet, express-rate-limit
- **Frontend:** React 18, Vite, React Router, Chart.js, html5-qrcode (scanner), jsPDF + xlsx (relatórios), lucide-react
- **Segurança:** consultas parametrizadas (anti SQL Injection), sanitização de entradas (anti XSS), JWT, rate limiting, logs de auditoria, variáveis de ambiente (`.env`)

---

## 📁 Estrutura

```
├── server/               # Backend (API Express)
│   ├── src/
│   │   ├── index.js      # Ponto de entrada + segurança
│   │   ├── db.js         # SQLite + helpers de query
│   │   ├── schema.sql    # Tabelas, FKs, índices
│   │   ├── auth.js       # JWT + permissões
│   │   ├── seed.js       # Dados de demonstração realistas
│   │   ├── utils.js      # Datas, períodos, cálculos
│   │   ├── services/     # IA, auditoria, notificações
│   │   └── routes/       # Todas as rotas da API
│   └── data/             # Banco SQLite (criado automaticamente)
└── client/               # Frontend (React)
    └── src/
        ├── pages/        # 23 páginas
        ├── components/   # Layout, UI, Gráficos
        ├── api.js        # Cliente HTTP
        └── styles.css    # Estilos responsivos
```

# estoque-ceem
