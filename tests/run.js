/**
 * 自检入口：黄金用例 + 端到端冒烟（对应设计文档第 8 节验收标准）
 * 运行：node tests/run.js
 */

import { ymdToJdn, jdnToYmd, jdnToWeekday, WEEKDAY_NAMES } from '../src/core/julian.js';
import { toLunar, leapMonthOf, lunarToSolar } from '../src/core/lunar.js';
import { ganzhiOfJdn, ZHI } from '../src/core/ganzhi.js';
import { computeBazi } from '../src/engines/bazi.js';
import { computeLiuyao, GUA_NAMES } from '../src/engines/liuyao.js';
import { computeQimen } from '../src/engines/qimen.js';
import { computeZiwei, ZIWEI_TABLE, ZIFU_MAP } from '../src/engines/ziwei.js';
import { build, validate, cacheStats } from '../src/factpack.js';
import { gate, DISCLAIMER, DISCLAIMER_ENABLED } from '../src/compliance/gateway.js';
const DISC12 = DISCLAIMER.slice(0, 12);
import { interpret } from '../src/interpret/index.js';
import { aggSource } from '../src/ai/index.js';
import { renderReportHtml, renderShareCardSvg } from '../src/report/index.js';
import { listSkus, createOrder, payOrder, unlockedSections, SECTION_PRICE, resetOrders } from '../src/commerce/sku.js';
import { loadPurchases, savePurchases, addPurchase, purchasedKeysFor } from '../src/commerce/purchases.js';

let pass = 0;
let fail = 0;
const failures = [];

function ok(id, name, fn) {
  try {
    const r = fn();
    if (r === true) {
      pass++;
      console.log(`  ✓ ${id} ${name}`);
    } else {
      fail++;
      failures.push(`${id} ${name}: ${r}`);
      console.log(`  ✗ ${id} ${name} -> ${r}`);
    }
  } catch (e) {
    fail++;
    failures.push(`${id} ${name}: ${e.message}`);
    console.log(`  ✗ ${id} ${name} -> 异常 ${e.message}`);
  }
}

const TZ = 8;
const jdOf = (y, m, d, hh = 12) => ymdToJdn(y, m, d) - 0.5 + (hh - TZ) / 24;
const uniq = (a) => new Set(a).size;

