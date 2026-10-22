/**
 * 六爻解读 —— 深度版
 *
 * 与旧版的区别：不再只报「世爻在某爻」，而是按「卦体—用神—世应—动变—应期—建议」六层展开，
 * 每一条都回溯到本卦真实的爻象（地支、六亲、六神、旺衰、空亡、月破、动变）。
 */

import {
  GUA_MEANING, LIUQIN, LIUSHEN, WANGSHUAI, GUA_TI,
  bianRel, dongTrend, shiWord, ysWord,
} from './liuyaoDeep.js';

const POS_ORDER = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

function compose({ summary, bullets = [], evidence = [], advice = [] }) {
  const parts = [summary.trim()];
  if (bullets.length) parts.push('【要点】\n' + bullets.map((b) => '· ' + b).join('\n'));
  if (evidence.length) parts.push('【依据溯源】\n' + evidence.map((e) => '· ' + e).join('\n'));
  if (advice.length) parts.push('【建议】\n' + advice.map((a) => '· ' + a).join('\n'));
  return parts.join('\n\n');
}

const lineTag = (l) => `${l.position}（${l.zhi}·${l.liuqin}·${l.liushen}·${l.wangshuai}${l.xunkong ? '·空亡' : ''}${l.yuePo ? '·月破' : ''}）`;

