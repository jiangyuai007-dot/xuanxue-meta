/**
 * 商业化核心模块：SKU、章节解锁、模拟/真实渠道订单、回调核销、对账与自助退款
 * Phase 1 加固：订单读写接入统一存储层 src/storage/db.js（支持 node:sqlite WAL 与原子 CAS 合并）
 * Phase 4 升级：
 *   1. 新增 `ai_followup_pack`（大师追问包）SKU
 *   2. `confirmPaid` 增加回调金额一致性校验（防一分钱改价攻击）与幂等核销计数
 *   3. `listOrders` 附带 `canRefund` 与 `refundBlockReason`，支持前端一键自助退款
 *   4. 新增 `reconcileOrders()` 订单对账与异常巡检接口（自动修复缺失权益令牌、汇总渠道 GMV 与退款流水）
 */

import path from 'node:path';
import crypto from 'node:crypto';
import { issueEntitlement } from './entitle.js';
import { createCharge, refundCharge } from './pay/index.js';
import { DATA_DIR, readCollection, writeCollection } from '../storage/db.js';

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
    desc: '解锁本报告全部章节与命盘追问',
    unlockAll: true,
  },
  {
    id: 'member_month',
    name: '会员月卡',
    type: 'subscription',
    price: 19.9,
    desc: '30 天内无限查看全部报告、AI 追问与每日运势',
    unlockAll: true,
    days: 30,
  },
  {
    id: 'ai_followup_pack',
    name: '大师追问畅聊包',
    type: 'pack',
    price: 9.9,
    desc: '解锁当前命盘深度多轮追问（针对跳槽/流年/感情/择方专项解答）',
    unlockAll: false,
    quota: 20,
  },
];

export function listSkus() {
  return SKUS.map((s) => ({ ...s }));
}

export function getSku(id) {
  return SKUS.find((s) => s.id === id) || null;
}

function loadOrders() {
  return readCollection('orders');
}

function saveOrders(list, opts = {}) {
  writeCollection('orders', list, opts);
}

const IDEMPOTENT_WINDOW_MS = 5 * 60 * 1000; // 5 分钟内重复相同下单视为同一订单，不重复计费

/**
 * 创建订单（幂等）
 * 相同 (skuId, system, sectionKey, factPackId) 在 5 分钟内重复创建返回同一 pending 订单。
 * @param {{ skuId:string, sectionKey?:string, system?:string, factPackId?:string, userId?:string }} req
 */
export function createOrder(req) {
  const sku = getSku(req.skuId);
  if (!sku) throw new Error(`未知 SKU: ${req.skuId}`);
  const sectionKey = req.sectionKey || sku.sectionKey || null;
  if (sku.type === 'single' && !sectionKey) throw new Error('单章解锁需要指定 sectionKey');
  if (sectionKey && req.system && SECTION_PRICE[req.system] && SECTION_PRICE[req.system][sectionKey] === undefined) {
    throw new Error('该体系没有这一章，请重新选择');
  }

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
 */
export function payOrder(orderId, { channel = 'mock' } = {}) {
  const list = loadOrders();
  const o = list.find((x) => x.id === orderId);
  if (!o) throw new Error(`订单不存在: ${orderId}`);
  if (o.status === 'paid') {
    if (!o.entitlement) o.entitlement = issueEntitlement(o);
    saveOrders(list);
    return o;
  }
  if (o.status === 'refunded') throw new Error('该订单已退款，无法再次支付');

  const charge = createCharge({ order: o, channel });
  o.channel = channel;
  o.tradeNo = charge.tradeNo || null;
  if (charge.paid) {
    o.status = 'paid';
    o.paidAt = new Date().toISOString();
    o.entitlement = issueEntitlement(o);
  } else {
    o.payInfo = {
      payUrl: charge.payUrl || null,
      codeUrl: charge.codeUrl || null,
      orderString: charge.orderString || null,
      notifyUrl: charge.notifyUrl || null,
    };
  }
  saveOrders(list);
  return o;
}

/**
 * 异步支付回调确认（幂等 + 金额防篡改核验）
 */
export function confirmPaid(orderId, { tradeNo, amountFen, channel } = {}) {
  const list = loadOrders();
  const o = list.find((x) => x.id === orderId);
  if (!o) throw new Error(`订单不存在: ${orderId}`);

  // 若回调报文带了实付分值（amountFen），必须与订单应付分值一致，防止低价替单攻击
  if (Number.isFinite(amountFen)) {
    const expectFen = Math.round(Number(o.amount || 0) * 100);
    if (amountFen !== expectFen) {
      throw new Error(`支付回调金额不匹配：应付 ${expectFen} 分，实付 ${amountFen} 分`);
    }
  }

  o.notifyCount = (o.notifyCount || 0) + 1;
  o.lastNotifyAt = new Date().toISOString();

  if (o.status === 'paid') {
    if (!o.entitlement) {
      o.entitlement = issueEntitlement(o);
    }
    saveOrders(list);
    return o;
  }
  if (o.status === 'refunded') throw new Error('订单已退款，无法确认支付');
  o.status = 'paid';
  o.paidAt = new Date().toISOString();
  if (tradeNo) o.tradeNo = tradeNo;
  if (channel && !o.channel) o.channel = channel;
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
      reason: '付费内容已完整查看，数字化内容不支持无理由退款；如属重复扣款或内容缺失，请联系客服处理',
    };
  }
  return { ok: true, reason: '' };
}

