import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cria a pool de conexões MySQL a partir das variáveis de ambiente.
// Suporta diversos formatos/provedores:
//   - URL completa: MYSQL_PRIVATE_URL, MYSQL_URL, DATABASE_URL,
//     MYSQL_ADDON_URI, CLEARDB_DATABASE_URL, JAWSDB_URL, MYSQL_ADDON_HOST etc.
//   - Variáveis separadas (Railway): MYSQLHOST, MYSQLPORT, MYSQLDATABASE,
//     MYSQLUSER, MYSQLPASSWORD
//   - Variáveis separadas (padrão): MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE,
//     MYSQL_USER, MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD
function getConnectionConfig() {
  // 1) URL completa
  const url =
    process.env.MYSQL_PRIVATE_URL ||
    process.env.MYSQL_URL ||
    process.env.DATABASE_URL ||
    process.env.MYSQL_ADDON_URI ||
    process.env.CLEARDB_DATABASE_URL ||
    process.env.JAWSDB_URL;

  if (url) {
    return { uri: url };
  }

  // 2) Variáveis separadas (Railway + genéricas)
  const host =
    process.env.MYSQLHOST ||
    process.env.MYSQL_HOST ||
    process.env.MYSQL_ADDON_HOST;
  const port =
    process.env.MYSQLPORT ||
    process.env.MYSQL_PORT ||
    process.env.MYSQL_ADDON_PORT;
  const database =
    process.env.MYSQLDATABASE ||
    process.env.MYSQL_DATABASE ||
    process.env.MYSQL_ADDON_DB;
  const user =
    process.env.MYSQLUSER ||
    process.env.MYSQL_USER ||
    process.env.MYSQL_ADDON_USER;
  const password =
    process.env.MYSQLPASSWORD ||
    process.env.MYSQL_PASSWORD ||
    process.env.MYSQL_ADDON_PASSWORD ||
    process.env.MYSQL_ROOT_PASSWORD;

  if (!host || !database) {
    throw new Error(
      'Configuração do MySQL ausente. Defina MYSQL_PRIVATE_URL (ex.: mysql://user:pass@host:3306/dbname) ou as variáveis MYSQL_HOST/MYSQL_DATABASE/MYSQL_USER/MYSQL_PASSWORD.'
    );
  }

  return {
    host,
    port: port ? Number(port) : 3306,
    database,
    user: user || 'root',
    password: password || '',
  };
}

let _pool = null;

// Pool lazy: só é criado quando uma conexão é realmente necessária.
// Isso permite que o servidor inicie mesmo sem credenciais no momento
// do import e dá uma mensagem de erro clara apenas quando uma consulta
// for tentada (ex.: na inicialização do schema).
function getPool() {
  if (!_pool) {
    const config = getConnectionConfig();
    _pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
      multipleStatements: true,
      dateStrings: true,
    });
  }
  return _pool;
}

// Inicializa o schema (cria as tabelas caso não existam)
export async function initSchema() {
  const schemaSql = readFileSync(resolve(__dirname, 'schema.sql'), 'utf-8');
  await getPool().query(schemaSql);
}

// ---------- Helpers de data ----------
export function now() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Helpers de consulta (async) ----------
// SELECT -> retorna array de linhas
export async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

// SELECT de uma única linha
export async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// INSERT/UPDATE/DELETE -> retorna resultado (insertId, affectedRows, ...)
export async function run(sql, params = []) {
  const [result] = await getPool().query(sql, params);
  return result;
}

// Retorna o último id inserido na conexão (usar dentro da mesma conexão/transação)
export async function lastId(conn = null) {
  if (conn) {
    const [rows] = await conn.query('SELECT LAST_INSERT_ID() AS id');
    return rows[0].id;
  }
  return (await getPool().query('SELECT LAST_INSERT_ID() AS id'))[0][0].id;
}

// Transação: recebe uma função async que recebe a conexão como argumento
export async function transaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export default getPool;
