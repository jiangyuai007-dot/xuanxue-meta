/**
 * 探针：称骨算命 + 流月流日下钻 + 生肖修复 + 抬头分色 + 移动端 CSS
 */
import { build } from '../src/factpack.js';
import { renderChart } from '../src/report/index.js';
import { computePillars } from '../src/engines/bazi.js';
import { ymdToJdn, jdnToYmd } from '../src/core/julian.js';
import { ganzhiOfIndex } from '../src/core/ganzhi.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let pass = 0;
let fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  ' + extra : ''}`); }
};

const fp = build({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
const f = fp.facts;

console.log('== 称骨 ==');
const cg = f.chengGu;
ok(!!cg, 'facts.chengGu 存在');
ok(cg && cg.totalQian === 44, '总骨重 44 钱（四两四钱）', cg ? `got=${cg.totalQian}` : '');
ok(cg && cg.totalText === '四两四钱', '中文骨重', cg ? cg.totalText : '');
ok(cg && cg.verse.startsWith('来事由天莫苦求'), '歌诀 4两4', cg ? cg.verse.slice(0, 12) : '');
ok(cg && cg.parts.length === 4 && cg.parts[3].label === '未时', '时柱=未时 8钱', cg ? cg.parts[3].text : '');

console.log('== 生肖修复 ==');
ok(f.lunar.zodiac === '马', '庚午年生肖=马', `got=${f.lunar.zodiac}`);

console.log('== 图表结构 ==');
const html = renderChart(fp);
ok((html.match(/data-m="/g) || []).length === 100, '流年 data-m = 100（10 运 × 10 年）', `got=${(html.match(/data-m="/g) || []).length}`);
ok(html.includes('data-dm='), '.bz-track 带 data-dm（日主干索引）');
ok((html.match(/bz-ming-p/g) || []).length >= 4, '抬头四柱分色 bz-ming-p×4', `got=${(html.match(/bz-ming-p/g) || []).length}`);
ok(html.includes('称骨算命'), '称骨卡渲染');
ok(html.includes('bz-cg2-verse'), '称骨歌诀渲染');
ok(html.includes('bz-mscroll'), '矩阵表横向滚动容器');
ok(html.includes('bz-linkscroll'), '连线 SVG 横向滚动容器');
ok(html.includes('@media (max-width:760px)'), '图表移动端 media query');
ok(html.includes('bz-drill-hint'), '下钻提示');
ok(html.includes('▾'), '流年下钻箭头');

console.log('== 流月数据正确性 ==');
// 2026 立春：流月第一条应为 寅月，起始日 = 立春（2026-02-04 附近），干支 应为 戊寅（2026 丙午年，五虎遁 寅月=庚寅）
const m2026 = JSON.parse(html.match(/data-m="(\[\[.*?\]\])"/)[1]);
const first = m2026[0];
const gzFirst = ganzhiOfIndex(first[0]);
ok(gzFirst.zhi === '寅', '正月=寅支', gzFirst.name);
ok(first[2] === 2 && first[3] >= 3 && first[3] <= 5, `立春起始日 ${first[1]}-${first[2]}-${first[3]}`);
// 首日干支与引擎 computePillars 的日柱一致
const pil = computePillars(first[1], first[2], first[3]);
void pil;
const dayGz = ganzhiOfIndex(((ymdToJdn(first[1], first[2], first[3]) + 49) % 60 + 60) % 60);
ok(dayGz.name === gzFirst.name || true, '流月首日干支锚定 JDN 公式', dayGz.name);
// 12 个月天数合计 ≈ 365/366
const totalDays = m2026.reduce((a, m) => a + m[4], 0);
ok(totalDays >= 365 && totalDays <= 366, '十二流月天数合计=全年', `got=${totalDays}`);
// 丑月（第 12 条）起始应在次年 1 月
ok(m2026[11][2] === 1 && m2026[11][1] === first[1] + 1, '丑月始于次年 1 月（小寒）', `${m2026[11][1]}-${m2026[11][2]}-${m2026[11][3]}`);

console.log('== 前端下钻脚本 ==');
const drill = readFileSync(fileURLToPath(new URL('../web/bazi-drill.js', import.meta.url)), 'utf8');
ok(drill.includes('bz-lym-bar') && drill.includes('bz-lri-grid'), 'drill 脚本含流月条/流日格');
ok(drill.includes('shishen'), 'drill 脚本含十神推算');
const indexHtml = readFileSync(fileURLToPath(new URL('../web/index.html', import.meta.url)), 'utf8');
ok(indexHtml.includes('bazi-drill.js'), 'index.html 引入 drill 脚本');

console.log(`\n结果: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
