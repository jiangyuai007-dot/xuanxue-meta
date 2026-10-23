/**
 * Phase 4：基于 FactPack 护栏的「AI 命盘多轮追问（Contextual Follow-up Chat）」（src/ai/chat.js）
 *
 * 核心设计原则：
 *   1. 事实零幻觉（FactPack Anchoring）：
 *      所有追问上下文严格锚定当前命盘的 `F1..Fn` 确定性事实编号表（由 `reportPlan.js` 抽取），
 *      严禁大模型重新排盘或编造不存在的干支、星曜、卦爻。
 *   2. 双引擎无缝降级（LLM + 本地命理专家规则引擎）：
 *      - 当配置了 `AGNES_API_KEY` 时，调用大模型生成针对性多轮解答并提取引用的 `F1..Fn` 依据；
 *      - 当未配置 API Key 或网络超时，自动切入「本地确定性专家追问引擎」，识别用户问题意图
 *        （事业跳槽/财运投资/感情正缘/流年应期/方位择吉/健康作息/综合盘面），结合五体系真实盘面数据给出精准解答。
 *   3. 唯一合规出口（Compliance Gateway）：
 *      所有输出文本与追问建议均强制经过 `src/compliance/gateway.js` 的 `gate()` 过滤，
 *      拦截医疗、法律、荐股与迷信化煞等高风险表述，并将绝对断言转化为倾向性建议。
 */

import crypto from 'node:crypto';
import { listChapters, ALL_PRESETS } from '../core/reportPlan.js';
import * as client from './client.js';
import { FACT_RULESET } from './prompt.js';
import { gate } from '../compliance/gateway.js';
import { readCollection, writeCollection } from '../storage/db.js';

/** 各体系默认推荐快捷追问词（供前端空状态展示一键提问胶囊） */
export const PRESET_QUESTIONS = {
  bazi: [
    '我近两年适合跳槽、转行或拓展副业吗？',
    '我的正缘特征是什么？感情稳定期在何时？',
    '我的喜用神在日常办公方位与穿戴上怎么运用？',
    '当前大运与今年流年有哪些需要留意的冲合信号？',
  ],
  liuyao: [
    '本卦用神旺衰如何？所占之事最终趋势怎样？',
    '卦中动爻与变卦对结果有什么关键影响？',
    '这件事大致的应期（关键时间窗口）在什么时候？',
    '当下最稳妥的行动策略是主动推进还是暂缓观望？',
  ],
  qimen: [
    '此局最有利的求谋方位与行动时辰是哪个？',
    '日干与时干落宫生克反映当前怎样的主客局势？',
    '盘面有哪些吉凶格局或四害（门迫/击刑/入墓）需要规避？',
    '此事目前宜主动出击还是守成等待时机？',
  ],
  ziwei: [
    '我命宫与三方四正的主星组合有什么核心优势与短板？',
    '生年四化与宫干飞化提示我的事业与财富重心在哪里？',
    '当前大限与今年流年需要重点关注哪些宫位变动？',
    '夫妻宫与福德宫体现怎样的感情互动模式与心态特征？',
  ],
  hepan: [
    '我们两人的五行与喜用神互补性强吗？',
    '双方日柱夫妻宫有哪些合冲关系需要在日常磨合？',
    '我们在财务规划与事业协同上适合怎样分工配合？',
    '长期相处最值得坚持的三条关系升温建议是什么？',
  ],
};

export function presetQuestionsFor(system = 'bazi') {
  return PRESET_QUESTIONS[system] || PRESET_QUESTIONS.bazi;
}

/**
 * 从当前 FactPack 抽取全量去重事实编号表 F1..Fn
 * @param {object} factPack
 * @returns {Array<{id:string, text:string}>}
 */
