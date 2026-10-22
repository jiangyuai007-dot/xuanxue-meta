/**
 * 八字解读 —— 深度命书版
 *
 * 与旧版（模板要点罗列）的根本区别：
 *  1. 每段都是「推理链」：某干支 → 落在某宫 → 主某事 → 结合喜忌定吉凶 → 给出应对；
 *  2. 全部结论回溯到本盘真实数据（干支/十神/藏干/神煞/刑冲合会/长生/空亡），不写通用套话；
 *  3. 引据可核：调候取《穷通宝鉴》，格局取《子平真诠》，体用取《滴天髓》，岁运取《渊海子平》《三命通会》；
 *  4. 大运、流年逐运逐年展开，是全套报告里分量最重的两章。
 *
 * 铁律：倾向性描述，不作确定断言；医疗/投资类由合规网关二次把关。
 */

const KEYS = ['year', 'month', 'day', 'hour'];
const POS = { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' };

import { chengguDetailSection } from '../chengguDetail.js';
import { GONG_YI, SS_DEEP, SS_COMBO, CLASSIC, relYi, relGong, tiaohouOf } from './deep.js';

// ---------------------------------------------------------------- 基础工具

const safeList = (v) => (Array.isArray(v) ? v : []);
const pick = (arr, n) => safeList(arr).slice(0, n);
const joinCN = (arr, sep = '、') => safeList(arr).join(sep);
const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);

/** 十神在四个生活领域的指向（与 SS_DEEP.yun 的「行运心法」互补，不重复） */
const SS_FIELD = {
  比肩: '事业上宜结伴而行、忌独断专行；财务上与人合作须先小人后君子；人际上同辈往来增多；健康上总体平稳，重在作息规律',
  劫财: '事业上宜守成不宜扩张；财务上防透支与替人担保；人际上人情往来密集，账目须划清；健康上防应酬过度',
  食神: '事业上宜出作品、立口碑；财务上收入随技艺稳步上行；人际上气氛和顺；健康上宜规律饮食与作息',
  伤官: '事业上宜创新与表达，忌与上位硬碰；财务上忌冲动扩张；人际上言语须留三分；健康上防心火偏旺与睡眠不稳',
  偏财: '事业上机会面拓宽，宜广种薄收；财务上须设止盈线与储蓄纪律；人际上应酬增多；健康上防因忙生乱',
  正财: '事业上宜做长线布局；财务上收入趋稳，宜做资产沉淀；人际上重契约与承诺；健康上总体平稳',
  七杀: '事业上压力与机会同至；财务上宜留足应急金；人际上权责须分明；健康上防长期透支与意外磕碰',
  正官: '事业上宜在制度内争取晋升与评优；财务上以稳健为主；人际上重信誉守规则；健康上防长期过劳',
  偏印: '事业上宜研究与方法论沉淀；财务上不宜冒进；人际上易独处，须主动维系关系；健康上防思虑过度',
  正印: '事业上宜考证与系统性学习；财务上宜为教育与资质做投入；人际上多得长辈与机构助力；健康上总体向好',
};

/** 地支藏干（本气在前） */
const CANG = {
  子: ['癸'], 丑: ['己', '癸', '辛'], 寅: ['甲', '丙', '戊'], 卯: ['乙'],
  辰: ['戊', '乙', '癸'], 巳: ['丙', '戊', '庚'], 午: ['丁', '己'],
  未: ['己', '丁', '乙'], 申: ['庚', '壬', '戊'], 酉: ['辛'],
  戌: ['戊', '辛', '丁'], 亥: ['壬', '甲'],
};
const GAN_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const GAN_YANG = { 甲: 1, 乙: 0, 丙: 1, 丁: 0, 戊: 1, 己: 0, 庚: 1, 辛: 0, 壬: 1, 癸: 0 };
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE = { 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' };

/** 十神：以日主为「我」定目标干之十神 */
function shishenOf(dm, g) {
  if (!dm || !g) return '';
  const dw = GAN_WX[dm]; const gw = GAN_WX[g];
  const same = GAN_YANG[g] === GAN_YANG[dm];
  // 同五行：同干为比肩，异干必异阴阳 → 劫财（十天干中同五行者阴阳必相反）
  if (gw && gw === dw) return g === dm ? '比肩' : '劫财';
  if (SHENG[gw] === dw) return same ? '偏印' : '正印';   // 生我
  if (SHENG[dw] === gw) return same ? '食神' : '伤官';   // 我生
  if (KE[gw] === dw) return same ? '七杀' : '正官';      // 克我
  if (KE[dw] === gw) return same ? '偏财' : '正财';      // 我克
  return '';
}

/** 十神统计（天干除日主 + 各支藏干本气） */
function shishenStats(f) {
  const counter = {};
  for (const k of KEYS) {
    const p = f.fourPillars?.[k];
    if (!p) continue;
    if (k !== 'day' && p.shishen) counter[p.shishen] = (counter[p.shishen] || 0) + 1;
    for (const c of safeList(p.canggan)) {
      if (c.type === '本气' && c.shishen) counter[c.shishen] = (counter[c.shishen] || 0) + 1;
    }
  }
  return counter;
}

/** 截断到 n 字，去掉尾部残标点，避免「…，）」这类断句残骸 */
function clip(s, n = 26) {
  let t = String(s || '').replace(/[\s，、；：,;:。（(]+$/, '').trim();
  if (!t) return '';
  if (t.length <= n) return t;
  return t.slice(0, n).replace(/[\s，、；：,;:。（(]+$/, '') + '…';
}

/** 组合断语：去掉「命局构成「X」：」这类与前导标题重复的前缀 */
function comboText(x) {
  return String(x?.text || '').replace(/^命局构成「[^」]*」[：:]\s*/, '');
}

const topShishen = (f, n = 3) => Object.entries(shishenStats(f))
  .sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ name: k, n: v }));

const countSs = (f, name) => shishenStats(f)[name] || 0;

/** 十神组合判定用的计数包 */
function comboCounts(f) {
  const c = {};
  for (const [k, v] of Object.entries(shishenStats(f))) c[k] = v;
  const g = (n) => c[n] || 0;
  return {
    shishang: g('食神') + g('伤官'), cai: g('正财') + g('偏财'),
    qisha: g('七杀'), zhengguan: g('正官'), yin: g('正印') + g('偏印'),
    bijie: g('比肩') + g('劫财'), shishen: g('食神'), shangguan: g('伤官'),
    pianin: g('偏印'),
    weak: num(f.strength?.score) < 45,
  };
}

const hasSha = (f, name) => safeList(f.shensha).some((x) => x.name === name);
const relByType = (f, ...types) => safeList(f.relations?.all).filter((r) => types.includes(r.type));
const topRel = (f, n = 3) => pick(f.relations?.all, n);

function wxExtreme(f) {
  const pct = f.elementPercent || {};
  const entries = Object.entries(pct).filter(([, v]) => num(v) > 0);
  if (!entries.length) return { strong: null, weak: null };
  const sorted = entries.slice().sort((a, b) => num(b[1]) - num(a[1]));
  return {
    strong: { el: sorted[0][0], v: num(sorted[0][1]) },
    weak: { el: sorted[sorted.length - 1][0], v: num(sorted[sorted.length - 1][1]) },
  };
}

/** 当前所处大运 */
function currentDayun(f) {
  const y = new Date().getFullYear();
  const steps = safeList(f.dayun?.steps);
  return steps.find((s) => y >= num(s.fromYear) && y <= num(s.toYear))
    || steps.find((s) => s.order === 1) || null;
}

const isFav = (f, el) => safeList(f.yongshen?.favorable).includes(el);
const isUnfav = (f, el) => safeList(f.yongshen?.unfavorable).includes(el);

