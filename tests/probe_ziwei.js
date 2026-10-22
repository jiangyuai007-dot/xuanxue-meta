import { computeZiwei } from '../src/engines/ziwei.js';
import { ZIWEI_TABLE, ZIFU_MAP, PALACE_ORDER } from '../src/engines/ziwei.js';
import { ZHI } from '../src/core/ganzhi.js';

function zidx(n) { return ZHI.indexOf(n); }

// 找一个落在农历八月的日期（用于锚定"农历八月卯时→命宫午"）
import { toLunar } from '../src/core/lunar.js';
import { resolveDateTime } from '../src/core/time.js';

function findLunarMonth(targetMonth, year = 2024) {
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 28; d++) {
      const dt = resolveDateTime({ year, month: m, day: d, hour: 6, minute: 0, city: '北京' });
      const lu = toLunar(dt.jdSolar, 0);
      if (lu.month === targetMonth && !lu.isLeap) return { year, month: m, day: d, lu };
    }
  }
  return null;
}

const anchor = findLunarMonth(8);
console.log('锚定日期(农历八月卯时):', anchor);

const r = computeZiwei({ year: anchor.year, month: anchor.month, day: anchor.day, hour: 6, minute: 0, gender: 'male', city: '北京' });
console.log('农历:', r.lunar.yearGanzhi, r.lunar.month, '月', r.lunar.day, '日');
console.log('命宫:', r.mingGong.zhi, '身宫:', r.shenGong.zhi);
console.log('五行局:', r.wuXingJu.name, '紫微:', r.ziweiZhi, '天府:', r.tianfuZhi);
console.log('四化:', JSON.stringify(r.fourHua));

// 不变量检查
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ✗', name); } }

// 1) 命宫午（农历八月卯时）
check('命宫=午', r.mingGong.zhi === '午');
check('身宫=子', r.shenGong.zhi === '子');

// 2) 紫微落宫 = 查表
const tbl = ZIWEI_TABLE[r.wuXingJu.name][r.lunar.day - 1];
check('紫微落宫=查表', r.ziweiZhi === tbl);

// 3) 天府 = 紫府对照
check('天府=对照', ZIFU_MAP[r.ziweiZhi] === r.tianfuZhi);

// 4) 主星空档
const sp = r.starPositions;
const zi = zidx(r.ziweiZhi), tf = zidx(r.tianfuZhi);
check('天机=紫微逆1', sp['天机'] === (zi - 1 + 12) % 12);
check('太阳=紫微逆3', sp['太阳'] === (zi - 3 + 12) % 12);
check('武曲=紫微逆4', sp['武曲'] === (zi - 4 + 12) % 12);
check('天同=紫微逆5', sp['天同'] === (zi - 5 + 12) % 12);
check('廉贞=紫微逆8', sp['廉贞'] === (zi - 8 + 12) % 12);
check('太阴=天府顺1', sp['太阴'] === (tf + 1) % 12);
check('贪狼=天府顺2', sp['贪狼'] === (tf + 2) % 12);
check('巨门=天府顺3', sp['巨门'] === (tf + 3) % 12);
check('天相=天府顺4', sp['天相'] === (tf + 4) % 12);
check('天梁=天府顺5', sp['天梁'] === (tf + 5) % 12);
check('七杀=天府顺6', sp['七杀'] === (tf + 6) % 12);
check('破军=天府顺10', sp['破军'] === (tf + 10) % 12);

// 5) 十四主星互不相同（除紫微天府可能同宫），总数14
check('主星数量=14', Object.keys(sp).length === 14);

// 6) 十二宫各含星，命宫/身宫标记
let mingHas = false, shenHas = false;
for (const k of PALACE_ORDER) {
  const p = r.palaces[k];
  if (p.isMing) mingHas = p.zhi === r.mingGong.zhi;
  if (p.isShen) shenHas = p.zhi === r.shenGong.zhi;
}
check('命宫标记一致', mingHas);
check('身宫标记一致', shenHas);

// 7) 大限起运岁 = 局数
check('大限起运=局数', r.daXian[0].ageStart === r.wuXingJu.number);

console.log(`\n不变量检查: ${pass} 通过, ${fail} 失败`);
console.log('命宫主星:', r.palaces['命宫'].stars.map(s => s.name).join(' '));
console.log('财帛宫主星:', r.palaces['财帛宫'].stars.map(s => s.name).join(' '));
console.log('官禄宫主星:', r.palaces['官禄宫'].stars.map(s => s.name).join(' '));
console.log('DAXIAN:', r.daXian.slice(0, 4).map(d => `${d.zhi}${d.ageStart}-${d.ageEnd}`).join(' '));
process.exit(fail ? 1 : 0);
