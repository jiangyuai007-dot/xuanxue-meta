/**
 * 权益核心：服务端签发 / 校验「已解锁章节」凭证（entitlement token）
 *
 * 设计要点（安全整改 · 付费权益）：
 *  - 解锁判定只认服务端签发的权益凭证，绝不信任前端直接传来的章节键数组
 *    （旧接口 body.purchased 属于不可信输入，新入口 entitledSections 直接无视它）。
 *  - 凭证 = base64url(JSON 载荷) + '.' + HMAC-SHA256(规范化载荷, 密钥)。
 *  - 密钥优先级：process.env.XUANXUE_SECRET > 持久化文件 data/.secret（0600）。
 *    首次启动无环境变量时随机生成并落盘，重启后仍能验旧签（密钥持久化）。
 *  - verifyEntitlement 除验签外，还会回查订单状态：已退款（refunded）视为无效，
 *    订阅（member_month）校验 exp 未过期。
 *  - 兼容：旧 unlockedSections() 保留给旧调用 / 冒烟测试，新判定入口必须是验签路径。
 *
 * 注意：本文件与 sku.js 存在循环引用（sku.js 的 payOrder 调用 issueEntitlement，
 * 本文件 verifyEntitlement 调用 sku.js 的 getOrder），全部为运行时调用，
 * ES Module 实时绑定可安全解析，请勿在模块顶层直接调用对方导出。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SECTION_PRICE, getSku, getOrder } from './sku.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const DATA_DIR = path.join(ROOT, 'data');
const SECRET_FILE = path.join(DATA_DIR, '.secret');

let _secret = null;

/** 取得签名密钥：环境变量优先，否则读取 / 生成持久化密钥文件 */
export function getSecret() {
  if (_secret) return _secret;
  if (process.env.XUANXUE_SECRET) {
    _secret = String(process.env.XUANXUE_SECRET);
    return _secret;
  }
  // 尝试读取持久化密钥
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const s = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (s) {
        _secret = s;
        return _secret;
      }
    }
  } catch {
    /* ignore */
  }
  // 首次启动：随机生成并落盘（仅本机可读写）
  _secret = crypto.randomBytes(32).toString('hex');
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SECRET_FILE, _secret, { mode: 0o600 });
  } catch {
    /* 落盘失败不阻塞，仅当前进程内存有效 */
  }
  return _secret;
}

/** 仅供测试：重置内存密钥（不影响磁盘文件） */
export function _resetSecretCache() {
  _secret = null;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

/**
 * 规范化签名串：固定字段顺序，sections 排序，保证可复现。
 * 订阅类 system 记为 '*'（跨体系全解锁）。
 */
function canonical(payload) {
  return JSON.stringify({
    orderId: payload.orderId,
    system: payload.system,
    sections: [...(payload.sections || [])].sort(),
    exp: payload.exp ?? null,
  });
}

function signPayload(payload) {
  return crypto.createHmac('sha256', getSecret()).update(canonical(payload)).digest('base64url');
}

/** 全部体系的全部章节键（订阅卡用） */
function allSectionKeys() {
  const out = [];
  for (const sys of Object.keys(SECTION_PRICE)) {
    for (const k of Object.keys(SECTION_PRICE[sys])) out.push(k);
  }
  return out;
}

/**
 * 由服务端在订单支付成功后签发权益凭证。
 * @param {{ id:string, skuId:string, system?:string, sectionKey?:string, validUntil?:string, status:string }} order
 * @returns {string} entitlement token
 */
export function issueEntitlement(order) {
  const sku = getSku(order.skuId);
  if (!sku) throw new Error(`未知 SKU: ${order.skuId}`);
  let system = order.system || null;
  let sections = [];
  let exp = null;

  if (sku.type === 'subscription') {
    // 会员月卡：跨体系全解锁，exp = 订阅到期时间戳
    system = '*';
    sections = allSectionKeys();
    exp = order.validUntil ? new Date(order.validUntil).getTime() : null;
  } else if (sku.unlockAll) {
    // 全量包：解锁该订单所属体系全部章节，单章类无过期
    sections = Object.keys(SECTION_PRICE[order.system] || {});
    exp = null;
  } else {
    // 单章：仅该 sectionKey
    sections = order.sectionKey ? [order.sectionKey] : [];
    exp = null;
  }

  const payload = { v: 1, orderId: order.id, system, sections, exp };
  const token = b64url(JSON.stringify(payload)) + '.' + signPayload(payload);
  return token;
}

/**
 * 校验权益凭证。
 * @param {string} token
 * @param {{ system?:string }} opts 调用方当前体系
 * @returns {null | { orderId:string, system:string, sections:string[], exp:number|null }}
 */
export function verifyEntitlement(token, { system } = {}) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const enc = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload;
  try {
    payload = JSON.parse(Buffer.from(enc, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  // 1) 签名校验
  if (!payload || signPayload(payload) !== sig) return null;
  // 2) 体系匹配（订阅 '*' 适用任意体系）
  if (!(payload.system === '*' || payload.system === system)) return null;
  // 3) 过期校验（订阅类）
  if (payload.exp && Date.now() > payload.exp) return null;
  // 4) 回查订单状态：已退款 / 不存在 → 凭证失效
  const order = getOrder(payload.orderId);
  if (!order || order.status !== 'paid') return null;
  return { orderId: payload.orderId, system: payload.system, sections: payload.sections, exp: payload.exp ?? null };
}

/**
 * 新的解锁判定入口：只认可通过验签的凭证，返回该体系已解锁章节键集合。
 * 绝不信任任何前端直接传来的章节键数组。
 * @param {{ system?:string, tokens?:string[] }} opts
 * @returns {string[]}
 */
export function entitledSections({ system, tokens } = {}) {
  const out = new Set();
  for (const t of tokens || []) {
    const p = verifyEntitlement(t, { system });
    if (!p) continue;
    const valid = SECTION_PRICE[system] || {};
    for (const k of p.sections) {
      // 订阅 '*' 仅采纳属于当前体系的键；体系专属凭证直接采纳其声明的合法键
      if (p.system === '*') {
        if (valid[k] !== undefined) out.add(k);
      } else if (valid[k] !== undefined) {
        out.add(k);
      }
    }
  }
  return [...out];
}
