/**
 * ai/service —— 报告服务层（线上链路的唯一装配点）
 */

import { entitledSections } from '../commerce/entitle.js';
import { unlockedSections, listOrders, markConsumed, SECTION_PRICE } from '../commerce/sku.js';
import { verifySession } from '../account/user.js';
import { getChapter, listChapters } from '../core/reportPlan.js';
import { generateReport } from './index.js';
import { renderChapterCard } from '../report/templates/bazi.js';
import { renderHePanChapterCard } from '../report/templates/hepan.js';

/** 章节卡渲染层按体系分派：合盘用合盘整页的同一份版式，其余沿用通用章节卡并传入 gateSystem */
const CARD_OF = (system) =>
  system === 'hepan'
    ? renderHePanChapterCard
    : (chapter, data, opts = {}) => renderChapterCard(chapter, data, { ...opts, gateSystem: system });

export function sessionUserOf(req) {
  if (!req) return null;
  const raw = String(req.headers['x-session-token'] || '');
  const auth = String(req.headers.authorization || '');
  const token = raw || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  return verifySession(token.trim()) || null;
}

export function resolvePurchased({ system, body = {}, req }) {
  const paidKeys = Object.keys(SECTION_PRICE[system] || {});
  const purchasedSet = new Set();

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
      markConsumed(o.id);
    }
  }
  return purchasedSet;
}

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

function toItem(r, system, purchasedSet) {
  const chapter = getChapter(r.key, system) || { ...CHAPTER_FALLBACK, key: r.key, title: r.title };
  const unlocked = chapter.free === true || purchasedSet.has(chapter.key);
  const card = CARD_OF(system);
  const priceNum = (SECTION_PRICE[system] || {})[chapter.key];
  const priceStr = priceNum !== undefined ? `¥${priceNum}` : undefined;
  return {
    key: chapter.key,
    title: chapter.title,
    order: chapter.order,
    free: !!chapter.free,
    unlocked,
    html: unlocked
      ? card(chapter, r.data, { unlocked: true, source: r.source })
      : card(chapter, {}, { unlocked: false, price: priceStr }),
    data: r.data || {},
    source: r.source,
    latencyMs: r.latencyMs || 0,
    warnings: r.warnings || [],
    error: r.error || '',
  };
}