/**
 * 退款
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
  o.entitlement = null;
  saveOrders(list);
  return o;
}

/** 订单查询（订单中心用）：按用户隔离，按时间倒序，并附带可退款判定 */
export function listOrders({ userId, status, limit = 50 } = {}) {
  let list = loadOrders();
  if (userId) list = list.filter((o) => o.userId === userId);
  if (status) list = list.filter((o) => o.status === status);
  return list
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
    .map((o) => {
      const cr = canRefund(o);
      return {
        ...o,
        canRefund: cr.ok,
        refundBlockReason: cr.reason || '',
      };
    });
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
  const o = loadOrders().find((x) => x.id === orderId) || null;
  if (!o) return null;
  const cr = canRefund(o);
  return { ...o, canRefund: cr.ok, refundBlockReason: cr.reason || '' };
}

/**
 * 计算已解锁章节
 */
export function unlockedSections(opts = {}) {
  const { system, purchased } = opts;
  const out = new Set();
  if (Array.isArray(purchased)) {
    const valid = SECTION_PRICE[system] || {};
    for (const k of purchased) if (valid[k] !== undefined) out.add(k);
    return [...out];
  }
  const list = loadOrders().filter((o) => o.status === 'paid');
  const now = Date.now();
  for (const o of list) {
    if (o.validUntil && new Date(o.validUntil).getTime() < now) continue;
    const sku = getSku(o.skuId);
    if (!sku) continue;
    if (sku.type === 'subscription') {
      for (const sys of Object.keys(SECTION_PRICE)) {
        for (const k of Object.keys(SECTION_PRICE[sys])) out.add(k);
      }
      continue;
    }
    if (sku.unlockAll) {
      if (o.system && SECTION_PRICE[o.system]) {
        for (const k of Object.keys(SECTION_PRICE[o.system])) out.add(k);
      }
      continue;
    }
    if (o.sectionKey) out.add(o.sectionKey);
  }
  return [...out];
}

export function skuSectionKeys(sku, system, sectionKey) {
  if (sku.id === 'single_section') return sectionKey ? [sectionKey] : [];
  if (sku.id === 'chenggu_detail') return ['chenggu'];
  if (sku.unlockAll) return Object.keys(SECTION_PRICE[system] || {});
  return [];
}

/** 清空订单（测试用） */
export function resetOrders() {
  saveOrders([], { replaceAll: true });
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
    file: ORDER_FILE,
  };
}

/**
 * Phase 4：订单自动对账与异常修复（Reconciliation）
 * 巡检全部订单：
 *   1. 若发现 status==='paid' 但因极端中断缺失 entitlement 令牌，自动补签并落盘修复；
 *   2. 按渠道（mock/wechat/alipay）统计实收 GMV、退款金额与待支付单量；
 *   3. 列出异常单明细供运营核查。
 */
export function reconcileOrders({ autoHeal = true } = {}) {
  const list = loadOrders();
  let healedCount = 0;
  const anomalies = [];
  const byChannel = {};

  for (const o of list) {
    const ch = o.channel || 'unassigned';
    if (!byChannel[ch]) {
      byChannel[ch] = { count: 0, paidCount: 0, refundedCount: 0, gmv: 0, refundedAmount: 0 };
    }
    byChannel[ch].count += 1;
    if (o.status === 'paid') {
      byChannel[ch].paidCount += 1;
      byChannel[ch].gmv = Math.round((byChannel[ch].gmv + Number(o.amount || 0)) * 100) / 100;
      if (!o.entitlement) {
        if (autoHeal) {
          o.entitlement = issueEntitlement(o);
          healedCount += 1;
        } else {
          anomalies.push({ orderId: o.id, issue: 'MISSING_ENTITLEMENT' });
        }
      }
      if (!o.tradeNo) {
        anomalies.push({ orderId: o.id, issue: 'MISSING_TRADE_NO' });
      }
    } else if (o.status === 'refunded') {
      byChannel[ch].refundedCount += 1;
      byChannel[ch].refundedAmount = Math.round((byChannel[ch].refundedAmount + Number(o.amount || 0)) * 100) / 100;
      if (o.entitlement) {
        if (autoHeal) {
          o.entitlement = null;
          healedCount += 1;
        } else {
          anomalies.push({ orderId: o.id, issue: 'REFUNDED_WITH_ACTIVE_ENTITLEMENT' });
        }
      }
    }
  }

  if (healedCount > 0) {
    saveOrders(list);
  }

  const paid = list.filter((o) => o.status === 'paid');
  const refunded = list.filter((o) => o.status === 'refunded');
  const pending = list.filter((o) => o.status === 'pending');

  return {
    checkedAt: new Date().toISOString(),
    total: list.length,
    paid: paid.length,
    pending: pending.length,
    refunded: refunded.length,
    gmv: Math.round(paid.reduce((a, b) => a + Number(b.amount || 0), 0) * 100) / 100,
    refundedAmount: Math.round(refunded.reduce((a, b) => a + Number(b.amount || 0), 0) * 100) / 100,
    healedCount,
    anomalies,
    byChannel,
  };
}
