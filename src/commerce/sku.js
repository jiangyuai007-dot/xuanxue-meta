/**
 * 商业化骨架：SKU、章节解锁、模拟订单
 * 说明（设计文档 D8）：不接真实支付，订单为本地模拟，保留完整状态机以便后续对接
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { issueEntitlement } from './entitle.js';
import { createCharge, refundCharge } from './pay/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const DATA_DIR = path.join(ROOT, 'data');
const ORDER_FILE = path.join(DATA_DIR, 'orders.json');

/** 章节解锁定价表 */
export const SECTION_PRICE = {
  bazi: {
    // 免费两章用于让用户核验盘准确度、建立信任，不参与定价
    xingge: 6.9, shiye: 6.9, caiyun: 6.9, ganqing: 6.9,
    // 六亲（qinyuan）已并入「情感婚姻」章，键随之删除；神煞（shensha）补位
    jiankang: 6.9, shensha: 6.9,
    chenggu: 0.99,
    dayun: 9.9,
  },
  // 合盘：单开体系（用户拍板⑥），总论章免费引流，其余五章收费
  hepan: {
    ganzhi: 9.9, riyu: 9.9, wuxing: 9.9, chongke: 9.9, xiangchu: 6.9,
  },
  liuyao: { shiying: 6.9, dongyao: 6.9, advice: 9.9 },
  qimen: { direction: 9.9, palace: 6.9, advice: 9.9 },
  ziwei: { pattern: 9.9, fourhua: 9.9, dayun: 9.9, liunian: 6.9 },
};

export const SECTION_TITLE = {
  // —— 八字 ——
  baziSections: '八字十章',
  mingju: '命局总论', geju: '格局用神', xingge: '性格禀赋', shiye: '事业官禄',
  caiyun: '财运理财', ganqing: '情感婚姻', qinyuan: '六亲人际', jiankang: '健康养生',
  chenggu: '称骨算命·白话详解',
  // —— 合盘 ——
  hetong: '合盘总论', ganzhi: '天干地支合参', riyu: '日柱与夫妻宫',
  wuxing: '五行与用神互补', chongke: '需要注意的冲刑', xiangchu: '相处建议',
  // —— 通用 / 其他体系 ——
  career: '事业方向', wealth: '财运特征', relationship: '感情与人际', dayun: '大运走势', liunian: '近年流年',
  shiying: '世应关系', dongyao: '动爻与变卦', advice: '趋势与建议',
  direction: '用神方位', palace: '九宫要点',
  pattern: '命宫与格局', fourhua: '生年四化',
};

export const SKUS = [
  {
    id: 'chenggu_detail',
    name: '称骨算命·白话详解',
    type: 'single',
    price: 0.99,
    desc: '袁天罡称骨歌白话精解：总论/性格轨迹/事业/财运/感情/建议',
    sectionKey: 'chenggu',
  },
  {
    // 合盘单开 SKU（用户拍板⑥）：与八字报告是两个产品，不并入全量包
    id: 'hepan_full',
    name: '合盘全解读',
    type: 'bundle',
    price: 39.9,
    desc: '六章合盘深度解读：总论／干支合参／日柱夫妻宫／五行用神／冲刑／相处建议',
    system: 'hepan',
    unlockAll: true,
  },
  {
    id: 'single_section',
    name: '单章解锁',
    type: 'single',
    price: 6.9,
    desc: '解锁任意一章完整内容',
  },
  {
    id: 'full_report',
    name: '完整报告',
    type: 'bundle',
    price: 19.9,
    desc: '解锁本报告全部章节',
    unlockAll: true,
  },
  // full_plus（完整报告 + 追问 3 次）已下架：追问功能前后端均未实现，售卖未交付的能力会构成交易纠纷。
  // 待追问功能上线后再重新上架。
  {
    id: 'member_month',
    name: '会员月卡',
    type: 'subscription',
    price: 19.9,
    desc: '30 天内无限查看全部报告与每日提示',
    unlockAll: true,
    days: 30,
  },
];

