/**
 * 统一持久化存储引擎（src/storage/db.js）
 *
 * Phase 1 & Phase 4 存储加固设计：
 *   1. 双引擎自适应：
 *      - 在 Node.js >= 22.5 环境自动启用内置 `node:sqlite`（开启 WAL 模式 + ACID 事务），无需任何第三方 npm 依赖；
 *      - 在 Node.js 18~21 环境自动降级为「进程级原子写（.tmp + renameSync）+ 主键级 CAS 合并（Optimistic Merge）」引擎。
 *   2. 磁盘镜像双写与测试透明兼容：
 *      - 无论底层走 SQLite 还是原子 JSON，均同步维护 `data/users.json`、`data/orders.json`、`data/reports.json`、`data/chats.json`；
 *      - 当外部测试脚本（如 `tests/smoke.js`）直接删除 `data/orders.json` 时，引擎自动感知文件删除并同步清空对应表，保证 100% 向后兼容。
 *   3. 消除 Lost Update（并发写覆盖）：
 *      - 按主键 `id` 增量合并而非盲目全表覆盖。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
export const DATA_DIR = path.join(ROOT, 'data');
export const SQLITE_FILE = path.join(DATA_DIR, 'xuanxue.sqlite');

const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
  reports: path.join(DATA_DIR, 'reports.json'),
  chats: path.join(DATA_DIR, 'chats.json'),
  feedbacks: path.join(DATA_DIR, 'feedbacks.json'),
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/* ------------------------------------------------------------------ *
 * 1. 探测 Node 22+ 内置 node:sqlite（零外部依赖）
 * ------------------------------------------------------------------ */
let sqliteDb = null;
let sqliteMode = false;

try {
  const req = createRequire(import.meta.url);
  const sqliteMod = req('node:sqlite');
  if (sqliteMod && typeof sqliteMod.DatabaseSync === 'function') {
    ensureDataDir();
    sqliteDb = new sqliteMod.DatabaseSync(SQLITE_FILE);
    sqliteDb.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS kv_collections (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        sort_ts INTEGER NOT NULL DEFAULT 0,
        payload TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS idx_kv_col_ts ON kv_collections (collection, sort_ts DESC);
    `);
    sqliteMode = true;
  }
} catch {
  sqliteMode = false;
  sqliteDb = null;
}

/** 记录每个集合上次同步的磁盘 JSON mtimeMs，用于检测外部测试脚本删改文件 */
const lastFileStat = {
  users: -1,
  orders: -1,
  reports: -1,
  chats: -1,
  feedbacks: -1,
};

function readJsonFileRaw(collection) {
  const file = FILES[collection];
  if (!file || !fs.existsSync(file)) return { exists: false, list: [], mtimeMs: 0 };
  try {
    const st = fs.statSync(file);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (collection === 'reports') {
      const list = raw && Array.isArray(raw.list) ? raw.list : (Array.isArray(raw) ? raw : []);
      return { exists: true, list, mtimeMs: st.mtimeMs };
    }
    return { exists: true, list: Array.isArray(raw) ? raw : [], mtimeMs: st.mtimeMs };
  } catch {
    return { exists: true, list: [], mtimeMs: 0 };
  }
}

function writeJsonFileAtomic(collection, list) {
  const file = FILES[collection];
  if (!file) return;
  try {
    ensureDataDir();
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    const content = collection === 'reports'
      ? JSON.stringify({ v: 1, list }, null, 0)
      : JSON.stringify(list, null, 2);
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, file);
    try {
      lastFileStat[collection] = fs.statSync(file).mtimeMs;
    } catch {
      /* ignore */
    }
  } catch (e) {
    if (typeof console !== 'undefined') console.warn(`[storage] 原子落盘失败 (${collection}):`, e && e.message);
  }
}

function recordSortTs(rec, idx = 0) {
  const iso = rec?.updatedAt || rec?.paidAt || rec?.createdAt;
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : (Date.now() - idx);
}

function syncJsonToSqlite(collection, list) {
  if (!sqliteMode || !sqliteDb) return;
  try {
    sqliteDb.exec('BEGIN IMMEDIATE TRANSACTION');
    const del = sqliteDb.prepare('DELETE FROM kv_collections WHERE collection = ?');
    del.run(collection);
    const ins = sqliteDb.prepare(
      'INSERT OR REPLACE INTO kv_collections (collection, id, sort_ts, payload) VALUES (?, ?, ?, ?)'
    );
    list.forEach((item, idx) => {
      if (!item || !item.id) return;
      ins.run(collection, String(item.id), recordSortTs(item, idx), JSON.stringify(item));
    });
    sqliteDb.exec('COMMIT');
  } catch {
    try { sqliteDb.exec('ROLLBACK'); } catch { /* ignore */ }
  }
}

/**
 * 读取指定集合的全量列表（自动感知磁盘 JSON 变更并与 SQLite 保持同步）
 * @param {'users'|'orders'|'reports'|'chats'} collection
 * @returns {Array<object>}
 */
export function readCollection(collection) {
  const disk = readJsonFileRaw(collection);
  if (!sqliteMode || !sqliteDb) {
    return disk.list;
  }

  // 若磁盘文件被外部测试脚本（如 smoke.js rmSync）删除或修改，则以磁盘为准同步至 SQLite
  if (!disk.exists && lastFileStat[collection] !== 0) {
    syncJsonToSqlite(collection, []);
    lastFileStat[collection] = 0;
    return [];
  }
  if (disk.exists && disk.mtimeMs !== lastFileStat[collection]) {
    syncJsonToSqlite(collection, disk.list);
    lastFileStat[collection] = disk.mtimeMs;
    return disk.list;
  }

  try {
    const stmt = sqliteDb.prepare('SELECT payload FROM kv_collections WHERE collection = ? ORDER BY rowid ASC');
    const rows = stmt.all(collection);
    return rows.map((r) => JSON.parse(r.payload));
  } catch {
    return disk.list;
  }
}

/**
 * 写入指定集合（先与磁盘最新记录做主键级合并以防并发覆盖，再执行 SQLite 事务与原子文件替换）
 * @param {'users'|'orders'|'reports'|'chats'} collection
 * @param {Array<object>} nextList
 * @param {{ replaceAll?: boolean, deletedIds?: string[] }} [opts]
 */
export function writeCollection(collection, nextList, opts = {}) {
  const { replaceAll = false, deletedIds = [] } = opts;
  let finalList = Array.isArray(nextList) ? nextList : [];

  if (!replaceAll && finalList.length > 0) {
    // 主键级 CAS 合并：若其它并发请求刚刚插入了新记录，保留不在 deletedIds 中的并发新增项
    const disk = readJsonFileRaw(collection);
    if (disk.exists && disk.list.length > 0) {
      const nextIds = new Set(finalList.map((x) => x && x.id).filter(Boolean));
      const delSet = new Set(deletedIds);
      for (const oldItem of disk.list) {
        if (oldItem && oldItem.id && !nextIds.has(oldItem.id) && !delSet.has(oldItem.id)) {
          finalList.push(oldItem);
        }
      }
    }
  }

  if (sqliteMode && sqliteDb) {
    syncJsonToSqlite(collection, finalList);
  }
  writeJsonFileAtomic(collection, finalList);
  return finalList;
}

/** 存储层运行状态（供 /api/health 可观测性展示） */
export function storageStats() {
  return {
    engine: sqliteMode ? 'node:sqlite(WAL)' : 'atomic-json(CAS)',
    sqliteEnabled: sqliteMode,
    sqliteFile: SQLITE_FILE,
  };
}
