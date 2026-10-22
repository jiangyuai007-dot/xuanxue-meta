/**
 * 紫微斗数解读 —— 深度版
 *
 * 与旧版的区别：不再只报「命宫坐某星」，而是按「命宫格局—十二宫—四化—大限—流年」五层展开，
 * 每一条都回溯到本盘真实的星曜落宫、四化落点与宫位体系，并给出「星性 × 宫位」的合成读法。
 */

import { STAR, HUA, PALACE, sanFangSiZheng, detectPatterns, starInPalace, huaInPalace } from './ziweiDeep.js';

function compose({ summary, bullets = [], evidence = [], advice = [] }) {
  const parts = [summary.trim()];
  if (bullets.length) parts.push('【要点】\n' + bullets.map((b) => '· ' + b).join('\n'));
  if (evidence.length) parts.push('【依据溯源】\n' + evidence.map((e) => '· ' + e).join('\n'));
  if (advice.length) parts.push('【建议】\n' + advice.map((a) => '· ' + a).join('\n'));
  return parts.join('\n\n');
}

const idxToPalaceMap = (f) => {
  const m = {};
  for (const p of Object.values(f.palaces || {})) m[p.zhiIndex] = p;
  return m;
};

const mainStars = (p) => (p?.stars || []).filter((s) => s.kind === '主星').map((s) => s.name);