export function extractAllFactLines(factPack) {
  if (!factPack || !factPack.facts) return [];
  const system = factPack.system || 'bazi';
  const chapters = listChapters(system);
  const seenNeeds = new Set();
  const seenTexts = new Set();
  const out = [];
  let n = 0;

  for (const ch of chapters) {
    for (const need of ch.needs || []) {
      if (seenNeeds.has(need)) continue;
      seenNeeds.add(need);
      const pick = ALL_PRESETS[need];
      if (!pick) continue;
      let raw = '';
      try {
        raw = pick(factPack.facts);
      } catch {
        raw = '';
      }
      if (!raw) continue;
      for (const line of String(raw).split('\n')) {
        const t = line.trim();
        if (!t || seenTexts.has(t)) continue;
        seenTexts.add(t);
        n += 1;
        out.push({ id: `F${n}`, text: t });
      }
    }
  }
  return out;
}

/**
 * 识别用户追问的核心意图分类
 * @param {string} q
 * @returns {'career'|'wealth'|'love'|'timing'|'direction'|'health'|'general'}
 */
export function detectIntent(q) {
  const s = String(q || '');
  if (/跳槽|工作|事业|职场|升职|创业|副业|行业|岗位|考公|编制|领导|合作/.test(s)) return 'career';
  if (/财|赚钱|收入|投资|理财|亏|薪|存款|生意|求财|破财/.test(s)) return 'wealth';
  if (/感情|婚姻|桃花|正缘|结婚|恋爱|伴侣|对象|复合|分手|夫妻|合婚|相处/.test(s)) return 'love';
  if (/何时|什么时候|应期|流年|今年|明年|哪年|大运|大限|月份|时机|窗口/.test(s)) return 'timing';
  if (/方位|方向|城市|去哪|颜色|穿戴|喜用|布置|风水|办公/.test(s)) return 'direction';
  if (/健康|身体|睡眠|作息|精力|压力|状态|养生|情绪/.test(s)) return 'health';
  return 'general';
}

/**
 * 本地确定性命理专家追问引擎（当未配置外部 LLM Key 或网络降级时使用）
 * 严格根据五大体系各自的 `factPack.facts` 结构化字段与问题意图生成针对性解答。
 */
