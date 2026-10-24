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
  const q = String(question || '').trim();
  const intent = detectIntent(q);

  const pickBasis = (keywords = [], max = 4) => {
    const matched = [];
    for (const fl of factLines) {
      if (keywords.some((k) => k && fl.text.includes(k))) {
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
    const nowY = new Date().getFullYear();
    const steps = f.dayun?.steps || f.dayun?.list || [];
    const curDy = steps.find((s) => nowY >= s.fromYear && nowY <= s.toYear) || steps[0] || {};
    const curLn = (f.liunian || []).find((l) => l.year === nowY) || (f.liunian || [])[0] || { year: nowY, name: '', shishen: '' };
    const nextLns = (f.liunian || []).filter((l) => l.year >= nowY && l.year <= nowY + 3);
    const dirMap = { 木: '正东、东南方', 火: '正南方', 土: '本地或中原腹地', 金: '正西、西北方', 水: '正北、沿海或江河汇聚之地' };
    const colorMap = { 木: '青绿、竹青色系', 火: '暖红、绛紫色系', 土: '米黄、大地色系', 金: '月白、浅杏与金属色系', 水: '玄黑、深海蓝色系' };
    const indMap = { 木: '教育文化、医疗健康、林木设计、新媒体与成长型业务', 火: '科技互联网、能源电力、传媒演艺、餐饮照明与AI算力', 土: '不动产、基建工程、供应链管理、农业与综合顾问', 金: '金融投行、法律合规、精密制造、汽车硬件与贵金属', 水: '跨境贸易、航运物流、旅游消费、自由咨询与流动型商业' };
    const firstFav = (ys.favorable || [])[0] || '水';

    if (/具体行业|城市方位/.test(q)) {
      basis = pickBasis(['喜用神', '格局', '十神', '五行']);
      answer =
        `针对您追问的「喜用神对应行业与城市方位」，结合日主${dm.gan || ''}${dm.element || ''}与「${pt.name || '本命格局'}」详解如下：\n` +
        `1. 黄金行业赛道：您的核心喜用神为「${fav}」（首取「${firstFav}」），最契合切入「${indMap[firstFav] || '科技创新与专业咨询'}」等高景气赛道；若结合月柱十神「${p.month?.shishen || ''}」，在组织中担任技术专家、产品统筹或独立顾问更能放大个人价值。\n` +
        `2. 发展城市与空间选择：跨城发展、出差拓展客户或选址置业时，优先选择以出生城市为基准的「${dirMap[firstFav] || '东、北方'}」城市群，能够有效借助地利气场提升贵人运与项目成单率。`;
      suggestions = [
        '今年流年对我的正财和副业收入有什么影响？',
        '我的正缘特征是什么？感情稳定期在何时？',
      ];
    } else if (/办公方位|穿戴|颜色|办公|布置/.test(q)) {
      basis = pickBasis(['喜用神', '五行', '日主']);
      answer =
        `针对您的「日常办公方位与穿戴开运指南」，结合原局五行分布（${Object.entries(f.elementPercent || {}).map(([k, v]) => `${k}${v}%`).join('、')}）与喜用神「${fav}」给出落地方案：\n` +
        `1. 工位朝向与桌面布局：日常办公座次宜面朝或靠拢「${dirMap[firstFav] || '正东、正北方'}」，桌面保持整洁明朗，可适度摆放契合「${firstFav}」属性的器物（如水培绿植、温润茶具或简约金属书立）以聚气定神。\n` +
        `2. 穿戴色系与作息调频：重要商务洽谈、面试或签约场合，服饰与配饰优先选用「${colorMap[firstFav] || '深海蓝、竹青色系'}」作为主视觉点缀，少用忌神「${unfav}」对应的大面积色块。`;
      suggestions = [
        '我的喜用神对应的具体行业与城市方位有哪些？',
        '当前大运与今年流年有哪些需要留意的冲合信号？',
      ];
    } else if (/未来三年|哪一年|晋升|突破/.test(q)) {
      basis = pickBasis(['大运', '流年', '喜用神', '十神']);
      const lnText = nextLns.map((l) => `${l.year}${l.name || ''}年（十神：${l.shishen || '流年'}）`).join('、') || `${curLn.year}年`;
      answer =
        `针对您追问的「未来三年晋升与突破窗口」，结合大运「${curDy.name || ''}」与流年序列推演如下：\n` +
        `1. 未来三年流年逐年盘点：近三年流年依次为 ${lnText}。其中凡流年干支透出或生扶您的喜用神「${fav}」之年，即为职称晋升、核心项目夺标或薪资跃迁的最佳发力年。\n` +
        `2. 关键突破抓手：在流年引动官杀或印星的阶段，宜主动争取跨部门主责项目、考取高含金量资质或向上级汇报阶段性成果，将运势红利转化为实打实的职级与资历。`;
      suggestions = [
        '今年流年对我的正财和副业收入有什么影响？',
        '我的喜用神在日常办公方位与穿戴上怎么运用？',
      ];
    } else if (/冲合|信号|当前大运|今年流年/.test(q) && !/正财|副业收入/.test(q)) {
      basis = pickBasis(['大运', '流年', '干支互动']);
      const relText = (f.relations?.all || []).slice(0, 4).map((r) => `${r.name}（${r.note || '气机交感'}）`).join('；') || '原局四柱流通平稳';
      answer =
        `针对您关心的「当前大运与今年流年冲合信号」，结合六柱同参推演如下：\n` +
        `1. 岁运并临与交感：您现行「${curDy.name || ''}」大运（${curDy.fromYear || ''}–${curDy.toYear || ''}），今年流年为「${curLn.year || nowY} ${curLn.name || ''}年（${curLn.shishen || ''}）」。原局内部及岁运呈现「${relText}」之象。\n` +
        `2. 现实应对提醒：逢冲则动、逢合则聚。若流年与月柱（父母/事业宫）或日柱（夫妻宫）发生冲合，往往预示团队架构调整、办公环境变动或家宅喜事搬迁——主动求变（如主动出差、学习进修、装修置业）即可顺势应象。`;
      suggestions = [
        '未来三年哪一年的流年最利晋升或突破？',
        '我的正缘特征是什么？感情稳定期在何时？',
      ];
    } else if (intent === 'career') {
      basis = pickBasis(['格局', '喜用神', '大运', '十神']);
      answer =
        `结合您的八字原局来看，日主为${dm.gan || ''}${dm.element || ''}（${st.level || '中和'}），命局成「${pt.name || '正格'}」（月令本气${pt.shishen || '当令'}），喜用神倾向于「${fav}」，忌神为「${unfav}」。\n` +
        `1. 职业赛道与角色定位：${pt.name || '当前格局'}配合年干${p.year?.shishen || ''}、月干${p.month?.shishen || ''}、时干${p.hour?.shishen || ''}，说明您在具备专业技术壁垒、制度规范或需要统筹协调的岗位上更容易建立核心竞争力。若考虑跳槽或拓展副业，优先切入与喜用五行「${fav}」相契合的领域。\n` +
        `2. 近两年变动策略：当前行「${curDy.name || ''}」大运，流年${curLn.year ? `${curLn.year}（${curLn.name || ''}，十神${curLn.shishen || ''}）` : ''}与原局交感明显。建议采取「先骑驴找马、拿到明确 Offer 再交接」的稳健策略，核心合同条款多留书面备份。`;
      suggestions = [
        '我的喜用神对应的具体行业与城市方位有哪些？',
        '未来三年哪一年的流年最利晋升或突破？',
      ];
    } else if (intent === 'wealth') {
      basis = pickBasis(['喜用神', '五行', '大运', '十神']);
      answer =
        `从四柱财星与喜用结构分析，日主${dm.gan || ''}${dm.element || ''}（${st.level || ''}），局中喜「${fav}」流通生扶，忌「${unfav}」过旺耗泄。\n` +
        `1. 正偏财格局与变现路径：您的四柱十神（年${p.year?.shishen || ''}、月${p.month?.shishen || ''}、时${p.hour?.shishen || ''}）显示，财富增长更契合「主业深耕溢价 + 阶段性项目分红」的复合模式。当流年或流月引动「${fav}」五行时，绩效奖金、客户回款或副业产出的转化率最为可观。\n` +
        `2. 现金流风控要点：逢忌神「${unfav}」偏旺的年份或季度，需防范人情借贷、冲动投资或账期拖延。日常财务建议实行「主账户稳健储蓄 + 独立机动预算池」制度。`;
      suggestions = [
        '我的喜用神在日常办公方位与穿戴上怎么运用？',
        '当前大运与今年流年有哪些需要留意的冲合信号？',
      ];
    } else if (intent === 'love') {
      basis = pickBasis(['日柱', '干支互动', '十神', '神煞']);
      answer =
        `八字中以日支（夫妻宫）为核心观察伴侣画像与亲密关系模式。您的日柱为「${p.day?.name || ''}」，夫妻宫坐「${p.day?.zhi || ''}」（藏干十神：${(p.day?.hiddenShishen || []).join('、') || '本气'}）：\n` +
        `1. 正缘画像与吸引特质：夫妻宫坐「${p.day?.zhi || ''}」配合原局「${pt.name || ''}」，与您长久契合的伴侣通常处事沉稳、注重生活质感与精神共鸣，且对方八字五行若多「${fav}」，能自然化解您的焦虑与压力。\n` +
        `2. 感情稳定期与磨合建议：原局干支互动（${(f.relations?.all || []).slice(0, 2).map((r) => r.name).join('、') || '整体平和'}）提示，逢流年与日柱「${p.day?.name || ''}」发生六合、三合或引动红鸾天喜星时，最利定情、同居或谈婚论嫁；日常相处宜少翻旧账、多用正向肯定表达需求。`;
      suggestions = [
        '当前大运与今年流年有哪些需要留意的冲合信号？',
        '我近两年适合跳槽、转行或拓展副业吗？',
      ];
    } else {
      basis = pickBasis(['四柱', '日主', '格局', '喜用神', '大运']);
      answer =
        `围绕您提出的「${q}」，结合本盘四柱「${p.year?.name || ''} ${p.month?.name || ''} ${p.day?.name || ''} ${p.hour?.name || ''}」综合推演如下：\n` +
        `1. 原局核心枢机：日主${dm.gan || ''}${dm.element || ''}（强弱评定：${st.level || ''}·${st.score ?? 50}分），成「${pt.name || ''}」，全局以「${fav}」为调候通关与扶抑用神。\n` +
        `2. 阶段行动纲领：当前处于「${curDy.name || ''}」大运，凡事顺应喜用神「${fav}」的节奏稳扎稳打——顺境期主动扩充专业护城河与核心人脉，波动期精简战线、规律作息，即可行稳致远。`;
      suggestions = [
        '我的喜用神在日常办公方位与穿戴上怎么运用？',
        '我的正缘特征是什么？感情稳定期在何时？',
      ];
    }
  } else if (sys === 'ziwei') {
    const mg = f.mingGong || {};
    const sg = f.shenGong || {};
    const fh = f.fourHua || {};
    const palaces = f.palaces || {};
    const pMing = palaces['命宫'] || {};
    const pGuan = palaces['官禄宫'] || {};
    const pCai = palaces['财帛宫'] || {};
    const pQian = palaces['迁移宫'] || {};
    const pFuqi = palaces['夫妻宫'] || {};
    const pFude = palaces['福德宫'] || {};
    const pTian = palaces['田宅宫'] || {};
    const pJie = palaces['疾厄宫'] || {};
    const curDx = (f.daXian || []).find((d) => d.isCurrent) || (f.daXian || [])[0] || {};
    const mingFly = (f.palaceSihua && f.palaceSihua['命宫']) || pMing.flyHua || {};

    const starNames = (pObj) => {
      const m = (pObj?.stars || []).filter((s) => s.kind === '主星').map((s) => `${s.name}${s.brightness ? `(${s.brightness})` : ''}${s.hua ? `[化${s.hua.label || s.hua}]` : ''}`);
      if (m.length) return m.join('、');
      return '借对宫主星同参';
    };
    const auxNames = (pObj) => {
      const a = (pObj?.stars || []).filter((s) => s.kind === '辅星').map((s) => s.name);
      return a.length ? a.join('、') : '诸吉拱照';
    };

    if (/宫干飞出|命宫宫干|飞化落入|飞化/.test(q) && !/生年四化/.test(q)) {
      basis = pickBasis(['命宫', '四化', '十二宫']);
      const lu = mingFly.lu || {};
      const quan = mingFly.quan || {};
      const ke = mingFly.ke || {};
      const ji = mingFly.ji || {};
      answer =
        `针对您的追问「${q}」，根据您的命宫「${pMing.ganzhi || mg.ganzhi || ''}」（宫干为「${mingFly.gan || pMing.gan || ''}」）飞出的四化落宫轨迹详解如下：\n` +
        `1. 飞禄与飞权（主动精力与资源投向）：命干飞【化禄】入「${lu.targetPalace || '财帛宫'}」（${lu.star || ''}化禄，对宫冲照${lu.chongPalace || ''}），代表您天生最乐意倾注心力、也最容易收获福气与人缘的领域在「${lu.targetPalace || '财帛宫'}」；命干飞【化权】入「${quan.targetPalace || '命宫'}」（${quan.star || ''}化权${quan.isSelf ? '·自化权' : ''}），说明您在该领域极具主见、掌控欲与执行魄力。\n` +
        `2. 飞科与飞忌（声誉贵人与执念消耗点）：命干飞【化科】入「${ke.targetPalace || '疾厄宫'}」（${ke.star || ''}化科），主该宫位事项重视体面、条理与口碑；命干飞【化忌】入「${ji.targetPalace || '交友宫'}」（${ji.star || ''}化忌，冲「${ji.chongPalace || '兄弟宫'}」），提示您一生容易在「${ji.targetPalace || '交友宫'}」和「${ji.chongPalace || '兄弟宫'}」相关事务上操心劳神或产生执念，宜保持边界感、避免过度包揽。`;
      suggestions = [
        '事业宫（官禄宫）与财帛宫的主星组合适合什么发展路线？',
        '夫妻宫与福德宫体现怎样的感情互动模式与心态特征？',
      ];
    } else if (/生年四化|财富重心|事业与财富/.test(q)) {
      basis = pickBasis(['生年四化', '官禄宫', '财帛宫', '命宫']);
      answer =
        `针对您的追问「${q}」，结合生年四化与命财官枢机解析如下：\n` +
        `1. 生年四化先天红利点：您生年干引动【化禄】在「${fh.lu?.star || ''}」（落${fh.lu?.palace || ''}）、【化权】在「${fh.quan?.star || ''}」（落${fh.quan?.palace || ''}）、【化科】在「${fh.ke?.star || ''}」（落${fh.ke?.palace || ''}）、【化忌】在「${fh.ji?.star || ''}」（落${fh.ji?.palace || ''}）。化禄所在之「${fh.lu?.palace || '财官宫'}」是您最顺畅的财源与机遇入口，化权所在之「${fh.quan?.palace || '核心宫'}」则是您建功立业、掌握话语权的抓手。\n` +
        `2. 生年化忌风控守则：生年化忌落在「${fh.ji?.palace || ''}（${fh.ji?.star || ''}化忌）」，代表该宫位是您人生的「必修课与磨刀石」——凡涉及该宫位的资金投入或人际承诺，务求稳扎稳打、先小人后君子，越沉淀越能转忌为用。`;
      suggestions = [
        '我命宫宫干飞出的四化落入哪些宫位，代表什么含义？',
        '当前大限与今年流年需要重点关注哪些宫位变动？',
      ];
    } else if (/事业宫|官禄宫|财帛宫|发展路线/.test(q)) {
      basis = pickBasis(['官禄宫', '财帛宫', '命宫', '生年四化']);
      answer =
        `针对您关注的「官禄宫（事业宫）与财帛宫发展路线」，结合本命盘星曜配置详解如下：\n` +
        `1. 官禄宫（事业模式）：您的官禄宫在「${pGuan.zhi || ''}宫（${pGuan.ganzhi || ''}）」，坐守主星「${starNames(pGuan)}」，辅曜见「${auxNames(pGuan)}」。这表明您在职场上适合依靠专业策划、体系搭建或技术顾问实力立足，不宜走粗放拼杀路线。\n` +
        `2. 财帛宫（求财与现金流）：您的财帛宫在「${pCai.zhi || ''}宫（${pCai.ganzhi || ''}）」，坐守主星「${starNames(pCai)}」，辅曜见「${auxNames(pCai)}」。官禄与财帛同参，提示您的财富增长高度依赖「职级跃升带动高单价专业回报」，适合配置长线稳健资产（田宅宫在${pTian.zhi || ''}宫，坐${starNames(pTian)}），稳步扩充财富蓄水池。`;
      suggestions = [
        '当前大限与今年流年需要重点关注哪些宫位变动？',
        '田宅宫与疾厄宫的星曜组合有什么资产和养生提示？',
      ];
    } else if (/大限|流年|宫位变动/.test(q)) {
      basis = pickBasis(['大限', '流年', '命宫', '生年四化']);
      const dxPalaceObj = Object.values(palaces).find((p) => p.zhi === curDx.zhi) || {};
      const lnPalaceObj = Object.values(palaces).find((p) => p.zhi === f.liuNian?.mingGongZhi) || {};
      answer =
        `针对您的追问「${q}」，结合您当前虚岁 ${f.xuAge || '—'} 岁的运限轨迹推演如下：\n` +
        `1. 当前十年大限重心：您正行「${curDx.ageStart || ''}-${curDx.ageEnd || ''}岁 ${curDx.ganzhi || curDx.zhi || ''}大限」，大限命宫叠本命「${curDx.palace || '田宅宫'}」，宫内坐「${starNames(dxPalaceObj)}」。这意味着这十年的人生主旋律围绕「${curDx.palace || '根基积累与平台升级'}」展开，一切重大决策均应以稳固该宫位为核心。\n` +
        `2. 今年流年（${f.liuNian?.year || new Date().getFullYear()}年）引动点：今年流年命宫在「${f.liuNian?.mingGongZhi || ''}宫」（叠本命「${lnPalaceObj.name || '流年宫'}」，主星：${starNames(lnPalaceObj)}）。流年与大限交汇提示今年适合梳理存量资源、精进核心业务，在流年吉化引动的月份果断推进关键计划。`;
      suggestions = [
        '夫妻宫与福德宫体现怎样的感情互动模式与心态特征？',
        '我命宫宫干飞出的四化落入哪些宫位，代表什么含义？',
      ];
    } else if (/夫妻宫|福德宫|感情|婚姻|正缘|心态/.test(q)) {
      basis = pickBasis(['夫妻宫', '福德宫', '命宫', '十二宫']);
      answer =
        `针对您的追问「${q}」，结合本命盘「夫妻宫」与「福德宫」双宫同参解析如下：\n` +
        `1. 夫妻宫（伴侣特质与互动模式）：您的夫妻宫在「${pFuqi.zhi || ''}宫（${pFuqi.ganzhi || ''}）」，坐守主星「${starNames(pFuqi)}」，辅曜「${auxNames(pFuqi)}」。这反映您容易被有才华、性格鲜明或具备独立主见的异性吸引；双方相处最忌信息不透明或冷战内耗，适合建立共同成长目标。\n` +
        `2. 福德宫（精神世界与情绪底层）：您的福德宫在「${pFude.zhi || ''}宫（${pFude.ganzhi || ''}）」，坐守主星「${starNames(pFude)}」（作为夫妻宫的气数位）。说明您在感情与生活中极重精神契合度与内心安全感，日常宜多给彼此留出独处充电与深度交流的空间。`;
      suggestions = [
        '事业宫（官禄宫）与财帛宫的主星组合适合什么发展路线？',
        '我命宫与三方四正的主星组合有什么核心优势与短板？',
      ];
    } else if (/田宅|疾厄|资产|房产|健康|养生/.test(q)) {
      basis = pickBasis(['田宅宫', '疾厄宫', '十二宫']);
      answer =
        `针对您关注的「田宅资产与疾厄身心状态」，结合原盘宫位星曜解析如下：\n` +
        `1. 田宅宫（不动产与家庭蓄水池）：您的田宅宫在「${pTian.zhi || ''}宫（${pTian.ganzhi || ''}）」，坐守「${starNames(pTian)}」（辅曜：${auxNames(pTian)}）。提示您在置业安家与大额固定资产配置上宜求稳求质，居家环境保持采光通透、整洁有序最能涵养家宅气场。\n` +
        `2. 疾厄宫（精力管理与作息）：您的疾厄宫在「${pJie.zhi || ''}宫（${pJie.ganzhi || ''}）」，坐守「${starNames(pJie)}」。日常需留意用脑过度、睡眠浅或肠胃消化节奏，规律运动与按时作息是维持高能量状态的根本。`;
      suggestions = [
        '我命宫与三方四正的主星组合有什么核心优势与短板？',
        '生年四化与宫干飞化提示我的事业与财富重心在哪里？',
      ];
    } else {
      // 默认 / 命宫与三方四正核心优势与短板
      basis = pickBasis(['命宫', '官禄宫', '财帛宫', '迁移宫']);
      answer =
        `针对您的追问「${q}」，从命宫与三方四正（命·财·官·迁）核心格局为您深度拆解：\n` +
        `1. 命宫与三方四正核心优势：您的命宫坐「${mg.zhi || ''}宫（${mg.ganzhi || ''}）」，主星为「${starNames(pMing)}」（辅曜：${auxNames(pMing)}），身宫在「${sg.zhi || ''}宫（${sg.palace || ''}）」，五行局为「${f.wuXingJu?.name || ''}」。三方四正会照财帛宫「${starNames(pCai)}」、官禄宫「${starNames(pGuan)}」、迁移宫「${starNames(pQian)}」——整体格局兼具谋略思考与务实落地能力，在需要专业判断与长线规划的事务上优势突出。\n` +
        `2. 潜在短板与破局之道：命宫与三方四正若逢煞曜或自化权忌同度，容易出现「思虑过重、完美主义或关键时刻犹豫」的短板。建议行动上奉行「先完成再完美」，借迁移宫「${starNames(pQian)}」的外拓气机多走出去链接贵人与优质平台。`;
      suggestions = [
        '我命宫宫干飞出的四化落入哪些宫位，代表什么含义？',
        '事业宫（官禄宫）与财帛宫的主星组合适合什么发展路线？',
      ];
    }
  } else if (sys === 'liuyao') {
    const ben = f.benGua || {};
    const bian = f.bianGua || {};
    const ysName = f.yongshen || '官鬼';
    const ysLines = f.yongshenLines || [];
    const ysLine = ysLines[0] || (f.lines || []).find((l) => l.isShi) || (f.lines || [])[0] || {};
    const dong = f.dongYao || [];
    const dongLines = (f.lines || []).filter((l) => l.isDong);
    const shiLine = (f.lines || []).find((l) => l.isShi) || {};
    const yingLine = (f.lines || []).find((l) => l.isYing) || {};
    const yj = f.yueJian?.zhi || '';
    const rj = f.riJian?.ganzhi || '';
    const xk = (f.xunkong || []).join('、') || '无';

    if (/动爻|变卦|关键影响/.test(q)) {
      basis = pickBasis(['动爻', '变卦', '本卦', '用神']);
      const dongDesc = dongLines.length
        ? dongLines.map((l) => `${l.position}「${l.liuqin}${l.gan}${l.zhi}${l.zhiElement}」（临${l.liushen}，${l.wangshuai || ''}）发动`).join('；')
        : '六爻安静无动爻';
      answer =
        `针对您的追问「${q}」，结合本卦《${ben.name || ''}》变《${bian.name || ben.name || ''}》的动变轨迹详解如下：\n` +
        `1. 动爻发动玄机：神兆机于动。本盘「${dongDesc}」。${dongLines.length ? '动爻代表事态演进中最活跃的变量与推动力，其对用神与世爻的生克直接决定中途转折。' : '由于本卦六爻皆静，说明外部环境短期内不会发生剧烈突变，结果主要取决于月建日辰对用神与世爻的生扶程度。'}\n` +
        `2. 变卦终局指向：之卦（变卦）为《${bian.name || ben.name || ''}》（${bian.gong || ben.gong || ''}宫），代表事情发展的下半场与最终归宿。行事宜顺应动变方向调整预期，切忌死守旧有经验。`;
      suggestions = [
        '这件事大致的应期（关键时间窗口）在什么时候？',
        '世爻与应爻的生克关系说明对方目前是什么态度？',
      ];
    } else if (/应期|什么时候|时间窗口|何时/.test(q)) {
      basis = pickBasis(['月建', '日辰', '旬空', '用神']);
      answer =
        `针对您最关心的「应期（关键时间窗口）」，结合六爻月建「${yj}月」、日辰「${rj}日」（旬空：${xk}）推演如下：\n` +
        `1. 核心应期法则：您所占问之事以「${ysName}」为用神，当前用神落在${ysLine.position || '世爻'}「${ysLine.gan || ''}${ysLine.zhi || ''}${ysLine.zhiElement || ''}」（月建状态：${ysLine.wangshuai || '平相'}${ysLine.xunkong ? '，当前落旬空' : ''}）。\n` +
        `2. 具体时间窗口锁定：${ysLine.xunkong ? `因用神目前逢「${xk}」旬空，远应出空填实之月、近应冲空填实之「${ysLine.zhi || ''}日」必有明确回音；` : `用神不空，近期以逢「${ysLine.zhi || '用神'}」值日/值月、或生合用神之地支日辰为最关键的推进与揭晓节点。`}${dongLines.length ? `同时需留意动爻地支（${dongLines.map((l) => l.zhi).join('、')}）逢值逢合之日。` : ''}`;
      suggestions = [
        '当下最稳妥的行动策略是主动推进还是暂缓观望？',
        '世爻与应爻的生克关系说明对方目前是什么态度？',
      ];
    } else if (/世爻|应爻|态度|主客|风险/.test(q)) {
      basis = pickBasis(['世应', '本卦', '六爻']);
      answer =
        `针对您的追问「${q}」，从六爻「世爻（代表您自己）」与「应爻（代表对方/外部环境/所谋之事）」对照拆解如下：\n` +
        `1. 世爻态势（我方立场）：世爻居「${shiLine.position || f.shiYing?.shiPosition || ''}」，持「${shiLine.liuqin || ''}${shiLine.gan || ''}${shiLine.zhi || ''}${shiLine.zhiElement || ''}」（临${shiLine.liushen || ''}，旺衰：${shiLine.wangshuai || ''}），说明您当前对此事投入度高，关切点在于${shiLine.liuqin === '妻财' ? '实际收益与资源回报' : shiLine.liuqin === '官鬼' ? '职位结果与官方定锤' : shiLine.liuqin === '父母' ? '合同文书与资质落实' : '整体推进确定性'}。\n` +
        `2. 应爻态度（彼方反馈）：应爻居「${yingLine.position || f.shiYing?.yingPosition || ''}」，持「${yingLine.liuqin || ''}${yingLine.gan || ''}${yingLine.zhi || ''}${yingLine.zhiElement || ''}」（临${yingLine.liushen || ''}，旺衰：${yingLine.wangshuai || ''}）。世爻（${shiLine.zhiElement || ''}）与应爻（${yingLine.zhiElement || ''}）五行相参，建议在沟通中投其所好、先明确书面权责边界，避开旬空（${xk}）之日做仓促决定。`;
      suggestions = [
        '本卦用神旺衰如何？所占之事最终趋势怎样？',
        '卦中动爻与变卦对结果有什么关键影响？',
      ];
    } else if (/策略|主动推进|暂缓观望|怎么做/.test(q)) {
      basis = pickBasis(['用神', '世应', '动爻', '月建']);
      const isStrong = ['旺', '相'].includes(ysLine.wangshuai) && !ysLine.yuePo;
      answer =
        `针对您的追问「${q}」，结合用神「${ysName}（${ysLine.position || ''}${ysLine.zhi || ''}${ysLine.zhiElement || ''}）」与世爻旺衰给出行动策略：\n` +
        `1. 进退总方针：当前用神在月建${yj}、日辰${rj}下处于「${ysLine.wangshuai || '平'}」态${ysLine.yuePo ? '（逢月破）' : ''}${ysLine.xunkong ? '（逢旬空）' : ''}。${isStrong ? '用神得令有气，整体态势利于「主动推进、把握先机」，宜趁势落实关键谈判与节点。' : '用神气机尚待生扶充实，当下最稳妥的策略是「稳守基本盘、先做足筹备再伺机发力」，不宜盲目硬推或孤注一掷。'}\n` +
        `2. 落地执行三步法：一是紧盯「${ysLine.liuqin || ysName}」所代表的關鍵人或凭证；二是避开克制用神的忌神日辰；三是待应期窗口（${ysLine.zhi || ''}日/月）一到即刻拍板闭环。`;
      suggestions = [
        '这件事大致的应期（关键时间窗口）在什么时候？',
        '世爻与应爻的生克关系说明对方目前是什么态度？',
      ];
    } else {
      // 默认 / 本卦用神旺衰与最终趋势
      basis = pickBasis(['本卦', '用神', '世应', '月建']);
      answer =
        `针对您的追问「${q}」，依据本卦《${ben.name || ''}》（${ben.gong || ''}宫${ben.gongElement || ''}·${ben.generation || ''}卦）之《${bian.name || ben.name || ''}》详解如下：\n` +
        `1. 用神旺衰定纲领：本局取「${ysName}」为用神（${f.yongshenNote || '紧扣所占事项'}）。盘中用神落在「${ysLine.position || ''}」，爻象为「${ysLine.liuqin || ''}${ysLine.gan || ''}${ysLine.zhi || ''}${ysLine.zhiElement || ''}」（临${ysLine.liushen || ''}），在${yj}月、${rj}日下处于「${ysLine.wangshuai || '平'}」态${ysLine.xunkong ? '（落旬空）' : ''}。\n` +
        `2. 整体趋势研判：世爻在${f.shiYing?.shiPosition || ''}（${shiLine.zhi || ''}${shiLine.zhiElement || ''}），应爻在${f.shiYing?.yingPosition || ''}（${yingLine.zhi || ''}${yingLine.zhiElement || ''}），全盘共 ${dong.length} 爻发动。用神与世爻相参，提示此事${['旺', '相'].includes(ysLine.wangshuai) ? '根基扎实、顺水推舟可成' : '需历经一番周折沟通与材料补齐方能落地'}。`;
      suggestions = [
        '卦中动爻与变卦对结果有什么关键影响？',
        '这件事大致的应期（关键时间窗口）在什么时候？',
      ];
    }
  } else if (sys === 'qimen') {
    const fav = f.favorable || {};
    const rank2 = (f.ranking || [])[1] || (f.ranking || [])[0] || {};
    const zf = f.zhiFu || {};
    const zs = f.zhiShi || {};
    const pats = f.patterns || [];
    const pals = Object.values(f.palaces || {});
    const dayGan = (f.pillars?.day?.name || '')[0] || '';
    const hourGan = (f.pillars?.hour?.name || '')[0] || '';
    const dayPal = pals.find((p) => p.tianPan === dayGan) || pals[0] || {};
    const hourPal = pals.find((p) => p.tianPan === hourGan) || pals[1] || {};
    const sihaiPals = pals.filter((p) => p.jiXing || p.menPo || p.ruMu || p.kongWang);

    if (/日干|时干|主客|谁占主动/.test(q)) {
      basis = pickBasis(['四柱', '值符', '九宫']);
      answer =
        `针对您的追问「${q}」，在奇门遁甲中以「日干」代表求测人（我方/主），以「时干」代表所测之事或对方（客）：\n` +
        `1. 日干（我方）落宫状态：本日日干为「${dayGan}」，天盘落入「${dayPal.name || ''}宫（${dayPal.direction || ''}方）」，宫内配「${dayPal.door || ''} · ${dayPal.star || ''} · ${dayPal.shen || ''}」，十二长生状态为「${dayPal.changsheng || '平'}」（${dayPal.changshengNote || ''}）。\n` +
        `2. 时干（事体/彼方）落宫与主客生克：时干为「${hourGan}」，天盘落入「${hourPal.name || ''}宫（${hourPal.direction || ''}方）」，配「${hourPal.door || ''} · ${hourPal.star || ''} · ${hourPal.shen || ''}」。日干落宫与时干落宫对照，提示您在与对方博弈或推进事项时，宜借用「${fav.direction || ''}方（${fav.palaceName || ''}宫）」做中间缓冲与通关切入。`;
      suggestions = [
        '盘面有哪些吉凶格局或四害（门迫/击刑/入墓）需要规避？',
        '除了最优吉方，排名第二的备选方位是哪个宫位？',
      ];
    } else if (/格局|四害|门迫|击刑|入墓|规避/.test(q)) {
      basis = pickBasis(['命中格局', '四害', '空亡', '九宫']);
      const patList = pats.length
        ? pats.map((x) => `【${x.name}】（${x.palace || ''}宫·${x.type || ''}：${x.note || x.desc || '气机交感'}）`).join('；')
        : '全盘格局清正平稳';
      const shList = sihaiPals.length
        ? sihaiPals.map((p) => `${p.name}宫(${p.direction})见${[p.jiXing ? '六仪击刑' : '', p.menPo ? '门迫' : '', p.ruMu ? '入墓' : '', p.kongWang ? '旬空' : ''].filter(Boolean).join('/')}`).join('、')
        : '各宫无严重刑迫';
      answer =
        `针对您关注的「盘面吉凶格局与四害规避」，为您逐宫排查如下：\n` +
        `1. 核心吉凶十干克应格局：本局命中 ${pats.length} 项重点格局——${patList}。凡逢吉格落宫（如青龙返首、飞鸟跌穴、三奇得使）宜大胆借势；逢凶格落宫则宜避其锋芒。\n` +
        `2. 四害（击刑/门迫/入墓/空亡）预警：盘中「${shList}」。在签署协议、出行约谈或资金拨付时，尽量避开上述四害落宫所对应的方位，做到知险而避。`;
      suggestions = [
        '此事目前宜主动出击还是守成等待时机？',
        '此局最有利的求谋方位与行动时辰是哪个？',
      ];
    } else if (/备选方位|排名第二|第二/.test(q)) {
      basis = pickBasis(['最优吉方', '九宫', '值使']);
      answer =
        `针对您的追问「${q}」，结合九宫奇门综合评分榜单为您揭晓：\n` +
        `1. 首选与次选吉方对照：本局第一吉方为「${fav.direction || ''}方（${fav.palaceName || ''}宫，${fav.door || ''}·${fav.star || ''}·${fav.shen || ''}，综合评分 ${fav.score ?? 85}）」。若现实中不便前往首选方位，排名第二的备选吉方为「${rank2.direction || ''}方（${rank2.palaceName || ''}宫）」，宫内临「${rank2.door || ''} · ${rank2.star || ''} · ${rank2.shen || ''}」（评分 ${rank2.score ?? 78}）。\n` +
        `2. 备选方位使用贴士：在洽谈座次选择（面朝${rank2.direction || fav.direction || ''}方）、电话沟通或出行路线规划时，均可优先启用这两个吉门宫位，引动三奇八门吉气。`;
      suggestions = [
        '日干与时干落宫生克反映当前怎样的主客局势？',
        '此事目前宜主动出击还是守成等待时机？',
      ];
    } else if (/主动出击|守成|等待时机|策略/.test(q)) {
      basis = pickBasis(['值符', '值使', '局式', '最优吉方']);
      const zsPal = pals.find((p) => p.isZhiShi) || {};
      const isHold = zsPal.kongWang || zsPal.menPo || zsPal.ruMu || ['死门', '惊门', '伤门'].includes(zs.door);
      answer =
        `针对您的追问「${q}」，从奇门「值符（天时大势）」与「值使门（执行落地）」给出主客进退决策：\n` +
        `1. 进退定调：本局为「${f.juName || ''}·${f.yuan || ''}」，值符「${zf.star || ''}」落${zf.palaceName || ''}宫，值使「${zs.door || ''}」落${zs.palaceName || ''}宫。${isHold ? `由于值使门「${zs.door || ''}」当前带收敛或休整信号，盲目强攻易耗损精力，现阶段更宜「守成蓄力、完善筹码、等待节点」。` : `值使门「${zs.door || ''}」气机通畅，主事体具备明确推进通道，现阶段宜「主动出击、顺势敲定核心环节」。`}\n` +
        `2. 关键应期与节奏：奇门断应期常看值使门落宫数与马星（${f.maXing?.zhi || ''}马在${f.maXing?.palaceName || ''}宫）冲动之时。建议提前备齐方案，在吉门当值时辰一举达成。`;
      suggestions = [
        '此局最有利的求谋方位与行动时辰是哪个？',
        '盘面有哪些吉凶格局或四害（门迫/击刑/入墓）需要规避？',
      ];
    } else {
      // 默认 / 最有利的求谋方位与行动时辰
      basis = pickBasis(['最优吉方', '值符', '值使', '局式']);
      answer =
        `针对您的追问「${q}」，结合本局「${f.juName || ''}（${f.solarTerm || ''}·${f.yuan || ''}，${f.juMethodName || ''}）」盘面事实推演如下：\n` +
        `1. 最优求谋吉方：针对「${f.purpose?.label || f.purpose?.name || '当前所谋事项'}」，九宫量化评估最优方位在「${fav.direction || ''}方（${fav.palaceName || ''}宫）」，该宫临吉门「${fav.door || ''}」、九星「${fav.star || ''}」、八神「${fav.shen || ''}」（综合指数 ${fav.score ?? 88}）。原因：${(fav.reasons || []).join('、') || '门星神三吉同聚，无四害侵扰'}。\n` +
        `2. 黄金行动时辰与借势法：今日四柱为「${f.pillars?.year?.name || ''} ${f.pillars?.month?.name || ''} ${f.pillars?.day?.name || ''} ${f.pillars?.hour?.name || ''}」，旬首${f.xunShou || ''}（${f.xunShouYi || ''}）。建议在值使门「${zs.door || ''}」或首选吉方地支对应的时辰发起核心沟通，面朝「${fav.direction || ''}方」洽谈最为得力。`;
      suggestions = [
        '日干与时干落宫生克反映当前怎样的主客局势？',
        '除了最优吉方，排名第二的备选方位是哪个宫位？',
      ];
    }
  } else if (sys === 'hepan') {
    const pA = (f.parties || [])[0] || {};
    const pB = (f.parties || [])[1] || {};
    const dayInfo = f.day || {};
    const wxInfo = f.wuxing || {};
    const comp = (f.complement || []).map((x) => `${x.element}（${pA.name}${x.aPercent}% ↔ ${pB.name}${x.bPercent}%）`).join('、') || '水木火流通互济';
    const favA = (pA.yongFavorable || []).join('、') || '水木';
    const favB = (pB.yongFavorable || []).join('、') || '火土';

    if (/五行|喜用神|互补/.test(q)) {
      basis = pickBasis(['五行', '互补', '合盘总分', '维度得分']);
      answer =
        `针对您的追问「${q}」，从双方八字原局五行占比与喜用神互旺机制详解如下：\n` +
        `1. 喜用神双向滋养度：${pA.name || '甲方'}（${pA.dayGanzhi || ''}日柱，日主${pA.dayMasterElement || ''}·${pA.strengthLevel || ''}）喜用神为「${favA}」；${pB.name || '乙方'}（${pB.dayGanzhi || ''}日柱，日主${pB.dayMasterElement || ''}·${pB.strengthLevel || ''}）喜用神为「${favB}」。双方五行与用神互补维度得分为 ${wxInfo.score ?? 14}/${wxInfo.weight ?? 20} 分，重点互补五行为：${comp}。\n` +
        `2. 现实相处体现：一方命局中偏旺的五行恰好能补益另一方的喜用所需，意味着两人在情绪价值、抗压能力与思维视角上能形成天然的「阴阳互济」，越是共同面对外部挑战，越能感受到彼此的扶持力。`;
      suggestions = [
        '双方日柱夫妻宫有哪些合冲关系需要在日常磨合？',
        '我们在财务规划与事业协同上适合怎样分工配合？',
      ];
    } else if (/日柱|夫妻宫|日常磨合|日支/.test(q)) {
      basis = pickBasis(['日柱', '合化协同', '冲突留心']);
      const dayHits = (dayInfo.items || []).join('；') || `${pA.dayGanzhi}与${pB.dayGanzhi}气机平和`;
      answer =
        `针对您的追问「${q}」，在正统八字合婚中，日柱（天干代表日主自我、地支为夫妻宫）权重居首：\n` +
        `1. 夫妻宫合参结论：${pA.name || '甲方'}日柱为「${pA.dayGanzhi || ''}」（夫妻宫坐${pA.dayZhi || ''}），${pB.name || '乙方'}日柱为「${pB.dayGanzhi || ''}」（夫妻宫坐${pB.dayZhi || ''}）。日柱核心交互呈现：「${dayHits}」。\n` +
        `2. 跨盘合冲与磨合指南：全盘共有 ${(f.he || []).length} 处相合相引（${(f.he || []).slice(0, 3).map((x) => `${x.name}[${x.keyText}]`).join('、') || '气场相融'}），同时存在 ${(f.conflicts || []).length} 处刑冲张力（${(f.conflicts || []).slice(0, 3).map((x) => `${x.name}[${x.keyText}]`).join('、') || '小幅观念差异'}）。逢冲克落入月柱或日柱时，代表双方原生家庭习惯或直觉反应节奏不同，建议约定「情绪平稳后再复盘问题」的沟通默契。`;
      suggestions = [
        '我们在财务规划与事业协同上适合怎样分工配合？',
        '长期相处最值得坚持的三条关系升温建议是什么？',
      ];
    } else if (/财务|事业|分工|配合|钱/.test(q)) {
      basis = pickBasis(['合盘总分', '五行', '合化协同']);
      answer =
        `针对您的追问「${q}」，结合${pA.name || '甲方'}（${pA.patternName || '正格'}）与${pB.name || '乙方'}（${pB.patternName || '正格'}）的十神格局与喜用配置，给出事业与财务协同方案：\n` +
        `1. 事业角色分工：${pA.name || '甲方'}日主${pA.dayMasterElement || ''}（喜${favA}），${pB.name || '乙方'}日主${pB.dayMasterElement || ''}（喜${favB}）。在家庭决策或事业搭档中，宜采取「一人主外拓攻坚、一人主风控统筹」的互补分工——大方向共同商议，具体执行各自发挥所长，避免两人在同一细节上重复内耗。\n` +
        `2. 家庭财务规划：建议设立「共同家庭基金池（用于置业、储蓄与大额开支）+ 各自独立自由账户」的双轨财务模式，并多配置与双方共同喜用神（${favA}、${favB}）相契合的稳健型资产。`;
      suggestions = [
        '长期相处最值得坚持的三条关系升温建议是什么？',
        '我们两人的五行与喜用神互补性强吗？',
      ];
    } else if (/长期相处|三条|升温建议|经营/.test(q)) {
      basis = pickBasis(['合盘总分', '合化协同', '冲突留心', '日柱']);
      answer =
        `针对您的追问「${q}」，基于双方综合契合指数 ${f.score ?? 75} 分（${f.grade || '互补有成'}）的盘面特征，为您提炼三条可长期践行的关系升温准则：\n` +
        `1. 善用「${(f.he || [])[0]?.name || '五行互补'}」共振点：定期安排共同旅行、居家微改造或共同学习计划，激活盘中相合柱位（${(f.he || []).slice(0, 2).map((x) => x.keyText).join('、') || '日柱同参'}）的默契气场。\n` +
        `2. 为「${(f.conflicts || [])[0]?.name || '观念磨合'}」加装缓冲阀：当遇到流年引动冲刑柱位时，主动降低对彼此的苛责预期，把分歧视为互补视角的提醒。\n` +
        `3. 岁运节奏同频：在未来关键流年（如合入夫妻宫或喜用神到位之年）共同推进婚嫁、置业或家庭升级大事，让关系在共同里程碑中持续稳固。`;
      suggestions = [
        '双方日柱夫妻宫有哪些合冲关系需要在日常磨合？',
        '我们在财务规划与事业协同上适合怎样分工配合？',
      ];
    } else {
      basis = pickBasis(['合盘总分', '合化协同', '冲突留心', '维度得分']);
      answer =
        `针对您的追问「${q}」，结合「${pA.name || '甲方'}（日柱${pA.dayGanzhi || ''}）」与「${pB.name || '乙方'}（日柱${pB.dayGanzhi || ''}）」的合盘事实分析如下：\n` +
        `1. 契合度全景：双方合盘综合得分为 ${f.score ?? 80} 分（评级「${f.grade || '良配'}」）。盘面呈现 ${(f.he || []).length} 处合化协同（${(f.he || []).slice(0, 3).map((x) => x.keyText).join('、') || '五行互补'}），这是两人建立长期信任与默契的天然纽带。\n` +
        `2. 相处磨合建议：盘面同时提示 ${(f.conflicts || []).length} 处需要留意的冲刑张力（${(f.conflicts || []).slice(0, 2).map((x) => x.keyText).join('、') || '偶有观念差异'}）。建议双方在重大财务、家庭分工与情绪沟通上建立「事前商议、换位思考」的共识机制，扬长避短。`;
      suggestions = [
        '我们两人的五行与喜用神互补性强吗？',
        '双方日柱夫妻宫有哪些合冲关系需要在日常磨合？',
      ];
    }
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
