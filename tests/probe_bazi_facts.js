/**
 * 八字事实层探针 —— 用公开例题锚定新算法
 * 运行：node tests/probe_bazi_facts.js
 */
import {
  analyzeGan, analyzeZhi, changsheng, zizuo, xunkongOf,
  taiyuan, mingGong, shenGong, monthOrderOf,
} from '../src/core/relations.js';
import { computeShensha, SHENSHA_RULES } from '../src/core/shensha.js';
import { GAN, ZHI, indexOfGanzhi } from '../src/core/ganzhi.js';
import { build } from '../src/factpack.js';

let pass = 0, fail = 0;
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${name}  ${detail}`); }
};
const gi = (n) => GAN.indexOf(n);
const zi = (n) => ZHI.indexOf(n);
const SECTION = (s) => console.log(`\n【${s}】`);

// ============ 例题上下文 ============
// 例 A（来自 public 命理例）：辛亥 丁酉 丙午 癸巳
const A = {
  yearGanIndex: gi('辛'), yearZhiIndex: zi('亥'),
  monthZhiIndex: zi('酉'), monthGanIndex: gi('丁'),
  dayGanIndex: gi('丙'), dayZhiIndex: zi('午'),
  hourZhiIndex: zi('巳'), hourGanIndex: gi('癸'),
};
// 例 B：壬子 辛亥 壬戌 乙巳
const B = {
  yearGanIndex: gi('壬'), yearZhiIndex: zi('子'),
  monthZhiIndex: zi('亥'), monthGanIndex: gi('辛'),
  dayGanIndex: gi('壬'), dayZhiIndex: zi('戌'),
  hourZhiIndex: zi('巳'), hourGanIndex: gi('乙'),
};
// 例 C：乙未 辛巳 壬辰 壬寅（用于胎元）
const Cm = { monthGanIndex: gi('辛'), monthZhiIndex: zi('巳') };

SECTION('一、胎元 / 命宫 / 身宫（公开例题锚定）');
{
  const ty = taiyuan(Cm.monthGanIndex, Cm.monthZhiIndex);
  t('胎元：辛巳月 → 壬申', ty.name === '壬申', `实际 ${ty.name}`);

  const mg = mingGong(A.yearGanIndex, A.monthZhiIndex, A.hourZhiIndex);
  t('命宫：辛亥 丁酉 丙午 癸巳 → 辛卯', mg.name === '辛卯', `实际 ${mg.name}｜${mg.source}`);

  const sg = shenGong(B.yearGanIndex, B.monthZhiIndex, B.hourZhiIndex);
  t('身宫：壬子 辛亥 壬戌 乙巳 → 乙巳', sg.name === '乙巳', `实际 ${sg.name}｜${sg.source}`);

  // 边界：所有月序×时序组合，命宫结果必须落在 1..12 有效范围
  let bad = 0;
  for (let m = 0; m < 12; m++) {
    for (let h = 0; h < 12; h++) {
      const r = mingGong(0, m, h);
      if (r.zhiIndex < 0 || r.zhiIndex > 11) bad++;
      if (!r.source) bad++;
    }
  }
  t('命宫全组合无越界（144 组）', bad === 0, `异常 ${bad}`);

  let bad2 = 0;
  for (let m = 0; m < 12; m++) {
    for (let h = 0; h < 12; h++) {
      const r = shenGong(0, m, h);
      if (r.zhiIndex < 0 || r.zhiIndex > 11) bad2++;
    }
  }
  t('身宫全组合无越界（144 组）', bad2 === 0, `异常 ${bad2}`);

  // 月序映射自检：寅=1 丑=12
  t('月序映射 寅=1', monthOrderOf(zi('寅')) === 1);
  t('月序映射 子=11', monthOrderOf(zi('子')) === 11);
  t('月序映射 丑=12', monthOrderOf(zi('丑')) === 12);
}

SECTION('二、旬空');
{
  t('甲子旬 → 空戌亥', JSON.stringify(xunkongOf(0)) === JSON.stringify(['戌', '亥']), JSON.stringify(xunkongOf(0)));
  t('甲申旬 → 空午未', JSON.stringify(xunkongOf(20)) === JSON.stringify(['午', '未']), JSON.stringify(xunkongOf(20)));
  t('甲寅旬 → 空子丑', JSON.stringify(xunkongOf(50)) === JSON.stringify(['子', '丑']), JSON.stringify(xunkongOf(50)));
  const yiyou = indexOfGanzhi(gi('乙'), zi('酉'));
  t('乙酉日柱 → 空午未', JSON.stringify(xunkongOf(yiyou)) === JSON.stringify(['午', '未']), `index=${yiyou}`);
}

SECTION('三、十二长生 / 自坐');
{
  t('甲木长生在亥', changsheng(gi('甲'), zi('亥')).state === '长生');
  t('乙木长生在午', changsheng(gi('乙'), zi('午')).state === '长生');
  t('丙火长生在寅', changsheng(gi('丙'), zi('寅')).state === '长生');
  t('癸水长生在卯', changsheng(gi('癸'), zi('卯')).state === '长生');
  t('庚金帝旺在酉', changsheng(gi('庚'), zi('酉')).state === '帝旺');
  t('自坐：甲寅 → 临官', zizuo(gi('甲'), zi('寅')).state === '临官', zizuo(gi('甲'), zi('寅')).state);
  t('自坐：癸亥 → 帝旺', zizuo(gi('癸'), zi('亥')).state === '帝旺', zizuo(gi('癸'), zi('亥')).state);
  // 每个天干，十二长生十二态必须齐全
  let incomplete = 0;
  for (let gI = 0; gI < 10; gI++) {
    const seen = new Set();
    for (let zI = 0; zI < 12; zI++) seen.add(changsheng(gI, zI).state);
    if (seen.size !== 12) incomplete++;
  }
  t('十天干十二长生状态均齐全', incomplete === 0, `异常 ${incomplete}`);
}

SECTION('四、干支关系（真实盘 庚午 辛巳 乙酉 癸未）');
{
  const gans = [
    { key: 'year', label: '年', ganIndex: gi('庚') },
    { key: 'month', label: '月', ganIndex: gi('辛') },
    { key: 'day', label: '日', ganIndex: gi('乙') },
    { key: 'hour', label: '时', ganIndex: gi('癸') },
  ];
  const zhis = [
    { key: 'year', label: '年', zhiIndex: zi('午') },
    { key: 'month', label: '月', zhiIndex: zi('巳') },
    { key: 'day', label: '日', zhiIndex: zi('酉') },
    { key: 'hour', label: '时', zhiIndex: zi('未') },
  ];
  const gr = analyzeGan(gans);
  const zr = analyzeZhi(zhis);
  const names = (arr) => arr.map((x) => x.name);

  t('天干：乙庚合金成立', names(gr).some((n) => n.includes('乙庚合金')), names(gr).join('｜'));
  t('地支：巳酉半合金局', names(zr).some((n) => n.includes('半合') && n.includes('金')), names(zr).join('｜'));
  t('地支：午未六合成立', names(zr).some((n) => n.includes('午未合')), names(zr).join('｜'));
  t('每组关系都带溯源依据', [...gr, ...zr].every((x) => !!x.source), '');
  t('每组关系都带柱位标签', [...gr, ...zr].every((x) => Array.isArray(x.keys) && x.keys.length >= 2), '');

  // 三合全局检测
  const full = analyzeZhi([
    { key: 'year', label: '年', zhiIndex: zi('申') },
    { key: 'month', label: '月', zhiIndex: zi('子') },
    { key: 'day', label: '日', zhiIndex: zi('辰') },
    { key: 'hour', label: '时', zhiIndex: zi('午') },
  ]);
  t('申子辰全见 → 三合水局', names(full).some((n) => n.includes('申子辰三合水局')), names(full).join('｜'));
  // 六冲检测
  const chong = analyzeZhi([
    { key: 'year', label: '年', zhiIndex: zi('子') },
    { key: 'day', label: '日', zhiIndex: zi('午') },
  ]);
  t('子午六冲成立', names(chong).some((n) => n.includes('子午相冲')), names(chong).join('｜'));
  // 三刑检测
  const xing = analyzeZhi([
    { key: 'year', label: '年', zhiIndex: zi('寅') },
    { key: 'month', label: '月', zhiIndex: zi('巳') },
    { key: 'day', label: '日', zhiIndex: zi('申') },
  ]);
  t('寅巳申 → 无恩之刑', names(xing).some((n) => n.includes('无恩之刑')), names(xing).join('｜'));
  // 自刑必须是「同支重复」，不能两不同支互刑
  const sameZi = analyzeZhi([
    { key: 'year', label: '年', zhiIndex: zi('午') },
    { key: 'day', label: '日', zhiIndex: zi('午') },
  ]);
  t('午见午 → 自刑成立', names(sameZi).some((n) => n.includes('自刑')), names(sameZi).join('｜'));
  const diffZi = analyzeZhi([
    { key: 'year', label: '年', zhiIndex: zi('午') },
    { key: 'day', label: '日', zhiIndex: zi('酉') },
  ]);
  t('午与酉不得判为自刑', !names(diffZi).some((n) => n.includes('自刑')), names(diffZi).join('｜'));
  const ziMao = analyzeZhi([
    { key: 'year', label: '年', zhiIndex: zi('子') },
    { key: 'day', label: '日', zhiIndex: zi('卯') },
  ]);
  t('子卯 → 无礼之刑', names(ziMao).some((n) => n.includes('无礼之刑')), names(ziMao).join('｜'));
  const chouWeiXu = analyzeZhi([
    { key: 'year', label: '年', zhiIndex: zi('丑') },
    { key: 'month', label: '月', zhiIndex: zi('戌') },
    { key: 'day', label: '日', zhiIndex: zi('未') },
  ]);
  t('丑戌未 → 恃势之刑', names(chouWeiXu).some((n) => n.includes('恃势之刑')), names(chouWeiXu).join('｜'));
}

SECTION('五、神煞全表（30+ 项）');
{
  const ctx = {
    ...A,
    stems: { year: A.yearGanIndex, month: A.monthGanIndex, day: A.dayGanIndex, hour: A.hourGanIndex },
  };
  const list = computeShensha(ctx);
  const uniqueNames = new Set(list.map((x) => x.name));
  t('规则总数 ≥ 30', SHENSHA_RULES.length >= 30, `规则 ${SHENSHA_RULES.length} 条`);
  t('例 A 至少命中 2 项神煞', uniqueNames.size >= 2, [...uniqueNames].join('、'));
  t('神煞均带起法依据 source', list.every((x) => !!x.source), '');
  t('神煞均带位置标注 position', list.every((x) => !!x.position), '');
  t('神煞均带分类 cat', list.every((x) => ['吉', '凶', '中'].includes(x.cat)), '');

  // 定向校验：日干丙 → 文昌在申；此盘四支无申，故不应出现文昌
  t('定向：日干丙而四支无申 → 无文昌', !list.some((x) => x.name === '文昌贵人'),
    list.filter((x) => x.name === '文昌贵人').map((x) => x.position).join(','));
  // 定向：日支午 → 驿马：午属寅午戌组 → 申
  const mayou = list.find((x) => x.name === '驿马');
  t('定向：日支午 → 驿马在申（四支无申则不现）', !mayou || mayou.position !== '日支', mayou ? mayou.position : '未现');
}

SECTION('六、八字引擎事实层落地（1990-05-20 14:30 北京 男）');
{
  const fp = build(
    { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
    { useCache: false },
  );
  const f = fp.facts;
  const K4 = ['year', 'month', 'day', 'hour'];
  const pillarsText = K4.map((k) => f.fourPillars[k].name).join(' ');

  t('四柱仍为 庚午 辛巳 乙酉 癸未', pillarsText === '庚午 辛巳 乙酉 癸未', pillarsText);
  t('事实包校验无错误', (fp.meta.warnings || []).length === 0, JSON.stringify(fp.meta.warnings || []));
  t('产出干支关系 relations', Array.isArray(f.relations?.all) && f.relations.all.length > 0,
    f.relations ? `天干 ${f.relations.gan.length} 组 / 地支 ${f.relations.zhi.length} 组` : '缺失');
  t('旬空 = 午未', (f.xunkong || []).join('、') === '午、未', JSON.stringify(f.xunkong));
  t('旬空命中具体柱位', (f.xunkongPositions || []).length > 0, JSON.stringify(f.xunkongPositions));
  t('三垣齐备（胎元/命宫/身宫）',
    !!(f.taiyuan?.name && f.mingGong?.name && f.shenGong?.name),
    `胎元${f.taiyuan?.name} 命宫${f.mingGong?.name} 身宫${f.shenGong?.name}`);
  t('十二长生四柱齐全', K4.every((k) => f.changsheng?.[k]?.state), K4.map((k) => f.changsheng?.[k]?.state).join('/'));
  t('自坐四柱齐全', K4.every((k) => f.zizuo?.[k]?.state), K4.map((k) => f.zizuo?.[k]?.state).join('/'));
  t('神煞 ≥ 5 项', (f.shensha || []).length >= 5, (f.shensha || []).map((x) => x.name).join('、'));
  t('神煞均带起法依据', (f.shensha || []).every((x) => !!x.source), '');
  t('大运每步带命局互动 impact', (f.dayun?.steps || []).every((s) => s.impact && Array.isArray(s.impact.all)),
    `共 ${(f.dayun?.steps || []).length} 步`);
  t('流年每条带命局互动 impact', (f.liunian || []).every((n) => n.impact && Array.isArray(n.impact.all)),
    `共 ${(f.liunian || []).length} 年`);
  t('宫位六亲 4 项', Object.keys(f.palaces || {}).length === 4, Object.values(f.palaces || {}).map((x) => x.name).join('/'));
  t('命卦已产出', !!f.mingGua?.group, `${f.mingGua?.name || '—'} ${f.mingGua?.group || ''}`);

  // 关键：该盘巳午未三会火 + 巳酉半合金 必须被识别（这正是「有眼力的产品」该看见的）
  const names = (f.relations?.zhi || []).map((x) => x.name).join('｜');
  t('识别出 巳午未会南方火', names.includes('会南方火'), names);
  t('识别出 巳酉半合金局', names.includes('半合金局'), names);
  t('天干识别出 乙庚合金', (f.relations?.gan || []).map((x) => x.name).join('｜').includes('乙庚合金'),
    (f.relations?.gan || []).map((x) => x.name).join('｜'));
}

console.log(`\n———— 通过 ${pass} / 失败 ${fail} ————`);
process.exit(fail ? 1 : 0);