/** 五行喜忌判词 */
function favWord(f, el) {
  if (!el) return '';
  if (isFav(f, el)) return '（此行正为命局所喜，其力可得其正）';
  if (isUnfav(f, el)) return '（此行为命局所忌，其力宜防其偏）';
  return '（此行于命局不喜不忌，顺势即可）';
}

function compose({ summary, bullets = [], evidence = [], advice = [] }) {
  const parts = [summary.trim()];
  if (bullets.length) parts.push('【要点】\n' + bullets.map((b) => '· ' + b).join('\n'));
  if (evidence.length) parts.push('【依据溯源】\n' + evidence.map((e) => '· ' + e).join('\n'));
  if (advice.length) parts.push('【建议】\n' + advice.map((a) => '· ' + a).join('\n'));
  return parts.join('\n\n');
}

// ---------------------------------------------------------------- 章节定义

export const BAZI_CHAPTERS = [
  { key: 'mingju', title: '命局总论', locked: false },
  { key: 'geju', title: '格局用神', locked: false },
  { key: 'xingge', title: '性格禀赋', locked: true },
  { key: 'shiye', title: '事业官禄', locked: true },
  { key: 'caiyun', title: '财运理财', locked: true },
  { key: 'ganqing', title: '情感婚姻', locked: true },
  { key: 'qinyuan', title: '六亲人际', locked: true },
  { key: 'jiankang', title: '健康养生', locked: true },
  { key: 'chenggu', title: '称骨算命·白话详解', locked: true },
  { key: 'dayun', title: '大运十年详解', locked: true },
  { key: 'liunian', title: '流年逐年', locked: true },
];

// ---------------------------------------------------------------- 各章生成器

function chMingju(f) {
  const p = f.fourPillars;
  const dm = f.dayMaster;
  const st = f.strength || {};
  const wx = wxExtreme(f);
  const gz = KEYS.map((k) => p[k].name).join(' ');
  const monthZhi = p.month.zhi;
  const rels = topRel(f, 4);
  const th = tiaohouOf(dm.gan, monthZhi);
  const score = num(st.score);

  const summary = `这一份命书，先从「局」说起。您的四柱为「${gz}」：年柱${p.year.name}、月柱${p.month.name}、日柱${p.day.name}、时柱${p.hour.name}。`
    + `日主为${dm.gan}（${dm.element}${dm.yang ? '、阳' : '、阴'}），生于${monthZhi}月——月令是八字取用的提纲，一个人禀赋的底色，多半由这一支定下。`
    + `以子平之法，日主即是「您本人」，其余七个字是环绕您的资源、压力与牵绊；${score} 分（${st.level}）的强弱评分，说的是您与这七字之力相互角力时，整体处在${score >= 58 ? '偏能动的位置' : score < 42 ? '偏借力的位置' : '相对均衡的位置'}。`
    + `命局取「${f.pattern?.name || '—'}」，这是您一生反复要解的题；五行之中${wx.strong?.el || '—'}最旺（${wx.strong?.v || 0}%）、${wx.weak?.el || '—'}最弱（${wx.weak?.v || 0}%）——旺者是用得顺手的本能，弱者是要刻意补的功课。`
    + `故用神喜${joinCN(f.yongshen?.favorable)}、忌${joinCN(f.yongshen?.unfavorable)}。${CLASSIC.体用}`
    + `下面按「先看局、再论格、后看运」的顺序逐层展开，每一条都标注出处，便于您自行核验。`;

  const bullets = [
    rels.length
      ? `干支之间的互动，是这张盘最值得先看的地方：${pick(rels, 4).map((r) => {
        const yi = relYi(r);
        const g = relGong(r);
        const keys = safeList(r.keys).map((k) => POS[k] || k).join('·');
        return `${r.name}${keys ? `（${keys}）` : ''}：${yi}${g ? `　落在${g.pos}，${g.dong}` : ''}`;
      }).join('；')}。合处主牵绊与成全，冲处主动荡与更迭，刑处主纠缠与内耗——这几处基本框定了您人生起伏的节奏。`
      : '本命局干支之间冲合刑会较少，属于结构平顺的命式，吉凶更多由大运流年的引动来决定。',
    `日主${dm.gan}在四支中的能量曲线为：${KEYS.map((k) => `${POS[k]}${f.changsheng?.[k]?.state || '—'}`).join(' → ')}。这条曲线说明您在不同人生阶段、不同关系场里的能量水平并不一样：旺处敢打敢冲，衰处宜守宜养。`,
    f.xunkongPositions?.length
      ? `旬空在${joinCN(f.xunkong)}，且${joinCN(f.xunkongPositions)}落空亡——空亡之柱所主的宫位人事，传统认为有「有其名而减其力」的倾向：不是没有，而是力度打折、应事偏迟。`
      : `旬空在${joinCN(f.xunkong)}，四柱未直接落空，空亡的影响主要体现在对应宫位所主之事的减力。`,
    `三垣为胎元${f.taiyuan?.name || '—'}、命宫${f.mingGong?.name || '—'}、身宫${f.shenGong?.name || '—'}：胎元主禀赋根基，命宫主一生格局所归，身宫主后天作为与立身之处。三垣与四柱合参，才知「先天给了什么、后天往哪走」。`,
    th ? `月令${monthZhi}月，${dm.gan}日主按《穷通宝鉴》调候常法，宜${th}。${CLASSIC.调候}` : '',
  ].filter(Boolean);

  const evidence = [
    `四柱：${gz}（由出生年月日时经节气分界与真太阳时换算得出）`,
    `日主：${dm.gan}（${dm.element}${dm.yang ? '阳' : '阴'}）｜月令：${monthZhi}｜强弱：${score}（${st.level}）`,
    `强弱依据：${clip(joinCN(st.basis || []), 150)}`,
    `格局：${f.pattern?.name || '—'}｜${f.pattern?.basis || ''}`,
    `五行占比：${Object.entries(f.elementPercent || {}).map(([k, v]) => `${k}${v}%`).join('、')}`,
    rels.length ? `干支互动：${rels.map((r) => `${r.name}（${(r.labels || []).join('·')}）`).join('；')}` : '干支互动：本命局无显著冲合刑会',
    `三垣：胎元${f.taiyuan?.name || '—'}、命宫${f.mingGong?.name || '—'}、身宫${f.shenGong?.name || '—'}｜旬空：${joinCN(f.xunkong)}`,
  ];

  const advice = [
    '先做一次「核验」：把本章的日主强弱、格局与人生实际感受对照。吻合度越高，后面各章参考价值越大；若明显不符，多半是出生时辰或真太阳时有出入，建议核实时辰后重排。',
    `记住喜忌这一组字（喜${joinCN(f.yongshen?.favorable)}、忌${joinCN(f.yongshen?.unfavorable)}），后面事业、财运、健康各章的建议都围绕它展开。`,
  ];

  return { ...BAZI_CHAPTERS[0], text: compose({ summary, bullets, evidence, advice }) };
}

