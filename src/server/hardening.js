/**
 * 服务端加固中间件（零第三方依赖）
 *  - 输入校验层（/api/paipan、/api/report 共用）
 *  - 安全响应头
 *  - 按 IP+接口维度的令牌桶限流
 *  - gzip 判定与压缩辅助
 *  - 内存 reports 的 LRU 容器
 *  - 客户端真实 IP 提取（受信反代后才信任 X-Forwarded-For）
 *
 * 设计约束：所有面向用户的错误都必须是「用户可读中文 + 固定 code」，
 * 内部字段名 / 堆栈绝不外泄。
 */

import zlib from 'node:zlib';
import { CITIES } from '../core/time.js';

/* ----------------------------------------------------------------------- *
 * 1. 安全响应头
 * ----------------------------------------------------------------------- */
// 页面含内联 <style>/<script>，故 script-src/style-src 允许 'unsafe-inline'；
// 经实测（CDP 抓 console error）前端无 eval/new Function/外联资源，故不放开 'unsafe-eval'。
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  "Content-Security-Policy":
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
};

/* ----------------------------------------------------------------------- *
 * 2. 输入校验层
 * ----------------------------------------------------------------------- */
const TYPES = ['bazi', 'liuyao', 'qimen', 'ziwei'];
const CITY_NAMES = new Set(CITIES.map((c) => c.name));

/** 公历当月天数（含闰年） */
export function daysInGregorianMonth(year, month) {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) return 29;
  return days[month - 1];
}

function toInt(v) {
  if (Number.isInteger(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  }
  return NaN;
}

/**
 * 校验 /api/paipan 与 /api/report 的入参。
 * @returns {{ok:true} | {ok:false, error:string}}
 * 失败信息均为用户可读中文；不返回任何内部字段名/堆栈。
 */
export function validateInput(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!input) return { ok: false, error: '请求体格式有误，请检查输入' };

  if (input.type === undefined || input.type === null || input.type === '') {
    return { ok: false, error: '请选择命理体系（八字 / 六爻 / 奇门 / 紫微）' };
  }
  if (!TYPES.includes(input.type)) {
    return { ok: false, error: `暂不支持的体系「${input.type}」，可选：八字 / 六爻 / 奇门 / 紫微` };
  }

  const year = toInt(input.year);
  if (!Number.isFinite(year)) return { ok: false, error: '出生年份必须填写' };
  if (year < 1900 || year > 2100) return { ok: false, error: '出生年份需在 1900~2100 之间' };

  const month = toInt(input.month);
  if (!Number.isFinite(month)) return { ok: false, error: '出生月份必须填写' };
  if (month < 1 || month > 12) return { ok: false, error: '出生月份需在 1~12 之间' };

  const day = toInt(input.day);
  if (!Number.isFinite(day)) return { ok: false, error: '出生日期必须填写' };
  const cal = input.calendar || 'gregorian';
  if (cal === 'lunar') {
    // 农历月最多 30 天（无 31 日）
    if (day < 1 || day > 30) return { ok: false, error: `农历 ${month} 月没有 ${day} 日` };
  } else {
    if (day < 1 || day > daysInGregorianMonth(year, month)) {
      return { ok: false, error: `公历 ${year} 年 ${month} 月没有 ${day} 日` };
    }
  }

  const hour = toInt(input.hour);
  if (!Number.isFinite(hour)) return { ok: false, error: '出生时辰必须填写' };
  if (hour < 0 || hour > 23) return { ok: false, error: '出生时辰需在 0~23 之间' };

  // minute / calendar / city 等「可选但需合规」的字段：仅在校验出现时校验，未提供不强制
  // （六爻 / 奇门既有调用不携带 minute、calendar，保持兼容）。
  if (input.minute !== undefined && input.minute !== null && input.minute !== '') {
    const minute = toInt(input.minute);
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) return { ok: false, error: '分钟需在 0~59 之间' };
  }
  if (input.calendar !== undefined && input.calendar !== null && input.calendar !== '') {
    if (!['gregorian', 'lunar'].includes(input.calendar)) {
      return { ok: false, error: '日历类型仅支持公历(gregorian)或农历(lunar)' };
    }
  }

  // 城市白名单：city 在 CITIES 内，或显式提供合法经纬度。两者皆无则明确报错（不静默兜底）。
  const cityOk = typeof input.city === 'string' && input.city.trim() !== '' && CITY_NAMES.has(input.city.trim());
  const hasLonLat = Number.isFinite(Number(input.lon)) && Number.isFinite(Number(input.lat));
  if (!cityOk && !hasLonLat) {
    return {
      ok: false,
      error: input.city ? `暂不支持城市「${input.city}」，请从城市列表中选择` : '请提供有效城市或经纬度',
    };
  }

  return { ok: true };
}