console.log('\n【A 组】历法与干支基础');
ok('A1', '儒略日往返一致，2026-09-22 为星期二', () => {
  const jdn = ymdToJdn(2026, 9, 22);
  const b = jdnToYmd(jdn);
  if (b.year !== 2026 || b.month !== 9 || b.day !== 22) return `往返失败 ${JSON.stringify(b)}`;
  const w = WEEKDAY_NAMES[jdnToWeekday(jdn)];
  return w === '星期二' ? true : `星期=${w}`;
});
ok('A2', '2024-02-10 = 甲辰年正月初一', () => {
  const r = toLunar(jdOf(2024, 2, 10));
  return r.month === 1 && r.day === 1 && r.yearGanzhi === '甲辰' ? true : JSON.stringify(r);
});
ok('A3', '2025-01-29 = 乙巳年正月初一', () => {
  const r = toLunar(jdOf(2025, 1, 29));
  return r.month === 1 && r.day === 1 && r.yearGanzhi === '乙巳' ? true : JSON.stringify(r);
});
ok('A4', '2026-02-17 = 丙午年正月初一', () => {
  const r = toLunar(jdOf(2026, 2, 17));
  return r.month === 1 && r.day === 1 && r.yearGanzhi === '丙午' ? true : JSON.stringify(r);
});
ok('A5', '2025 年闰六月', () => {
  const lm = leapMonthOf(2025);
  return lm && lm.month === 6 ? true : JSON.stringify(lm);
});
ok('A6', '2023 年闰二月', () => {
  const lm = leapMonthOf(2023);
  return lm && lm.month === 2 ? true : JSON.stringify(lm);
});
ok('A7', '农历往返一致（2015-2030 每月初一）', () => {
  let bad = 0;
  for (let y = 2015; y <= 2030; y++) {
    for (let m = 1; m <= 12; m++) {
      const r = toLunar(jdOf(y, m, 1));
      const back = lunarToSolar(r.gy, r.month, r.day, r.isLeap);
      if (!(back.year === y && back.month === m && back.day === 1)) bad++;
    }
  }
  return bad === 0 ? true : `${bad} 例不一致`;
});
ok('A8', '年柱 2024/2025/2026 = 甲辰/乙巳/丙午', () => {
  for (const [y, e] of [[2024, '甲辰'], [2025, '乙巳'], [2026, '丙午']]) {
    const r = computeBazi({ year: y, month: 6, day: 15, hour: 12, gender: 'male', city: '北京' });
    if (r.fourPillars.year.name !== e) return `${y} → ${r.fourPillars.year.name}`;
  }
  return true;
});
ok('A9', '日柱锚点 1900-01-01 = 甲戌', () => ganzhiOfJdn(ymdToJdn(1900, 1, 1)).name === '甲戌' || ganzhiOfJdn(ymdToJdn(1900, 1, 1)).name);
ok('A10', '晚子时判定（广州 00:30）', () => {
  const r = computeBazi({ year: 2000, month: 1, day: 1, hour: 0, minute: 30, gender: 'male', city: '广州' });
  return r.time.lateZi === true && r.fourPillars.hour.zhi === '子' ? true : JSON.stringify({ lateZi: r.time.lateZi });
});
// 线上真 bug（2026-09-30）：浏览器表单 input.value 是字符串，'2006' 直接进天文/农历计算
// 会被 '2006'+1 拼成 '20061' 而跑飞成死循环，把整个 node 服务 100% CPU 打死 → 报告区空白。
// 这里必须用「字符串形态」复刻前端真实入参，数字入参永远测不出这个坑。
ok('A11', '表单字符串生辰（"2006"…）不死循环且能排盘', () => {
  const t = Date.now();
  const r = computeBazi({ year: '2006', month: '4', day: '3', hour: '11', minute: '15', gender: 'male', city: '南京' });
  const ms = Date.now() - t;
  if (ms >= 3000) return `卡死 ${ms}ms`;
  if (!r.fourPillars || !r.fourPillars.year.name) return `未排盘 ${JSON.stringify(r).slice(0, 120)}`;
  return true;
});
ok('A12', '表单字符串 + 农历生辰（"1990"/"五月初五"）不死循环', () => {
  const t = Date.now();
  const r = computeBazi({ year: '1990', month: '5', day: '5', hour: '9', minute: '0', gender: 'female', city: '北京', calendar: 'lunar' });
  const ms = Date.now() - t;
  if (ms >= 3000) return `卡死 ${ms}ms`;
  if (!r.fourPillars || !r.fourPillars.year.name) return `未排盘 ${JSON.stringify(r).slice(0, 120)}`;
  return true;
});
ok('A13', '脏字段（year:"abc"）抛可读错而非卡死', () => {
  try {
    computeBazi({ year: 'abc', month: '4', day: '3', hour: '11', gender: 'male', city: '南京' });
  } catch (e) {
    return /生辰字段|非法/.test(e.message) ? true : `错误文案不可读：${e.message}`;
  }
  return '未抛错';
});

