/**
 * 探针：神煞 108 项 + 起法依据悬停 + 版本 1.4.0
 */
import { SHENSHA_RULES, computeShensha } from '../src/core/shensha.js';
import { build } from '../src/factpack.js';
import { renderChart } from '../src/report/index.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('== 神煞规则库 ==');
ok('规则数=108', SHENSHA_RULES.length === 108, String(SHENSHA_RULES.length));
ok('全部带起法口诀(source)', SHENSHA_RULES.every((r) => r.source && r.source.length >= 4));
ok('全部带释义(desc)', SHENSHA_RULES.every((r) => r.desc && r.desc.length >= 4));
ok('类别只含 吉/中/凶', SHENSHA_RULES.every((r) => ['吉', '中', '凶'].includes(r.cat)));
const names = SHENSHA_RULES.map((r) => r.name);
ok('无重名', new Set(names).size === names.length);
const must = ['天乙贵人', '太极贵人', '文昌贵人', '天德贵人', '月德贵人', '驿马', '华盖', '桃花（咸池）', '将星',
  '羊刃', '禄神', '魁罡', '金舆', '国印贵人', '空亡', '劫煞', '元辰', '灾煞', '破碎煞', '流霞', '丧门', '吊客', '披麻', '金神', '三奇贵人', '学堂', '词馆'];
ok('关键条目齐全(27项)', must.every((n) => names.includes(n)), names.join(','));

console.log('== 引擎事实包（1990-05-20 14:30 男） ==');
const input = { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', name: '探针' };
const fp = build(input);
const f = fp.facts;
ok('engine=1.4.0', String(fp.meta?.engineVersion || '').includes('1.4.0'), String(fp.meta?.engineVersion));
const ss = f.shensha || [];
ok('命中神煞>=15', ss.length >= 15, String(ss.length));
ok('每条命中都带source', ss.every((x) => x.source && x.source.length >= 4));
ok('每条命中都带by(起法维度)', ss.every((x) => x.by));
ok('空亡作为规则命中(带source)', ss.some((x) => x.name === '空亡' && x.source));

console.log('== 红艳煞起法修正（乙申非乙午） ==');
// 乙日干，四支仅日支见申 → 红艳；日支改午 → 不命中（年支等不得含申/午干扰）
const c1 = { yearGanIndex: 0, yearZhiIndex: 0, monthZhiIndex: 2, dayGanIndex: 1, dayZhiIndex: 8, hourZhiIndex: 2, stems: { year: 0, month: 0, day: 1, hour: 0 } };
const r1 = computeShensha(c1).filter((x) => x.name === '红艳煞');
ok('乙日见申→红艳命中', r1.length === 1, JSON.stringify(r1));
const c2 = { ...c1, dayZhiIndex: 6 }; // 午
const r2 = computeShensha(c2).filter((x) => x.name === '红艳煞');
ok('乙日见午→不命中', r2.length === 0, JSON.stringify(r2));

console.log('== 图表层 ==');
const html = renderChart(fp);
ok('悬停含起法依据title', html.includes('title="【起法依据·'));
ok('标题显示规则库108项', html.includes('规则库 108 项'));
ok('大运流年块在位', html.includes('bz-track') && html.includes('data-dm'));
ok('流年带流月数据', html.includes('data-m="[['));

console.log('== 铁扫帚/破月 上下文（农历月） ==');
const ctxHas = SHENSHA_RULES.filter((r) => r.name === '铁扫帚' || r.name === '破月（骨髓破）').length;
ok('铁扫帚+破月规则在库', ctxHas === 2);

console.log(`\n结果: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
