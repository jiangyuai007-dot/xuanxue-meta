/** 诊断：童子煞（季节法·日支或时支 vs 仅日支）命中率统计 */
import { computeShensha } from '../src/core/shensha.js';
import { computeBazi } from '../src/engines/bazi.js';

const stat = { both: 0, dayOnly: 0, n: 0 };
for (let i = 0; i < 400; i++) {
  const y = 1950 + Math.floor(Math.random() * 80);
  const m = 1 + Math.floor(Math.random() * 12);
  const d = 1 + Math.floor(Math.random() * 28);
  const h = Math.floor(Math.random() * 24);
  try {
    const r = computeBazi({ year: y, month: m, day: d, hour: h, minute: 10, gender: 'male', calendar: 'solar' });
    const p = r.fourPillars || r.pillars;
    if (!p) continue;
    const c = {
      yearGanIndex: p.year.ganIndex, yearZhiIndex: p.year.zhiIndex,
      monthZhiIndex: p.month.zhiIndex, dayGanIndex: p.day.ganIndex,
      dayZhiIndex: p.day.zhiIndex, hourZhiIndex: p.hour.zhiIndex,
      stems: { year: p.year.ganIndex, month: p.month.ganIndex, day: p.day.ganIndex, hour: p.hour.ganIndex },
      gender: 'male', yearGanYang: true, lunarMonth: 1,
    };
    const ss = computeShensha(c);
    stat.n++;
    if (ss.some((x) => x.name === '童子煞')) stat.both++;
    if (ss.some((x) => x.name === '童子煞') && ss.find((x) => x.name === '童子煞')?.position) stat.dayOnly += 0;
  } catch (e) { /* skip */ }
}
console.log('样本', stat.n, '童子煞命中', stat.both, '命中率', (stat.both / stat.n * 100).toFixed(1) + '%');