function chGeju(f) {
  const st = f.strength || {};
  const ys = f.yongshen || {};
  const p = f.fourPillars;
  const monthZhi = p.month.zhi;
  const dm = f.dayMaster.gan;
  const th = tiaohouOf(dm, monthZhi);
  const cang = safeList(p.month.canggan);
  const benQi = cang.find((c) => c.type === '本气');
  const touGan = KEYS.some((k) => k !== 'day' && p[k].gan === (benQi?.gan || ''));
  const broken = relByType(f, 'chong', 'xing');
  const wx = wxExtreme(f);

  const summary = `取格之法，先看月令。${CLASSIC.格局}`
    + `本命生于${monthZhi}月，月支本气为${benQi?.gan || '—'}，对日主${dm}而言是「${benQi?.shishen || '—'}」，故命局定「${f.pattern?.name || '—'}」——${f.pattern?.basis || ''}。`
    + `定格只是第一步，还要看这格局成不成：一看月令本气是否透出天干（${touGan ? `本气${benQi?.gan}已透干，格局有根` : `本气${benQi?.gan}未透干，格局之力藏而未显`}），二看是否被刑冲破害所伤（${broken.length ? `本局有${broken.length}处刑冲，格局完整性受到扰动` : '本局刑冲较少，格局结构相对完整'}）。`
    + `再论用神：日主${num(st.score)} 分（${st.level}），扶抑一路取${joinCN(ys.favorable)}为喜、${joinCN(ys.unfavorable)}为忌。`
    + `${th ? `同时，${monthZhi}月的${dm}日主，调候宜${th}——调候与扶抑并参，才是完整的取用。` : ''}`
    + `${CLASSIC.病药}`;

  const bullets = [
    `扶抑用神：${ys.basis || '—'}。落到取用上，${num(st.score) >= 58 ? '宜泄宜克，取食伤、财官为用' : num(st.score) < 42 ? '宜扶宜帮，取印绶、比劫为用' : '不宜大补大泄，以保持五行流通为要'}。`,
    th ? `调候用神：${monthZhi}月${dm}日主，《穷通宝鉴》取「${th}」。${CLASSIC.调候}调候解决的是命局的寒暖燥湿——气候不和，则五行虽全也难舒展，所以调候往往优先于扶抑。` : '',
    `成格与破格：一在月令本气是否透干有力，二在有无刑冲破害伤其体。${broken.length ? `本局刑冲所及为${broken.slice(0, 2).map((r) => r.name).join('、')}，其力会削弱格局的纯粹度，表现为「有能力但不易专注，或机会来了易被打断」。` : '本局格局结构完整，主思路清晰、行事少自相矛盾。'}`,
    `通关与病药：命局若两行对峙（如金木相战、水火交争），取中间一行和解，即为通关。${CLASSIC.通关}本局${wx.strong?.el || '—'}旺而${wx.weak?.el || '—'}弱${wx.weak?.el ? `，补${wx.weak.el}既是扶抑，也常常正是通关之法` : ''}。`,
    `十神结构：${topShishen(f, 4).map((x) => `${x.name}×${x.n}`).join('、')}。这组配比决定格局落在人生的哪个面上——官杀重则应在名分职位，财星重则应在经营取利，食伤重则应在才艺输出。`,
  ].filter(Boolean);

  const evidence = [
    `月支：${monthZhi}｜本气${benQi?.gan || '—'}（${benQi?.shishen || '—'}）｜藏干 ${cang.map((c) => `${c.gan}${c.type}`).join(' ')}`,
    `格局：${f.pattern?.name || '—'}｜${f.pattern?.basis || ''}`,
    `透干：${touGan ? `月令本气${benQi?.gan}透于天干` : `月令本气${benQi?.gan}未透干`}`,
    `强弱：${num(st.score)}（${st.level}）｜${clip(joinCN(st.basis || []), 140)}`,
    `用神：喜${joinCN(ys.favorable)}、忌${joinCN(ys.unfavorable)}`,
    `刑冲：${broken.length ? broken.map((r) => r.name).join('、') : '无显著刑冲'}`,
  ];

  const advice = [
    `喜用五行为${joinCN(ys.favorable)}：行业属性、常居方位、日常配色，都可往这一边靠，作为长期微调而非剧烈改变。`,
    '格局只定「框架」，能否兑现要看大运是否配合——务必与大运章节合看：命好不如运好，运与命合方见其功。',
  ];

  return { ...BAZI_CHAPTERS[1], text: compose({ summary, bullets, evidence, advice }) };
}

function chXingge(f) {
  const dm = f.dayMaster;
  const p = f.fourPillars;
  const top = topShishen(f, 3);
  const selfState = f.changsheng?.day?.state || '—';
  const dayZhiSha = safeList(f.shensha).filter((x) => x.position === '日支');
  const curve = KEYS.map((k) => f.changsheng?.[k]?.state || '—').join('→');
  const c = comboCounts(f);
  const combos = SS_COMBO.filter((x) => { try { return x.need(c); } catch { return false; } });
  const lead = top[0]?.name || '';
  const deep = SS_DEEP[lead] || {};

  const summary = `论性格，先把「出厂设置」摆清楚。您是${dm.gan}${dm.element}之人，生于${p.month.zhi}月，日支坐${p.day.zhi}（自坐${f.zizuo?.day?.state || '—'}）。`
    + `四支给出的能量曲线是 ${curve}——这条线说明您并非一味地强或一味地弱，而是在不同场合、不同关系里呈现不同能量水平：得地之时敢冲敢担，失地之时宜守宜养。`
    + `命中最有力的三种力量是${top.map((x) => `${x.name}（${x.n}现）`).join('、')}，主导者是「${lead}」——${deep.xing || ''}。`
    + `${deep.shi ? `落到人事上，${lead}${deep.shi}。` : ''}`
    + `下面按「主导—辅助—内耗」三层拆开，再谈神煞与刑冲对性情的加减。`;

  const bullets = [
    `主导特质（${lead}）：${deep.xing || '—'}。${deep.shi ? `此十神${deep.shi}。` : ''}这是您最本能的反应方式，顺之则省力，逆之则拧巴。`,
    top[1] ? `辅助特质（${top[1].name}）：${SS_DEEP[top[1].name]?.xing || '—'}。它是主导力量的配角，在主导受挫时会顶上来，是您的第二套方案。` : '第二十神力量不强，行事风格相对专注单一——好处是聚焦，代价是弹性偏小。',
    top[2] ? `内在消耗（${top[2].name}）：${SS_DEEP[top[2].name]?.xing || '—'}。这一层提示「什么最耗您」，看清它才好在日常安排里留缓冲，而不是靠意志硬扛。` : '消耗型十神不显著，内耗较少，属于想清楚就做得动的类型。',
    combos.length ? `性情组合：${combos.slice(0, 2).map((x) => `${x.name}——${comboText(x)}`).join('　')}` : '',
    dayZhiSha.length
      ? `心性相关神煞（落在日支，最切己）：${dayZhiSha.slice(0, 4).map((x) => `${x.name}（${clip(x.desc, 22)}）`).join('；')}。神煞是加减项，不改变格局主体，只影响性情的色调。`
      : '日支无显著神煞，表里较为如一，少有「外人看不透」的反差。',
    (selfState === '帝旺' || selfState === '临官')
      ? `日主自坐${selfState}之地：自我意识较强，独立与主见突出，是能扛事的人；需要注意的是，强者的盲点常在「不听劝」，宜刻意留一个敢说真话的人在身边。`
      : ((selfState === '绝' || selfState === '墓' || selfState === '死')
        ? `日主自坐${selfState}之地：容易有阶段性低迷，但这不等于能力不足——您的反弹韧性多半来自后天积累与方法论，而非靠先天精力硬撑，所以「养」比「拼」更重要。`
        : `日主自坐${selfState}之地：精力起伏不大，稳定性是您的优势，适合长期主义的活法。`),
    relByType(f, 'chong').length
      ? `刑冲对性情的影响：命局有${relByType(f, 'chong').slice(0, 2).map((r) => r.name).join('、')}，冲处主动——这类结构的人往往反应快、耐不住静止，好处是行动力强，代价是容易在变动里消耗。`
      : '命局无显著冲刑，性情相对稳定；但也要留意「过于求稳」可能带来的迟滞。',
  ].filter(Boolean);

  const evidence = [
    `日主：${dm.gan}（${dm.element}${dm.yang ? '阳' : '阴'}）｜日柱：${p.day.name}｜自坐：${f.zizuo?.day?.state || '—'}`,
    `十二长生曲线：${KEYS.map((k) => `${POS[k]}${f.changsheng?.[k]?.state || '—'}`).join('、')}`,
    `十神结构：${topShishen(f, 5).map((x) => `${x.name}×${x.n}`).join('、')}`,
    `月干十神：${p.month.shishen}｜时干十神：${p.hour.shishen}`,
    `日支藏干：${safeList(p.day.canggan).map((x) => `${x.gan}（${x.shishen}）`).join('、') || '—'}`,
    `命中神煞：${safeList(f.shensha).map((x) => `${x.name}@${x.position}`).join('、') || '—'}`,
  ];

  const advice = [
    `把主导十神（${lead}）用在匹配的场景里，比强行改正更有效${deep.yun ? `：${deep.yun}。` : '。'}`,
    '消耗型十神提示的是「什么最耗您」——在日程设计里给它留缓冲，比靠意志力硬扛更可持续。',
  ];

  return { ...BAZI_CHAPTERS[2], text: compose({ summary, bullets, evidence, advice }) };
}

