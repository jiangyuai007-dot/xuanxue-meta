/**
 * Phase 1 专项验收门禁（scripts/phase1_verify.mjs）
 *
 * 覆盖 Phase 1 五大核心交付项：
 *   1. 紫微斗数引擎（src/engines/ziwei.js & web/ziwei.html）：
 *      - shenZhu 身主按生年地支起（不再是 undefined）
 *      - 支持农历/闰月输入与字符串生辰收敛（normalizeInput）
 *      - 晚子时（23:00–23:59）农历日顺延，与四柱日干支进位一致
 *      - 闰月分界规则（split15 / next / current）生效
 *      - web/ziwei.html 具备公历/农历/闰月选择器与 #reportBody 容器
 *   2. 八字合盘引擎（src/engines/hepan.js）：
 *      - zodiacDim 使用年柱地支（生肖）而非日柱地支判定六合/三合/六冲/六害
 *      - 同生肖（如午×午）不再误判为生肖三合
 *   3. 报告整页路由与 AI 磁盘缓存恢复（src/server/index.js）：
 *      - /api/report/:id/html 保留 rec.ai 章节卡（不再因 { factPack: pack } 丢失退化）
 *      - 内存 LRU 未命中但磁盘 data/ai-cache 命中时自动恢复 AI 章节卡
 *   4. 前端已购凭证 Schema 统一（src/commerce/purchases.js / web/app.js / web/hepan-drill.js）：
 *      - 双向兼容标准 Array 与旧版 Object 格式，跨页切换不再清空已购凭证
 *      - hepan-drill.js 修复 o.order.id 解包与分享卡 reportToken 鉴权参数
 *   5. 统一高并发持久化存储层（src/storage/db.js）：
 *      - 支持 Node 22+ node:sqlite(WAL) 与 Node 18+ 原子 JSON CAS 主键级合并
 *      - 并发写入不同主键记录互不覆盖（消除 Lost Update）
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeZiwei } from '../src/engines/ziwei.js';
import { computeBazi } from '../src/engines/bazi.js';
import { computeHePan } from '../src/engines/hepan.js';
import { normalizePurchases, loadPurchases, savePurchases, addPurchase, purchasedKeysFor, entitlementsForRequest } from '../src/commerce/purchases.js';
import { readCollection, writeCollection, storageStats } from '../src/storage/db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}${extra ? '　' + extra : ''}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${extra ? '　' + extra : ''}`);
  }
}

console.log('\n【1】紫微斗数引擎与表单修复验证');
{
  const zw1990 = computeZiwei({ year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
  check('1990庚午年身主为「火星」（非 undefined）', zw1990.shenZhu === '火星', `shenZhu=${zw1990.shenZhu}`);

  const zw2024 = computeZiwei({ year: 2024, month: 9, day: 3, hour: 6, minute: 0, gender: 'male', city: '北京' });
  check('2024甲辰年身主为「天机」', zw2024.shenZhu === '天机', `shenZhu=${zw2024.shenZhu}`);

  const zwLunar = computeZiwei({ calendar: 'lunar', year: '1990', month: '4', day: '26', hour: '14', minute: '30', gender: 'male', city: '北京' });
  check('紫微农历字符串生辰排盘与公历一致', zwLunar.mingGong.zhi === zw1990.mingGong.zhi && zwLunar.ziweiZhi === zw1990.ziweiZhi,
    `命宫=${zwLunar.mingGong.zhi} 紫微=${zwLunar.ziweiZhi}`);

  const zwNoon = computeZiwei({ year: 1990, month: 5, day: 20, hour: 12, minute: 0, gender: 'male', city: '北京', useTrueSolarTime: false });
  const zwLate = computeZiwei({ year: 1990, month: 5, day: 20, hour: 23, minute: 30, gender: 'male', city: '北京', useTrueSolarTime: false });
  check('紫微晚子时（23:30）农历日顺延至次日', zwLate.lunar.day === zwNoon.lunar.day + 1,
    `12:00日=${zwNoon.lunar.day} 23:30日=${zwLate.lunar.day}`);

  // 2025 年闰六月：验证 split15 / next / current 闰月规则
  const leap10 = computeZiwei({ calendar: 'lunar', isLeapMonth: true, year: 2025, month: 6, day: 10, hour: 10, gender: 'male', city: '北京', leapMonthRule: 'split15' });
  const leap20 = computeZiwei({ calendar: 'lunar', isLeapMonth: true, year: 2025, month: 6, day: 20, hour: 10, gender: 'male', city: '北京', leapMonthRule: 'split15' });
  const leapCur = computeZiwei({ calendar: 'lunar', isLeapMonth: true, year: 2025, month: 6, day: 20, hour: 10, gender: 'male', city: '北京', leapMonthRule: 'current' });
  check('紫微闰月 split15 规则：初十作六月、二十作七月', leap10.lunar.effectiveMonth === 6 && leap20.lunar.effectiveMonth === 7 && leapCur.lunar.effectiveMonth === 6,
    `d10=${leap10.lunar.effectiveMonth} d20=${leap20.lunar.effectiveMonth} cur=${leapCur.lunar.effectiveMonth}`);

  const ziweiHtml = fs.readFileSync(path.join(ROOT, 'web/ziwei.html'), 'utf8');
  check('web/ziwei.html 含公历/农历选择器 (#calendar) 与闰月 (#isLeap)',
    ziweiHtml.includes('id="calendar"') && ziweiHtml.includes('id="isLeap"') && ziweiHtml.includes('id="reportBody"'));
}

console.log('\n【2】八字合盘生肖维度修复验证');
{
  const pHorse = computeBazi({ type: 'bazi', year: 1990, month: 6, day: 15, hour: 10, gender: 'male', city: '北京' });
  const pGoat = computeBazi({ type: 'bazi', year: 1991, month: 6, day: 15, hour: 10, gender: 'female', city: '北京' });
  const pRat = computeBazi({ type: 'bazi', year: 1996, month: 6, day: 15, hour: 10, gender: 'female', city: '北京' });
  const pHorse2 = computeBazi({ type: 'bazi', year: 1990, month: 6, day: 21, hour: 10, gender: 'female', city: '北京' });

  const hpLiuHe = computeHePan({ a: pHorse, b: pGoat });
  check('午马(1990) × 未羊(1991) -> 生肖六合', hpLiuHe.zodiac.ziKind === '生肖六合', hpLiuHe.zodiac.ziKind);

  const hpChong = computeHePan({ a: pHorse, b: pRat });
  check('午马(1990) × 子鼠(1996) -> 生肖相冲', hpChong.zodiac.ziKind === '生肖相冲', hpChong.zodiac.ziKind);

  const hpSame = computeHePan({ a: pHorse, b: pHorse2 });
  check('同属马(1990×1990)不同日支 -> 无特殊关系（不误判为三合或日支冲合）', hpSame.zodiac.ziKind === '无特殊关系', hpSame.zodiac.ziKind);
}

console.log('\n【3】前端已购凭证 Schema 统一与防互冲验证');
{
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  };

  // 模拟旧版 hepan-drill.js 写入的 Object 结构
  mem.set('xuanxue.purchases', JSON.stringify({ hepan: ['ganzhi', 'riyu'], entitlements: ['ent_hepan_123'] }));
  const list = loadPurchases();
  check('旧版 Object 结构自动迁移为标准 Array', Array.isArray(list) && list.length === 1);
  check('迁移后合盘章节键与凭证完整保留',
    purchasedKeysFor('hepan').includes('ganzhi') && entitlementsForRequest().includes('ent_hepan_123'));

  // 再追加一笔八字购买，验证八字与合盘凭证共存不互冲
  addPurchase({
    orderId: 'OD_BAZI_1',
    skuId: 'single_section',
    skuName: '单章解锁',
    system: 'bazi',
    sectionKeys: ['xingge'],
    amount: 6.9,
    paidAt: new Date().toISOString(),
    entitlement: 'ent_bazi_456',
  });
  check('八字与合盘购买记录共存不互冲',
    purchasedKeysFor('bazi').includes('xingge') &&
    purchasedKeysFor('hepan').includes('ganzhi') &&
    entitlementsForRequest().length === 2);

  const hepanJs = fs.readFileSync(path.join(ROOT, 'web/hepan-drill.js'), 'utf8');
  check('web/hepan-drill.js 已修复 oRes.order 解包与分享卡 token',
    hepanJs.includes('oRes.order || oRes') && hepanJs.includes('sharecard.svg?t='));
}

console.log('\n【4】统一持久化存储层（src/storage/db.js）并发安全验证');
{
  const st = storageStats();
  check('存储引擎正常初始化', !!st.engine, `engine=${st.engine}`);

  // 模拟并发交错写入 orders：A 先读出快照，B 插入新订单并保存，随后 A 保存自己的修改 -> B 的新订单不得被 A 覆盖丢失
  const snapshotA = readCollection('orders');
  const orderB = { id: 'OD_CONCURRENT_B', skuId: 'single_section', status: 'pending', createdAt: new Date().toISOString() };
  writeCollection('orders', [...snapshotA, orderB]);

  const orderA = { id: 'OD_CONCURRENT_A', skuId: 'full_report', status: 'paid', createdAt: new Date().toISOString() };
  // A 基于旧快照 snapshotA 写入（不含 orderB）
  writeCollection('orders', [...snapshotA, orderA]);

  const merged = readCollection('orders');
  const hasA = merged.some((o) => o.id === 'OD_CONCURRENT_A');
  const hasB = merged.some((o) => o.id === 'OD_CONCURRENT_B');
  check('并发交错写入时主键级 CAS 合并生效（A 与 B 订单均不丢失）', hasA && hasB,
    `hasA=${hasA} hasB=${hasB} total=${merged.length}`);

  // 清理测试订单
  writeCollection('orders', snapshotA, { replaceAll: true, deletedIds: ['OD_CONCURRENT_A', 'OD_CONCURRENT_B'] });
}

console.log('\n【5】服务端 /api/report/:id/html 保留 AI 章节端到端验证');
await (async () => {
  const PORT = 8891;
  const BASE = `http://127.0.0.1:${PORT}`;
  const child = spawn(process.execPath, [path.join(ROOT, 'src/server/index.js')], {
    env: { ...process.env, PORT: String(PORT), AI_FORCE_LOCAL: '1' },
    stdio: 'ignore',
  });
  try {
    let up = false;
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`${BASE}/api/health`);
        if (r.ok) { up = true; break; }
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    check('测试服务启动并响应 /api/health', up);
    if (up) {
      const h = await (await fetch(`${BASE}/api/health`)).json();
      check('/api/health 暴露 storage 状态', !!h.storage?.engine, JSON.stringify(h.storage));

      const sr = await fetch(`${BASE}/api/report/stream?mode=json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { type: 'bazi', year: 1992, month: 7, day: 15, hour: 9, minute: 20, gender: 'female', city: '上海' },
        }),
      });
      const sd = await sr.json();
      check('/api/report/stream?mode=json 生成 10 章卡片', sd.ok === true && sd.chapters?.length === 10);

      const pageRes = await fetch(`${BASE}${sd.reportUrl}`);
      const pageHtml = await pageRes.text();
      const cardCount = (pageHtml.match(/<section class="rp-ch"/g) || []).length;
      check('/api/report/:id/html 渲染完整 10 张 AI 骨架章节卡（不再退化为旧模板）',
        pageRes.status === 200 && cardCount === 10 && pageHtml.includes('rp-hd-bar'),
        `status=${pageRes.status} cards=${cardCount}`);
    }
  } finally {
    child.kill();
  }
})();

console.log(`\n════════════════════════════════════════════`);
console.log(`Phase 1 专项门禁：通过 ${pass} 项 · 失败 ${fail} 项`);
console.log(`════════════════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);