export function liuyaoChapters(f) {
  const lines = f.lines || [];
  const bian = f.bianLines || [];
  const dong = lines.filter((l) => l.isDong);
  const shi = f.shiLine;
  const ying = lines[f.shiYing?.ying] || null;
  const benMeaning = GUA_MEANING[f.benGua.name] || '大象需结合用神旺衰综合判断';
  const bianMeaning = GUA_MEANING[f.bianGua.name] || '';
  const ti = GUA_TI[f.benGua.generation] || '';

  // ---------------- 免费：卦象概览
  const overview = `本卦为「${f.benGua.name}」（${f.benGua.upper}上${f.benGua.lower}下），属${f.benGua.gong}宫${f.benGua.gongElement}，${f.benGua.generation}卦，${benMeaning}。`
    + `${ti ? `卦体上：${ti}。` : ''}`
    + `变卦为「${f.bianGua.name}」${bianMeaning ? `，${bianMeaning}` : ''}——本卦说的是当下的处境，变卦说的是事情往哪走，两者合看才完整。`
    + `月建${f.yueJian.zhi}（${f.yueJian.element}），日辰${f.riJian.ganzhi}，旬空${f.xunkong.join('、')}。`
    + `月建是「当下的天时」，决定各爻的旺衰；日辰是「当下的地气」，决定事情推不推得动。这两项是本章所有判断的基准。`;

  // ---------------- 免费：用神分析
  const ysLines = f.yongshenLines || [];
  const yongshenText = `本次所问：${f.question || '（未填写具体事项）'}，归类为${f.purposeKey || f.category}。${f.yongshenNote || ''}`
    + `用神取「${f.yongshen}」——${LIUQIN[f.yongshen] ? `${LIUQIN[f.yongshen].yi}，主${LIUQIN[f.yongshen].shi}。${LIUQIN[f.yongshen].ji}` : '此用神的事象需结合卦象综合看'}。`
    + `卦中用神出现在：${ysLines.length ? ysLines.map((l) => `${l.position}（${l.zhi}，${l.wangshuai}${l.xunkong ? '，空亡' : ''}${l.yuePo ? '，月破' : ''}）`).join('；') : '卦中未出现'}。`
    + `${ysWord(f.yongshen, ysLines)}`;

  // ---------------- 付费：世应关系
  const shiLiuqin = LIUQIN[shi?.liuqin] || null;
  const shiShen = LIUSHEN[shi?.liushen] || null;
  const yingLiuqin = LIUQIN[ying?.liuqin] || null;
  const yingShen = LIUSHEN[ying?.liushen] || null;
  const gap = Math.abs((f.shiYing?.shi ?? 2) - (f.shiYing?.ying ?? 5));

  const shiyingText = compose({
    summary: `世应是一卦的「主客」：世爻为问卦人自己，应爻为对方、环境或所问之事。`
      + `本卦世爻在${f.shiYing.shiPosition}，应爻在${f.shiYing.yingPosition}——${gap === 3 ? '世应相隔三爻，正是标准的「内三爻外三爻」之隔，主我与对方处在相对的位置上，宜讲条件而非讲情面' : '世应相邻，主双方距离近、牵扯深，事情多半绕不开彼此'}。`
      + `${shiWord(shi)}`
      + `${shiLiuqin ? `世爻临${shi.liuqin}：${shiLiuqin.yi}，主${shiLiuqin.shi}——这是你在此事中的姿态：你是以「${shi.liuqin}」的身份在应对。` : ''}`
      + `${yingLiuqin ? `应爻临${ying.liuqin}，主${yingLiuqin.shi}——这是对方或环境的性质。` : ''}`
      + `下面按「自身—对方—两相对照—神煞加减」四层拆开。`,
    bullets: [
      `自身（世爻${shi ? lineTag(shi) : '—'}）：${WANGSHUAI[shi?.wangshuai] || '旺衰不明'}。${shiWord(shi)}${shiLiuqin ? `六亲为${shi.liuqin}，主${shiLiuqin.shi}；${shiLiuqin.xiong}` : ''}`,
      `对方／环境（应爻${ying ? lineTag(ying) : '—'}）：${ying ? `${WANGSHUAI[ying.wangshuai] || ''}。${yingLiuqin ? `六亲为${ying.liuqin}，主${yingLiuqin.shi}` : ''}` : '应爻信息不足，宜以用神所在之爻参看'}。`
        + `${yingShen ? `应爻临${ying.liushen}：${yingShen.xing}。` : ''}`,
      `两相对照：世爻${['旺', '相'].includes(shi?.wangshuai) ? '有力' : '偏弱'}、应爻${['旺', '相'].includes(ying?.wangshuai) ? '有力' : '偏弱'}——`
        + `${['旺', '相'].includes(shi?.wangshuai) && !['旺', '相'].includes(ying?.wangshuai)
          ? '我强彼弱，主动权在你手里，宜主动出牌，条件可以谈得细一点'
          : (['旺', '相'].includes(ying?.wangshuai) && !['旺', '相'].includes(shi?.wangshuai)
            ? '彼强我弱，宜先借力与等待，不宜正面争锋；把条件补齐再谈'
            : '双方力量相当，宜以规则与契约定胜负，而非靠气势')}。`,
      shiShen ? `世爻六神为${shi.liushen}：${shiShen.xing}。六神不改变旺衰，只给这件事定「色调」——它提示的是事情的氛围与容易踩的坑。` : '',
      `世爻${shi?.xunkong ? '落空亡：主自身底气不足、事有悬空之感，宜先把确定性的部分落实，再谈推进' : '不落空亡：自身立场明确，宜按既定方向推进'}；`
        + `${shi?.yuePo ? '又值月破，主外力干扰与计划被打断，宜留缓冲。' : '未值月破，外力干扰相对有限。'}`,
    ].filter(Boolean),
    evidence: [
      `世爻：${f.shiYing.shiPosition}｜${shi ? `${shi.zhi}（${shi.zhiElement}）·${shi.liuqin}·${shi.liushen}·${shi.wangshuai}${shi.xunkong ? '·空亡' : ''}${shi.yuePo ? '·月破' : ''}` : '—'}`,
      `应爻：${f.shiYing.yingPosition}｜${ying ? `${ying.zhi}（${ying.zhiElement}）·${ying.liuqin}·${ying.liushen}·${ying.wangshuai}${ying.xunkong ? '·空亡' : ''}` : '—'}`,
      `月建：${f.yueJian.zhi}（${f.yueJian.element}）｜日辰：${f.riJian.ganzhi}｜旬空：${f.xunkong.join('、')}`,
      `六爻全象：${lines.map(lineTag).join('、')}`,
    ],
    advice: [
      `世应关系给出的是「位置感」：谁主动、谁被动、该讲条件还是讲情面。把它转成谈判策略，比反复揣测结果有用得多。`,
      `世爻偏弱时不代表事不可为，只是说明你要先把条件补齐——借力、等时、找人搭手，都是正当的打法。`,
    ],
  });

  // ---------------- 付费：动爻与变卦
  const dongDetail = dong.map((l) => {
    const bz = bian[l.index]?.zhi || '';
    const blq = bian[l.index]?.liuqin || '';
    const rel = bianRel(l.zhi, bz);
    const trend = dongTrend(l.zhi, bz);
    const lq = LIUQIN[l.liuqin];
    const ls = LIUSHEN[l.liushen];
    return `${l.position}动（${l.zhi}·${l.liuqin}·${l.liushen}${l.yuePo ? '·月破' : ''}${l.xunkong ? '·空亡' : ''}）`
      + `${bz ? `→ 变${bz}·${blq}` : ''}`
      + `${rel ? `：${rel}` : ''}${trend ? `；${trend}` : ''}`
      + `${lq ? `。此爻所主为${lq.shi}` : ''}`
      + `${blq && blq !== l.liuqin ? `；变后转为${blq}（${LIUQIN[blq] ? LIUQIN[blq].shi : ''}），说明事情的性质在中途会换个面貌` : ''}`
      + `${ls ? `。六神${l.liushen}：${ls.xing}` : ''}`;
  });

  const dongText = compose({
    summary: `动爻是这一卦的「开关」：不动之爻只是背景，动爻才是事情真正发生转折的地方。`
      + `${dong.length ? `本卦有 ${dong.length} 个动爻（${dong.map((d) => d.position).join('、')}）——动爻越多，说明这件事的变量越多、越需要分头处理，而不是等一个结果。`
        : '本卦六爻安静，无一爻发动：说明事情暂时处在相对稳定的状态，变化动力不强，宜按部就班，不宜无事生变。'}`
      + `变卦「${f.bianGua.name}」是动爻推动之后的结果${bianMeaning ? `，${bianMeaning}` : ''}：读法上是「本卦看当下、变卦看结局」，动爻则是连接两者的路径。`
      + `下面逐爻说明：它动了什么、变成了什么、回头对本爻是生是克、主什么事。`,
    bullets: dong.length ? dongDetail : [
      '六爻安静：事情暂无明显转折，宜维持现状、做积累型投入；若强求变化，反而容易自乱阵脚。',
      '安静之卦的判断重点转向用神旺衰与世应关系——条件够不够，比变不变更重要。',
      '若后续事态有新的进展（例如对方回应、条件变化），可再起一卦，看动爻是否出现。',
    ],
    evidence: [
      `动爻：${dong.length ? dong.map((d) => `${d.position}（${d.zhi}→${bian[d.index]?.zhi || '—'}）`).join('、') : '无'}`,
      `本卦：${f.benGua.name}（${f.benGua.upper}上${f.benGua.lower}下）｜变卦：${f.bianGua.name}`,
      `月建：${f.yueJian.zhi}（${f.yueJian.element}）｜日辰：${f.riJian.ganzhi}`,
      `动爻六亲分布：${dong.length ? dong.map((d) => `${d.position}=${d.liuqin}`).join('、') : '—'}`,
    ],
    advice: [
      dong.length
        ? '动爻提示的是「变量在哪里」：把每个动爻对应的六亲事象列出来，就是这件事的待办清单——逐项处理，比笼统等待有效。'
        : '静卦的打法是「先攒条件再等时机」：把用神该补的补上，等动爻出现（即外部条件变化）再出手。',
      '变卦看的是方向与收尾，不是既定的结果；同一卦在不同人手里，应对不同，走向也不同。',
    ],
  });

  // ---------------- 付费：趋势与建议
  const ysStrong = ysLines.some((l) => ['旺', '相'].includes(l.wangshuai));
  const ysKong = ysLines.some((l) => l.xunkong);
  const shiStrong = ['旺', '相'].includes(shi?.wangshuai);
  const favorable = ysStrong && shiStrong && !ysKong;
  const lu = LIUSHEN[shi?.liushen];

  const fang = [];
  if (ysKong) fang.push('一防落空——用神空亡，承诺要落到纸面、时间要落到日期');
  if (shi?.yuePo) fang.push(`${fang.length ? '二' : '一'}防外力打断——世爻月破，关键节点要留缓冲`);
  fang.push(`${['一', '二', '三'][fang.length] || '三'}防${lu ? `${shi.liushen}之性：${lu.xing}` : '急躁——条件不足时抢时间，多半要返工'}`);

  const advice = compose({
    summary: `这一章把前面四层——卦体、用神、世应、动变——收到一起，给出一个「能不能做、怎么做、什么时候做」的倾向性判断。`
      + `结论先说：${favorable ? '条件相对具备，可择机推进' : (ysStrong || shiStrong ? '条件半具备，宜补齐短板后推进' : '条件尚不充分，宜先蓄力、等待时机')}。`
      + `判据有三条：一，用神${f.yongshen}${ysStrong ? '得月令之力' : '在月令处偏弱'}；二，世爻${shiStrong ? '有力，自身条件够' : '偏弱，自身需借力'}；三，${dong.length ? `有 ${dong.length} 个动爻，事有变量` : '卦静无动，事态平稳'}。`
      + `${ysKong ? '需要额外留意的是：用神落空亡，说明事情有「看得见但拿不稳」的成分，时间与交付方式要落实清楚。' : ''}`
      + `要强调的是：六爻给的是「当下条件的结构」，不是对结果的断言——同样的卦，应对不同，走向也不同。`,
    bullets: [
      `能不能做：${favorable ? '用神与世爻两方面都站得住，说明「想做」与「能做」基本对得上，可以把计划落到日程上' : '用神与世爻至少有一头偏弱，宜先把弱的一头补起来：或补条件、或找人搭手、或改期'}。`,
      `怎么做：${LIUQIN[f.yongshen] ? `把用神${f.yongshen}所主之事（${LIUQIN[f.yongshen].shi}）当成主线，其余都是配套；${LIUQIN[f.yongshen].xiong}` : '以用神所在之爻的事象为主线，其余配套处理'}。`,
      `防什么：${fang.join('；')}。`,
      `什么时候：${ysStrong ? '用神得令，宜在月建当令之气未退之前推进（月建一换，力量对比会重排）' : '用神失令，宜等下一个能生扶用神的月份再动，比现在硬推省力'}；${dong.length ? '又因有动爻，宜在变量出现后一周内做决定，不宜久拖' : '卦静无动，宜按既有节奏稳步推进，不必刻意择日'}。`,
      `卦体的整体提示：${ti || '本卦卦体无特殊提示，按常规判断'}。${benMeaning}。`,
    ].filter(Boolean),
    evidence: [
      `用神：${f.yongshen}｜${ysLines.length ? ysLines.map((l) => `${l.position}·${l.zhi}·${l.wangshuai}`).join('、') : '卦中不见'}`,
      `世爻：${f.shiYing.shiPosition}·${shi?.zhi}·${shi?.wangshuai}${shi?.xunkong ? '·空亡' : ''}`,
      `动爻数：${dong.length}｜变卦：${f.bianGua.name}`,
      `月建：${f.yueJian.zhi}（${f.yueJian.element}）｜日辰：${f.riJian.ganzhi}｜旬空：${f.xunkong.join('、')}`,
    ],
    advice: [
      '把本章的「能不能做／怎么做／什么时候」转成一张待办表：每一条对应一个动作与一个日期，才是对卦最好的回应。',
      '本章为传统文化视角下的卦象分析，属于倾向性参考，不构成对工作、投资、健康或任何现实事务的决策依据；重大事项请以现实条件与专业人士意见为准。',
    ],
  });

  return [
    { key: 'overview', title: '卦象概览', text: overview, locked: false },
    { key: 'yongshen', title: '用神分析', text: yongshenText, locked: false },
    { key: 'shiying', title: '世应关系', text: shiyingText, locked: true },
    { key: 'dongyao', title: '动爻与变卦', text: dongText, locked: true },
    { key: 'advice', title: '趋势与建议', text: advice, locked: true },
  ];
}