function chShiye(f) {
  const p = f.fourPillars;
  const guan = countSs(f, '正官') + countSs(f, '七杀');
  const yin = countSs(f, '正印') + countSs(f, '偏印');
  const shishang = countSs(f, '食神') + countSs(f, '伤官');
  const cai = countSs(f, '正财') + countSs(f, '偏财');
  const cur = currentDayun(f);
  const steps = safeList(f.dayun?.steps);
  const c = comboCounts(f);
  const combos = SS_COMBO.filter((x) => { try { return x.need(c); } catch { return false; } });

  const summary = `论事业，子平之法先看四组力量的配比：官杀主名分与职位，印绶主学识与靠山，食伤主输出与专业，财星主经营与资源。`
    + `本命官杀 ${guan}、印绶 ${yin}、食伤 ${shishang}、财星 ${cai}——这组数字说的是您的位置感、背书、本事与资源各占多少。`
    + `月柱${p.month.name}为事业根基宫（古称「门户」），月干${p.month.shishen}坐${p.month.zhi}，其配置是理解职业路径的第一线索。`
    + `${combos.length ? `更关键的是，本命构成「${combos[0].name}」——${comboText(combos[0])}` : ''}`
    + `下面按「配比—路径—运程—行业」四层展开。`;

  const bullets = [
    guan >= 2
      ? `官杀有力（${guan}现）：适合在层级清晰、权责明确的组织里发展，抗压能力是实打实的优势。但要留意「过度承担」——官杀重的人容易把别人的责任也扛过来，宜给职责划硬边界。`
      : `官杀不重（${guan}现）：更适合扁平、自由度高的环境，靠专业与作品取胜，而非靠职级硬爬。`,
    yin >= 2
      ? `印绶有份量（${yin}现）：学历、资质、师长提携对您是真实加成，宜持续做系统性学习投入，证书与科班路径含金量高。`
      : `印绶不重（${yin}现）：自学与实战积累比科班路径更重要，宜边做边总结方法论，把经验变成可复用的东西。`,
    shishang >= 2
      ? `食伤有力（${shishang}现）：适合创作、咨询、教学、技术研发等「以输出换回报」的方向。您的价值要被看见就得有作品，所以「产出」比「资历」更能定义您。`
      : `食伤偏弱（${shishang}现）：输出与表达需要刻意练习，否则容易被低估——宜主动争取汇报、发表、授课一类能见度高的场合。`,
    cai >= 2 ? `财星有力（${cai}现）：有经营与整合资源的天赋；若能配上专业（食伤生财）或名分（财官相生），事业上限会被明显抬高。` : '',
    combos.length > 1 ? `其他组合：${combos.slice(1, 3).map((x) => `${x.name}——${clip(comboText(x), 56)}`).join('；')}` : '',
    cur ? `当前大运「${cur.name}」（${cur.shishen}，${cur.fromYear}–${cur.toYear}）：${SS_DEEP[cur.shishen]?.yun || ''}。这一步运是您眼下十年的主旋律，重大决策宜顺着它的性质做，而非逆着来。` : '',
  ].filter(Boolean);

  const evidence = [
    `十神配比：官杀 ${guan}／印绶 ${yin}／食伤 ${shishang}／财星 ${cai}（含藏干本气）`,
    `月柱 ${p.month.name}：${p.month.shishen}坐${p.month.zhi}，藏 ${safeList(p.month.canggan).map((x) => x.gan).join('、')}`,
    `格局：${f.pattern?.name || '—'}｜${f.pattern?.basis || ''}`,
    `用神：喜${joinCN(f.yongshen?.favorable)}、忌${joinCN(f.yongshen?.unfavorable)}`,
    cur ? `当前大运：${cur.name}（${cur.startAge}–${cur.startAge + 9} 岁，${cur.fromYear}–${cur.toYear}）` : '大运未确定',
  ];

  const upYears = steps.filter((s) => ['正官', '七杀', '正印', '偏印', '食神', '正财', '偏财'].includes(s.shishen)).slice(0, 4);
  const advice = [
    upYears.length
      ? `相对有利的运程窗口：${upYears.map((s) => `${s.fromYear}–${s.toYear}（${s.name}·${s.shishen}）`).join('；')}。跳槽、创业、考证、争取晋升，宜优先在这些窗口里评估与出手。`
      : '大运中官印食伤力量不突出，事业推进更依赖主动规划与技能积累，而非运势推动。',
    `行业五行：优先${joinCN(f.yongshen?.favorable)}属性行业；其次是能补足最弱五行（${wxExtreme(f).weak?.el || '—'}）的岗位属性。`,
    '本章为传统文化视角下的事业倾向分析，具体择业与经营决策请以现实条件与专业意见为准。',
  ];

  return { ...BAZI_CHAPTERS[3], text: compose({ summary, bullets, evidence, advice }) };
}

