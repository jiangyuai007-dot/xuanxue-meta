/**
 * ai/service —— 报告服务层（线上链路的唯一装配点）
 *
 * 只做三件事，规则/文案/版式一概不碰：
 *   1. sessionUserOf()   登录态解析（server 复用，避免两处实现漂移）
 *   2. resolvePurchased()已购集合解析（原 server/index.js 内联逻辑，等价迁移）
 *   3. buildReport()     调 ai/index 逐章生成，判断解锁 → 渲染层出章节卡 HTML → 回调
 *
 * 消费方有两种：SSE 逐章（/api/report/stream）与一次性（?mode=json）。
 */

import { entitledSections } from '../commerce/entitle.js';
import { unlockedSections, listOrders, markConsumed, SECTION_PRICE } from '../commerce/sku.js';
import { verifySession } from '../account/user.js';
import { getChapter, listChapters } from '../core/reportPlan.js';
import { generateReport } from './index.js';
import { renderChapterCard } from '../report/templates/bazi.js';
import { renderHePanChapterCard } from '../report/templates/hepan.js';

/** 章节卡渲染层按体系分派：合盘用合盘整页的同一份版式，其余沿用八字 */
const CARD_OF = (system) => (system === 'hepan' ? renderHePanChapterCard : renderChapterCard);

/**
 * 取登录态：Authorization: Bearer <token> 或 x-session-token 头
 * @param {import('node:http').IncomingMessage} req
 */
export function sessionUserOf(req) {
  if (!req) return null;
  const raw = String(req.headers['x-session-token'] || '');
  const auth = String(req.headers.authorization || '');
  const token = raw || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  return verifySession(token.trim()) || null;
}

/**
 * 解析本章节已解锁集合（等价迁移自 server/index.js，行为一字不改）
 *
 * 三条路径（顺序即优先级）：
 *   全站免费（默认，XUANXUE_PAID !== '1'）→ 付费键全解锁
 *   权益凭证（body.entitlements，服务端验签）→ 仅凭证覆盖的章节
 *   演示模式（XUANXUE_DEMO_UNLOCK=1）→ 以服务端订单为准
 *   登录用户已支付订单的凭证 → 换设备/清缓存后权益仍可恢复
 *
 * 前端传来的 purchased 裸章节键数组一律不采信（可伪造，等于白送全部付费内容）。
 *
 * @param {{system:string, body?:object, req?:object}} p
 * @returns {Set<string>}
 */
export function resolvePurchased({ system, body = {}, req }) {
  const paidKeys = Object.keys(SECTION_PRICE[system] || {});
  const purchasedSet = new Set();

  // 全站免费模式（默认）：所有付费章节直接可读，不做任何付费门禁。
  // 按「计划里的章节」解锁而非只按价表：价表漏登记的那章（曾出现 shensha）
  // 会被误判成锁定。需恢复付费时设置 XUANXUE_PAID=1 启动，届时走凭证验签路径。
  const FREE_MODE = process.env.XUANXUE_PAID !== '1';
  if (FREE_MODE) {
    for (const k of paidKeys) purchasedSet.add(k);
    for (const c of listChapters(system)) purchasedSet.add(c.key);
  } else if (Array.isArray(body.entitlements) && body.entitlements.length) {
    for (const k of entitledSections({ system, tokens: body.entitlements })) purchasedSet.add(k);
  } else if (process.env.XUANXUE_DEMO_UNLOCK === '1') {
    for (const k of unlockedSections({ system })) purchasedSet.add(k);
  }

  const sessionUser = sessionUserOf(req);
  if (sessionUser) {
    for (const o of listOrders({ userId: sessionUser.id, status: 'paid' })) {
      if (!o.entitlement) continue;
      const ks = entitledSections({ system, tokens: [o.entitlement] });
      if (!ks.length) continue;
      for (const k of ks) purchasedSet.add(k);
      // 付费内容已真实交付 → 打标，作为「已消费不支持无理由退款」的依据
      markConsumed(o.id);
    }
  }
  return purchasedSet;
}

/**
 * 逐章产出报告：生成 → 判解锁 → 渲染层出 HTML → 回调（供 SSE 实时推）
 *
 * @param {object} p
 * @param {object} p.factPack        factpack（含 facts）
 * @param {Set<string>} [p.purchasedSet]
 * @param {boolean} [p.useCache]    默认 true
 * @param {(item:object, progress:{done:number,total:number,index:number}) => void} [p.onChapter]
 * @returns {Promise<{chapters:Array, source:string, aiCount:number, cacheCount:number,
 *                    localCount:number, totalMs:number, warnings:string[]}>}
 */
export async function buildReport(p) {
  const { factPack, purchasedSet = new Set(), useCache = true, onChapter } = p;
  const system = factPack.system;
  const facts = factPack.facts || {};

  const res = await generateReport({
    system,
    facts,
    factPackId: factPack.id,
    useCache,
    onChapter: (r, progress) => {
      const item = toItem(r, system, purchasedSet);
      if (typeof onChapter === 'function') onChapter(item, progress);
    },
  });

  return {
    chapters: res.chapters.map((r) => toItem(r, system, purchasedSet)),
    source: res.source,
    aiCount: res.aiCount,
    cacheCount: res.cacheCount,
    localCount: res.localCount,
    totalMs: res.totalMs,
    warnings: res.warnings,
  };
}

const CHAPTER_FALLBACK = { key: '', title: '', order: 0, free: false };

/** 章节结果 → 带 HTML 的传输件 */
function toItem(r, system, purchasedSet) {
  const chapter = getChapter(r.key, system) || { ...CHAPTER_FALLBACK, key: r.key, title: r.title };
  const unlocked = chapter.free === true || purchasedSet.has(chapter.key);
  const card = CARD_OF(system);
  return {
    key: chapter.key,
    title: chapter.title,
    order: chapter.order,
    free: !!chapter.free,
    unlocked,
    // 版式由渲染层写死：解锁与否只决定「卡」还是「锁」，不影响结构
    html: unlocked
      ? card(chapter, r.data, { unlocked: true, source: r.source })
      : card(chapter, {}, { unlocked: false }),
    data: r.data || {},
    source: r.source,
    latencyMs: r.latencyMs || 0,
    warnings: r.warnings || [],
    error: r.error || '',
  };
}
