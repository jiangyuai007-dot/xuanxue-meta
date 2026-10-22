/**
 * 探针：童子煞补齐 + 常用神煞（太极贵人/十灵日/十恶大败/阴差阳错/日贵/魁罡）在库校验
 * 结果同时写 stdout 与 tests/.probe_tongzi.log（便于无 stdout 环境下读取）
 */
import fs from 'node:fs';
import { SHENSHA_RULES, computeShensha } from '../src/core/shensha.js';
import { build } from '../src/factpack.js';
import { renderChart } from '../src/report/index.js';

const LOG = [];
const out = (s) => { LOG.push(s); console.log(s); };
let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; out(`  ✓ ${name}${extra ? ' → ' + extra : ''}`); } else { fail++; out(`  ✗ ${name}${extra ? ' → ' + extra : ''}`); }
};

const names = SHENSHA_RULES.map((r) => r.name);
out('== 规则库 ==');
ok('规则数>=108', names.length >= 108, String(names.length));
ok('无重名', new Set(names).size === names.length);
ok('全部带起法口诀 source', SHENSHA_RULES.every((r) => r.source));
ok('全部带起例维度 by', SHENSHA_RULES.every((r) => r.by), String(SHENSHA_RULES.filter((r) => !r.by).map((r) => r.name)));

out('== 用户点名的神煞 ==');
for (const n of ['童子煞', '太极贵人', '十灵日', '十恶大败', '阴差阳错', '日贵', '魁罡', '文昌贵人', '天乙贵人', '金舆', '国印贵人']) {
  ok(`在库：${n}`, names.includes(n));
}

out('== 童子煞起法（口诀：春秋寅子贵，冬夏卯未辰；金木马卯合，水火鸡犬多，土命逢辰巳）==');
const TZ = SHENSHA_RULES.find((r) => r.name === '童子煞');
ok('童子煞规则存在', !!TZ);
const ctx = (o) => ({
  yearGanIndex: 0, yearZhiIndex: 0, monthZhiIndex: 2, dayGanIndex: 0, dayZhiIndex: 0, hourZhiIndex: 6,
  stems: { year: 0, month: 0, day: 0, hour: 0 }, gender: 'male', yearGanYang: true, ...o,
});
const has = (c, n) => computeShensha(c).some((x) => x.name === n);

// 春月(寅) + 日支子 → 命中（春秋寅子贵）
ok('春月·日支子 命中', has(ctx({ monthZhiIndex: 2, dayZhiIndex: 0 }), '童子煞'));
// 秋月(申) + 日支寅 → 命中
ok('秋月·日支寅 命中', has(ctx({ monthZhiIndex: 8, dayZhiIndex: 2, hourZhiIndex: 6 }), '童子煞'));
// 夏月(午) + 日支未 → 命中（冬夏卯未辰）
ok('夏月·日支未 命中', has(ctx({ monthZhiIndex: 6, dayZhiIndex: 7, hourZhiIndex: 10 }), '童子煞'));
// 冬月(子) + 日支辰 → 命中
ok('冬月·日支辰 命中', has(ctx({ monthZhiIndex: 0, dayZhiIndex: 4, hourZhiIndex: 10 }), '童子煞'));
// 不命中：夏月(午)、日支子、时支酉（卯未辰之外）
ok('无对应支 不命中', !has(ctx({ monthZhiIndex: 6, dayZhiIndex: 0, hourZhiIndex: 9 }), '童子煞'));
// 夏月 + 日支午：纳音法单独见不算童子煞（避免人人命带）
ok('仅纳音法见 不算童子煞', !has(ctx({ monthZhiIndex: 6, dayZhiIndex: 6, hourZhiIndex: 10 }), '童子煞'));

out('== 真童子（季节法＋纳音法同见一支）==');
// 夏月(午) + 年柱甲子(海中金·金见午卯) + 日支卯 → 两法同见卯
ok('夏月·金纳音·日支卯 真童子', has(ctx({ monthZhiIndex: 6, dayZhiIndex: 3, hourZhiIndex: 10 }), '真童子'));
// 夏月 + 年柱庚午(路旁土·土见辰巳) + 日支辰 → 两法同见辰
ok('夏月·土纳音·日支辰 真童子', has(ctx({ yearGanIndex: 6, yearZhiIndex: 6, monthZhiIndex: 6, dayZhiIndex: 4, hourZhiIndex: 10 }), '真童子'));
// 春月季节支为寅子，与纳音支无交集 → 永不判真童子
ok('春月 不判真童子', !has(ctx({ monthZhiIndex: 2, dayZhiIndex: 0, hourZhiIndex: 2 }), '真童子'));

out('== 实盘渲染 ==');
const fp = await build({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', calendar: 'solar' });
const hitNames = (fp.facts.shensha || []).map((x) => x.name);
out(`  实盘命中 ${hitNames.length} 项：${hitNames.join('、')}`);
const html = renderChart(fp);
ok('engine=1.5.1', String(fp.meta?.engineVersion).includes('1.5.1'), String(fp.meta?.engineVersion));
ok('渲染含神煞区', html.includes('bz-shensha'));
ok('渲染含全量规则库折叠', html.includes('bz-ss-all') && html.includes('bz-ss-libgrid'));
ok('渲染标出规则库总数', html.includes(`规则库 ${SHENSHA_RULES.length} 项`));
ok('悬停起法依据存在', html.includes('【起法依据·'));

// 扫一批日期：确认童子煞在实盘能命中（起法太窄会是 0 命中）
let tzHit = 0; let total = 0;
for (let m = 1; m <= 12; m++) {
  for (const d of [3, 17]) {
    for (const h of [3, 15]) {
      total++;
      const f2 = await build({ type: 'bazi', year: 2026, month: m, day: d, hour: h, minute: 0, gender: 'male', calendar: 'solar' });
      if ((f2.facts.shensha || []).some((x) => x.name === '童子煞')) tzHit++;
    }
  }
}
ok('实盘童子煞命中率合理(0<x<70%)', tzHit > 0 && tzHit < total * 0.7, `${tzHit}/${total}`);

fs.writeFileSync(new URL('./.probe_tongzi.log', import.meta.url), LOG.join('\n') + `\n\n合计：${pass} 通过 / ${fail} 失败\n`, 'utf8');
out(`\n合计：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