export function listSkus() {
  return SKUS.map((s) => ({ ...s }));
}

export function getSku(id) {
  return SKUS.find((s) => s.id === id) || null;
}

function loadOrders() {
  try {
    if (fs.existsSync(ORDER_FILE)) return JSON.parse(fs.readFileSync(ORDER_FILE, 'utf8'));
  } catch {
    /* ignore */
  }
  return [];
}

function saveOrders(list) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ORDER_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch {
    /* 订单落盘失败不阻塞 */
  }
}

/**
 * 创建订单
 * @param {{ skuId:string, sectionKey?:string, system?:string, factPackId?:string }} req
 */
const IDEMPOTENT_WINDOW_MS = 5 * 60 * 1000; // 5 分钟内重复相同下单视为同一订单，不重复计费

/**
 * 创建订单（幂等）
 * 相同 (skuId, system, sectionKey, factPackId) 在 5 分钟内重复创建返回同一 pending 订单。
 * @param {{ skuId:string, sectionKey?:string, system?:string, factPackId?:string }} req
 */
export function createOrder(req) {
  const sku = getSku(req.skuId);
  if (!sku) throw new Error(`未知 SKU: ${req.skuId}`);
  const sectionKey = req.sectionKey || sku.sectionKey || null;
  if (sku.type === 'single' && !sectionKey) throw new Error('单章解锁需要指定 sectionKey');
  // 章节键必须真实存在于该体系定价表：否则用户会为一个并不存在的章节付费（买了拿不到内容）
  if (sectionKey && req.system && SECTION_PRICE[req.system] && SECTION_PRICE[req.system][sectionKey] === undefined) {
    throw new Error('该体系没有这一章，请重新选择');
  }

  // 幂等：相同维度且在窗口期内且仍为 pending 的订单直接返回，避免重复计费
  const now = Date.now();
  const list0 = loadOrders();
  const dup = list0.find(
    (o) =>
      o.skuId === sku.id &&
      (o.system || null) === (req.system || null) &&
      (o.sectionKey || null) === (sectionKey || null) &&
      (o.factPackId || null) === (req.factPackId || null) &&
      o.status === 'pending' &&
      now - new Date(o.createdAt).getTime() < IDEMPOTENT_WINDOW_MS
  );
  if (dup) return dup;

  let amount = sku.price;
  if (sku.type === 'single') {
    amount = (SECTION_PRICE[req.system] || {})[sectionKey] ?? sku.price;
  }
  const order = {
    id: 'OD' + crypto.randomBytes(6).toString('hex').toUpperCase(),
    skuId: sku.id,
    skuName: sku.name,
    type: sku.type,
    sectionKey: sectionKey || null,
    system: req.system || null,
    factPackId: req.factPackId || null,
    // 登录用户下单时绑定账号，供「订单中心 / 跨设备恢复权益」查询；游客下单为 null
    userId: req.userId || null,
    amount,
    currency: 'CNY',
    status: 'pending',
    createdAt: new Date().toISOString(),
    paidAt: null,
    validUntil: sku.days ? new Date(Date.now() + sku.days * 86400000).toISOString() : null,
  };
  const list = loadOrders();
  list.push(order);
  saveOrders(list);
  return order;
}

/**
 * 模拟/真实支付统一入口。
 * - 默认 mock 渠道：立即判定已支付并签发权益凭证（保持既有冒烟测试语义）
 * - 真实渠道：订单保持 pending 并记录 tradeNo，必须等渠道异步回调 confirmPaid 才签发凭证
 */