function chCaiyun(f) {
  const cai = countSs(f, '正财') + countSs(f, '偏财');
  const bijie = countSs(f, '比肩') + countSs(f, '劫财');
  const p = f.fourPillars;
  const st = f.strength || {};
  const score = num(st.score);
  const cangWithCai = KEYS.filter((k) => safeList(p[k].canggan).some((x) => ['正财', '偏财'].includes(x.shishen)));
  const cur = currentDayun(f);
  const c = comboCounts(f);
  const combos = SS_COMBO.filter((x) => { try { return x.need(c); } catch { return false; } });
  const curWx = cur ? GAN_WX[(cur.name || '')[0]] : '';

  const summary = `论财，传统子平看四件事：财星有无、财星强弱、日主能否担得起、财有无库藏。`
    + `本命财星 ${cai} 现，比劫 ${bijie} 现，日主强弱 ${score} 分（${st.level}）——担财能力是这一章的关键：`
    + `${score >= 55 ? '日主有力，能担得住财，机会来了接得住' : score < 42 ? '日主偏弱，财多则担不动，宜先补「担财之力」（专业深度、团队、资历），再谈扩张' : '日主中和，财运以稳健积累为主，量入为出最宜'}。`
    + `${cangWithCai.length ? `此外，${cangWithCai.map((k) => POS[k]).join('、')}支中藏有财星，属「不显山露水的暗财」，这类财宜长持而不宜短炒。` : ''}`
    + `${combos.length ? `结构上，本命见「${combos[0].name}」——${comboText(combos[0])}` : ''}`
    + `下面按「财源—担财—风险—运程」四层说清。`;

  const bullets = [
    cai === 0
      ? '命局无明显财星：不易依赖被动收入，财富主要来自主动经营与专业能力变现——这其实是最可控的一种结构，因为收入与投入直接挂钩。'
      : (cai >= 3
        ? `财星偏旺（${cai}现）：赚钱机会多、财源广，但也意味着钱财流动快。${score < 50 ? '更关键的是日主偏弱，财旺身弱则「看得见拿不稳」，宜先把能力与团队做厚，再接大机会。' : '宜建立强制储蓄与资产沉淀机制，把流水变成存量。'}`
        : `财星中和（${cai}现）：收入路径清晰，量入为出即可维持稳定增长，不缺机会也不至于被机会冲散。`),
    (bijie >= 2 && cai >= 1)
      ? `比劫与财星同时有力（比劫 ${bijie}／财星 ${cai}）：传统视为「财来财去」的结构——钱财容易在人情、合伙、担保中被分摊。合伙与担保类事务宜格外审慎，账目权责务必书面化。`
      : `比劫不重（${bijie}现）：独立核算、自行支配资金的结构更适合您，财务边界清晰是您的优势。`,
    cangWithCai.length
      ? `藏财在${cangWithCai.map((k) => POS[k]).join('、')}：有暗财，适合长期持有型资产（房产、养老、指数化配置）而非短线操作——暗财的特点是慢、稳、久。`
      : '无明显藏财：收益更依赖明确的劳动与报酬关系，宜把精力放在提升单位时间价值上。',
    cur ? `当前大运「${cur.name}」（${cur.shishen}）：${SS_DEEP[cur.shishen]?.yun || ''}。此运干属${curWx || '—'}，${favWord(f, curWx)}财运节奏受此运主导，资产配置宜与该运性质匹配。` : '',
    `担财能力与现实对应：${score >= 55 ? '您可以在机会期适度进取（如置产、扩大经营），但要设好止损线。' : score < 42 ? '宜先做「能力—资历—团队」的积累期投入，扩张动作宜小步试错，忌一次性重仓。' : '宜稳健：「收入—储蓄—投资」的自动分流规则，比任何择时都管用。'}`,
  ].filter(Boolean);

  const evidence = [
    `财星计数：${cai}（正财 ${countSs(f, '正财')}／偏财 ${countSs(f, '偏财')}）｜比劫计数：${bijie}`,
    `藏财位置：${cangWithCai.map((k) => `${POS[k]}(${p[k].zhi})`).join('、') || '无'}`,
    `日主强弱：${st.level || '—'}（${score} 分）——担财能力的直接依据`,
    `用神：喜${joinCN(f.yongshen?.favorable)}、忌${joinCN(f.yongshen?.unfavorable)}`,
    cur ? `当前大运：${cur.name}（${cur.shishen}，${cur.fromYear}–${cur.toYear}）` : '',
  ].filter(Boolean);

  const advice = [
    (bijie >= 2 && cai >= 1)
      ? '避免与亲友产生模糊借贷；合作前书面约定出资、分工与退出机制——这不是生分，是让关系长久。'
      : '建立「收入—储蓄—投资」的自动分流规则，减少一次性大额决策的频率；大额决策前设 48 小时冷静期。',
    '本章为传统命理视角下的财富倾向分析，不构成任何投资建议；具体理财与投资决策请咨询持牌专业机构。',
  ];

  return { ...BAZI_CHAPTERS[4], text: compose({ summary, bullets, evidence, advice }) };
}

function describeSpouse(ten) {
  const MAP = {
    正财: '配偶宫坐正财：传统认为配偶务实顾家、重实际，关系稳定但需避免过于功利化沟通。',
    偏财: '配偶宫坐偏财：对方多半灵活外向、资源能力较强，关系活跃度高于稳定度，宜共建财务规则。',
    正官: '配偶宫坐正官：对方偏重规则与责任感，关系中有「互相成就」的结构，宜给彼此明确的角色分工。',
    七杀: '配偶宫坐七杀：对方个性强、有主见，相处中宜分工明确、避免正面相撞——强势配强势，最怕的是谁也不让。',
    食神: '配偶宫坐食神：关系氛围温和，重生活情趣与陪伴，宜一起经营具体的日常，感情在细节里长。',
    伤官: '配偶宫坐伤官：彼此表达直接，需注意言语锋利度的管理——伤官在夫妻宫，最宜「先听后说」。',
    比肩: '配偶宫坐比肩：双方独立性都强，宜保持各自空间并共建共同目标，亲密而有间是此格的答案。',
    劫财: '配偶宫坐劫财：经济边界要提前厘清，独立账户与共同账户分开更稳，财务透明是关系的保险。',
    正印: '配偶宫坐正印：对方包容度高、善于照顾，注意避免过度依赖——被照顾久了，容易忘了回应。',
    偏印: '配偶宫坐偏印：彼此精神共鸣重要，但需防范过度理想化对方，宜在共同事务里检验感情。',
  };
  return MAP[ten] || `配偶宫本气为${ten}，性情倾向需结合全局十神综合判断——单看一柱只能定色调，不能定全貌。`;
}