function localFollowupAnswer(factPack, question, factLines) {
  const sys = factPack.system || 'bazi';
  const f = factPack.facts || {};
  const intent = detectIntent(question);
  const pickBasis = (keywords = [], max = 4) => {
    const matched = [];
    for (const fl of factLines) {
      if (keywords.some((k) => fl.text.includes(k))) {
        matched.push(fl.id);
        if (matched.length >= max) break;
      }
    }
    if (matched.length < 2) {
      for (const fl of factLines.slice(0, max)) {
        if (!matched.includes(fl.id)) matched.push(fl.id);
        if (matched.length >= max) break;
      }
    }
    return matched;
  };

  let answer = '';
  let basis = [];
  let suggestions = [];

  if (sys === 'bazi') {
    const dm = f.dayMaster || {};
    const p = f.fourPillars || {};
    const st = f.strength || {};
    const pt = f.pattern || {};
    const ys = f.yongshen || {};
    const fav = (ys.favorable || []).join('、') || '水、木';
    const unfav = (ys.unfavorable || []).join('、') || '火、土';
    const curDy = (f.dayun?.list || [])[0] || {};
    const curLn = (f.liunian || [])[0] || {};

    if (intent === 'career') {
      basis = pickBasis(['格局', '喜用神', '大运', '十神']);
      answer =
        `结合您的八字原局来看，日主为${dm.gan || ''}${dm.element || ''}（${st.level || '中和'}），命局成「${pt.name || '正格'}」（月令本气${pt.shishen || '当令'}），喜用神倾向于「${fav}」，忌神为「${unfav}」。\n` +
        `1. 职业赛道与角色定位：${pt.name || '当前格局'}配合年干${p.year?.shishen || ''}、月干${p.month?.shishen || ''}，说明您在具备专业门槛、制度规范或需要统筹协调的岗位上更容易积累资历。若考虑跳槽或拓展副业，优先切入与喜用五行「${fav}」相契合的领域，避免盲目跨入高杠杆或纯消耗型赛道。\n` +
        `2. 近两年变动节奏：当前行「${curDy.name || ''}」大运，近期流年${curLn.year ? `${curLn.year}（${curLn.name || ''}，十神${curLn.shishen || ''}）` : ''}与原局存在动态交感。建议采取「先骑驴找马、拿到明确 Offer 再交接」的稳健策略，尤其在涉及核心资源与合同条款时多留书面备份。`;
      suggestions = [
        '我的喜用神对应的具体行业与城市方位有哪些？',
        '未来三年哪一年的流年最利晋升或突破？',
      ];
    } else if (intent === 'wealth') {
      basis = pickBasis(['喜用神', '五行占比', '大运', '十神']);
      answer =
        `从四柱财星与喜用结构分析，日主${dm.gan || ''}${dm.element || ''}（${st.level || ''}），局中喜「${fav}」流通生扶，忌「${unfav}」过旺耗泄。\n` +
        `1. 求财模式：您的命局结构更适合「专业技能变现 + 周期性复利积累」的正财与稳健偏财路线。当流年或流月引动「${fav}」五行时，主业绩效、项目奖金或知识技术产出的回报率往往更为顺畅。\n` +
        `2. 现金流风控：逢「${unfav}」偏旺的阶段，容易出现人情往来、冲动消费或账期拖延。日常财务管理宜实行「主账户储蓄 + 独立预算池」制度，减少非必要的担保与合伙借贷。`;
      suggestions = [
        '今年流年对我的正财和副业收入有什么影响？',
        '日常办公与习惯上如何强化喜用神能量？',
      ];
    } else if (intent === 'love') {
      basis = pickBasis(['日柱', '干支互动', '十神', '神煞']);
      answer =
        `八字中以日支（夫妻宫）为核心观察伴侣形态与互动模式。您的日柱为「${p.day?.name || ''}」，夫妻宫坐「${p.day?.zhi || ''}」：\n` +
        `1. 正缘气质与相处特征：夫妻宫地支与原局十神配置显示，与您契合度较高的伴侣通常行事有主见、注重实际生活品质，且在五行上若能补益您的喜用神「${fav}」，双方在沟通节奏上会更加顺畅。\n` +
        `2. 磨合关键点：原局干支互动（${(f.relations?.all || []).slice(0, 2).map((r) => r.name).join('、') || '整体平和'}）提示，在亲密关系中宜避免「把职场压力带入家庭沟通」或因表达过于直接而引发冷战。逢流年引动日支或桃花星时，单身者社交结识机会增多，已婚恋者宜通过共同旅行或立下共同目标来增进默契。`;
      suggestions = [
        '近几年哪些流年容易引动夫妻宫或红鸾桃花？',
        '如果做双人八字合盘，需要重点看哪几个维度？',
      ];
    } else if (intent === 'direction' || intent === 'health') {
      basis = pickBasis(['喜用神', '五行占比', '日主']);
      const dirMap = { 木: '正东、东南方', 火: '正南方', 土: '本地或中原腹地', 金: '正西、西北方', 水: '正北、沿海或江河汇聚之地' };
      const colorMap = { 木: '青绿、竹青色系', 火: '暖红、绛紫色系', 土: '米黄、大地色系', 金: '月白、浅杏与金属色系', 水: '玄黑、深海蓝色系' };
      const firstFav = (ys.favorable || [])[0] || '水';
      answer =
        `根据原局五行分布（${Object.entries(f.elementPercent || {}).map(([k, v]) => `${k}${v}%`).join('、')}）与喜用神「${fav}」判定：\n` +
        `1. 空间方位与环境：长期发展城市、办公工位朝向或日常洽谈，优先亲近「${dirMap[firstFav] || '东、北方'}」等气场流通明朗的方位；色彩搭配上可适当多用「${colorMap[firstFav] || '素雅深色系'}」作为点缀。\n` +
        `2. 作息与状态管理：命局中偏旺或偏弱的五行提醒您在高压工作期务必保持规律睡眠，避免熬夜透支精力。通过规律运动、户外接触自然与周期性复盘，能让自身状态始终维持在良性区间。`;
      suggestions = [
        '当前大运的整体走势与核心发力点是什么？',
        '结合我的八字日柱，今天的每日运势黄历宜忌如何？',
      ];
    } else {
      basis = pickBasis(['四柱', '日主', '格局', '喜用神', '大运']);
      answer =
        `围绕您提出的「${question}」，结合本盘确定性事实综合推演如下：\n` +
        `1. 原局底色：四柱为「${p.year?.name || ''} ${p.month?.name || ''} ${p.day?.name || ''} ${p.hour?.name || ''}」，日主${dm.gan || ''}${dm.element || ''}（${st.level || ''}），成「${pt.name || ''}」，全局以「${fav}」为喜用枢机。\n` +
        `2. 阶段策略：当前处于「${curDy.name || ''}」大运，流年演进中凡遇生扶喜用神「${fav}」之年（或月份），宜把握窗口期主动推进核心计划；逢忌神「${unfav}」叠见之时，则宜深耕内功、精简战线，做到顺势而为。`;
      suggestions = [
        '我近两年在事业跳槽与财务规划上要注意什么？',
        '当前大运和今年流年的干支冲合关系如何解读？',
      ];
    }
  } else if (sys === 'liuyao') {
    const ben = f.benGua || {};
    const bian = f.bianGua || {};
    const ys = f.yongShen || {};
    const moving = f.movingLines || [];
    basis = pickBasis(['本卦', '用神', '动爻', '世应']);
    answer =
      `针对您的追问「${question}」，依据本卦《${ben.name || ''}》${bian.name ? `之《${bian.name}》` : ''}的盘面事实解析如下：\n` +
      `1. 用神与世应态势：您所占问之事取「${ys.target || '世爻'}」为用神（落在第 ${ys.lineIndex || f.shiYao || 1} 爻，${ys.ganzhi || ''}${ys.wuxing || ''}），旺衰综合评定为「${ys.strength?.level || '平相'}」（月建${f.yueJian || ''}、日辰${f.riChen?.ganzhi || ''}，日辰空亡：${(f.xunkong || []).join('')}）。世爻居第 ${f.shiYao || ''} 爻、应爻居第 ${f.yingYao || ''} 爻，反映当前主客双方需找准契机切入。\n` +
      `2. 动爻与应期指引：${moving.length ? `本卦共 ${moving.length} 爻发动（第 ${moving.join('、')} 爻），动必有因，事物正处于变化转换期。` : '本卦六爻安静，事态短期内维持现有格局，宜稳步按计划推进。'}应期方面，通常以用神「生旺逢值、冲开合处或出空填实」之日/月为关键推进窗口，建议提前做好准备。`;
    suggestions = [
      '世爻与应爻的生克关系说明对方目前是什么态度？',
      '针对当前卦象，近期有哪些需要避开的风险点？',
    ];
  } else if (sys === 'qimen') {
    const fav = f.favorable || {};
    const zf = f.zhiFu || {};
    const zs = f.zhiShi || {};
    const pats = (f.patterns || []).slice(0, 3);
    basis = pickBasis(['局式', '值符', '最优吉方', '命中格局']);
    answer =
      `针对您的追问「${question}」，结合本局「${f.ju?.yinYang || ''}${f.ju?.ju || ''}局（${f.solarTerm || ''}·${f.ju?.yuan || ''}）」盘面事实推演如下：\n` +
      `1. 主客与值符值使：当前四柱为「${f.pillars?.nian?.name || ''} ${f.pillars?.yue?.name || ''} ${f.pillars?.ri?.name || ''} ${f.pillars?.shi?.name || ''}」，值符「${zf.star || ''}」落${zf.palaceName || ''}宫，值使「${zs.door || ''}」落${zs.palaceName || ''}宫。${pats.length ? `盘面命中「${pats.map((x) => x.name).join('、')}」格局，` : ''}整体气机提示行事需紧扣值使门与吉方节奏。\n` +
      `2. 方位与行动建议：针对「${f.purpose?.name || '当前所谋之事'}」，盘面综合评分最优方位在「${fav.direction || ''}方（${fav.palaceName || ''}宫，${fav.door || ''}·${fav.star || ''}）」。建议在沟通、出行或决策时优先借用吉门吉星之气，避开四害（门迫/击刑）落宫方向，先谋后动。`;
    suggestions = [
      '日干与时干落宫的生克关系说明目前谁占主动？',
      '除了最优吉方，排名第二的备选方位是哪个宫位？',
    ];
  } else if (sys === 'ziwei') {
    const mg = f.mingGong || {};
    const sg = f.shenGong || {};
    const fh = f.fourHua || {};
    const curDx = (f.daXian || []).find((d) => d.isCurrent) || (f.daXian || [])[0] || {};
    basis = pickBasis(['命宫', '生年四化', '大限', '十二宫']);
    answer =
      `针对您的追问「${question}」，结合紫微斗数命盘事实解析如下：\n` +
      `1. 命身格局与四化枢机：您的命宫坐「${mg.zhi || ''}宫（${mg.ganzhi || ''}）」，身宫在「${sg.zhi || ''}宫」，五行局为「${f.wuXingJu?.name || ''}」，命主${f.mingZhu || ''}、身主${f.shenZhu || ''}。生年四化「化禄在${fh.lu?.star || ''}、化权在${fh.quan?.star || ''}、化科在${fh.ke?.star || ''}、化忌在${fh.ji?.star || ''}」，化禄与化权所在宫位即为您人生最容易产出成果的发力点，而化忌所在宫位则提示需要耐心经营、不宜急躁求成。\n` +
      `2. 运限节奏：当前虚岁 ${f.xuAge || '—'} 岁，正行「${curDx.ageStart || ''}-${curDx.ageEnd || ''}岁 ${curDx.zhi || ''}宫（本命${curDx.palace || ''}）」大限，今年流年命宫在「${f.liuNian?.mingGongZhi || ''}宫」。建议围绕当前大限主轴稳步配置资源，顺应四化引动的机遇。`;
    suggestions = [
      '我命宫宫干飞出的四化落入哪些宫位，代表什么含义？',
      '事业宫（官禄宫）与财帛宫的主星组合适合什么发展路线？',
    ];
  } else if (sys === 'hepan') {
    const pA = (f.parties || [])[0] || {};
    const pB = (f.parties || [])[1] || {};
    basis = pickBasis(['合盘总分', '合化协同', '冲突留心', '维度得分']);
    answer =
      `针对您的追问「${question}」，结合「${pA.name || '甲方'}（日柱${pA.dayGanzhi || ''}）」与「${pB.name || '乙方'}（日柱${pB.dayGanzhi || ''}）」的合盘事实分析如下：\n` +
      `1. 契合度全景：双方合盘综合得分为 ${f.score ?? 80} 分（评级「${f.grade || '良配'}」）。盘面呈现 ${(f.he || []).length} 处合化协同（${(f.he || []).slice(0, 3).map((x) => x.keyText).join('、') || '五行互补'}），这是两人建立长期信任与默契的天然纽带。\n` +
      `2. 相处磨合建议：盘面同时提示 ${(f.conflicts || []).length} 处需要留意的冲刑张力（${(f.conflicts || []).slice(0, 2).map((x) => x.keyText).join('、') || '偶有观念差异'}）。建议双方在重大财务、家庭分工与情绪沟通上建立「事前商议、换位思考」的共识机制，扬长避短。`;
    suggestions = [
      '我们两人在日支（夫妻宫）层面的互动需要注意什么？',
      '双方五行喜用神如何互相补益？',
    ];
  }

  return {
    answer,
    basis,
    suggestions,
    source: 'local',
  };
}

