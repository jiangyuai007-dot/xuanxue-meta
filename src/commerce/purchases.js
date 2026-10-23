/**
 * 已购持久化（按档案 / 浏览器维度）
 *
 * 设计要点：
 *  - 解锁以「本机已购集合」为准，存于 localStorage['xuanxue.purchases']；刷新 / 重开浏览器后仍在。
 *  - 每条记录沉淀 orderId / skuId / system / sectionKeys / amount / paidAt / factPackId / entitlement，
 *    为将来接入登录态做跨设备同步预留结构。
 *  - Phase 1 修复：统一 `app.js`（Array 结构）与 `hepan-drill.js`（旧版 Object 结构）的存储格式，
 *    读出时自动将旧版 `{ hepan: [...], entitlements: [...] }` 对象格式无损迁移为标准数组格式，
 *    彻底消除八字与合盘跨页切换时互相清空已购凭证的 Bug。
 */

const KEY = 'xuanxue.purchases';

/**
 * 将任意形态的 localStorage 值归一化为标准购买记录数组
 * @param {any} raw
 * @returns {Array<object>}
 */
export function normalizePurchases(raw) {
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === 'object');
  if (raw && typeof raw === 'object') {
    // 兼容旧版 hepan-drill.js 写入的 { hepan: ['ganzhi', ...], entitlements: ['tok1', ...] } 格式
    const migrated = [];
    const ents = Array.isArray(raw.entitlements) ? raw.entitlements.filter(Boolean) : [];
    for (const [sys, val] of Object.entries(raw)) {
      if (sys === 'entitlements' || !Array.isArray(val) || !val.length) continue;
      migrated.push({
        skuId: `${sys}_migrated`,
        skuName: '已解锁章节',
        system: sys,
        sectionKeys: val.filter((k) => typeof k === 'string'),
        amount: 0,
        paidAt: new Date().toISOString(),
        entitlement: ents[0] || null,
      });
    }
    for (let i = migrated.length ? 1 : 0; i < ents.length; i++) {
      migrated.push({
        skuId: 'entitlement_migrated',
        skuName: '已购凭证',
        system: 'hepan',
        sectionKeys: [],
        amount: 0,
        paidAt: new Date().toISOString(),
        entitlement: ents[i],
      });
    }
    return migrated;
  }
  return [];
}

export function loadPurchases() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    const list = normalizePurchases(raw);
    if (raw && !Array.isArray(raw) && typeof raw === 'object') {
      savePurchases(list);
    }
    return list;
  } catch {
    return [];
  }
}

export function savePurchases(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizePurchases(list)));
  } catch {
    /* 隐私模式下可能不可写，忽略 */
  }
}

/** 记录一笔已购，同 entitlement 或同 SKU + 同体系 + 同章节集合去重，避免重复记录 */
export function addPurchase(rec) {
  if (!rec || typeof rec !== 'object') return;
  const list = loadPurchases();
  if (rec.entitlement && list.some((p) => p.entitlement === rec.entitlement)) {
    return;
  }
  const dup = list.find(
    (p) => p.skuId === rec.skuId && p.system === rec.system &&
      JSON.stringify(p.sectionKeys) === JSON.stringify(rec.sectionKeys)
  );
  if (!dup) list.unshift(rec);
  savePurchases(list.slice(0, 50));
}

/** 取某体系下当前已购的全部章节键 */
export function purchasedKeysFor(system) {
  const set = new Set();
  for (const p of loadPurchases()) {
    if (p.system === system && Array.isArray(p.sectionKeys)) p.sectionKeys.forEach((k) => set.add(k));
  }
  return [...set];
}

/** 提取本机全部有效的服务端 HMAC 权益凭证 */
export function entitlementsForRequest() {
  return [...new Set(loadPurchases().map((p) => p.entitlement).filter(Boolean))];
}