function chGanqing(f) {
  const p = f.fourPillars;
  const dayCang = safeList(p.day.canggan);
  const spouseTen = dayCang.length ? dayCang[0].shishen : '—';
  const dayZhi = p.day.zhi;
  const dm = f.dayMaster.gan;
  const spouseStar = GAN_YANG[dm] ? '财星（妻财）' : '官杀（官鬼）';
  const hasTaoHua = hasSha(f, '桃花') || hasSha(f, '墙内桃花');
  const hasHongLuan = hasSha(f, '红鸾');
  const hasChacuo = hasSha(f, '阴阳差错');
  const hasLiuE = hasSha(f, '六厄');
  const hasGouSha = hasSha(f, '勾煞');
  const rels = relByType(f, 'chong', 'xing', 'hai').filter((r) => (r.keys || []).includes('day'));
  const cur = currentDayun(f);
  const selfCs = f.changsheng?.day?.state || '—';

  const summary = `论婚姻，传统看两处：一是「星」（配偶星），二是「宫」（日支夫妻宫），星宫合参才能定论。${CLASSIC.夫妻}`
    + `本命日柱${p.day.name}，日支${dayZhi}即夫妻宫，其中所藏为${dayCang.map((x) => `${x.gan}（${x.shishen}）`).join('、') || '无'}，本气为「${spouseTen}」——这是配偶性情与关系结构的第一手信息。`
    + `以日主${dm}（${GAN_YANG[dm] ? '阳' : '阴'}干）论，配偶星看${spouseStar}。`
    + `${rels.length ? `更要紧的是，夫妻宫被${rels.map((r) => r.name).join('、')}所扰——冲则多变、合则牵绊、刑则内耗，这几处往往是关系中摩擦点的来源。` : '夫妻宫未见刑冲，关系结构相对稳定，主要课题来自日常经营，而非结构性冲突。'}`
    + `下面按「宫—星—神煞—运程」四层展开。`;

  const bullets = [
    `${describeSpouse(spouseTen)}这是从宫位直接读出的信息，也是全章最硬的一条依据。`,
    rels.length
      ? `夫妻宫受扰：${rels.map((r) => `${r.name}（${(r.labels || []).join('·')}）`).join('、')}。传统认为冲主动、刑主缠、害主暗损，对应的多是聚散、聚少离多或沟通中的隐性摩擦——以机制化解（约定决策流程、冲突冷却期）比回避更有效。`
      : '夫妻宫无冲刑：关系结构平稳，课题多在日常经营，宜把精力放在共同事务与沟通质量上。',
    hasTaoHua ? '命带桃花：异性缘与人缘较旺，魅力是关系的资产，同时需要清晰的边界感——桃花旺者最忌「暧昧不清」。' : '命局桃花不显：感情更多从长期相处与共同事务中自然生长，宜在共事中发现人，而非靠一见之缘。',
    hasHongLuan ? '命带红鸾：婚恋喜庆之事有天然助力，容易在合适的时机成事——红鸾主「顺」，顺境里的感情宜及时把握。' : '',
    hasChacuo ? '日柱带阴阳差错：传统认为婚姻家事易有周折。重点不在结果注定，而在相处模式要更主动经营（如婚前把财务、居住、长辈照料等议题谈透）。' : '',
    hasLiuE ? '命带六厄：主运途蹇滞、事多阻厄，关系中易有「明明想好好过却总被事打断」的体感，宜留出专门的相处时间，别让事务挤掉关系。' : '',
    hasGouSha ? '命带勾煞：主牵连纠缠，关系中宜把责任与边界说清楚，避免「说不清是谁的事」带来的消耗。' : '',
    `日支${dayZhi}于日主为「${selfCs}」之地，这决定您在亲密关系里的能量投放方式——${(selfCs === '帝旺' || selfCs === '临官') ? '投入度高、主导性强，宜给对方留出空间' : ((selfCs === '绝' || selfCs === '墓' || selfCs === '死') ? '投入偏保守或有阶段性低迷，宜主动表达而非等对方来猜' : '投入平稳，细水长流是其优势')}。`,
    cur ? `当前大运「${cur.name}」（${cur.shishen}）：${SS_DEEP[cur.shishen]?.yun || ''}。大运引动夫妻宫的年份（详见流年章节）通常是关系中的关键节点。` : '',
  ].filter(Boolean);

  const evidence = [
    `日柱 ${p.day.name}｜日支${dayZhi}藏干：${dayCang.map((x) => `${x.gan}(${x.type}/${x.shishen})`).join('、') || '—'}`,
    `配偶星：以日主${dm}论，${spouseStar}为配偶星`,
    `时柱 ${p.hour.name}（子女宫）：${p.hour.shishen}`,
    rels.length ? `刑冲害关系：${rels.map((r) => `${r.name}｜${(r.labels || []).join('·')}`).join('；')}` : '刑冲关系：夫妻宫无冲刑',
    `神煞：${safeList(f.shensha).filter((x) => ['桃花', '墙内桃花', '红鸾', '阴阳差错', '六厄', '勾煞', '孤辰', '寡宿'].includes(x.name)).map((x) => `${x.name}@${x.position}`).join('、') || '无显著婚恋神煞'}`,
  ];

  const advice = [
    '关系问题的解法在沟通结构，而非性格改造：约定决策流程、冲突冷却期、财务边界三条规则，比反复讨论有效得多。',
    '本章为传统文化视角下的关系倾向分析，不作为婚恋决策依据；现实关系请以彼此沟通与实际相处为准。',
  ];

  return { ...BAZI_CHAPTERS[5], text: compose({ summary, bullets, evidence, advice }) };
}

const SS_DESC = {
  比肩: '独立、自我驱动，习惯亲力亲为', 劫财: '行动快、重情谊，出手大方',
  食神: '温和、有审美与创造力', 伤官: '敏锐、表达欲强，喜突破规则',
  偏财: '灵活、资源整合力强', 正财: '务实、讲信用，擅积累',
  七杀: '果断、抗压，逆境中成长', 正官: '守规矩、重名誉',
  偏印: '思维跳跃、自学力强', 正印: '厚道、学习系统性强',
};

function chQinyuan(f) {
  const p = f.fourPillars;
  const rels = relByType(f, 'chong', 'hai', 'xing');

  const summary = `四柱本身就是一张六亲宫位图。${CLASSIC.六亲}`
    + `判断某一宫位的亲缘状态，传统用两步：一看宫位干支及其十神是否得力（得力则亲缘有助，失力则助力有限），二看该宫是否被刑冲（被冲则多变动，被合则多牵绊）。`
    + `下面逐宫说明，每宫给出「宫位含义—干支十神—有无刑冲—相处要点」四层，便于您对应到具体的人与事。`;

  const bullets = KEYS.map((k) => {
    const x = p[k];
    const g = GONG_YI[k];
    const affected = rels.filter((r) => (r.keys || []).includes(k));
    const cangTxt = safeList(x.canggan).map((c) => c.gan).join('') || '无';
    const ten = k === 'day' ? '日主本人' : x.shishen;
    const base = `${g.pos}（${x.name}）主${g.scope}：本宫天干十神为${ten}${k !== 'day' ? `（${SS_DESC[ten] || ''}）` : ''}，支藏 ${cangTxt}。`;
    const tail = affected.length
      ? `本宫被${affected.map((r) => r.name).join('、')}所引动——${g.dong}，这一类亲缘关系易有波动、聚少离多，或需要更多主动沟通来维持。`
      : `本宫无冲刑：${g.scope}这一块少有外力扰动，${k === 'day' ? '自身与配偶之间的稳定度较高，是四柱里最经得起长期经营的一柱' : `${ten}坐于此宫，相处中${SS_DEEP[ten]?.xing || '基调平和、少生枝节'}`}。宜保持稳定联系频率，别等有事才走动。`;
    return base + tail;
  });

  const advice = [
    '六亲关系的改善路径是「降低期待＋提高沟通频率」，而不是等待运势转好——运势只提供气候，关系靠日常浇灌。',
    '刑冲所在宫位提示的是课题所在：年柱多主与长辈的观念差异，月柱多主手足或同事协作，日柱多主夫妻相处，时柱多主与晚辈的相处方式。对号入座，才好对症下药。',
  ];

  const evidence = [
    `宫位十神：${KEYS.map((k) => `${POS[k]}${k === 'day' ? '日主' : p[k].shishen}`).join('、')}`,
    rels.length ? `刑冲害关系：${rels.map((r) => `${r.name}（${(r.labels || []).join('·')}）`).join('；')}` : '刑冲害关系：无',
    `神煞涉及六亲者：${safeList(f.shensha).filter((x) => ['孤辰', '寡宿', '天乙贵人', '太极贵人', '月德贵人', '天德贵人'].includes(x.name)).map((x) => `${x.name}@${x.position}`).join('、') || '—'}`,
  ];

  return { ...BAZI_CHAPTERS[6], text: compose({ summary, bullets: bullets.filter(Boolean), evidence, advice }) };
}

const ORGAN_NOTE = {
  木: '木属肝胆、筋骨与眼睛，木气失衡者易有筋骨紧张与用眼过度的倾向',
  火: '火属心与小肠、血脉循环，火气偏盛者需留意作息规律、情绪管理与心血管负荷',
  土: '土属脾胃与肌肉，土虚或土壅者常见消化与饮食节律的问题',
  金: '金属肺与大肠、皮毛，金气偏枯或过旺者需留意呼吸道与季节交替时的不适',
  水: '水属肾与膀胱、内分泌代谢，水弱者传统认为精力储备与恢复力需要刻意维护',
};

