import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cria a pool de conexões MySQL a partir da URL fornecida pelo Railway.
// Ex.: MYSQL_PRIVATE_URL="mysql://user:pass@host:3306/dbname"
function createPool() {
  const url = process.env.MYSQL_PRIVATE_URL || process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Configuração do MySQL ausente. Defina MYSQL_PRIVATE_URL (ex.: mysql://user:pass@host:3306/dbname).');
  }
  return mysql.createPool({
    uri: url,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    multipleStatements: true,
    dateStrings: true,
  });
}

export const pool = createPool();

// Inicializa o schema (cria as tabelas caso não existam)
export async function initSchema() {
  const schemaSql = readFileSync(resolve(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(schemaSql);
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
  const [rows] = await pool.query(sql, params);
  return rows;
}

// SELECT de uma única linha
export async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// INSERT/UPDATE/DELETE -> retorna resultado (insertId, affectedRows, ...)
export async function run(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

// Retorna o último id inserido na conexão (usar dentro da mesma conexão/transação)
export async function lastId(conn = null) {
  if (conn) {
    const [rows] = await conn.query('SELECT LAST_INSERT_ID() AS id');
    return rows[0].id;
  }
  return (await pool.query('SELECT LAST_INSERT_ID() AS id'))[0][0].id;
}

// Transação: recebe uma função async que recebe a conexão como argumento
export async function transaction(fn) {
  const conn = await pool.getConnection();
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

export default pool;
