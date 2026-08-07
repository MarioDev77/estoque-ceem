import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '..', process.env.DB_PATH || './data/escola.db');

// Garante que o diretório do banco exista
if (!existsSync(dirname(dbPath))) {
  mkdirSync(dirname(dbPath), { recursive: true });
}

export const db = new DatabaseSync(dbPath);

// Ativa integridade referencial
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Cria as tabelas caso não existam
const schemaSql = readFileSync(resolve(__dirname, 'schema.sql'), 'utf-8');
db.exec(schemaSql);

// ---------- Helpers ----------
export function now() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function query(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

export function get(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.get(...params);
}

export function run(sql, params = []) {
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return result;
}

export function lastId() {
  return db.prepare('SELECT last_insert_rowid() AS id').get().id;
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export default db;