/**
 * 组装多轮追问 LLM Prompt
 */
function buildChatMessages(factPack, factLines, question, history = []) {
  const sysNameMap = {
    bazi: '四柱八字',
    liuyao: '六爻纳甲',
    qimen: '奇门遁甲',
    ziwei: '紫微斗数',
    hepan: '八字合盘',
  };
  const sysTitle = sysNameMap[factPack.system] || '传统命理';
  const factBlock = factLines.map((l) => `${l.id} ${l.text}`).join('\n');
  const validIds = factLines.map((l) => l.id).join('、');

  const systemPrompt = [
    `你是一位深谙中华传统${sysTitle}文化的资深命理顾问，正在基于用户已排好的确定性命盘（FactPack）回答用户的针对性追问。`,
    FACT_RULESET,
    '【追问输出格式】请只输出一个合法的 JSON 对象（不要包裹在解释文字中），包含以下 3 个字段：',
    '  "answer": "针对用户问题的详实解答（180-420字，分 2-3 个自然段，用 \\n 分段，结合事实编号表中的具体干支/星曜/宫位/卦象给出有理有据的分析与可执行建议）",',
    `  "basis": ["引用的事实编号数组，只能从 ${validIds} 中选取 2-4 个，如 F1, F3"],`,
    '  "suggestions": ["紧扣当前回答延伸出的 2 个后续追问短句，每句不超过 22 字"]',
    '',
    '【当前命盘唯一事实编号表（严禁编造表外事实）】',
    factBlock || 'F1 命盘已完成确定性计算',
  ].join('\n');

  const messages = [{ role: 'system', content: systemPrompt }];
  const recent = Array.isArray(history) ? history.slice(-6) : [];
  for (const turn of recent) {
    if (!turn || !turn.role || !turn.content) continue;
    messages.push({
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      content: String(turn.content).slice(0, 600),
    });
  }
  messages.push({
    role: 'user',
    content: `用户追问：${question}\n请严格依据上方「事实编号表」输出 JSON（含 answer、basis、suggestions）。`,
  });
  return messages;
}

