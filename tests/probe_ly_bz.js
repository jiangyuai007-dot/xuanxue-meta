import fs from 'fs';
import { build } from '../src/factpack.js';
import { renderChart } from '../src/report/index.js';

const cases = [
  { name: 'liuyao', input: { type: 'liuyao', year: 2026, month: 9, day: 25, hour: 22, minute: 30, city: '北京', category: 'wealth', question: '今年财运如何' } },
  { name: 'bazi', input: { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京', name: '李某' } },
];

let pass = 0;
let fail = 0;
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} —— ${detail}`); }
};

for (const c of cases) {
  const fp = await build(c.input);
  const f = fp.facts;
  const html = renderChart(fp);
  fs.mkdirSync('C:/Users/Administrator/WorkBuddy/2026-09-22-22-12-39/data/preview', { recursive: true });
  fs.writeFileSync(`C:/Users/Administrator/WorkBuddy/2026-09-22-22-12-39/data/preview/${c.name}.html`,
    `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${c.name}</title></head><body style="background:#f3ede2;padding:24px">${html}</body></html>`);

  console.log(`\n【${c.name}】`);
  if (c.name === 'liuyao') {
    t('四柱齐全', ['year', 'month', 'day', 'hour'].every((k) => f.siZhu?.[k]?.name), JSON.stringify(f.siZhu));
    t('各柱带空亡', ['year', 'month', 'day', 'hour'].every((k) => f.siZhu?.[k]?.xunkong?.length === 2));
    t('日柱与六爻日辰一致', f.siZhu.day.name === f.riJian.ganzhi, `${f.siZhu?.day?.name} vs ${f.riJian.ganzhi}`);
    t('卦身有值', !!f.guaShen?.zhi, JSON.stringify(f.guaShen));
    t('神煞 ≥ 10 项', (f.shensha || []).length >= 10, `实际 ${f.shensha.length}`);
    t('神煞含驿马/桃花/贵人', ['驿马', '桃花', '天乙贵人'].every((n) => f.shensha.some((s) => s.name.startsWith(n))));
    t('变卦六爻已装卦', (f.bianLines || []).length === 6 && f.bianLines.every((l) => l.zhi && l.liuqin));
    t('月破已判定', f.lines.every((l) => typeof l.yuePo === 'boolean'));
    t('爻带纳甲干', f.lines.every((l) => l.gan));
    const inGua = f.shensha.filter((s) => s.lineIndex !== null && s.lineIndex !== undefined);
    t('落卦神煞回填爻位', f.lines.some((l) => l.shensha.length > 0) || inGua.length === 0, `落卦 ${inGua.length}`);
    t('节气区间有值', !!f.yueJian.jieName && !!f.yueJian.nextName, JSON.stringify(f.yueJian));
    t('渲染含热卜式信息表', html.includes('ly3') && html.includes('卦式') && html.includes('神煞'));
    t('渲染含卦身/月破标记', html.includes('身') && html.includes('破'));
    console.log(`  四柱=${f.siZhu.year.name} ${f.siZhu.month.name} ${f.siZhu.day.name} ${f.siZhu.hour.name}　卦身=${f.guaShen.zhi}　神煞${f.shensha.length}项`);
  } else {
    t('大运 radio 切换结构', html.includes('bz-dy-r') && html.includes('bz-dy-panel'), '缺 radio/panel');
    t('默认选中当前运', /checked/.test(html));
    t(':checked 联动规则存在', html.includes(':checked~'));
    t('连线图干支上下两行', html.includes('天干</text>') && html.includes('地支</text>'));
    t('干支关系上弧下弧并存', (html.match(/Q /g) || []).length >= 2, `弧线 ${((html.match(/Q /g) || []).length)}`);
    t('日柱日元高亮保留', html.includes('（日元）') && /stroke="#c9a961"/.test(html));
    t('四柱干支仍在', html.includes('庚') && html.includes('午'));
    console.log(`  关系弧线=${(html.match(/Q /g) || []).length}`);
  }
}

console.log(`\n———— 通过 ${pass} / 失败 ${fail} ————`);
if (fail > 0) process.exit(1);
