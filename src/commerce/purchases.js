/**
 * 已购持久化（按档案 / 浏览器维度）
 *
 * 设计要点：
 *  - 解锁以「本机已购集合」为准，存于 localStorage；刷新 / 重开浏览器后仍在。
 *  - 每条记录沉淀 orderId / skuId / system / sectionKeys / amount / paidAt / factPackId，
 *    为将来接入登录态做跨设备同步预留结构，但当前保持单机产品形态（无登录、无多用户）。
 *  - 浏览器侧直接读写 localStorage；Node 测试通过注入 globalThis.localStorage 垫片复用同一份实现。
 */

const KEY = 'xuanxue.purchases';

export function loadPurchases() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function savePurchases(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式下可能不可写，忽略 */
  }
}

/** 记录一笔已购，同 SKU + 同体系 + 同章节集合去重，避免重复记录 */
export function addPurchase(rec) {
  const list = loadPurchases();
  const dup = list.find(
    (p) => p.skuId === rec.skuId && p.system === rec.system &&
      JSON.stringify(p.sectionKeys) === JSON.stringify(rec.sectionKeys)
  );
  if (!dup) list.unshift(rec);
  savePurchases(list.slice(0, 50));
}

/** 取某体系下当前已购的全部章节键（即传给后端 /api/report 的 purchased 集合） */
export function purchasedKeysFor(system) {
  const set = new Set();
  for (const p of loadPurchases()) {
    if (p.system === system && Array.isArray(p.sectionKeys)) p.sectionKeys.forEach((k) => set.add(k));
  }
  return [...set];
}