/* ----------------------------------------------------------------------- *
 * 3. 限流：令牌桶，按 IP + 接口维度
 * ----------------------------------------------------------------------- */
// 读接口（静态/GET）：每 IP 60 次/分钟；写接口（排盘/报告/下单）：每 IP 20 次/分钟。
const RATE = {
  read: { cap: 60, refillPerSec: 60 / 60 },
  write: { cap: 20, refillPerSec: 20 / 60 },
};
const WRITE_PATHS = new Set([
  '/api/paipan', '/api/report', '/api/report/stream',
  '/api/hepan', '/api/hepan/report/stream',
  '/api/order', '/api/reports',
]);
// 本地回环免限流，方便本地联调/验收。
const WHITELIST = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const buckets = new Map();

/** @returns {{ok:true, remaining:number} | {ok:false, retryAfter:number}} */
export function rateLimit(ip, urlPath, method) {
  if (WHITELIST.has(ip)) return { ok: true, remaining: Infinity };
  const isWrite = WRITE_PATHS.has(urlPath);
  const key = ip + '|' + (isWrite ? 'w' : 'r');
  const cfg = isWrite ? RATE.write : RATE.read;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: cfg.cap, ts: now };
    buckets.set(key, b);
  }
  b.tokens = Math.min(cfg.cap, b.tokens + ((now - b.ts) / 1000) * cfg.refillPerSec);
  b.ts = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, remaining: Math.floor(b.tokens) };
  }
  const retryAfter = Math.ceil((1 - b.tokens) / cfg.refillPerSec);
  return { ok: false, retryAfter };
}

/* ----------------------------------------------------------------------- *
 * 4. 客户端真实 IP（仅受信反代后才信任 X-Forwarded-For，避免公网伪造绕过限流）
 * ----------------------------------------------------------------------- */
function isPrivateIp(ip) {
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (ip.startsWith('169.254.')) return true;
  return false;
}

export function clientIp(req) {
  const sock = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';
  const real = sock.replace(/^::ffff:/, '');
  const xff = req.headers['x-forwarded-for'];
  // 仅当连接来自内网/回环（前面有可信反代）时才信任 XFF 的第一个 IP
  if (xff && (real === '127.0.0.1' || real === '::1' || isPrivateIp(real))) {
    const first = String(xff).split(',')[0].trim();
    if (first) return first;
  }
  return real;
}

/* ----------------------------------------------------------------------- *
 * 5. gzip 辅助
 * ----------------------------------------------------------------------- */
const COMPRESSIBLE = new Set([
  'text/html',
  'application/javascript',
  'text/css',
  'application/json',
  'image/svg+xml',
]);
const MIN_GZIP_BYTES = 1024;

export function isCompressible(contentType) {
  const base = String(contentType || '').split(';')[0].trim();
  return COMPRESSIBLE.has(base);
}

/** 尊重 Accept-Encoding，对可压缩且 >1KB 的 body 做 gzip。 */
export function maybeGzip(req, contentType, buf) {
  const ae = req.headers['accept-encoding'] || '';
  if (!isCompressible(contentType) || buf.length <= MIN_GZIP_BYTES || !/\bgzip\b/.test(ae)) {
    return { buf, encoding: null };
  }
  try {
    return { buf: zlib.gzipSync(buf), encoding: 'gzip' };
  } catch {
    return { buf, encoding: null };
  }
}

/* ----------------------------------------------------------------------- *
 * 6. 内存 reports 的 LRU 容器（上限可配，超出按最近最少使用淘汰）
 * ----------------------------------------------------------------------- */
// 内存报告上限：300 条，超出淘汰最久未访问。常量集中，便于调整。
export const REPORTS_MAX = 300;

export class LRUCache {
  constructor(max = REPORTS_MAX) {
    this.max = max;
    this.map = new Map(); // 保持插入顺序即 LRU 顺序
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, v); // 移到末尾表示最近使用
    return v;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    return this;
  }
  has(key) {
    return this.map.has(key);
  }
  delete(key) {
    return this.map.delete(key);
  }
  get size() {
    return this.map.size;
  }
}