/**
 * 解析 LLM 追问响应并校验 basis 白名单
 */
function parseChatCompletion(rawContent, factLines) {
  const validSet = new Set(factLines.map((l) => l.id));
  const text = String(rawContent || '').trim();
  if (!text) return null;

  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj.answer === 'string' && obj.answer.trim().length >= 20) {
      const basis = Array.isArray(obj.basis)
        ? obj.basis.map((x) => String(x).trim()).filter((x) => validSet.has(x)).slice(0, 5)
        : [];
      const suggestions = Array.isArray(obj.suggestions)
        ? obj.suggestions.map((x) => String(x).trim()).filter(Boolean).slice(0, 3)
        : [];
      return {
        answer: obj.answer.trim(),
        basis: basis.length ? basis : factLines.slice(0, 3).map((l) => l.id),
        suggestions,
      };
    }
  } catch {
    /* 若模型直接返回了自然语言段落，也做容错收编 */
  }
  if (cleaned.length >= 24 && !cleaned.startsWith('{')) {
    return {
      answer: cleaned.slice(0, 800),
      basis: factLines.slice(0, 3).map((l) => l.id),
      suggestions: [],
    };
  }
  return null;
}

/**
 * 执行一次基于 FactPack 护栏的命盘追问（支持 LLM + 本地专家兜底 + 合规网关过滤）
 * @param {{ factPack: object, question: string, history?: Array }} params
 */