console.log('\n【B 组】排盘引擎');
ok('B1', '八字：1990-05-20 14:30 北京 = 庚午 辛巳 乙酉 癸未', () => {
  const r = computeBazi({ year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
  const got = ['year', 'month', 'day', 'hour'].map((k) => r.fourPillars[k].name).join(' ');
  return got === '庚午 辛巳 乙酉 癸未' ? true : got;
});
ok('B2', '八字：大运 10 步 + 五行占比合计 100%', () => {
  const r = computeBazi({ year: 1990, month: 5, day: 20, hour: 14, gender: 'male', city: '北京' });
  if (!r.dayun.steps || r.dayun.steps.length !== 10) return `大运 ${r.dayun.steps?.length} 步`;
  const s = Object.values(r.elementPercent).reduce((a, b) => a + b, 0);
  return Math.abs(s - 100) < 0.5 ? true : `五行合计 ${s}`;
});
ok('B3', '八字：时辰与真太阳时一致（关真太阳时，24 时辰）', () => {
  const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  for (let h = 0; h < 24; h++) {
    const r = computeBazi({ year: 2026, month: 6, day: 15, hour: h, minute: 30, gender: 'male', city: '北京', useTrueSolarTime: false });
    const expect = h >= 23 ? 0 : Math.floor((h + 1) / 2) % 12;
    if (r.fourPillars.hour.zhi !== ZHI[expect]) return `${h}:30 → ${r.fourPillars.hour.zhi}，期望 ${ZHI[expect]}`;
  }
  return true;
});
ok('B4', '八字：农历输入可用', () => {
  const r = computeBazi({ calendar: 'lunar', year: 2024, month: 1, day: 1, hour: 8, gender: 'female', city: '北京' });
  return r.lunar.yearGanzhi === '甲辰' && r.lunar.month === 1 && r.lunar.day === 1 ? true : JSON.stringify(r.lunar);
});
ok('B5', '八字：24 时辰 × 3 城市排盘不报错', () => {
  for (let h = 0; h < 24; h++) {
    for (const c of ['北京', '乌鲁木齐', '香港']) {
      computeBazi({ year: 2026, month: 3, day: 15, hour: h, gender: 'male', city: c });
    }
  }
  return true;
});
ok('B6', '六爻：六十四卦名表完整（64）', () => {
  let n = 0;
  for (const k of Object.keys(GUA_NAMES)) n += GUA_NAMES[k].length;
  return n === 64 ? true : `共 ${n}`;
});
ok('B7', '六爻：时间起卦产出本卦/变卦/六亲/世应', () => {
  const r = computeLiuyao({ year: 2026, month: 9, day: 22, hour: 10, city: '北京', category: 'career' });
  if (!r.benGua.name || !r.bianGua.name) return '缺卦名';
  if (r.lines.length !== 6) return '爻数不为 6';
  if (!r.lines.every((l) => l.liuqin && l.liushen && l.zhi)) return '缺六亲/六神/地支';
  if (r.shiYing.shi === r.shiYing.ying) return '世应同位';
  return true;
});
ok('B8', '六爻：数字起卦可用（多爻动 0~6）', () => {
  const r = computeLiuyao({ year: 2026, month: 9, day: 22, hour: 10, city: '北京', method: 'number', numbers: [23, 88] });
  const r2 = computeLiuyao({ year: 2026, month: 9, day: 22, hour: 10, city: '北京', method: 'number', numbers: [23, 88] });
  if (!r.benGua.name) return JSON.stringify({ g: r.benGua.name });
  if (r.dongYao.length < 0 || r.dongYao.length > 6) return '动爻数越界 ' + r.dongYao.length;
  if (JSON.stringify(r.dongYao) !== JSON.stringify(r2.dongYao)) return '不确定';
  return true;
});
ok('B9', '六爻：24 时辰排盘不报错', () => {
  for (let h = 0; h < 24; h++) computeLiuyao({ year: 2026, month: 6, day: 10, hour: h, city: '上海', category: 'wealth' });
  return true;
});
ok('B9b', '六爻：手动指定六爻按阴阳成卦（全阴=坤为地，防布尔/数字比对回归）', () => {
  const cases = [
    { lines: [7, 7, 7, 7, 7, 7], want: '乾为天', dong: 0 },
    { lines: [8, 8, 8, 8, 8, 8], want: '坤为地', dong: 0 },
    { lines: [9, 7, 7, 7, 7, 7], want: '乾为天', dong: 1 },
    { lines: [7, 7, 7, 7, 7, 6], want: '泽天夬', dong: 1 },
    { lines: [7, 8, 7, 8, 7, 8], want: '水火既济', dong: 0 },
  ];
  for (const c of cases) {
    const r = computeLiuyao({ year: 2026, month: 9, day: 30, hour: 8, city: '北京', method: 'manual', lines: c.lines });
    if (r.benGua.name !== c.want) return `lines=${c.lines} 期望「${c.want}」实得「${r.benGua.name}」`;
    if (r.dongYao.length !== c.dong) return `lines=${c.lines} 动爻数期望 ${c.dong} 实得 ${r.dongYao.length}`;
  }
  return true;
});
ok('B10', '奇门：九宫齐全，星/门/神/地盘干不重复', () => {
  const r = computeQimen({ year: 2026, month: 9, day: 22, hour: 10, city: '北京', purpose: 'career' });
  if (r.palaces.length !== 9) return '宫数不为 9';
  const ps = r.palaces.filter((p) => !p.isMiddle);
  if (uniq(ps.map((p) => p.star)) !== 8) return '星重复';
  if (uniq(ps.map((p) => p.door)) !== 8) return '门重复';
  if (uniq(ps.map((p) => p.shen)) !== 8) return '神重复';
  if (uniq(r.palaces.map((p) => p.diPan)) !== 9) return '地盘干重复';
  if (uniq(ps.map((p) => p.tianPan)) !== 8) return '天盘干重复';
  return true;
});
ok('B11', '奇门：值符宫天盘干 = 旬首仪，值使宫门 = 值使门', () => {
  const r = computeQimen({ year: 2026, month: 9, day: 22, hour: 10, city: '北京', purpose: 'wealth' });
  const zf = r.palaces.find((p) => p.id === r.zhiFu.palace);
  const zs = r.palaces.find((p) => p.id === r.zhiShi.palace);
  if (zf.tianPan !== r.xunShouYi) return `值符宫天盘 ${zf.tianPan} ≠ ${r.xunShouYi}`;
  if (zs.door !== r.zhiShi.door) return `值使宫门 ${zs.door} ≠ ${r.zhiShi.door}`;
  if (zf.shen !== '值符') return `值符宫神 ${zf.shen}`;
  return true;
});
ok('B12', '奇门：24 时辰 × 多日期排盘不报错（含中宫寄坤）', () => {
  for (const [y, m, d] of [[2026, 3, 15], [2025, 12, 21], [2024, 6, 1]]) {
    for (let h = 0; h < 24; h++) {
      computeQimen({ year: y, month: m, day: d, hour: h, city: '上海', purpose: 'wealth' });
    }
  }
  return true;
});

console.log('\n【C 组】事实包、缓存与合规');
ok('C1', '事实包结构校验通过', () => {
  const fp = build({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
  const e = validate(fp);
  return e.length === 0 ? true : e.join(';');
});
ok('C2', '同一输入二次请求命中缓存', () => {
  const input = { type: 'bazi', year: 1988, month: 3, day: 8, hour: 9, minute: 15, gender: 'female', city: '成都' };
  build(input, { useCache: false });
  return build(input).meta.cacheHit === true || 'cacheHit=false';
});
ok('C3', '不同输入产生不同 id', () => {
  const a = build({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, gender: 'male', city: '北京' });
  const b = build({ type: 'bazi', year: 1991, month: 5, day: 20, hour: 14, gender: 'male', city: '北京' });
  return a.id !== b.id ? true : 'id 相同';
});
ok('C4', `合规：断言词被弱化 + ${DISCLAIMER_ENABLED ? '注入' : '不注入'}免责声明`, () => {
  const g = gate('你明年一定会升职，这是必然的结果。', { system: 'bazi' });
  if (g.text.includes('一定会') || g.text.includes('必然')) return '断言词未处理';
  return g.text.includes(DISC12) === DISCLAIMER_ENABLED ? true : (DISCLAIMER_ENABLED ? '缺免责声明' : '开关已关闭但仍残留免责声明');
});
ok('C5', '合规：医疗与投资高风险内容被改写', () => {
  const g = gate('你命中有绝症，且炒股必涨。', { system: 'bazi' });
  if (g.text.includes('绝症') || g.text.includes('必涨')) return '高风险内容未改写';
  return g.blocked.some((b) => b.type === 'medical') ? true : '未记录 medical 拦截';
});
ok('C6', '合规：改运化解类被拦截', () => {
  const g = gate('建议做一场法事来化解灾厄，可以改运。', { system: 'bazi' });
  return g.blocked.some((b) => b.type === 'superstition') ? true : '未拦截 superstition';
});
ok('C7', '合规：敏感词替换生效', () => {
  const g = gate('此命克夫，须注意。', { system: 'bazi' });
  return !g.text.includes('克夫') ? true : '克夫未替换';
});
ok('C8', '紫微已启用：返回命宫与十二宫', () => {
  const r = build({ type: 'ziwei', year: 2000, month: 1, day: 1 });
  return r.system === 'ziwei' && r.facts.mingGong && Object.keys(r.facts.palaces).length === 12 ? true : '紫微未正确产出';
});
ok('C9', '非法体系返回错误', () => {
  try {
    build({ type: 'unknown', year: 2000, month: 1, day: 1 });
    return '未拒绝';
  } catch {
    return true;
  }
});
ok('C10', '农历非法日期抛错', () => {
  try {
    lunarToSolar(2024, 1, 31, false);
    return '未抛错';
  } catch {
    return true;
  }
});
ok('C11', '报告来源汇总口径：缓存不算本地兜底', () => {
  // 缓存里存的就是 AI 产物，全部命中缓存时必须报 cache，不能报 local-fallback（否则页面会写"本地规则解读"误导用户）
  const cases = [
    [[{ source: 'ai' }, { source: 'cache' }], 'ai'],
    [[{ source: 'ai' }], 'ai'],
    [[{ source: 'cache' }, { source: 'cache' }], 'cache'],
    [[{ source: 'local' }], 'local-fallback'],
    [[{ source: 'local' }, { source: 'cache' }], 'cache'],
    [[], 'local-fallback'],
  ];
  for (const [rs, want] of cases) {
    const got = aggSource(rs);
    if (got !== want) return `${JSON.stringify(rs.map((r) => r.source))} → ${got}，期望 ${want}`;
  }
  return true;
});

console.log('\n【D 组】商业化骨架');
ok('D1', 'SKU 列表与章节定价可用', () => listSkus().length > 0 && Object.keys(SECTION_PRICE.bazi).length > 0 ? true : 'SKU/定价为空');
ok('D2', '订单：创建 → 支付 → 解锁生效', () => {
  const o = createOrder({ skuId: 'single_section', sectionKey: 'dayun', system: 'bazi', factPackId: 'test' });
  if (o.status !== 'pending') return '初始状态错误';
  if (payOrder(o.id).status !== 'paid') return '支付失败';
  return unlockedSections({ system: 'bazi' }).includes('dayun') ? true : '解锁未生效';
});
ok('D3', '全量包订单解锁全部章节', () => {
  const o = createOrder({ skuId: 'full_report', system: 'qimen', factPackId: 't2' });
  payOrder(o.id);
  const un = unlockedSections({ system: 'qimen' });
  return ['direction', 'palace', 'advice'].every((k) => un.includes(k)) ? true : JSON.stringify(un);
});
ok('D4', '称骨详解 SKU ¥0.99 且解锁 chenggu 章节', () => {
  const o = createOrder({ skuId: 'chenggu_detail', system: 'bazi', factPackId: 't3' });
  if (o.amount !== 0.99) return `金额 ${o.amount}`;
  payOrder(o.id);
  return unlockedSections({ system: 'bazi' }).includes('chenggu') ? true : '解锁未生效';
});

console.log('\n【F 组】付费解锁闭环（按已购持久化）');
// 用内存垫片模拟浏览器 localStorage，复用真实持久化实现
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
};
resetOrders();

ok('F1', '按已购集合解锁：只解锁已购章节', () => {
  const u = unlockedSections({ system: 'bazi', purchased: ['xingge'] });
  return u.length === 1 && u[0] === 'xingge' ? true : JSON.stringify(u);
});
ok('F2', '按已购解锁：过滤非法章节键', () => {
  const u = unlockedSections({ system: 'bazi', purchased: ['xingge', 'not_a_key', 'dayun'] });
  return u.includes('xingge') && u.includes('dayun') && !u.includes('not_a_key') && u.length === 2 ? true : JSON.stringify(u);
});
ok('F3', '按已购解锁：不跨体系混入（direction 属奇门）', () => {
  const u = unlockedSections({ system: 'bazi', purchased: ['direction'] });
  return u.length === 0 ? true : JSON.stringify(u);
});
ok('F4', '持久化往返：写入后重读一致（模拟刷新仍解锁）', () => {
  _store.clear();
  savePurchases([]);
  addPurchase({ skuId: 'single_section', skuName: '单章解锁', system: 'bazi', sectionKeys: ['xingge'], amount: 6.9, paidAt: new Date().toISOString() });
  const before = purchasedKeysFor('bazi');
  const after = loadPurchases().flatMap((p) => (p.system === 'bazi' ? p.sectionKeys : []));
  return JSON.stringify(before) === JSON.stringify(after) && after.includes('xingge') ? true : JSON.stringify({ before, after });
});
ok('F5', '持久化去重：同 SKU+同体系+同章节只留一条', () => {
  _store.clear();
  savePurchases([]);
  const rec = { skuId: 'full_report', skuName: '完整报告', system: 'bazi', sectionKeys: ['xingge', 'shiye'], amount: 19.9, paidAt: new Date().toISOString() };
  addPurchase(rec);
  addPurchase(rec);
  return loadPurchases().length === 1 ? true : '长度=' + loadPurchases().length;
});
ok('F6', '订单→解锁闭环（无 purchased 回退订单路径）', () => {
  const o = createOrder({ skuId: 'single_section', sectionKey: 'dayun', system: 'bazi', factPackId: 'tF' });
  payOrder(o.id);
  return unlockedSections({ system: 'bazi' }).includes('dayun') ? true : '未解锁';
});

console.log('\n【D2 组】紫微斗数引擎');
ok('Z1', '农历八月卯时 → 命宫午、身宫子', () => {
  const fp = build({ type: 'ziwei', year: 2024, month: 9, day: 3, hour: 6, minute: 0, gender: 'male', city: '北京' });
  const r = fp.facts;
  const okMing = r.mingGong.zhi === '午';
  const okShen = r.shenGong.zhi === '子';
  if (!okMing || !okShen) return `命宫=${r.mingGong.zhi} 身宫=${r.shenGong.zhi}`;
  return true;
});
ok('Z2', '紫微落宫 = 查表法结果', () => {
  const r = build({ type: 'ziwei', year: 2024, month: 9, day: 3, hour: 6, gender: 'male', city: '北京' }).facts;
  return r.ziweiZhi === ZIWEI_TABLE[r.wuXingJu.name][r.lunar.day - 1] ? true : `紫微=${r.ziweiZhi}`;
});
ok('Z3', '天府落宫 = 紫府对照', () => {
  const r = build({ type: 'ziwei', year: 2024, month: 9, day: 3, hour: 6, gender: 'male', city: '北京' }).facts;
  return ZIFU_MAP[r.ziweiZhi] === r.tianfuZhi ? true : `天府=${r.tianfuZhi}`;
});
ok('Z4', '十四主星空档规则正确', () => {
  const r = build({ type: 'ziwei', year: 2024, month: 9, day: 3, hour: 6, gender: 'male', city: '北京' }).facts;
  const sp = r.starPositions;
  const zi = ZHI.indexOf(r.ziweiZhi), tf = ZHI.indexOf(r.tianfuZhi);
  const mod = (a) => ((a % 12) + 12) % 12;
  const exp = {
    天机: mod(zi - 1), 太阳: mod(zi - 3), 武曲: mod(zi - 4), 天同: mod(zi - 5), 廉贞: mod(zi - 8),
    太阴: mod(tf + 1), 贪狼: mod(tf + 2), 巨门: mod(tf + 3), 天相: mod(tf + 4), 天梁: mod(tf + 5), 七杀: mod(tf + 6), 破军: mod(tf + 10),
  };
  for (const k of Object.keys(exp)) if (sp[k] !== exp[k]) return `${k}: 实=${sp[k]} 期=${exp[k]}`;
  return Object.keys(sp).length === 14 ? true : `主星数=${Object.keys(sp).length}`;
});
ok('Z5', '生年四化按十天干口诀（甲年：廉贞禄/破军权/武曲科/太阳忌）', () => {
  const r = build({ type: 'ziwei', year: 2024, month: 9, day: 3, hour: 6, gender: 'male', city: '北京' }).facts;
  return r.fourHua.lu.star === '廉贞' && r.fourHua.quan.star === '破军' && r.fourHua.ke.star === '武曲' && r.fourHua.ji.star === '太阳';
});
ok('Z6', '大限起运岁 = 五行局数', () => {
  const r = build({ type: 'ziwei', year: 2024, month: 9, day: 3, hour: 6, gender: 'male', city: '北京' }).facts;
  return r.daXian[0].ageStart === r.wuXingJu.number ? true : `起运=${r.daXian[0].ageStart}`;
});
ok('Z7', '十二宫齐全且命宫/身宫标记一致', () => {
  const r = build({ type: 'ziwei', year: 2024, month: 9, day: 3, hour: 6, gender: 'male', city: '北京' }).facts;
  const keys = Object.keys(r.palaces);
  if (keys.length !== 12) return `宫数=${keys.length}`;
  const ming = r.palaces['命宫'];
  const shen = Object.values(r.palaces).find((p) => p.isShen);
  return ming.zhi === r.mingGong.zhi && shen.zhi === r.shenGong.zhi ? true : '标记不一致';
});
ok('Z8', 'Phase1修复：紫微身主按生年地支起，非 undefined（甲辰年身主为天机）', () => {
  const r = build({ type: 'ziwei', year: 2024, month: 9, day: 3, hour: 6, gender: 'male', city: '北京' }).facts;
  return r.shenZhu === '天机' && !!r.mingZhu ? true : `mingZhu=${r.mingZhu} shenZhu=${r.shenZhu}`;
});
ok('Z9', 'Phase1修复：紫微支持农历输入与字符串生辰收敛', () => {
  const r = build({ type: 'ziwei', calendar: 'lunar', year: '1990', month: '4', day: '26', hour: '14', minute: '30', gender: 'male', city: '北京' }).facts;
  return r.shenZhu === '火星' && r.lunar.month === 4 && r.lunar.day === 26 ? true : JSON.stringify({ shenZhu: r.shenZhu, lunar: r.lunar });
});
ok('Z10', 'Phase1修复：紫微晚子时（23:30）农历日顺延，与四柱日干支对齐', () => {
  const rDay = computeZiwei({ year: 1990, month: 5, day: 20, hour: 12, minute: 0, gender: 'male', city: '北京', useTrueSolarTime: false });
  const rLateZi = computeZiwei({ year: 1990, month: 5, day: 20, hour: 23, minute: 30, gender: 'male', city: '北京', useTrueSolarTime: false });
  return rLateZi.lunar.day === rDay.lunar.day + 1 ? true : `12:00日=${rDay.lunar.day} 23:30日=${rLateZi.lunar.day}`;
});
ok('F8', 'Phase1修复：已购凭证兼容合盘旧 Object 格式并无损迁移为标准 Array', () => {
  _store.clear();
  _store.set('xuanxue.purchases', JSON.stringify({ hepan: ['ganzhi', 'riyu'], entitlements: ['tok_hp_1'] }));
  const migrated = loadPurchases();
  const keys = purchasedKeysFor('hepan');
  return Array.isArray(migrated) && migrated.length === 1 && keys.includes('ganzhi') && keys.includes('riyu') && migrated[0].entitlement === 'tok_hp_1'
    ? true
    : JSON.stringify({ migrated, keys });

  // Phase 2 新增回归测试
  ok('Z11', 'Phase2精进：紫微火铃按全书口诀精确安放（寅午戌年子时火在丑、铃在卯）', () => {
    const zw = computeZiwei({ year: 1990, month: 6, day: 15, hour: 0, minute: 10, gender: 'male', city: '北京', useTrueSolarTime: false });
    return zw.fuStarPositions['火星'] === '丑' && zw.fuStarPositions['铃星'] === '卯' ? true : JSON.stringify(zw.fuStarPositions);
  });
  ok('Z12', 'Phase2精进：紫微十二宫宫干四化飞星矩阵（palaceSihua）完整且含冲宫', () => {
    const zw = computeZiwei({ year: 2024, month: 6, day: 15, hour: 10, minute: 0, gender: 'male', city: '北京' });
    return zw.palaceSihua && Object.keys(zw.palaceSihua).length === 12 && !!zw.palaceSihua['命宫']?.ji?.chongPalace;
  });
  ok('B13', 'Phase2精进：奇门真置闰法（含上元符头与超神/接气）与飞盘奇门九宫飞布', () => {
    const qz = computeQimen({ year: 2026, month: 6, day: 7, hour: 10, minute: 0, city: '北京', juMethod: 'zhirun', panType: 'fei' });
    const mid = qz.palaces.find((p) => p.id === 5);
    return qz.panMethod === 'fei' && !!qz.zhirunInfo?.shangYuanFuTou && !!mid?.tianPan && Array.isArray(qz.patterns);
  });
  ok('B14', 'Phase2精进：八字六柱同参（computeSixPillarImpact 识别岁运并临与天克地冲）', () => {
    const bz = computeBazi({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
    const six = computeSixPillarImpact(bz.fourPillars, { ganIndex: 0, zhiIndex: 0, name: '甲子' }, { ganIndex: 0, zhiIndex: 0, name: '甲子', year: 2044 });
    return six.specials.some((x) => x.type === 'binglin') && six.specials.some((x) => x.type === 'tkdc');
  });
  ok('C12', 'Phase2精进：ReportPlan 覆盖五大体系（bazi/hepan/liuyao/qimen/ziwei）且自检零错误', () => {
    const errs = planSelfCheck();
    return errs.length === 0 && SUPPORTED_SYSTEMS.length === 5 ? true : errs.join('; ');
  });
});

console.log('\n【E 组】端到端（异步）');

(async () => {
  const fp = build({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });

  const rep = await interpret(fp, { unlocked: [] });
  ok('E1', `八字深度解读 11 章（实际 ${rep.sections.length}）`, () => rep.sections.length === 11 || String(rep.sections.length));
  ok('E2', '未解锁时存在锁定章节', () => rep.sections.some((s) => s.preview) || '无锁定章节');
  ok('E3', `解读${DISCLAIMER_ENABLED ? '全部含' : '全部不含'}免责声明`, () => rep.sections.every((s) => s.text.includes(DISC12) === DISCLAIMER_ENABLED) || (DISCLAIMER_ENABLED ? '有章节缺免责声明' : '有章节仍残留免责声明'));

  const rep2 = await interpret(fp, { unlocked: ['mingju', 'geju', 'xingge', 'shiye', 'caiyun', 'ganqing', 'qinyuan', 'jiankang', 'chenggu', 'dayun', 'liunian'] });
  ok('E4', '解锁后无锁定章节', () => !rep2.sections.some((s) => s.preview) || '仍存在锁定');
  ok('E1b', '解锁后各章必备「要点 / 依据溯源 / 建议」三段',
    () => rep2.sections.every((s) => s.text.includes('【要点】') && s.text.includes('【依据溯源】') && s.text.includes('【建议】'))
      || '有章节缺依据溯源结构');
  const totalChars = rep2.sections.reduce((a, s) => a + s.text.length, 0);
  ok('E1c', `解锁后总字数充足（${totalChars} 字，最短章 ${Math.min(...rep2.sections.map((s) => s.text.length))} 字）`,
    () => (totalChars >= 5000 && Math.min(...rep2.sections.map((s) => s.text.length)) >= 300) || `总计 ${totalChars}`);

  const html = renderReportHtml({ factPack: fp, interpretation: rep2 });
  ok('E5', `HTML 报告含四柱${DISCLAIMER_ENABLED ? '与免责声明' : '（免责已按开关关闭）'}`, () => (html.includes(DISC12) === DISCLAIMER_ENABLED) && html.includes('庚午') ? true : '内容缺失');

  const fp2 = build({ type: 'liuyao', year: 2026, month: 9, day: 22, hour: 10, city: '北京', category: 'wealth', question: '今年财运如何' });
  const rep3 = await interpret(fp2, { unlocked: [] });
  ok('E6', `六爻解读 5 章（实际 ${rep3.sections.length}）`, () => rep3.sections.length === 5 || String(rep3.sections.length));

  const fp3 = build({ type: 'qimen', year: 2026, month: 9, day: 22, hour: 10, city: '北京', purpose: 'wealth' });
  const rep4 = await interpret(fp3, { unlocked: [] });
  ok('E7', `奇门解读 4 章（实际 ${rep4.sections.length}）`, () => rep4.sections.length === 4 || String(rep4.sections.length));

  const svg = renderShareCardSvg(fp);
  ok('E8', '分享卡 SVG 可生成', () => svg.startsWith('<svg') && svg.length > 300 ? true : 'SVG 异常');

  // 付费解锁闭环（异步）：按已购解锁后该章 preview=false，未购章节 preview=true
  const fpF = build({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
  const repF = await interpret(fpF, { unlocked: ['xingge'] });
  ok('F7', '按已购解锁：已购章节 preview=false、未购章节 preview=true', () => {
    const sec = repF.sections.find((s) => s.key === 'xingge');
    const locked = repF.sections.find((s) => s.key === 'shiye');
    return sec && sec.preview === false && locked && locked.preview === true ? true : JSON.stringify({ x: sec && sec.preview, s: locked && locked.preview });
  });

  const fp4 = build({ type: 'ziwei', year: 2024, month: 9, day: 3, hour: 6, gender: 'male', city: '北京' });
  const rep5 = await interpret(fp4, { unlocked: [] });
  ok('E9', `紫微解读 6 章（实际 ${rep5.sections.length}）`, () => rep5.sections.length === 6 || String(rep5.sections.length));
  ok('E10', `紫微报告 HTML 含命宫${DISCLAIMER_ENABLED ? '与免责声明' : '（免责已按开关关闭）'}`, () => {
    const h = renderReportHtml({ factPack: fp4, interpretation: rep5 });
    return h.includes('命宫') && (h.includes(DISC12) === DISCLAIMER_ENABLED) ? true : '内容缺失';
  });

  console.log('\n────────────────────────────');
  console.log(`通过 ${pass} 项，失败 ${fail} 项`);
  if (failures.length) {
    console.log('失败明细：');
    for (const f of failures) console.log('  - ' + f);
  }
  console.log(`缓存：${JSON.stringify(cacheStats())}`);
  process.exit(fail === 0 ? 0 : 1);
})();