export function ziweiChapters(f) {
  const ju = f.wuXingJu || {};
  const palaces = f.palaces || {};
  const idxMap = idxToPalaceMap(f);
  const ming = palaces['命宫'];
  const shen = Object.values(palaces).find((p) => p.isShen);
  const mingStars = mainStars(ming);
  const sfszIdx = sanFangSiZheng(f.mingGong.zhiIndex);
  const sfszStars = sfszIdx.map((i) => (idxMap[i] ? mainStars(idxMap[i]) : [])).flat();
  const patterns = detectPatterns(f);
  const fz = (s) => (s && s.hua ? `${s.name}（${s.hua.label}）` : s ? s.name : '—');

  // ---------------- 免费：命盘概览
  const overview = `您的紫微命盘：农历 ${f.lunar.yearGanzhi}年（生肖${f.lunar.zodiac}）${f.lunar.isLeap ? '闰' : ''}${f.lunar.month}月${f.lunar.day}日，`
    + `四柱为 ${f.siZhu.year} ${f.siZhu.month} ${f.siZhu.day} ${f.siZhu.hour}。`
    + `命宫在${f.mingGong.zhi}宫（${f.mingGong.ganzhi}），身宫在${f.shenGong.zhi}宫；五行局为「${ju.name}」，于 ${ju.number} 岁起运。`
    + `紫微星坐${f.ziweiZhi}宫，天府星坐${f.tianfuZhi}宫——紫府二星是斗数与太微两大星系的首领，它们的落点决定了整张盘的骨架。`
    + `生年四化：禄—${f.fourHua.lu.star}　权—${f.fourHua.quan.star}　科—${f.fourHua.ke.star}　忌—${f.fourHua.ji.star}。`
    + `命宫主「先天之性」，身宫主「后天着力之处」：命看底色，身看选择，两者合参才完整。`
    + `本解读仅就排盘结果做文化性表述，不替代任何专业判断。`;

  // ---------------- 免费：十二宫星曜
  const palaceList = Object.values(palaces).map((p) => {
    const stars = p.stars.length ? p.stars.map(fz).join('、') : '（空宫）';
    return `${p.name}（${p.zhi}）：${stars}`;
  }).join('；\n');
  const palacesText = `十二宫星曜分布如下：\n${palaceList}。`
    + `传统上，命宫、财帛、官禄、迁移四宫（即命宫的三方四正）常被用来综合判断性格与人生重心；夫妻、子女、交友宫则与人际亲疏相关。`
    + `若某宫无主星（空宫），多以对宫星曜借参，结论宜保守看待——空宫不代表没有，而是「这一宫的特质要靠外界来触发」。`;

  // ---------------- 付费：命宫与格局
  const mingStarDesc = mingStars.map((n) => STAR[n]).filter(Boolean);
  const patternText = compose({
    summary: `论命先看命宫。您的命宫在${f.mingGong.zhi}宫（${f.mingGong.ganzhi}），`
      + `${mingStars.length ? `宫内主星为${mingStars.join('、')}` : '命宫为空宫，须借对宫（迁移宫）星曜来参'}。`
      + `${mingStarDesc.length ? `主导者是「${mingStars[0]}」——${mingStarDesc[0].xing}。` : ''}`
      + `身宫落在${f.shenGong.zhi}宫（${shen ? shen.name : '—'}）${shen ? `，${PALACE[shen.name] || ''}` : ''}——身宫是后天着力的方向：命宫给的脾气改不了太多，但往哪儿使劲是可以选的，身宫就是那个方向。`
      + `五行局「${ju.name}」决定起运岁数（${ju.number} 岁）与大限节奏，是后面两章的基准。`
      + `三方四正（命宫·财帛·官禄·迁移）会到的主星是：${sfszStars.join('、') || '—'}——这四宫决定您「能做成什么、靠什么赚钱、做什么工作、在外顺不顺」。`
      + `${patterns.length ? `格局上，本命可看出：${patterns.map((p) => p.name).join('、')}。` : ''}`,
    bullets: [
      ...mingStars.map((n) => starInPalace(n, '命宫')).filter(Boolean),
      ...patterns.map((p) => p.text),
      `身宫指向：${shen ? `身宫在${shen.name}——${PALACE[shen.name] || ''}。这意味着您后天的成就感，多半来自这一宫所主之事；把精力投在这里，比在命宫的惯性里打转更容易出成果。` : '身宫数据不足，宜以命宫与官禄宫合参。'}`,
      `三方四正综断：${sfszIdx.map((i) => (idxMap[i] ? `${idxMap[i].name}（${mainStars(idxMap[i]).join('、') || '空宫'}）` : '—')).join('、')}。`
        + `这四宫是「命宫的放大版」：单看命宫只能定性格，看这四宫才能定人生的基本盘。`,
      `五行局与节奏：「${ju.name}」于 ${ju.number} 岁起大限，每十年一运——局数决定起步早晚，局数与星曜配合决定每一步运的质感（详见大限章节）。`,
    ].filter(Boolean),
    evidence: [
      `命宫：${f.mingGong.zhi}宫（${f.mingGong.ganzhi}）｜主星：${mingStars.join('、') || '空宫'}`,
      `身宫：${f.shenGong.zhi}宫${shen ? `（${shen.name}）` : ''}`,
      `五行局：${ju.name}｜起运：${ju.number} 岁`,
      `三方四正：${sfszIdx.map((i) => (idxMap[i] ? `${idxMap[i].name}=${mainStars(idxMap[i]).join('、') || '空'}` : '—')).join('、')}`,
      `紫微在${f.ziweiZhi}宫｜天府在${f.tianfuZhi}宫`,
    ],
    advice: [
      mingStars[0]
        ? `把命宫主星（${mingStars[0]}）的习性用在匹配的场景里，比强行改正更有效：${STAR[mingStars[0]] ? STAR[mingStars[0]].ye : ''}`
        : '命宫空宫者，宜借对宫星曜之力，也宜多从外部环境中借势——这种盘往往「遇人则发」。',
      '格局只定框架，能否兑现还要看大限与四化——务必与后两章合看：命好不如限好，星性对了还要走到对的运上。',
    ],
  });

  // ---------------- 付费：生年四化
  const huaStar = (k) => f.fourHua[k].star;
  const palaceOfStar = (name) => {
    for (const p of Object.values(palaces)) if (p.stars.some((s) => s.name === name)) return p.name;
    return '—';
  };
  const fourHuaText = compose({
    summary: `生年四化是命盘的「放大器」：同一颗星，化禄、化权、化科、化忌四种状态，落到人生里是完全不同的四种用力方式。`
      + `您的四化落点为——化禄在${huaStar('lu')}（${palaceOfStar(huaStar('lu'))}），化权在${huaStar('quan')}（${palaceOfStar(huaStar('quan'))}），`
      + `化科在${huaStar('ke')}（${palaceOfStar(huaStar('ke'))}），化忌在${huaStar('ji')}（${palaceOfStar(huaStar('ji'))}）。`
      + `其中化忌所在之宫，传统上认为宜在该领域多一份觉察与经营：不是「不好」，而是「要反复用力」。`
      + `四化要挂在星上看——星是材质，化是用法，宫是场所，三者缺一不可。`,
    bullets: [
      huaInPalace('禄', huaStar('lu'), palaceOfStar(huaStar('lu'))),
      huaInPalace('权', huaStar('quan'), palaceOfStar(huaStar('quan'))),
      huaInPalace('科', huaStar('ke'), palaceOfStar(huaStar('ke'))),
      huaInPalace('忌', huaStar('ji'), palaceOfStar(huaStar('ji'))),
      `四化合看：禄权科忌四线并行——${HUA.禄.ji}；${HUA.权.ji}；${HUA.科.ji}；${HUA.忌.ji}。`
        + `实操上，宜把「禄」所在的领域当作资源池，把「权」所在的领域当作主战场，把「科」所在的领域当作口碑来源，把「忌」所在的领域当作长期功课。`,
    ].filter(Boolean),
    evidence: [
      `化禄：${huaStar('lu')}（${palaceOfStar(huaStar('lu'))}）｜化权：${huaStar('quan')}（${palaceOfStar(huaStar('quan'))}）`,
      `化科：${huaStar('ke')}（${palaceOfStar(huaStar('ke'))}）｜化忌：${huaStar('ji')}（${palaceOfStar(huaStar('ji'))}）`,
      `生年干：${f.siZhu.year}｜五行局：${ju.name}`,
      `化忌星性：${STAR[huaStar('ji')] ? STAR[huaStar('ji')].xing : '—'}`,
    ],
    advice: [
      '化忌不是凶，是「多用力」：它所在的宫位往往是你花力气最多、也最容易做出深度的地方——把它当成长期课题而非障碍。',
      '四化的用法是「把对的星用在对的宫」：禄在财帛宜顺取，权在官禄宜争取，科在迁移宜经营名声，忌在哪一宫就在哪一宫多一份耐心。',
    ],
  });

  // ---------------- 付费：大限走势
  const dx = (f.daXian || []).slice(0, 10);
  const nowAge = f.xuAge;
  const dxBullets = dx.map((d) => {
    const p = idxMap[d.zhiIndex] || Object.values(palaces).find((x) => x.zhi === d.zhi) || null;
    const stars = mainStars(p);
    const lead = STAR[stars[0]];
    const cur = nowAge >= d.ageStart && nowAge <= d.ageEnd;
    return `${d.ageStart}—${d.ageEnd} 岁${cur ? '【当前大限】' : ''}（${d.zhi}宫${p ? `·${p.name}` : ''}）：`
      + `${stars.length ? `宫内主星${stars.join('、')}` : '空宫，借对宫参看'}。`
      + `${lead ? `${stars[0]}：${lead.xing}——这十年您的行事气质偏${lead.xing.split('、')[0]}；落到人事上，${lead.shi}。${lead.ye}。` : ''}`
      + `${p ? `${p.name}主${PALACE[p.name] || ''}——大限走到哪一宫，哪一宫所主之事就会成为这十年的主旋律。` : ''}`
      + `${cur ? '您目前正处在这一限，本章其余各条宜与此条合看。' : ''}`;
  });

  const dayunText = compose({
    summary: `大限是紫微的「十年运」：自 ${ju.number} 岁起运，从命宫起，按五行局数顺（或逆）行，每宫十年。`
      + `读法上是「命盘是车，大限是路」——本命的星性决定你怎么开，大限所在之宫决定这段路是什么路况。`
      + `本盘共 ${dx.length} 步大限，下面逐年段说明：这十年走到哪一宫、宫内主星是什么、主什么事、您当下的位置在哪。`
      + `${nowAge ? `您当前 ${nowAge} 岁（虚岁），处在：${dx.find((d) => nowAge >= d.ageStart && nowAge <= d.ageEnd) ? `${dx.find((d) => nowAge >= d.ageStart && nowAge <= d.ageEnd).ageStart}—${dx.find((d) => nowAge >= d.ageStart && nowAge <= d.ageEnd).ageEnd} 岁这一限` : '表中所列之外的年龄段'}。` : ''}`,
    bullets: dxBullets,
    evidence: [
      `起运：${ju.number} 岁（${ju.name}）｜大限次序：${dx.map((d) => `${d.ageStart}-${d.ageEnd}=${d.zhi}宫`).join('、')}`,
      `命宫：${f.mingGong.zhi}宫｜身宫：${f.shenGong.zhi}宫`,
      `当前虚岁：${f.xuAge}`,
      `四化：禄${huaStar('lu')}·权${huaStar('quan')}·科${huaStar('ke')}·忌${huaStar('ji')}`,
    ],
    advice: [
      '大限走到哪一宫，就把精力往那一宫所主的事上倾斜：走到官禄宜拼事业，走到财帛宜做积累，走到夫妻宜经营关系，走到福德宜养身心。',
      '大限提示的是「环境气候」而非既定结果：同一部大限里，主动规划者与被动等待者的收获可以相差数倍。',
    ],
  });

  // ---------------- 付费：流年提示
  const ln = f.liuNian || {};
  const lnPalace = Object.values(palaces).find((p) => p.zhi === ln.mingGongZhi) || null;
  const lnStars = mainStars(lnPalace);
  const lnLead = STAR[lnStars[0]];
  const liunianText = compose({
    summary: `流年是在大限这块「路」上的「天气」：大限定十年的方向，流年定这一年的重心与氛围。`
      + `${ln.year ? `当前流年（${ln.year} 年）流年命宫在${ln.mingGongZhi}宫${lnPalace ? `（本命的${lnPalace.name}）` : ''}——` : ''}`
      + `${lnPalace ? `${lnPalace.name}主${PALACE[lnPalace.name] || ''}。这意味着今年您的注意力、事件与情绪，多半会往这一块聚拢。` : ''}`
      + `${lnStars.length ? `流年命宫内本命主星为${lnStars.join('、')}${lnLead ? `——${lnLead.xing}` : ''}：这是您今年面对事情时的基本姿态。` : ''}`
      + `读流年要三层叠看：本命盘是车、大限是路、流年是天气——只看天气不看路况，容易判断失误。`,
    bullets: [
      lnPalace
        ? `今年重心宫：${lnPalace.name}（${ln.mingGongZhi}宫）——${PALACE[lnPalace.name] || ''}。今年适合在这一块主动用力，被动等待则容易错过。`
        : '流年命宫数据不足，宜以大限所在之宫为主、流年斗君为辅来参看。',
      lnLead
        ? `今年行事气质：${lnStars[0]}——${lnLead.xing}。${lnLead.shi}这一层会在今年被放大：${lnLead.ye}。`
        : '流年命宫无主星，宜借对宫星曜之力，也宜多从外部借势。',
      `与生年四化合看：${['lu', 'quan', 'ke', 'ji'].map((k) => {
        const st = huaStar(k);
        const pl = palaceOfStar(st);
        const label = { lu: '禄', quan: '权', ke: '科', ji: '忌' }[k];
        return `化${label}在${st}·${pl}${pl === (lnPalace?.name || '') ? '（正是今年的重心宫，今年此线被触发）' : ''}`;
      }).join('；')}。`
        + `其中若化忌之宫正是今年的重心宫，宜在该领域多一份耐心与预案。`,
      `与大限合看：${nowAge && dx.length ? `您当前处在 ${dx.find((d) => nowAge >= d.ageStart && nowAge <= d.ageEnd)?.zhi || '—'}宫大限，今年是这一限中的一年——宜顺着大限的方向做年度计划，而不是另起炉灶。` : '大限数据不足，宜以命宫与官禄宫为主线。'}`,
    ].filter(Boolean),
    evidence: [
      `流年：${ln.year || '—'} 年｜流年命宫：${ln.mingGongZhi || '—'}宫${lnPalace ? `（本命${lnPalace.name}）` : ''}`,
      `流年命宫本命主星：${lnStars.join('、') || '空宫'}`,
      `生年四化：禄${huaStar('lu')}·权${huaStar('quan')}·科${huaStar('ke')}·忌${huaStar('ji')}`,
      `起运：${ju.number} 岁（${ju.name}）｜当前虚岁：${f.xuAge}`,
    ],
    advice: [
      '把流年的「重心宫」转成一个年度主题：例如重心在官禄就定事业目标，在财帛就定储蓄计划，在夫妻就定相处规则。',
      '流年仅为文化视角的节奏提示，不构成任何预测或决策依据；年度安排请以现实条件为准。',
    ],
  });

  return [
    { key: 'overview', title: '命盘概览', text: overview, locked: false },
    { key: 'palaces', title: '十二宫星曜', text: palacesText, locked: false },
    { key: 'pattern', title: '命宫与格局', text: patternText, locked: true },
    { key: 'fourhua', title: '生年四化', text: fourHuaText, locked: true },
    { key: 'dayun', title: '大限走势', text: dayunText, locked: true },
    { key: 'liunian', title: '流年提示', text: liunianText, locked: true },
  ];
}
