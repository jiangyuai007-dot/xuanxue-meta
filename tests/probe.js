import { computeLiuyao, GUA_NAMES, TRIGRAM_LINES, NAJIA } from '../src/engines/liuyao.js';
import { computeQimen } from '../src/engines/qimen.js';
import { TRIGRAMS } from '../src/engines/liuyao.js';

console.log('=== 六爻：六十四卦完整性 ===');
let guaCount = 0;
for (const u of TRIGRAMS) {
  const row = GUA_NAMES[u];
  guaCount += row.length;
  if (row.length !== 8) console.log(`✗ ${u} 行长度 ${row.length}`);
}
console.log(`卦名表共 ${guaCount} 卦 ${guaCount === 64 ? '✓' : '✗'}`);

// 八宫生成校验：乾宫八世
const expectations = [
  ['乾', '乾', '乾为天'], ['乾', '巽', '天风姤'], ['乾', '坎', '天水讼'], ['乾', '坤', '天地否'],
  ['巽', '坤', '风地观'], ['艮', '坤', '山地剥'], ['离', '坤', '火地晋'], ['离', '乾', '火天大有'],
];
for (const [u, l, name] of expectations) {
  const got = GUA_NAMES[u][TRIGRAMS.indexOf(l)];
  console.log(`乾宫 ${u}/${l} -> ${got} ${got === name ? '✓' : '✗ 期望 ' + name}`);
}

console.log('\n=== 六爻：装卦 ===');
const ly = computeLiuyao({ year: 2026, month: 9, day: 22, hour: 10, minute: 30, city: '北京', category: 'career', question: '今年工作变动如何', method: 'time' });
console.log(`本卦: ${ly.benGua.name} (${ly.benGua.upper}上${ly.benGua.lower}下) 宫=${ly.benGua.gong} 五行=${ly.benGua.gongElement} ${ly.benGua.generation}`);
console.log(`变卦: ${ly.bianGua.name}  动爻: ${ly.dongYao.map((d) => d.position).join(',')}`);
console.log(`世: ${ly.shiYing.shiPosition}  应: ${ly.shiYing.yingPosition}`);
console.log(`月建: ${ly.yueJian.zhi}(${ly.yueJian.element}) 日辰: ${ly.riJian.ganzhi} 旬空: ${ly.xunkong.join('/')}`);
console.log(`用神: ${ly.yongshen} — ${ly.yongshenNote}`);
ly.lines.forEach((l) => {
  console.log(`  ${l.position} ${l.symbol} ${l.zhi}(${l.zhiElement}) ${l.liuqin} ${l.liushen} ${l.isShi ? '【世】' : ''}${l.isYing ? '【应】' : ''}${l.isDong ? '【动→' + (l.changed ? '阳' : '阴') + '】' : ''} ${l.wangshuai}${l.xunkong ? ' 空亡' : ''}`);
});

const ln = computeLiuyao({ year: 2026, month: 9, day: 22, hour: 10, city: '北京', method: 'number', numbers: [23, 88], category: 'wealth' });
console.log(`\n数字起卦(23,88): ${ln.benGua.name} → ${ln.bianGua.name} 动爻 ${ln.dongYao[0].position} 用神 ${ln.yongshen}`);

console.log('\n\n=== 奇门：排盘完整性 ===');
const qm = computeQimen({ year: 2026, month: 9, day: 22, hour: 10, minute: 30, city: '北京', purpose: 'career' });
console.log(`${qm.juName} ${qm.yuan} 节气=${qm.solarTerm} 旬首=${qm.xunShou}(${qm.xunShouYi})`);
console.log(`值符: ${qm.zhiFu.star}@${qm.zhiFu.palaceName}宫  值使: ${qm.zhiShi.door}@${qm.zhiShi.palaceName}宫`);
console.log(`日时: ${qm.pillars.ri.ganzhi} / ${qm.pillars.shi.ganzhi}  空亡 ${qm.kongWang.join('/')}  马星 ${qm.maXing.zhi}@${qm.maXing.palaceName}`);
console.log('\n宫  地盘 天盘 星    门    神    空亡 马星');
for (const p of qm.palaces) {
  console.log(`${p.id} ${p.name}  ${p.diPan}    ${p.tianPan || '-'}    ${p.star}${p.starExtra}  ${p.door || '-'}  ${p.shen || '-'}   ${p.kongWang ? '是' : ''}${p.maXing ? ' 是' : ''}`);
}

const checks = [];
const di = qm.palaces.map((p) => p.diPan);
const tp = qm.palaces.filter((p) => !p.isMiddle).map((p) => p.tianPan);
const st = qm.palaces.filter((p) => !p.isMiddle).map((p) => p.star);
const dr = qm.palaces.filter((p) => !p.isMiddle).map((p) => p.door);
const sh = qm.palaces.filter((p) => !p.isMiddle).map((p) => p.shen);
const uniq = (a) => new Set(a).size;
checks.push(['地盘三奇六仪 9 项不重复', uniq(di) === 9, uniq(di)]);
checks.push(['天盘干 8 项不重复', uniq(tp) === 8, uniq(tp)]);
checks.push(['九星 8 项不重复', uniq(st) === 8, uniq(st)]);
checks.push(['八门 8 项不重复', uniq(dr) === 8, uniq(dr)]);
checks.push(['八神 8 项不重复', uniq(sh) === 8, uniq(sh)]);
const zf = qm.palaces.find((p) => p.id === qm.zhiFu.palace);
checks.push(['值符宫天盘干=旬首仪', zf.tianPan === qm.xunShouYi, zf.tianPan + ' vs ' + qm.xunShouYi]);
checks.push(['值符宫神=值符', zf.shen === '值符', zf.shen]);
const zs = qm.palaces.find((p) => p.id === qm.zhiShi.palace);
checks.push(['值使宫门=值使门', zs.door === qm.zhiShi.door, zs.door + ' vs ' + qm.zhiShi.door]);
console.log('');
for (const [name, ok, extra] of checks) console.log(`${ok ? '✓' : '✗'} ${name}  (${extra})`);

console.log(`\n用神方位: ${qm.favorable.direction}（${qm.favorable.palaceName}宫 ${qm.favorable.door}）得分 ${qm.favorable.score}`);
console.log(`理由: ${qm.favorable.why.join('；')}`);

console.log('\n=== 奇门：多时辰稳定性（24 个时辰全排一遍）===');
let err = 0;
for (let h = 0; h < 24; h++) {
  try {
    const q = computeQimen({ year: 2026, month: 3, day: 15, hour: h, minute: 0, city: '上海', purpose: 'wealth' });
    const s = new Set(q.palaces.filter((p) => !p.isMiddle).map((p) => p.star));
    if (s.size !== 8) {
      console.log(`✗ ${h}时 星重复`);
      err++;
    }
  } catch (e) {
    console.log(`✗ ${h}时: ${e.message}`);
    err++;
  }
}
console.log(err === 0 ? '✓ 24 个时辰排盘均正常' : `✗ ${err} 处异常`);
