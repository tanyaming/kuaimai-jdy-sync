import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'sync.db');

let db: SqlJsDatabase;
let SQL: SqlJsStatic;

export async function initDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  // 初始化 sql.js
  SQL = await initSqlJs();

  // 如果数据库文件存在，加载它
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    logger.info('数据库加载成功', { path: DB_PATH });
  } else {
    db = new SQL.Database();
    logger.info('数据库创建成功', { path: DB_PATH });
  }

  // 启用 WAL 模式（sql.js 不支持，但保留接口兼容）
  initTables();
  saveDb();

  logger.info('数据库初始化完成', { path: DB_PATH });
  return db;
}

export function getDb(): SqlJsDatabase {
  if (!db) {
    throw new Error('数据库未初始化，请先调用 initDb()');
  }
  return db;
}

function initTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      last_sync_time TEXT NOT NULL,
      sync_type TEXT NOT NULL DEFAULT 'order',
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      shop_id TEXT NOT NULL DEFAULT '',
      platform_order_no TEXT NOT NULL DEFAULT '',
      order_status TEXT NOT NULL DEFAULT '',
      jiyun_data_id TEXT,
      first_sync_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      last_sync_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      sync_count INTEGER NOT NULL DEFAULT 1
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT,
      error_type TEXT NOT NULL,
      error_message TEXT NOT NULL,
      request_body TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // 创建索引
  db.run('CREATE INDEX IF NOT EXISTS idx_order_sync_log_order_id ON order_sync_log(order_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_order_sync_log_last_sync ON order_sync_log(last_sync_at);');
  db.run('CREATE INDEX IF NOT EXISTS idx_sync_error_log_created ON sync_error_log(created_at);');

  // 创建唯一约束（sql.js 不支持 IF NOT EXISTS 用于 UNIQUE 索引）
  try {
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_order_sync_log_unique ON order_sync_log(order_id, shop_id);');
  } catch {
    // 可能已存在，忽略
  }

  saveDb();
}

/**
 * 将数据库内容写入磁盘
 */
function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * 持久化数据库（每次写入后调用）
 */
export function persistDb() {
  saveDb();
}

export function closeDb() {
  if (db) {
    saveDb();
    db.close();
    logger.info('数据库连接已关闭');
  }
}
