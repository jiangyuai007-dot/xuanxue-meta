/**
 * 报告访问令牌（report token）：为 /api/report/<id>/html 提供隐私鉴权
 *
 * 背景（安全整改 · 报告隐私）：
 *  - 原报告页仅凭 URL 即可拿到 93KB 完整报告（含精确出生时间与命盘），转发即泄露隐私。
 *  - 现报告页 URL 必须带有效 token（?t=<token>）才返回完整报告；
 *    无 token / token 过期 / 签名无效 → 404/403（文案「报告链接已失效，请重新生成」）。
 *
 * 令牌 = base64url(JSON 载荷) + '.' + HMAC-SHA256(规范化载荷, 与权益凭证同一密钥)。
 * 载荷含 factPackId / 可选 sections / iat / exp，默认 10 分钟短期有效（可配 ttl）。
 */

import crypto from 'node:crypto';
import { getSecret } from './entitle.js';

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function canonical(payload) {
  return JSON.stringify({
    factPackId: payload.factPackId,
    sections: [...(payload.sections || [])].sort(),
    iat: payload.iat,
    exp: payload.exp,
  });
}

function signPayload(payload) {
  return crypto.createHmac('sha256', getSecret()).update(canonical(payload)).digest('base64url');
}

/**
 * 签发报告访问令牌。
 * @param {string} factPackId
 * @param {{ sections?:string[], ttl?:number }} [opts] ttl 单位毫秒，默认 10 分钟
 * @returns {string} report token
 */
export function issueReportToken(factPackId, { sections = [], ttl = 10 * 60 * 1000 } = {}) {
  const iat = Date.now();
  const exp = iat + ttl;
  const payload = { v: 1, factPackId, sections, iat, exp };
  return b64url(JSON.stringify(payload)) + '.' + signPayload(payload);
}

/**
 * 校验报告访问令牌。
 * @param {string} factPackId 当前请求的报告 ID（必须与令牌内一致，防跨报告盗用）
 * @param {string} token
 * @returns {null | { factPackId:string, sections:string[], iat:number, exp:number }}
 */
export function verifyReportToken(factPackId, token) {
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
  if (!payload || payload.factPackId !== factPackId) return null;
  if (signPayload(payload) !== sig) return null;
  if (payload.exp && Date.now() > payload.exp) return null;
  return { factPackId: payload.factPackId, sections: payload.sections || [], iat: payload.iat, exp: payload.exp };
}

/**
 * 拼装带 token 的报告页 URL。
 *
 * 体系隔离：合盘的整页路由是 /api/hepan/:id/html，地址必须指回自己的路由，
 * 否则前端「查看完整报告」会跳到八字整页（版式丢失）。
 *
 * @param {string} factPackId
 * @param {string} token
 * @param {string} [pagePath='/api/report'] 整页路由前缀（hepan 传 '/api/hepan'）
 * @returns {string}
 */
export function reportUrl(factPackId, token, pagePath = '/api/report') {
  const base = String(pagePath || '/api/report').replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(factPackId)}/html?t=${encodeURIComponent(token)}`;
}
