# TODO — Migração SQLite → MySQL (Railway)

## Etapa 1: Dependências e Configuração
- [x] Adicionar `mysql2` ao `server/package.json`
- [x] Configurar `.env.example` com `MYSQL_PRIVATE_URL`

## Etapa 2: Banco de Dados
- [x] Reescrever `server/src/schema.sql` em MySQL (InnoDB, AUTO_INCREMENT, NOW(), DATETIME)
- [x] Reescrever `server/src/db.js` com pool `mysql2/promise` (query/get/run/transaction/lastId async)

## Etapa 3: Núcleo
- [x] Converter `server/src/auth.js` (datetime('now', ?) → DATE_SUB(NOW(), INTERVAL ? MINUTE))
- [x] Converter `server/src/utils.js` (getSchoolDays → async)
- [x] Converter `server/src/index.js` (tratamento de erro, inicialização async)

## Etapa 4: Rotas (async + sintaxe MySQL)
- [x] `server/src/routes/auth.js`
- [x] `server/src/routes/cadastros.js`
- [x] `server/src/routes/estoque.js`
- [x] `server/src/routes/cardapio.js`
- [x] `server/src/routes/consumo.js`
- [x] `server/src/routes/desperdicio.js`
- [x] `server/src/routes/financeiro.js`
- [x] `server/src/routes/compras.js`
- [x] `server/src/routes/dashboard.js`
- [x] `server/src/routes/relatorios.js`
- [x] `server/src/routes/ia.js`
- [x] `server/src/routes/sistema.js`

## Etapa 5: Serviços (async)
- [x] `server/src/services/ai.js`
- [x] `server/src/services/notifications.js`
- [x] `server/src/services/audit.js`

## Etapa 6: Scripts
- [x] Converter `server/src/seed.js`
- [x] Converter `server/src/reset.js`
- [x] Converter `server/src/clean.js`

## Etapa 7: Testes
- [x] Instalar dependências (`npm install` no server — mysql2 instalado)
- [x] Verificar sintaxe de todos os arquivos JS (node --check)
- [x] Confirmar ausência de padrões SQLite no código (search_files)
- [ ] Rodar seed e testar API contra MySQL (requer banco ativo)
