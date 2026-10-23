/**
 * 合盘引擎自检（不依赖服务，直接 import 引擎）
 *  Purpose：确认 computeHePan 的输入/输出契约、确定性、指数区间、生肖维度年支准确性。
 */
import { computeBazi } from '../src/engines/bazi.js';
import { computeHePan, HEWAN_ENGINE_VERSION } from '../src/engines/hepan.js';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}${extra ? '　' + extra : ''}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${extra ? '　' + extra : ''}`);
  }
};
const section = (t) => console.log(`\n【${t}】`);

// 注意：computeBazi 直接返回 facts（不是 {facts:{...}}），别再套一层 .facts
const A = computeBazi({ type: 'bazi', calendar: 'solar', year: 1990, month: 5, day: 20, hour: 10, minute: 30, gender: 'male', city: '北京' });
const B = computeBazi({ type: 'bazi', calendar: 'solar', year: 1993, month: 3, day: 8, hour: 14, minute: 20, gender: 'female', city: '上海' });
const C = computeBazi({ type: 'bazi', calendar: 'solar', year: 1990, month: 5, day: 20, hour: 10, minute: 30, gender: 'male', city: '北京' });

section('1 输入契约');
ok('两个八字 facts 可合盘', !!A.fourPillars?.day && !!B.fourPillars?.day, `${A.fourPillars.year.name} ${B.fourPillars.year.name}`);
ok('引擎版本号存在', typeof HEWAN_ENGINE_VERSION === 'string', HEWAN_ENGINE_VERSION);

const f = computeHePan({ a: A, b: B, names: { a: '男方', b: '女方' } });

section('2 输出结构');
ok('score 为 0-100 整数', Number.isInteger(f.score) && f.score >= 0 && f.score <= 100, `score=${f.score}`);
ok('分档在五档之内', ['天作之合', '相得益彰', '互补有成', '需要磨合', '挑战较多'].includes(f.grade), f.grade);
ok('双方 party 各就位', f.parties.length === 2 && f.parties[0].name === '男方' && f.parties[1].name === '女方');
ok('dims 四维齐全', ['day', 'combine', 'wuxing', 'zodiac'].every((d) => f.dims.some((x) => x.dim === d)));
ok('he/conflicts 是数组', Array.isArray(f.he) && Array.isArray(f.conflicts), `合 ${f.he.length} 项 / 冲克 ${f.conflicts.length} 项`);
ok('headline 非空', !!f.headline && f.headline.length > 6);
ok('summary 含双方日柱', f.summary.includes(f.parties[0].dayGanzhi) && f.summary.includes(f.parties[1].dayGanzhi));

section('2b 生肖维度（Phase 1 回归锁死：按年支生肖而非日支判定）');
// 1990 庚午（马）× 1991 辛未（羊）→ 午未六合（生肖六合），不受日支影响
const horse = computeBazi({ type: 'bazi', year: 1990, month: 6, day: 15, hour: 10, gender: 'male', city: '北京' });
const goat = computeBazi({ type: 'bazi', year: 1991, month: 6, day: 15, hour: 10, gender: 'female', city: '北京' });
const hpHorseGoat = computeHePan({ a: horse, b: goat });
ok('1990午马 × 1991未羊 判定为「生肖六合」', hpHorseGoat.zodiac.ziKind === '生肖六合', `${horse.lunar.zodiac}×${goat.lunar.zodiac} -> ${hpHorseGoat.zodiac.ziKind}`);
// 同年同属马（午×午），即使日支相冲，生肖也不得被误判为「生肖相冲」
const horse2 = computeBazi({ type: 'bazi', year: 1990, month: 6, day: 21, hour: 10, gender: 'female', city: '北京' });
const hpSameZodiac = computeHePan({ a: horse, b: horse2 });
ok('同属马（午×午）不同日支，绝不误判为生肖相冲/六合', hpSameZodiac.zodiac.ziKind === '无特殊关系', `${horse.fourPillars.day.name}×${horse2.fourPillars.day.name} -> ${hpSameZodiac.zodiac.ziKind}`);

section('3 确定性');
const f2 = computeHePan({ a: A, b: B, names: { a: '男方', b: '女方' } });
ok('同输入两次结果完全一致', JSON.stringify(f) === JSON.stringify(f2), `score=${f2.score}`);
const f3 = computeHePan({ a: B, b: A, names: { a: '乙方', b: '甲方' } });
ok('换顺序后指数不变、分档不变', f3.score === f.score && f3.grade === f.grade, `score=${f3.score}`);
ok('换顺序后甲乙方归属随之对调', f3.parties[0].name === '乙方' && f3.parties[1].name === '甲方');
const same = computeHePan({ a: A, b: C });
ok('自己与自己合盘不崩', same.score >= 0 && same.score <= 100, `score=${same.score}`);

section('4 跨盘关系只取跨盘');
const crossOnly = [...f.he, ...f.conflicts].every((r) => {
  const ks = r.keys || [];
  return ks.some((k) => k.startsWith('a.')) && ks.some((k) => k.startsWith('b.'));
});
ok('所有关系项都是跨盘（同盘内部关系未混入）', crossOnly);
const dayRel = f.day;
ok('日柱关系含双方日支', !!dayRel && dayRel.items.length > 0, dayRel.items[0] || '');

section('5 指数区间（随机 40 组不越界、可被分档覆盖）');
let minScore = 100;
let maxScore = 0;
const grades = new Set();
for (let i = 0; i < 40; i++) {
  const y1 = 1975 + (i % 25);
  const x1 = computeBazi({ type: 'bazi', year: y1, month: (i % 12) + 1, day: (i % 27) + 1, hour: i % 24, gender: i % 2 ? 'male' : 'female', city: '北京' });
  const y2 = 1975 + ((i * 7) % 25);
  const x2 = computeBazi({ type: 'bazi', year: y2, month: (i * 3 % 12) + 1, day: (i * 5 % 27) + 1, hour: (i * 2) % 24, gender: i % 2 ? 'female' : 'male', city: '上海' });
  const r = computeHePan({ a: x1, b: x2 });
  minScore = Math.min(minScore, r.score);
  maxScore = Math.max(maxScore, r.score);
  grades.add(r.grade);
}
ok('40 组覆盖多档分档', grades.size >= 2, `档位 ${grades.size} 种：${[...grades].join('/')}`);
ok('区间落在 0-100', minScore >= 0 && maxScore <= 100, `min=${minScore} max=${maxScore}`);

console.log(`\n———— 引擎自检：通过 ${pass} · 失败 ${fail} ————`);
process.exit(fail ? 1 : 0);
