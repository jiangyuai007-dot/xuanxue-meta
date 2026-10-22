/**
 * cache —— AI 章节结果缓存
 *
 * 键：`v{PLAN_VERSION}::{system}::{factPackId}::{chapterKey}`
 * 目的：同一个人第二次生成报告秒开、零成本；模板升级后旧缓存自动失效。
 * 存储：data/ai-cache/<key>.json，TTL 30 天，超出按 mtime 淘汰最旧。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const CACHE_DIR = path.join(ROOT, 'data', 'ai-cache');

export const CACHE_TTL_MS = 30 * 24 * 3600 * 1000; // 30 天
const MAX_FILES = 800;
const CLEAN_EVERY = 50;
let writes = 0;

const safeName = (k) => k.replace(/[^\w.-]/g, '_');

function ensure() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function evict() {
  try {
    ensure();
    const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
    if (files.length <= MAX_FILES) return;
    const withTime = files.map((f) => {
      try {
        return { f, m: fs.statSync(path.join(CACHE_DIR, f)).mtimeMs };
      } catch {
        return { f, m: 0 };
      }
    });
    withTime.sort((a, b) => a.m - b.m);
    for (let i = 0; i < withTime.length - MAX_FILES; i++) {
      try {
        fs.unlinkSync(path.join(CACHE_DIR, withTime[i].f));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export function keyOf({ planVersion, system, factPackId, chapterKey }) {
  return `v${planVersion}:${system}:${factPackId}:${chapterKey}`;
}

/** 读缓存（过期顺手删掉） */
export function read({ planVersion, system, factPackId, chapterKey }) {
  const k = keyOf({ planVersion, system, factPackId, chapterKey });
  const file = path.join(CACHE_DIR, safeName(k) + '.json');
  try {
    if (!fs.existsSync(file)) return null;
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs > CACHE_TTL_MS) {
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
      return null;
    }
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    o.hit = true;
    return o;
  } catch {
    return null;
  }
}

/** 写缓存 */
export function write(payload) {
  const k = keyOf(payload);
  try {
    ensure();
    fs.writeFileSync(path.join(CACHE_DIR, safeName(k) + '.json'), JSON.stringify({ ...payload, at: new Date().toISOString() }), 'utf8');
    writes += 1;
    evict();
    if (writes % CLEAN_EVERY === 0) evict();
    return k;
  } catch {
    return null;
  }
}

/** 统计（给诊断脚本用） */
export function stats() {
  let files = 0;
  let bytes = 0;
  try {
    ensure();
    for (const f of fs.readdirSync(CACHE_DIR)) {
      files += 1;
      try {
        bytes += fs.statSync(path.join(CACHE_DIR, f)).size;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return { files, bytes, ttlMs: CACHE_TTL_MS, dir: CACHE_DIR };
}

export { CACHE_DIR };