export function payOrder(orderId, { channel = 'mock' } = {}) {
  const list = loadOrders();
  const o = list.find((x) => x.id === orderId);
  if (!o) throw new Error(`订单不存在: ${orderId}`);
  if (o.status === 'paid') {
    // 幂等：已支付则直接复用已签发凭证
    if (!o.entitlement) o.entitlement = issueEntitlement(o);
    saveOrders(list);
    return o;
  }
  if (o.status === 'refunded') throw new Error('该订单已退款，无法再次支付');

  const charge = createCharge({ order: o, channel }); // 渠道未配置时会抛中文错误
  o.channel = channel;
  o.tradeNo = charge.tradeNo || null;
  if (charge.paid) {
    o.status = 'paid';
    o.paidAt = new Date().toISOString();
    // 服务端签发权益凭证（核心：绝不在前端信任章节数组）
    o.entitlement = issueEntitlement(o);
  } else {
    // 真实渠道：等异步回调，绝不允许就地判定为已支付
    o.payInfo = { payUrl: charge.payUrl || null, codeUrl: charge.codeUrl || null, orderString: charge.orderString || null };
  }
  saveOrders(list);
  return o;
}

/**
 * 异步支付回调确认（幂等）：重复回调返回同一凭证，不会重复签发。
 * 仅真实渠道需要；mock 渠道不走这条路。
 */
export function confirmPaid(orderId, { tradeNo } = {}) {
  const list = loadOrders();
  const o = list.find((x) => x.id === orderId);
  if (!o) throw new Error(`订单不存在: ${orderId}`);
  if (o.status === 'paid') {
    if (!o.entitlement) {
      o.entitlement = issueEntitlement(o);
      saveOrders(list);
    }
    return o;
  }
  if (o.status === 'refunded') throw new Error('订单已退款，无法确认支付');
  o.status = 'paid';
  o.paidAt = new Date().toISOString();
  if (tradeNo) o.tradeNo = tradeNo;
  o.entitlement = issueEntitlement(o);
  saveOrders(list);
  return o;
}

/** 首次真正把付费内容交付给用户时打标（退款策略依据之一），幂等 */
export function markConsumed(orderId) {
  if (!orderId) return null;
  const list = loadOrders();
  const o = list.find((x) => x.id === orderId);
  if (!o || o.consumedAt) return o || null;
  o.consumedAt = new Date().toISOString();
  saveOrders(list);
  return o;
}

/** 退款时限：下单后 7 天 */
export const REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 退款策略判定
 * @returns {{ ok:boolean, reason:string }} ok=false 时 reason 为可直接展示给用户的中文原因
 */
export function canRefund(order) {
  if (!order) return { ok: false, reason: '订单不存在' };
  if (order.status === 'pending') return { ok: false, reason: '订单尚未完成支付，无需退款' };
  if (order.status === 'closed') return { ok: false, reason: '订单已关闭，无需退款' };
  if (order.status === 'refunded') return { ok: false, reason: '该订单已退款' };
  if (order.status !== 'paid') return { ok: false, reason: '订单状态不支持退款' };
  const created = new Date(order.createdAt).getTime();
  if (Number.isFinite(created) && Date.now() - created > REFUND_WINDOW_MS) {
    return { ok: false, reason: '已超过下单后 7 天的退款时限' };
  }
  if (order.consumedAt) {
    return {
      ok: false,
      reason: '付费内容已完整查看，数字化内容不支持无理由退款；如属重复扣款或内容缺失，请联系 support@example.com 人工处理',
    };
  }
  return { ok: true, reason: '' };
}

/**
 * 退款：先过策略，不通过时抛出中文原因（由接口层转 400）。
 * 通过后调用渠道退款、置 refunded、清空凭证（凭证立即失效）。
 */
export function refundOrder(orderId, { reason = '' } = {}) {
  const list = loadOrders();
  const o = list.find((x) => x.id === orderId);
  if (!o) throw new Error(`订单不存在: ${orderId}`);
  const c = canRefund(o);
  if (!c.ok) throw new Error(c.reason);
  const r = refundCharge({ order: o, channel: o.channel || 'mock' });
  o.status = 'refunded';
  o.refundedAt = new Date().toISOString();
  o.refundReason = reason || '用户自助申请';
  o.refundId = r && r.refundId ? r.refundId : null;
  o.entitlement = null; // 凭证立即失效
  saveOrders(list);
  return o;
}

