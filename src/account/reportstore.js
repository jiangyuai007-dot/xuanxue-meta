/**
 * 云历史（P0-2「我的报告」）：把排盘结果从浏览器 localStorage 搬到服务端
 *
 * 为什么需要：
 *  - 原「我的档案 / 保存当前」只写 localStorage：换设备、清缓存、换浏览器 → 历史归零；
 *    同一台电脑换人用 → 档案串号；自己也拿不到任何回访数据。
 *  - 服务端内存表 `reports`（LRU）只能活一会儿，重启就没了，做不了「上次看到的报告」。
 *  - 本模块做**只存输入参数 + 标签**的轻量云历史（一个记录几百字节），
 *    打开时按参数确定性重排（同一份输入永远得到同一份命盘），不做大 payload 落盘。
 *
 * 归属（owner）：
 *  - 登录用户 → `uid:<用户ID>`，换设备也能看；
 *  - 游客 → `did:<服务端下发的随机设备ID>`（httpOnly cookie），清 cookie 等于放弃历史，
 *    因此客户端会同时提示「登录可跨设备保存」。
 *
 * 落盘：data/reports.json（单进程单机形态；多实例前需换成共享存储）。
 * 治理：每个 owner 最多 200 条、超过 24 个月的记录整体清理，避免索引无限膨胀。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const DATA_DIR = path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'reports.json');

const PER_OWNER_MAX = 200;
const RETAIN_MS = 24 * 30 * 24 * 60 * 60 * 1000; // 24 个月
const TOTAL_MAX = 20000;

function loadAll() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (raw && Array.isArray(raw.list)) return raw.list;
  } catch {
    /* 文件不存在或坏档 → 视作空库（坏档不阻塞启动） */
  }
  return [];
}

function saveAll(list) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    // 先写临时文件再 rename：避免写一半被 kill 掉留下一份坏 json
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, list }, null, 0), 'utf8');
    fs.renameSync(tmp, FILE);
  } catch (e) {
    /* 落盘失败不阻塞主流程（退化为「这次没存住」） */
    if (typeof console !== 'undefined') console.warn('[reportstore] 落盘失败：', e && e.message);
  }
}

/** 新记录 id：R + 8 字节随机（不加密，仅做不可枚举的句柄） */
function newId() {
  return 'R' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

/**
 * 保存（或更新）一条云历史：同 owner + 同体系 + 同参数 → 覆盖旧记录，不重复堆条目。
 * @param {{owner:string, system:string, title?:string, subtitle?:string, payload:object}} p
 * @returns {{id:string, createdAt:string, updatedAt:string, updated:boolean}}
 */
export function saveReport({ owner, system, title = '', subtitle = '', payload }) {
  if (!owner || !system || payload === undefined) throw new Error('缺少 owner / system / payload');
  const list = loadAll();
  const key = (r) => `${r.owner}|${r.system}|${JSON.stringify(r.payload)}`;
  const now = new Date().toISOString();
  const idx = list.findIndex((r) => r.owner === owner && r.system === system && JSON.stringify(r.payload) === JSON.stringify(payload));
  if (idx >= 0) {
    const cur = list[idx];
    const rec = {
      ...cur,
      title: title || cur.title || '',
      subtitle: subtitle || cur.subtitle || '',
      updatedAt: now,
    };
    list.splice(idx, 1);
    list.unshift(rec);
    saveAll(list);
    return { id: rec.id, createdAt: rec.createdAt, updatedAt: now, updated: true };
  }
  const rec = {
    id: newId(),
    owner,
    system,
    title,
    subtitle,
    payload, // 用于确定性重排（不含解读正文，隐私面小、体积小）
    factPackId: null,
    createdAt: now,
    updatedAt: now,
    openedAt: null,
  };
  list.unshift(rec);
  // 治理：超期清理 + 每 owner 上限 + 总量上限
  const cutoff = Date.now() - RETAIN_MS;
  const kept = list
    .filter((r) => Date.parse(r.updatedAt || r.createdAt || 0) > cutoff)
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const perOwner = new Map();
  const pruned = kept.filter((r) => {
    const n = (perOwner.get(r.owner) || 0) + 1;
    perOwner.set(r.owner, n);
    return n <= PER_OWNER_MAX;
  });
  saveAll(pruned.slice(0, TOTAL_MAX));
  return { id: rec.id, createdAt: now, updatedAt: now, updated: false };
}

/** 我的报告列表（新 → 旧），只回列表字段，不带 payload（payload 里有出生时间等敏感输入） */
export function listReports(owner) {
  return loadAll()
    .filter((r) => r.owner === owner)
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    .map((r) => ({
      id: r.id,
      system: r.system,
      title: r.title || '',
      subtitle: r.subtitle || '',
      factPackId: r.factPackId || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      openedAt: r.openedAt || null,
    }));
}

/** 按记录 id 取完整记录（含 payload），用于打开/分享时重排 */
export function getReport(id) {
  const r = loadAll().find((x) => x.id === id);
  return r || null;
}

/** 按 factPackId 反查记录：LRU 未命中时用它把老报告重建回来 */
export function getReportByPackId(factPackId) {
  if (!factPackId) return null;
  return loadAll().find((x) => x.factPackId === factPackId) || null;
}

/** 删除（必须 owner 一致，防止越权删别人的报告） */
export function removeReport(id, owner) {
  const list = loadAll();
  const hit = list.some((r) => r.id === id && r.owner === owner);
  if (!hit) return false;
  saveAll(list.filter((r) => !(r.id === id && r.owner === owner)));
  return true;
}

/** 打标：最近一次打开命中的命盘 id（下次打开可直接复用内存表，秒开） */
export function touchReport(id, { factPackId = null } = {}) {
  const list = loadAll();
  const hit = list.find((r) => r.id === id);
  if (!hit) return false;
  hit.factPackId = factPackId || hit.factPackId || null;
  hit.openedAt = new Date().toISOString();
  saveAll(list);
  return true;
}

/** 老记录补齐 factPackId（历史数据字段缺失时回填，避免列表一直显示「未打开过」） */
export function markFactPack(id, factPackId) {
  const list = loadAll();
  const hit = list.find((r) => r.id === id);
  if (!hit || hit.factPackId) return false;
  hit.factPackId = factPackId;
  saveAll(list);
  return true;
}

/** 调试/门禁用：当前记录数与占用字节数 */
export function reportStoreStats() {
  const list = loadAll();
  let bytes = 0;
  try {
    bytes = fs.statSync(FILE).size;
  } catch {
    bytes = 0;
  }
  return { total: list.length, bytes, perOwnerMax: PER_OWNER_MAX, retainDays: Math.round(RETAIN_MS / 86400000) };
}
