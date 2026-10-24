/**
 * 事实包（FactPack）：全系统的中枢契约
 * 职责：调度排盘引擎、归一化输入、生成缓存键、落盘缓存、校验结构
 * 设计铁律：事实包内只有「确定性事实」，不含任何自然语言解读
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { computeBazi, BAZI_ENGINE_VERSION } from './engines/bazi.js';
import { computeLiuyao, LIUYAO_ENGINE_VERSION } from './engines/liuyao.js';
import { computeQimen, QIMEN_ENGINE_VERSION } from './engines/qimen.js';
import { computeZiwei, ZIWEI_ENGINE_VERSION } from './engines/ziwei.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
export const DATA_DIR = path.join(ROOT, 'data');
const CACHE_DIR = path.join(DATA_DIR, 'cache');

/* —— 磁盘缓存治理（上限/淘汰开关，集中常量便于调整） —— */
export const CACHE_TTL_MS = 7 * 24 * 3600 * 1000; // 缓存文件 TTL：7 天
export const CACHE_MAX_FILES = 500; // 缓存文件数量上限，超出按 mtime 淘汰最旧
const CACHE_CLEAN_EVERY = 50; // 每写入 N 次触发一次清理（与启动时各清一次）
let writeCounter = 0;

function ensureDirs() {
  for (const d of [DATA_DIR, CACHE_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

/**
 * 数量上限硬淘汰（按 mtime 淘汰最旧），每次写盘后调用，保证文件数永不超过 CACHE_MAX_FILES。
 * 仅做计数淘汰，不做 TTL 扫描，开销很低。
 */
export function evictExcess() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    const files = fs.readdirSync(CACHE_DIR).filter((f) => /\.json$/.test(f));
    if (files.length <= CACHE_MAX_FILES) return;
    const withTime = files.map((f) => {
      let mtime = 0;
      try {
        mtime = fs.statSync(path.join(CACHE_DIR, f)).mtimeMs;
      } catch {
        /* ignore */
      }
      return { f, mtime };
    });
    withTime.sort((a, b) => a.mtime - b.mtime);
    const toRemove = withTime.length - CACHE_MAX_FILES;
    for (let i = 0; i < toRemove; i++) {
      try {
        fs.unlinkSync(path.join(CACHE_DIR, withTime[i].f));
        memory.delete(withTime[i].f.replace(/\.json$/, ''));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * 缓存治理：删除过期文件（mtime 超过 TTL），若仍超数量上限则按 mtime 升序淘汰最旧。
 * 幂等、可多次调用；失败不影响主流程。
 */
export function enforceCachePolicy() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(CACHE_DIR).filter((f) => /\.json$/.test(f));
    // 1) TTL 过期淘汰
    for (const f of files) {
      const fp = path.join(CACHE_DIR, f);
      try {
        const st = fs.statSync(fp);
        if (now - st.mtimeMs > CACHE_TTL_MS) {
          fs.unlinkSync(fp);
          memory.delete(f.replace(/\.json$/, ''));
        }
      } catch {
        /* ignore */
      }
    }
    // 2) 数量上限淘汰
    evictExcess();
  } catch {
    /* ignore */
  }
}

const ENGINE_VERSION = { bazi: BAZI_ENGINE_VERSION, liuyao: LIUYAO_ENGINE_VERSION, qimen: QIMEN_ENGINE_VERSION, ziwei: ZIWEI_ENGINE_VERSION };

/** 归一化输入（决定缓存键） */
function canonical(input) {
  const src = { ...input };
  const keys = [
    'type', 'calendar', 'year', 'month', 'day', 'hour', 'minute', 'gender',
    'isLeapMonth', 'city', 'lon', 'lat', 'useTrueSolarTime', 'tzOffset',
    'method', 'numbers', 'lines', 'guaName', 'category', 'purpose', 'question',
    'panType', 'jiGong', 'juMethod', 'customJu', 'customYinYang',
  ];
  const o = {};
  for (const k of keys) {
    if (src[k] !== undefined && src[k] !== null && src[k] !== '') o[k] = src[k];
  }
  if (Array.isArray(o.numbers)) o.numbers = o.numbers.join(',');
  return o;
}

export function cacheKeyOf(input) {
  const c = canonical(input);
  // 引擎版本号参与哈希：事实包结构升级后，旧缓存自动失效，避免返回缺字段的陈旧事实包
  const ver = ENGINE_VERSION[c.type || 'bazi'] || '0';
  const str = JSON.stringify(c, Object.keys(c).sort()) + '@' + ver;
  const hash = crypto.createHash('sha1').update(str).digest('hex').slice(0, 16);
  return `${c.type || 'bazi'}:${hash}`;
}

const memory = new Map();

/** 校验事实包结构 */
export function validate(fp) {
  const errs = [];
  if (!fp || typeof fp !== 'object') return ['事实包为空'];
  if (!fp.id) errs.push('缺少 id');
  if (!fp.system) errs.push('缺少 system');
  if (!fp.facts || typeof fp.facts !== 'object') errs.push('缺少 facts');
  if (fp.system === 'bazi') {
    const f = fp.facts || {};
    for (const k of ['fourPillars', 'dayMaster', 'strength', 'dayun', 'elementPercent']) {
      if (!f[k]) errs.push(`八字 facts 缺少 ${k}`);
    }
    for (const p of ['year', 'month', 'day', 'hour']) {
      if (!f.fourPillars || !f.fourPillars[p] || !f.fourPillars[p].name) errs.push(`四柱缺少 ${p}柱`);
    }
  }
  if (fp.system === 'liuyao') {
    const f = fp.facts || {};
    if (!f.benGua || !f.benGua.name) errs.push('六爻缺少本卦');
    if (!Array.isArray(f.lines) || f.lines.length !== 6) errs.push('六爻爻数不为 6');
  }
  if (fp.system === 'qimen') {
    const f = fp.facts || {};
    if (!Array.isArray(f.palaces) || f.palaces.length !== 9) errs.push('奇门宫数不为 9');
    if (!f.zhiFu || !f.zhiShi) errs.push('奇门缺少值符/值使');
  }
  if (fp.system === 'ziwei') {
    const f = fp.facts || {};
    if (!f.mingGong || !f.mingGong.zhi) errs.push('紫微缺少命宫');
    if (!f.wuXingJu || !f.wuXingJu.name) errs.push('紫微缺少五行局');
    if (!f.palaces || Object.keys(f.palaces).length !== 12) errs.push('紫微十二宫不全');
    if (!f.fourHua || !f.fourHua.lu) errs.push('紫微缺少四化');
    if (!f.starPositions || Object.keys(f.starPositions).length !== 14) errs.push('紫微十四主星不全');
  }
  return errs;
}

function readCache(id) {
  if (memory.has(id)) return memory.get(id);
  const file = path.join(CACHE_DIR, `${id.replace(/[^\w.-]/g, '_')}.json`);
  if (fs.existsSync(file)) {
    try {
      const st = fs.statSync(file);
      if (Date.now() - st.mtimeMs > CACHE_TTL_MS) {
        // 已过期：视为未命中并顺手删除
        try {
          fs.unlinkSync(file);
        } catch {
          /* ignore */
        }
        return null;
      }
      const fp = JSON.parse(fs.readFileSync(file, 'utf8'));
      memory.set(id, fp);
      return fp;
    } catch {
      return null;
    }
  }
  return null;
}

function writeCache(fp) {
  memory.set(fp.id, fp);
  try {
    ensureDirs();
    const file = path.join(CACHE_DIR, `${fp.id.replace(/[^\w.-]/g, '_')}.json`);
    fs.writeFileSync(file, JSON.stringify(fp), 'utf8');
    // 硬上限：每次写盘后立即淘汰最旧，确保文件数永不超 CACHE_MAX_FILES
    evictExcess();
    // 周期性触发完整治理（含 TTL 过期），与启动清理配合，保证永不无限增长
    writeCounter += 1;
    if (writeCounter % CACHE_CLEAN_EVERY === 0) enforceCachePolicy();
  } catch (e) {
    // 缓存落盘失败不阻塞主流程
    fp.meta = { ...(fp.meta || {}), cacheWriteError: e.message };
  }
}

/**
 * 构建事实包（带缓存）
 * @param {object} input
 * @param {{ useCache?:boolean }} opts
 */
export function build(input, opts = {}) {
  const type = input.type || 'bazi';
  if (!['bazi', 'liuyao', 'qimen', 'ziwei'].includes(type)) {
    throw new Error(`不支持的体系: ${type}（可用：bazi / liuyao / qimen / ziwei）`);
  }
  const id = cacheKeyOf({ ...input, type });
  const useCache = opts.useCache !== false;
  if (useCache) {
    const hit = readCache(id);
    if (hit) {
      return { ...hit, meta: { ...hit.meta, cacheHit: true } };
    }
  }

  const started = Date.now();
  let facts;
  if (type === 'bazi') facts = computeBazi(input);
  else if (type === 'liuyao') facts = computeLiuyao(input);
  else if (type === 'qimen') facts = computeQimen(input);
  else facts = computeZiwei(input);

  const fp = {
    id,
    system: type,
    version: 1,
    generatedAt: new Date().toISOString(),
    input: canonical(input),
    facts,
    meta: {
      engineVersion: ENGINE_VERSION[type],
      buildMs: Date.now() - started,
      warnings: [],
      confidence: 'high',
      cacheHit: false,
    },
  };

  const errs = validate(fp);
  if (errs.length) {
    fp.meta.warnings = errs;
    fp.meta.confidence = 'low';
  }
  if (facts.time && facts.time.lateZi) {
    fp.meta.warnings.push('出生时刻落入晚子时（23:00 后），日柱已按次日计算');
  }
  if (type === 'bazi' && input.hour === undefined) {
    fp.meta.warnings.push('未提供出生时辰，时柱按 12:00 估算，结果仅供参考');
  }

  writeCache(fp);
  return fp;
}

/** 缓存统计（供成本看板使用，含治理上限便于核对） */
export function cacheStats() {
  let files = 0;
  let bytes = 0;
  try {
    if (fs.existsSync(CACHE_DIR)) {
      for (const f of fs.readdirSync(CACHE_DIR)) {
        const st = fs.statSync(path.join(CACHE_DIR, f));
        files++;
        bytes += st.size;
      }
    }
  } catch {
    /* ignore */
  }
  return { memoryEntries: memory.size, files, bytes, maxFiles: CACHE_MAX_FILES, ttlMs: CACHE_TTL_MS };
}

export { ensureDirs, DATA_DIR as dataDir };
