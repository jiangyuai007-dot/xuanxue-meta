/**
 * 本轮综合探针：六爻多爻动/新起卦方法/卦辞解释 + 奇门起局选项/四柱表
 */
import { computeLiuyao, GUA_NAMES, LIUYAO_ENGINE_VERSION } from '../src/engines/liuyao.js';
import { computeQimen, QIMEN_ENGINE_VERSION } from '../src/engines/qimen.js';
import { build } from '../src/factpack.js';
import { renderChart } from '../src/report/index.js';
import { guaciOf, GUACI } from '../src/core/guaci.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  [' + detail + ']' : ''}`); }
  else { fail++; console.log(`  ✗ ${name}  [${detail}]`); }
};

const BASE = { type: 'liuyao', year: 2026, month: 9, day: 26, hour: 21, minute: 30, city: '北京' };

console.log('— 六爻多爻动（时间起卦） —');
const dongCounts = [];
for (let d = 15; d <= 26; d++) {
  const f = computeLiuyao({ ...BASE, day: d });
  dongCounts.push(f.dongYao.length);
}
ok('时间起卦：12 天动爻数不全为 1', !dongCounts.every((c) => c === 1), JSON.stringify(dongCounts));
ok('时间起卦：动爻数 0~6', dongCounts.every((c) => c >= 0 && c <= 6));
const f1a = computeLiuyao(BASE);
const f1b = computeLiuyao(BASE);
ok('时间起卦：同时间确定性一致', JSON.stringify(f1a.dongYao) === JSON.stringify(f1b.dongYao));

console.log('— 数字起卦1/2 —');
const fn1 = computeLiuyao({ ...BASE, method: 'number', numbers: [123, 456] });
const fn1b = computeLiuyao({ ...BASE, method: 'number', numbers: [123, 456] });
ok('数字1：确定性', JSON.stringify(fn1.dongYao) === JSON.stringify(fn1b.dongYao), `${fn1.dongYao.length} 爻动`);
const fn2 = computeLiuyao({ ...BASE, method: 'number2', numbers: [6, 7, 888] });
ok('数字2：可排盘', !!fn2.benGua.name, `${fn2.benGua.name} 动${fn2.dongYao.length}爻`);

console.log('— 手动指定 / 卦名起卦 / 自动 —');
const fm = computeLiuyao({ ...BASE, method: 'manual', lines: [7, 8, 7, 8, 7, 8] });
ok('手动：静卦 0 动爻', fm.dongYao.length === 0, `${fm.benGua.name}`);
const fnm = computeLiuyao({ ...BASE, method: 'name', guaName: '地天泰' });
ok('卦名：地天泰', fnm.benGua.name === '地天泰' && fnm.dongYao.length === 0, `宫${fnm.benGua.gong}`);
const fa = computeLiuyao({ ...BASE, method: 'auto' });
ok('自动：可排盘', !!fa.benGua.name, `${fa.benGua.name}→${fa.bianGua.name}`);

console.log('— 卦辞库 —');
ok('卦辞 64 条齐全', Object.keys(GUACI).length === 64, String(Object.keys(GUACI).length));
const gt = guaciOf('地天泰');
ok('泰卦辞/象/断', !!gt && gt.guaCi.includes('小往大来') && gt.xiang.includes('天地交'), gt ? 'ok' : 'missing');
// 卦名表与卦辞表键完全一致
const allNames = Object.values(GUA_NAMES).flat();
const missing = allNames.filter((n) => !GUACI[n]);
ok('64 卦名↔卦辞键一致', missing.length === 0, JSON.stringify(missing.slice(0, 4)));

console.log('— 六爻渲染（卦辞块/伏神/对齐 CSS） —');
const lyFp = build({ ...BASE, method: 'manual', lines: [7, 7, 8, 8, 8, 8] });
const lyHtml = renderChart(lyFp);
ok('渲染含卦辞解释块', typeof lyHtml === 'string' && lyHtml.includes('卦辞') && lyHtml.includes('断语'));
ok('渲染含本卦/变卦 tab', lyHtml.includes('gcBen') && lyHtml.includes('gcBian'));
ok('CSS：nowrap + 四柱 800', lyHtml.includes('white-space:nowrap') && lyHtml.includes('font-weight:800'));
ok('伏神金色样式', lyHtml.includes('.lfu{font-size:11px;color:var(--gold)'));

console.log('— 奇门起局选项 —');
const q1 = computeQimen({ ...BASE, type: 'qimen', purpose: 'general' });
ok('奇门默认拆补', q1.juMethodName === '拆补法', `${q1.juName}`);
const q2 = computeQimen({ ...BASE, type: 'qimen', juMethod: 'custom', customJu: 5 });
ok('自选局数：5 局', q2.ju === 5 && q2.juName.includes('5局'), q2.juName);
const q3 = computeQimen({ ...BASE, type: 'qimen', juMethod: 'zhirun' });
ok('置闰法可排盘', q3.juMethodName === '置闰法' && q3.ju >= 1 && q3.ju <= 9, q3.juName);
const q4 = computeQimen({ ...BASE, type: 'qimen', juMethod: 'maoshan' });
ok('茅山法可排盘', q4.juMethodName === '茅山法', q4.juName);
const q5 = computeQimen({ ...BASE, type: 'qimen', jiGong: 'yangGenYinKun' });
ok('阳艮阴坤寄宫可排盘', !!q5.jiGongName && q5.palaces.length === 9, q5.jiGongName);
ok('四柱完整+空亡', !!q5.fourPillars?.day?.name && q5.fourPillars.day.xunkong.length === 2, `${q5.fourPillars.year.name} ${q5.fourPillars.day.name} 空${q5.fourPillars.day.xunkong}`);
ok('节气区间', !!q5.nextTerm?.name, `${q5.solarTerm}→${q5.nextTerm?.name}`);

console.log('— 奇门渲染（四柱表） —');
const qmFp = build({ ...BASE, type: 'qimen' });
const qmHtml = renderChart(qmFp);
ok('渲染含四柱表/空亡行', typeof qmHtml === 'string' && qmHtml.includes('四柱') && qmHtml.includes('空亡'));
ok('渲染含起局方式 chip', qmHtml.includes('拆补法') && qmHtml.includes('寄坤二宫'));

console.log('— 引擎版本 —');
ok('liuyao 1.4.0', LIUYAO_ENGINE_VERSION === '1.4.0', LIUYAO_ENGINE_VERSION);
ok('qimen 1.1.0', QIMEN_ENGINE_VERSION === '1.1.0', QIMEN_ENGINE_VERSION);

console.log(`\n结果：${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
