/**
 * 奇门遁甲解读 —— 深度版
 *
 * 与旧版的区别：不再只报「哪个方位评分高」，而是按「盘式—用神宫—逐宫—时空节奏—行动」五层展开，
 * 每宫都给出「门—星—神—宫—天地盘干—长生—空亡马星」的完整读法与定调。
 */

import { DOOR, STAR, SHEN, PALACE_MEANING, GAN_YI, palaceRead, palaceTone, csWord } from './qimenDeep.js';

function compose({ summary, bullets = [], evidence = [], advice = [] }) {
  const parts = [summary.trim()];
  if (bullets.length) parts.push('【要点】\n' + bullets.map((b) => '· ' + b).join('\n'));
  if (evidence.length) parts.push('【依据溯源】\n' + evidence.map((e) => '· ' + e).join('\n'));
  if (advice.length) parts.push('【建议】\n' + advice.map((a) => '· ' + a).join('\n'));
  return parts.join('\n\n');
}

const P = (p) => `${p.name}宫（${p.direction}）`;

export function qimenChapters(f) {
  const fav = f.favorable || {};
  const zf = f.zhiFu || {};
  const zs = f.zhiShi || {};
  const kw = (f.kongWang || []).join('、') || '—';
  const palaces = f.palaces || [];
  const favPalace = palaces.find((p) => p.id === fav.palace) || null;
  const dayGanPalace = palaces.find((p) => p.tianPan === f.pillars?.ri?.gan) || null;
  const hourGanPalace = palaces.find((p) => p.tianPan === f.pillars?.shi?.gan) || null;
  const maPalace = palaces.find((p) => p.maXing) || null;
  const kongPalaces = palaces.filter((p) => p.kongWang);

  // ---------------- 免费：盘式概览
  const overview = `本次起局：${f.juName}，${f.yuan}（${f.yuanBasis}），节气为${f.solarTerm}，${f.panType}。`
    + `${f.jiGongName ? `${f.jiGongName}。` : ''}`
    + `日柱${f.pillars.ri.ganzhi}，时柱${f.pillars.shi.ganzhi}，旬首${f.xunShou}（${f.xunShouYi}）。`
    + `值符为${zf.star}，落于${zf.palaceName}宫${zf.midNote ? `（${zf.midNote}）` : ''}——值符是这一局的「主事者」，所落之宫即是全局的重心；`
    + `值使为${zs.door}，落于${zs.palaceName}宫——值使是这一局的「执行门」，主事情通过什么方式推进。`
    + `时旬空亡在${kw}，马星在${f.maXing?.palaceName || '—'}宫。`
    + `读奇门的顺序是：先看值符定全局重心，再看用神宫定方位与人事，最后看门星神的组合定吉凶与做法。`;

  // ---------------- 付费：用神方位
  const d = DOOR[fav.door];
  const s = STAR[fav.star];
  const g = SHEN[favPalace?.shen];
  const direction = compose({
    summary: `本次事由为「${f.purpose.name}」，${f.purpose.note}。`
      + `盘面上最有利的方位是${fav.direction}方（${fav.palaceName}宫），综合评分 ${fav.score}。`
      + `${d ? `该宫临${fav.door}：${d.yi}——${d.yi2}。` : ''}`
      + `${s ? `${fav.star}临宫：${s.xing}。` : ''}`
      + `${g ? `${favPalace.shen}临宫：${g.xing}。` : ''}`
      + `需要说明的是：方位是「条件」而非「保证」——同一方位，做不同的事、用不同的方式，结果可以相差很远。`
      + `下面按「为什么是这个宫—这一宫能做什么—不能做什么—怎么用」四层说清。`,
    bullets: [
      `为什么是这一宫：${(fav.why || []).join('；') || '综合门星神三者而得'}。`
        + `${favPalace ? `该宫天地盘为「${favPalace.tianPan}」临「${favPalace.diPan}」——${GAN_YI[favPalace.tianPan] ? `天盘${favPalace.tianPan}主${GAN_YI[favPalace.tianPan]}` : ''}${GAN_YI[favPalace.diPan] ? `，地盘${favPalace.diPan}主${GAN_YI[favPalace.diPan]}` : ''}；天盘主外显的人事，地盘主内里的底子，两者合看才是完整的一宫。` : ''}`,
      favPalace ? `这一宫能做什么：${d ? `${d.yi2}。` : ''}${PALACE_MEANING[favPalace.name] ? `宫位本身${PALACE_MEANING[favPalace.name]}。` : ''}` : '',
      `不能做什么：${d?.ji === '凶' ? '该宫之门属凶门，宜避开需要合作、求稳、公开的事务' : '即便是吉宫，也不宜做与该门性质相反的事（例如生门只利求财置业，不宜办丧葬与破坏性事务）'}；`
        + `${kongPalaces.some((p) => p.id === fav.palace) ? '又因此宫值空亡，力量打折，重要事项宜另择日再动。' : '此宫不值空亡，力量实在，可作为首选。'}`,
      `怎么用：${f.purpose.doors.includes(fav.door)
        ? `本事的用神门（${f.purpose.doors.join('或')}）正好落在${fav.palaceName}宫，方向上契合——宜朝${fav.direction}方布局，并把最重要的一步放在此宫所主的事务上`
        : `用神门（${f.purpose.doors.join('或')}）未落在最优宫，说明「方位」与「做法」两者不能兼得：宜在${fav.direction}方的有利条件与正确的做事方式之间做权衡，优先保证方式正确`}。`,
      `对照用神宫：${dayGanPalace ? `日干${f.pillars.ri.gan}落${dayGanPalace.name}宫（代表问事之人自己）；` : `日干${f.pillars.ri.gan}为旬首所藏、不入九宫天盘，此时以值符所在之宫（${zf.palaceName}宫）论「我」；`}${hourGanPalace ? `时干${f.pillars.shi.gan}落${hourGanPalace.name}宫（代表所问之事）。` : `时干${f.pillars.shi.gan}落${f.zhiFu?.palaceName || '—'}宫（${zf.midNote || '代表所问之事'}）。`}`
        + `${dayGanPalace && hourGanPalace ? `自己与所问之事分居两宫，两者之间的生克关系，就是这件事的难易所在——同宫则事在自身，相生则顺，相克则费劲。` : ''}`,
    ].filter(Boolean),
    evidence: [
      `最优宫：${fav.palaceName}宫（${fav.direction}）｜门${fav.door}／星${fav.star || '—'}／神${favPalace?.shen || '—'}｜评分 ${fav.score}`,
      `判据：${(fav.why || []).join('；')}`,
      `日干${f.pillars.ri.gan}${dayGanPalace ? `落${dayGanPalace.name}宫` : '不入天盘，以值符宫论'}｜时干${f.pillars.shi.gan}落${hourGanPalace?.name || zf.palaceName || '—'}宫`,
      `值符${zf.star}在${zf.palaceName}宫｜值使${zs.door}在${zs.palaceName}宫｜空亡${kw}`,
    ],
    advice: [
      `方位的用法是「朝这个方向布局、办事、见人」，而不是换个城市或搬家——把它理解成条件倾向，会更实用也更安全。`,
      `本章为传统奇门视角下的方位与倾向分析，不构成任何投资、出行或经营决策依据；实际决策请结合现实条件。`,
    ],
  });

  // ---------------- 付费：九宫要点
  const order = [4, 9, 2, 3, 5, 7, 8, 1, 6];
  const sorted = palaces.slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const palaceBullets = sorted.filter((p) => !p.isMiddle).map((p) => {
    const dd = DOOR[p.door];
    const ss = STAR[p.star];
    const gg = SHEN[p.shen];
    const cs = csWord(p.changsheng, p.changshengNote);
    return `${P(p)}：${p.door}／${p.star}${p.starExtra || ''}／${p.shen}${p.isZhiFu ? '（值符所在）' : ''}${p.isZhiShi ? '（值使所在）' : ''}——`
      + `${dd ? `${dd.yi}。` : ''}${ss ? `${p.star}：${ss.xing}。` : ''}${gg ? `${p.shen}：${gg.xing}。` : ''}`
      + `${PALACE_MEANING[p.name] ? `${PALACE_MEANING[p.name]}。` : ''}`
      + `${cs ? `宫位力量${cs}。` : ''}`
      + `天地盘「${p.tianPan}」临「${p.diPan}」${GAN_YI[p.tianPan] ? `：天盘${p.tianPan}主${GAN_YI[p.tianPan]}` : ''}${GAN_YI[p.diPan] ? `，地盘${p.diPan}主${GAN_YI[p.diPan]}` : ''}。`
      + `${palaceTone(p)}`;
  });

  const palaceText = compose({
    summary: `九宫是奇门的「地图」：每一宫都由门、星、神、天地盘干、宫位五行与长生状态共同决定，`
      + `读法上是「门定宜忌、星定气质、神定外力、干定人事、宫定方位与事类」。`
      + `本局九宫如下（按坎一、坤二、震三、巽四、中五、乾六、兑七、艮八、离九的次序展开，中宫寄坤一并说明）。`
      + `其中值符所在之宫为全局重心，值使所在之宫为主事的门径，这两宫要优先看；`
      + `空亡之宫力量打折、马星之宫主变动，是判断「何时动」的参考。`,
    bullets: palaceBullets,
    evidence: [
      `值符：${zf.star}在${zf.palaceName}宫${zf.midNote ? `（${zf.midNote}）` : ''}｜值使：${zs.door}在${zs.palaceName}宫`,
      `空亡宫：${kongPalaces.length ? kongPalaces.map((p) => `${p.name}宫`).join('、') : '无'}｜马星宫：${maPalace ? `${maPalace.name}宫` : '无'}`,
      `九宫评分：${(f.ranking || []).map((r) => `${r.palaceName}:${r.score}`).join('、')}`,
      `局：${f.juName}｜${f.yuan}｜${f.solarTerm}｜旬首${f.xunShou}`,
    ],
    advice: [
      '九宫的用法是「挑宫做事」：要谈合作找六合、要争取曝光找九天、要长期布局找九地、要稳妥守成找生门或九地所临之宫。',
      '宫位吉凶是条件倾向，不是结果判定：吉宫也可能办坏事（做法不对），凶宫也可能做成事（做法对了、代价大些）。',
    ],
  });

  // ---------------- 付费：行动建议
  const bestDoorOk = f.purpose.doors.includes(fav.door);
  const adviceText = compose({
    summary: `这一章把方位、九宫与时空节奏合成一份可执行的行动参考，回答三件事：往哪走、什么时候动、怎么动。`
      + `先说方向：${bestDoorOk
        ? `本事的用神门（${f.purpose.doors.join('或')}）正落在${fav.palaceName}宫，说明「对的方位」与「对的门径」重合——这种情况在奇门里属于条件比较顺的一类，宜优先朝${fav.direction}方推进`
        : `用神门（${f.purpose.doors.join('或')}）未落在最优宫，说明方位与做法两者不能兼得。经验上宜先保证做法正确（走对的门），方位只作辅助调节`}。`
      + `再说时机：${f.pillars.shi.zhi}时起局，${maPalace ? `马星在${maPalace.name}宫，主动与出行` : '盘面无马星'}，${kongPalaces.length ? `空亡在${kw}（${kongPalaces.map((p) => p.name).join('、')}宫），相关宫位的事项易有延迟或落空` : '无空亡'}。`
      + `最后说做法：奇门给的是「条件地图」，把条件用对的那一方，才是真正的赢面。`,
    bullets: [
      `往哪走：优先${fav.direction}方（${fav.palaceName}宫）${bestDoorOk ? '，此宫门星与事由契合，可作为主要着力点' : '，但同时要权衡用神门所在之宫'}；`
        + `次选可参考评分次之的${(f.ranking || []).slice(1, 3).map((r) => `${r.palaceName}宫（${r.direction}）`).join('、')}。`,
      `什么时候动：${maPalace ? `马星主变动与出行，宜在近期主动出击，不宜久拖` : '盘面无马星，宜按既定节奏稳步推进'}；`
        + `${kongPalaces.length ? `空亡宫所主之事宜延后或另择日，不宜在空亡期内定局；` : '无空亡，时间上无显著忌避；'}`
        + `${favPalace?.changsheng ? `最优宫处于「${favPalace.changsheng}」${favPalace.changshengNote ? `（${favPalace.changshengNote}）` : ''}，可作为节奏的参考。` : ''}`,
      `怎么动：${d ? `${fav.door}的宜忌是——${d.yi2}。` : ''}${s ? `配合${fav.star}的气质：${s.xing}。` : ''}`
        + `${g ? `再配合${favPalace?.shen}的外力：${g.xing}。` : ''}`,
      `防什么：${kongPalaces.length ? `一防空亡——${kongPalaces.map((p) => p.name).join('、')}宫所主之事易延迟、易落空，宜留备选方案；` : ''}`
        + `二防门星不合——吉门配凶星时，宜取门的「宜」而防星的「忌」；三防过度解读——奇门是条件地图，不是结果保证。`,
      `一句话：${bestDoorOk ? '方位与门径重合，宜顺势推进，动作要快' : '方位与门径不重合，宜先做对事，再择方位'}；`
        + `${maPalace ? '马星在盘，动则有利' : '马星不在盘，稳则有利'}。`,
    ].filter(Boolean),
    evidence: [
      `用神门：${f.purpose.doors.join('或')}｜最优宫门：${fav.door}｜是否契合：${bestDoorOk ? '是' : '否'}`,
      `最优宫：${fav.palaceName}（${fav.direction}）评分 ${fav.score}｜值符宫：${zf.palaceName}｜值使宫：${zs.palaceName}`,
      `马星：${maPalace ? `${maPalace.name}宫` : '无'}｜空亡：${kw}${kongPalaces.length ? `（${kongPalaces.map((p) => p.name).join('、')}宫）` : ''}`,
      `起局：${f.juName}｜${f.solarTerm}｜时柱${f.pillars.shi.ganzhi}`,
    ],
    advice: [
      '把「往哪走 / 什么时候 / 怎么动」写成三条具体的动作项，比记住吉凶名词有用得多。',
      '本章为传统奇门视角下的方位与节奏分析，属于文化性、倾向性参考，不构成投资、出行、经营或任何现实事务的决策依据。',
    ],
  });

  return [
    { key: 'overview', title: '盘式概览', text: overview, locked: false },
    { key: 'direction', title: '用神方位', text: direction, locked: true },
    { key: 'palace', title: '九宫要点', text: palaceText, locked: true },
    { key: 'advice', title: '行动建议', text: adviceText, locked: true },
  ];
}
