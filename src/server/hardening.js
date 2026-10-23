/**
 * 服务端加固中间件（零第三方依赖）
 *  - 输入校验层（/api/paipan、/api/report 共用）
 *  - 安全响应头（含 PWA worker-src / manifest-src 与 Canvas 海报 blob:/data: 支持）
 *  - 按 IP+接口维度的令牌桶限流
 *  - gzip 判定与压缩辅助
 *  - 内存 reports 的 LRU 容器
 *  - 客户端真实 IP 提取（受信反代后才信任 X-Forwarded-For）
 */

import zlib from 'node:zlib';
import { CITIES } from '../core/time.js';

/* ----------------------------------------------------------------------- *
 * 1. 安全响应头
 * ----------------------------------------------------------------------- */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; worker-src 'self'; manifest-src 'self'; img-src 'self' data: blob:; connect-src 'self'",
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
    if (day < 1 || day > 30) return { ok: false, error: `农历 ${month} 月没有 ${day} 日` };
  } else {
    if (day < 1 || day > daysInGregorianMonth(year, month)) {
      return { ok: false, error: `公历 ${year} 年 ${month} 月没有 ${day} 日` };
    }
  }

  const hour = toInt(input.hour);
  if (!Number.isFinite(hour)) return { ok: false, error: '出生时辰必须填写' };
  if (hour < 0 || hour > 23) return { ok: false, error: '出生时辰需在 0~23 之间' };

  if (input.minute !== undefined && input.minute !== null && input.minute !== '') {
    const minute = toInt(input.minute);
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) return { ok: false, error: '分钟需在 0~59 之间' };
  }
  if (input.calendar !== undefined && input.calendar !== null && input.calendar !== '') {
    if (!['gregorian', 'lunar'].includes(input.calendar)) {
      return { ok: false, error: '日历类型仅支持公历(gregorian)或农历(lunar)' };
    }
  }

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
const BUCKETS = new Map();
const MAX_BUCKETS = 10000;

export function rateLimit(ip, kind = 'read') {
  const now = Date.now();
  const cap = kind === 'write' ? 20 : 60;
  const refillPerMs = cap / 60000;
  const key = `${ip}:${kind}`;

  if (BUCKETS.size > MAX_BUCKETS) {
    for (const [k, v] of BUCKETS) {
      if (now - v.last > 120000) BUCKETS.delete(k);
      if (BUCKETS.size <= MAX_BUCKETS / 2) break;
    }
  }

  let b = BUCKETS.get(key);
  if (!b) {
    b = { tokens: cap, last: now };
    BUCKETS.set(key, b);
  } else {
    b.tokens = Math.min(cap, b.tokens + (now - b.last) * refillPerMs);
    b.last = now;
  }

  if (b.tokens < 1) {
    const retryAfter = Math.max(1, Math.ceil((1 - b.tokens) / refillPerMs / 1000));
    return { ok: false, retryAfter };
  }
  b.tokens -= 1;
  return { ok: true, retryAfter: 0 };
}

export function resetRateLimit() {
  BUCKETS.clear();
}

/* ----------------------------------------------------------------------- *
 * 4. 客户端 IP 提取
 * ----------------------------------------------------------------------- */
const TRUST_PROXY = process.env.XUANXUE_TRUST_PROXY === '1';

export function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      return xff.split(',')[0].trim();
    }
  }
  return (req.socket && req.socket.remoteAddress) || '0.0.0.0';
}

/* ----------------------------------------------------------------------- *
 * 5. Gzip 压缩辅助
 * ----------------------------------------------------------------------- */
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg\+xml)/;

export function maybeGzip(req, contentType, buf) {
  if (!buf || buf.length < 1024) return { buf, encoding: null };
  if (!COMPRESSIBLE.test(contentType || '')) return { buf, encoding: null };
  const ae = (req.headers && req.headers['accept-encoding']) || '';
  if (!/\bgzip\b/i.test(ae)) return { buf, encoding: null };
  try {
    return { buf: zlib.gzipSync(buf, { level: 6 }), encoding: 'gzip' };
  } catch {
    return { buf, encoding: null };
  }
}

/* ----------------------------------------------------------------------- *
 * 6. 进程内 LRU 缓存（用于 reports Map，防 OOM）
 * ----------------------------------------------------------------------- */
export const REPORTS_MAX = 300;

export class LRUCache {
  constructor(max = REPORTS_MAX) {
    this.max = max;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }
  set(key, val) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, val);
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
  clear() {
    this.map.clear();
  }
}