export async function answerFollowup({ factPack, question, history = [] }) {
  const q = String(question || '').trim();
  if (q.length < 2) throw new Error('请输入至少 2 个字的追问内容');
  if (q.length > 300) throw new Error('单次追问请控制在 300 字以内');
  if (!factPack || !factPack.facts) throw new Error('命盘不存在，请先完成排盘');

  const started = Date.now();
  const factLines = extractAllFactLines(factPack);
  let result = null;
  let warnings = [];

  if (client.isAvailable()) {
    try {
      const messages = buildChatMessages(factPack, factLines, q, history);
      const r = await client.chat({
        messages,
        max_tokens: 900,
        temperature: 0.35,
      });
      if (r.ok && r.body) {
        const rawText = r.body?.choices?.[0]?.message?.content || '';
        const parsed = parseChatCompletion(rawText, factLines);
        if (parsed) {
          result = { ...parsed, source: 'ai' };
        } else {
          warnings.push('AI 追问返回格式不完整，已切换本地专家规则引擎');
        }
      } else {
        warnings.push(r.error || 'AI 接口暂不可用，已切换本地专家规则引擎');
      }
    } catch (e) {
      warnings.push((e && e.message) || 'AI 调用异常，已切换本地专家规则引擎');
    }
  }

  if (!result) {
    result = localFollowupAnswer(factPack, q, factLines);
  }

  // 唯一合规出口过滤
  const gatedAns = gate(result.answer, { system: factPack.system, section: 'chat_followup' });
  const gatedSugs = (result.suggestions || []).map((s) => gate(s, { system: factPack.system, section: 'chat_suggestion' }).text);

  // 附上所引用的事实原文摘要，方便前端悬浮或点击核验
  const factMap = Object.fromEntries(factLines.map((l) => [l.id, l.text]));
  const basisDetails = (result.basis || [])
    .filter((id) => factMap[id])
    .map((id) => ({ id, text: factMap[id].slice(0, 90) }));

  return {
    question: q,
    answer: gatedAns.text,
    basis: result.basis || [],
    basisDetails,
    suggestions: gatedSugs.length ? gatedSugs : presetQuestionsFor(factPack.system).slice(0, 2),
    source: result.source || 'local',
    blockedCount: (gatedAns.blocked || []).length,
    latencyMs: Date.now() - started,
    warnings,
    at: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------
// 追问会话持久化（SQLite `chats` 集合 + `data/chats.json` 镜像）
// ------------------------------------------------------------------

export function getChatThread(factPackId) {
  if (!factPackId) return null;
  const list = readCollection('chats');
  return list.find((x) => x && x.id === factPackId) || null;
}

export function appendChatTurn({ factPackId, system, owner, question, reply }) {
  if (!factPackId) return null;
  const list = readCollection('chats');
  let thread = list.find((x) => x && x.id === factPackId);
  const now = new Date().toISOString();
  if (!thread) {
    thread = {
      id: factPackId,
      system: system || 'bazi',
      owner: owner || '',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    list.push(thread);
  }
  const turnId = 'msg_' + crypto.randomBytes(4).toString('hex');
  thread.updatedAt = now;
  thread.messages.push(
    {
      id: turnId + '_u',
      role: 'user',
      content: question,
      at: now,
    },
    {
      id: turnId + '_a',
      role: 'assistant',
      content: reply.answer,
      basis: reply.basis || [],
      basisDetails: reply.basisDetails || [],
      suggestions: reply.suggestions || [],
      source: reply.source || 'local',
      at: reply.at || now,
    }
  );
  // 每个命盘保留最近 40 条消息（20 轮对话），防止无限膨胀
  if (thread.messages.length > 40) {
    thread.messages = thread.messages.slice(-40);
  }
  writeCollection('chats', list);
  return thread;
}

export function clearChatThread(factPackId) {
  if (!factPackId) return false;
  const list = readCollection('chats');
  const next = list.filter((x) => x && x.id !== factPackId);
  writeCollection('chats', next, { deletedIds: [factPackId] });
  return next.length !== list.length;
}