function chJiankang(f) {
  const wx = wxExtreme(f);
  const dm = f.dayMaster;
  const monthZhi = f.fourPillars.month.zhi;
  const selfCs = f.changsheng?.day?.state || '—';
  const zizuo = f.zizuo?.day?.state || '—';
  const th = tiaohouOf(dm.gan, monthZhi);
  const hasBingFu = hasSha(f, '病符');
  const hasTianXing = hasSha(f, '天刑煞');

  const summary = `传统命理谈健康，用的是「五行平衡」的视角：某一行过旺或过弱，对应系统的负荷就会相对偏大。${CLASSIC.养生}`
    + `本命五行中${wx.strong?.el || '—'}最旺（${wx.strong?.v || 0}%）、${wx.weak?.el || '—'}最弱（${wx.weak?.v || 0}%），这两端就是需要重点关照的地方。`
    + `日主${dm.gan}${dm.element}，自坐${zizuo}，日支对日主为「${selfCs}」之地——先天精力基线由此往外推。`
    + `${th ? `又生于${monthZhi}月，调候宜${th}，寒暖燥湿的偏向本身就是养生方向的提示。` : ''}`
    + `需要说明的是：以下只是传统文化视角下的倾向提示，不能替代医学检查与诊断。`;

  const bullets = [
    wx.strong?.el ? `${wx.strong.el}偏旺（${wx.strong.v}%）：${ORGAN_NOTE[wx.strong.el]}。过旺的一行往往是「用得太多」的那一项，宜在生活方式上给它减负。` : '五行分布均衡，无显著偏旺之项。',
    wx.weak?.el ? `${wx.weak.el}偏弱（${wx.weak.v}%）：${ORGAN_NOTE[wx.weak.el]}。偏弱的一行是「先天储备不足」之处，宜有意识地养。` : '五行分布均衡，无显著偏弱之项。',
    `日主状态：自坐${zizuo}、日支为日主之${selfCs}。${(selfCs === '帝旺' || selfCs === '临官') ? '精力基线偏高，能扛但容易透支而不自知，宜设「休息红线」。' : ((selfCs === '绝' || selfCs === '墓' || selfCs === '死') ? '精力基线偏低，宜把「养」当成日常工程：规律作息优于任何补品。' : '精力基线平稳，重在维持节律不被打乱。')}`,
    th ? `月令调候（${monthZhi}月${dm.gan}日主宜${th}）：调候不仅关乎命局，也是体质的提示——寒者宜温、燥者宜润，饮食与起居可据此做长期微调。` : '',
    hasBingFu ? '命带病符：传统提示小病小痛偏多、恢复偏慢，宜把年度体检固定下来，别等有症状才检查。' : '',
    hasTianXing ? '命带天刑煞：传统提示注意磕碰与意外损伤，运动宜充分热身，出行与操作机械时多一分谨慎。' : '',
  ].filter(Boolean);

  const advice = [
    '最有效的三件事：固定作息、稳定饮食节律、每周有氧运动三次以上——其效果远大于任何补品或偏方。',
    '⚠ 本章为传统文化视角下的养生倾向提示，不是医疗诊断，不能替代医生；任何身体不适请前往正规医疗机构就诊，体检与筛查请遵医嘱。',
  ];

  const evidence = [
    `五行占比：${Object.entries(f.elementPercent || {}).map(([k, v]) => `${k}${v}%`).join('、')}`,
    `日主：${dm.gan}${dm.element}｜自坐：${zizuo}｜日支长生：${selfCs}`,
    `十二长生：${KEYS.map((k) => `${POS[k]}${f.changsheng?.[k]?.state || '—'}`).join('、')}`,
    `月令${monthZhi}（出生季节气候的寒暖燥湿倾向）${th ? `｜调候：${th}` : ''}`,
    `神煞：${safeList(f.shensha).filter((x) => ['病符', '天刑煞', '吊客'].includes(x.name)).map((x) => `${x.name}@${x.position}`).join('、') || '无显著健康类神煞'}`,
  ];

  return { ...BAZI_CHAPTERS[7], text: compose({ summary, bullets, evidence, advice }) };
}

/** 称骨算命·白话详解（收费章节，¥0.99） */
function chChenggu(f) {
  const cg = f.chengGu;
  const text = chengguDetailSection(cg);
  const self = BAZI_CHAPTERS.find((c) => c.key === 'chenggu');
  return {
    ...self,
    text: text ||
      (cg
        ? `称骨总重「${cg.totalText}」暂无详解条目。\n\n【要点】\n· 骨重由农历年、月、日、时骨重相加而得。\n\n【依据溯源】\n· 称骨歌诀：${cg.verse || '—'}\n\n【建议】\n· 称骨为民俗文化参考，不构成任何决策建议。`
        : `本盘暂无可计算的称骨数据（需农历信息完整）。\n\n【要点】\n· 称骨需农历年月日与时辰完整。\n\n【依据溯源】\n· 袁天罡称骨法。\n\n【建议】\n· 请核验出生时间后重新排盘；本内容不构成任何决策建议。`),
  };
}

// ---------------------------------------------------------------- 大运（分量最重的一章）

function chDayun(f) {
  const dy = f.dayun || {};
  const steps = safeList(dy.steps);
  const dm = f.dayMaster.gan;
  const fp = f.fourPillars || {};

  const summary = `本命${dy.forward ? '顺' : '逆'}行大运，${dy.basis || ''}。${CLASSIC.大运}`
    + `大运是人生的「十年背景音乐」：命局是车，大运是路——同一辆车，在不同路况上的表现可以差得很远。`
    + `本章逐运说明它与命局的实际作用：运干对日主是什么十神、运支与原局哪一支发生什么关系、落在哪个宫、这一运是助是耗。`
    + `每一步运都按「干支十神—宫位引动—喜忌定调—分领域」四层展开，是全套报告里最需要反复读的一章；每一运覆盖十年，其逐年的干支与应事在「流年逐年」一章里逐年展开。`;

  const bullets = steps.map((s) => {
    const gang = (s.name || '')[0] || '';
    const zhig = (s.name || '')[1] || '';
    const ss = s.shishen || '';
    const deep = SS_DEEP[ss] || {};
    const gangWx = GAN_WX[gang] || '';
    const zhiWx = GAN_WX[zhig] || '';
    const cangTxt = (CANG[zhig] || []).map((g) => `${g}（${shishenOf(dm, g)}）`).join('、');
    const inter = safeList(s.impact?.all);

    const head = `第${s.order}步 ${s.name || '—'}（${ss}）· ${s.startAge}–${s.startAge + 9} 岁 · 公历 ${s.fromYear}–${s.toYear}：`;

    let body = `运干${gang || '—'}为日主${dm}之${ss || '—'}${deep.xing ? `，此十神的心性是${deep.xing}` : ''}；`
      + `${deep.yun ? `${deep.yun}。` : ''}`
      + `${gangWx ? `运干属${gangWx}${favWord(f, gangWx)}。` : ''}`;

    body += `运支${zhig || '—'}${zhiWx ? `属${zhiWx}${favWord(f, zhiWx)}` : ''}；`
      + `${cangTxt ? `其中藏${cangTxt}——支中所藏是这一步运的「暗线」，主事往往从这些藏干上透出来。` : ''}`;

    if (inter.length) {
      const detail = inter.slice(0, 4).map((r) => {
        const yi = relYi(r);
        const g = relGong(r);
        const keys = safeList(r.keys).map((k) => POS[k] || k).join('·');
        return `${r.name}${keys ? `（${keys}）` : ''}${yi ? `——${yi}` : ''}${g ? `，${g.dong}` : ''}`;
      }).join('；');
      body += `本运与原局共形成 ${inter.length} 项作用：${detail}。`;
    } else {
      body += '本运与原局无明显刑合，属于相对平缓的十年，宜做积累型投入。';
    }

    const favGang = gangWx && isFav(f, gangWx);
    const unfavGang = gangWx && isUnfav(f, gangWx);
    const favZhi = zhiWx && isFav(f, zhiWx);
    const unfavZhi = zhiWx && isUnfav(f, zhiWx);
    let tone;
    if (favGang && favZhi) tone = '运干支皆为命局所喜，这十年整体是顺风的：机会来得更密、阻力相对小，宜主动进取，把重要布局放在这里。';
    else if (unfavGang && unfavZhi) tone = '运干支皆偏命局所忌，这十年宜守不宜攻：以积累、学习、固本为主，重大扩张宜缓，等下一运再动。';
    else if (favGang || favZhi) tone = '运干支一喜一忌，这十年是「有得有失」的格局：机会伴随代价，宜做取舍——把资源压在喜的那一端，忌的那一端设好防线。';
    else tone = '此运干支于命局不喜不忌，属于平运：不求大起，宜稳中求进，把基本功做扎实。';

    return head + body + tone + (SS_FIELD[ss] ? `本运的分领域指向：${SS_FIELD[ss]}。` : '');
  });

  const evidence = [
    `起运依据：${dy.basis || '—'}｜${dy.forward ? '顺行' : '逆行'}`,
    `各运与命局的作用条目数：${steps.map((s) => `${s.name}:${num(s.impact?.count)}`).join('、')}`,
    `作用最强的运：${(steps.slice().sort((a, b) => num(b.impact?.count) - num(a.impact?.count))[0]?.name) || '—'}（引动最多，通常是人生转折的窗口）`,
    `用神：喜${joinCN(f.yongshen?.favorable)}、忌${joinCN(f.yongshen?.unfavorable)}——各运吉凶以此为准绳`,
    `日主：${dm}｜四柱：${KEYS.map((k) => fp[k]?.name || '—').join(' ')}`,
  ];

  const advice = [
    '大运提示的是「环境气候」而非注定结果：同一部运里，主动规划者与被动等待者的收获可以相差数倍。',
    '作用项最多的两步运通常是人生转折窗口，重大决策宜提前一年准备，避免临时决断；忌神运则以固本为主，别硬拼。',
    '本章为传统文化视角下的运程倾向分析，不构成任何决策建议；人生走向由现实选择决定。',
  ];

  return { ...BAZI_CHAPTERS.find((c) => c.key === 'dayun'), text: compose({ summary, bullets, evidence, advice }) };
}