/** 订单查询（订单中心用）：按用户隔离，按时间倒序 */
export function listOrders({ userId, status, limit = 50 } = {}) {
  let list = loadOrders();
  if (userId) list = list.filter((o) => o.userId === userId);
  if (status) list = list.filter((o) => o.status === status);
  return list
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/** 关闭超时未支付订单（默认 30 分钟） */
export function closeExpiredOrders(ttlMs = 30 * 60 * 1000) {
  const list = loadOrders();
  const now = Date.now();
  let n = 0;
  for (const o of list) {
    if (o.status === 'pending' && now - new Date(o.createdAt).getTime() > ttlMs) {
      o.status = 'closed';
      o.closedAt = new Date().toISOString();
      n += 1;
    }
  }
  if (n) saveOrders(list);
  return n;
}

export function getOrder(orderId) {
  return loadOrders().find((x) => x.id === orderId) || null;
}

/**
 * 计算已解锁章节
 *
 * 解锁按「报告 / 档案」维度计算，前端在生成报告时把本机已购集合（purchased）带给后端，
 * 后端只在该体系合法章节键范围内认可，避免越权解锁。purchased 未传时回退到历史订单
 * （全局解锁），以兼容旧调用与冒烟测试；单机产品形态下前端永远显式携带 purchased。
 *
 * @param {{ system?:string, purchased?:string[] }} opts
 * @returns {string[]}
 */
export function unlockedSections(opts = {}) {
  const { system, purchased } = opts;
  const out = new Set();
  // 新路径：按前端带来的已购集合（按档案持久化）解锁，仅认该系统合法章节键
  if (Array.isArray(purchased)) {
    const valid = SECTION_PRICE[system] || {};
    for (const k of purchased) if (valid[k] !== undefined) out.add(k);
    return [...out];
  }
  // 旧路径：基于已支付订单（兼容测试与无前端场景）
  const list = loadOrders().filter((o) => o.status === 'paid');
  const now = Date.now();
  for (const o of list) {
    if (o.validUntil && new Date(o.validUntil).getTime() < now) continue; // 订阅过期
    const sku = getSku(o.skuId);
    if (!sku) continue;
    if (sku.type === 'subscription') {
      // 订阅卡跨体系全解锁
      for (const sys of Object.keys(SECTION_PRICE)) {
        for (const k of Object.keys(SECTION_PRICE[sys])) out.add(k);
      }
      continue;
    }
    if (sku.unlockAll) {
      // 全量包仅解锁该订单所属体系
      if (o.system && SECTION_PRICE[o.system]) {
        for (const k of Object.keys(SECTION_PRICE[o.system])) out.add(k);
      }
      continue;
    }
    if (o.sectionKey) out.add(o.sectionKey);
  }
  return [...out];
}

/**
 * 计算一个 SKU 在当前体系下会解锁的章节键（供前端拼装已购集合与支付清单）
 * @param {{ id:string, unlockAll?:boolean, sectionKey?:string|null }} sku
 * @param {string} system
 * @param {string} [sectionKey] 单章解锁时由调用方指定
 * @returns {string[]}
 */
export function skuSectionKeys(sku, system, sectionKey) {
  if (sku.id === 'single_section') return sectionKey ? [sectionKey] : [];
  if (sku.id === 'chenggu_detail') return ['chenggu'];
  if (sku.unlockAll) return Object.keys(SECTION_PRICE[system] || {});
  return [];
}

/** 清空订单（测试用） */
export function resetOrders() {
  saveOrders([]);
  return true;
}

/** 交易概览（后台用） */
export function orderStats() {
  const list = loadOrders();
  const paid = list.filter((o) => o.status === 'paid');
  return {
    total: list.length,
    paid: paid.length,
    refunded: list.filter((o) => o.status === 'refunded').length,
    gmv: Math.round(paid.reduce((a, b) => a + b.amount, 0) * 100) / 100,
  };
}