// ---------------------------------------------------------------- 流年

function chLiunian(f) {
  const years = safeList(f.liunian);
  const nowYear = new Date().getFullYear();
  const dm = f.dayMaster.gan;
  const steps = safeList(f.dayun?.steps);
  const curOf = (y) => steps.find((s) => y >= num(s.fromYear) && y <= num(s.toYear)) || null;

  const summary = `流年说的是「具体哪一年会发生什么推动」。${CLASSIC.流年}`
    + `读法上要把三层叠起来看：命局是车，大运是路，流年就是这一年的天气——运好遇好流年则顺势而上，运平遇冲刑之年则以稳为主。`
    + `本章逐年给出：该年干支、对日主的十神、所在大运、与命局的作用，以及应事领域与应对。`
    + `请把大运作为背景、流年作为触发点来读，不要单看一年就下结论。`;

  const bullets = years.map((y) => {
    const ganzhi = y.ganzhi || '';
    const gang = ganzhi[0] || '';
    const zhig = ganzhi[1] || '';
    const ss = y.shishen || '';
    const deep = SS_DEEP[ss] || {};
    const inter = safeList(y.impact?.all);
    const cur = curOf(y.year);
    const tag = y.year === nowYear ? '【本年】' : '';
    const gangWx = GAN_WX[gang] || '';
    const zhiWx = GAN_WX[zhig] || '';

    let line = `${tag}${y.year} 年 ${ganzhi || '—'}（${ss || '—'}）`;
    if (cur) line += `，处「${cur.name}」大运之内`;
    line += `：年干${gang || '—'}为日主${dm}之${ss || '—'}${gangWx ? `，属${gangWx}${favWord(f, gangWx)}` : ''}。`;
    if (deep.shi) line += `${ss || '此十神'}${deep.shi}。`;
    if (zhiWx) line += `年支${zhig}属${zhiWx}${favWord(f, zhiWx)}。`;

    if (inter.length) {
      const detail = inter.slice(0, 3).map((r) => {
        const yi = relYi(r);
        const g = relGong(r);
        return `${r.name}${yi ? `——${yi}` : ''}${g ? `，${g.dong}` : ''}`;
      }).join('；');
      line += `本年与命局形成 ${inter.length} 项作用：${detail}。`;
    } else {
      line += '本年与命局作用不明显，属于平稳推进之年，宜专注既定计划。';
    }

    const mark = ({
      正官: '责任与名分加重之年，宜在制度内争取晋升与评优，重大承诺量力而为。',
      七杀: '压力与机会同至之年，宜主动承重并设止损点，忌硬扛不休。',
      食神: '技艺与作品产出之年，宜推出成果、沉淀口碑。',
      伤官: '表达与锋芒活跃之年，宜给表达找正当出口，忌与上位正面冲撞。',
      正财: '收入结构趋稳之年，宜做长线配置与资产沉淀。',
      偏财: '机会与人情往来增多之年，宜设止盈线与储蓄纪律，忌冲动投入。',
      正印: '学习考证与长辈提携的窗口之年，宜做系统性投入。',
      偏印: '思路另辟蹊径之年，宜做研究与冷门领域沉淀，防闭门造车。',
      比肩: '同辈往来频繁之年，合作与竞争并起，宜把规则写在前面。',
      劫财: '钱财与人情两头活跃之年，合伙担保宜慎，账目须清晰。',
    })[ss] || '以稳为主，按既定节奏推进即可。';

    return line + mark;
  });

  const evidence = [
    `流年干支：${years.map((y) => `${y.year}=${y.ganzhi}(${y.shishen})`).join('、')}`,
    `作用最强年份：${(years.slice().sort((a, b) => num(b.impact?.count) - num(a.impact?.count))[0]?.year) || '—'}`,
    `与命局作用条目数：${years.map((y) => `${y.year}:${num(y.impact?.count)}`).join('、')}`,
    `大运背景：${steps.map((s) => `${s.name}(${s.fromYear}–${s.toYear})`).join('、')}`,
    `日主：${dm}｜用神：喜${joinCN(f.yongshen?.favorable)}、忌${joinCN(f.yongshen?.unfavorable)}`,
  ];

  const advice = [
    '把每一年的「主题」转成可执行的年度计划，比等待应验更有意义——流年给的是气候，收成还是要靠自己下地。',
    '作用项多的年份是变动年，重要决策宜提前布局、留足余地；平稳之年则适合深耕积累，别在平年折腾。',
    '本章为传统文化视角下的年度倾向分析，不构成任何决策建议。',
  ];

  return { ...BAZI_CHAPTERS.find((c) => c.key === 'liunian'), text: compose({ summary, bullets, evidence, advice }) };
}

// ---------------------------------------------------------------- 出口

const GENERATORS = {
  mingju: chMingju, geju: chGeju, xingge: chXingge, shiye: chShiye,
  caiyun: chCaiyun, ganqing: chGanqing, qinyuan: chQinyuan,
  jiankang: chJiankang, chenggu: chChenggu, dayun: chDayun, liunian: chLiunian,
};

/** 生成八字解读章节（11 章，含依据溯源） */
export function baziSections(facts) {
  return BAZI_CHAPTERS.map((c) => {
    const gen = GENERATORS[c.key];
    try {
      return gen(facts);
    } catch (e) {
      return {
        key: c.key, title: c.title, locked: c.locked,
        text: `本章生成异常：${e.message}。请重新排盘后再试。`,
      };
    }
  });
}

export default baziSections;
