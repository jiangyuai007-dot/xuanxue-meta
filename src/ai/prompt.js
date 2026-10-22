/**
 * prompt —— system / user 组装
 *
 * 三件事：
 *   1. 把「事实编号表」精确注入（AI 看到的命理事实只有这些，且带编号）
 *   2. 写死护栏：不得推算事实、不得编造编号、不得医疗/投资/法律结论、不得断言式预测
 *   3. 说明输出方式：主路径 tool calling；降级路径输出单个 JSON 对象（与 tool schema 同形）
 */

import { describeSchema } from './schema.js';
import { fillDesc } from '../core/reportPlan.js';

const IDENTITY =
  '你是一位中文传统命理（八字/子平）文化的解读助手，文风克制、具体、可读，面向普通读者。';

/** 全局铁律：所有章节共用，一字不改（AI 改不了事实，只能改写人话） */
const RULES = [
  '【事实边界】只能使用下方「事实编号表」中出现过的命理信息。严禁自行排列八字、自行推算格局、旺衰、大运、流年、神煞，严禁补充或修正任何事实。',
  '【依据溯源】basis 字段只能引用事实编号（形如 F1、F3、F5），不得写标题、不得编造编号、不得引用表中不存在的编号。同一编号可重复引用。',
  '【表述口径】一律用倾向性、建议性表述（「更倾向」「往往」「可以留意」），严禁断言式预测（「你一定会」「注定」「必然」）。同一命盘两次生成的核心结论必须一致。',
  '【合规红线】不得给出任何医疗诊断、药材、疗法、就诊建议；不得给出证券、彩票、收益承诺或具体投资标的；不得给出法律结论。涉及健康与财务时，把落脚点放在作息习惯、风险分散、专业机构咨询上。',
  '【不得迷信商业化】不得推销改运、化煞、做法事、开光、破太岁等任何付费玄学服务。',
  '【文风】直接写内容，不写前言后记，不重复章节标题，不使用 Markdown 标题符号（# 等）。summary 用单个换行 \\n 分段。',
  '【不越位】不得评价事实本身（「这份盘看起来有问题」），不得提示用户重新排盘。',
].join('\n');

/** 章节级额外约束（如健康章的医疗红线） */
const GUARD_RULES = {
  health: [
    '【健康章特别约束】全文不得出现任何具体病症、器官、药材、剂量、诊疗方案的指向性描述；不要把五行强弱换算成身体器官结论。只谈作息、睡眠、饮食节制、体检与专业就医的普遍性原则。',
  ],
  caiyun: [
    '【财运章特别约束】不得推荐任何具体证券、基金、币种、彩票号码，不得给出收益率或翻倍类承诺；只谈现金流管理、决策节奏与风险分散的普遍性原则。',
  ],
};

export function buildSystem(chapter) {
  const extra = GUARD_RULES[chapter.guard] || [];
  return [IDENTITY, RULES, ...extra].join('\n\n');
}

/**
 * 组装 user prompt
 * @param {object} chapter  章节定义
 * @param {Array<{id:string,text:string}>} factLines 已编号的事实行
 * @param {object} opts { free, locale }  （保留扩展位，暂不参与内容）
 */
export function buildUser(chapter, factLines, opts = {}) {
  const lines = factLines.map((f) => `${f.id} ${f.text}`).join('\n');
  const slotDesc = describeSchema(chapter.slots);
  const ids = factLines.map((f) => f.id);
  const label = opts.free ? '（本章为免费章节）' : '';

  return [
    `请填写章节「${chapter.title}」${label}。`,
    '',
    '【事实编号表】（以下 F 编号是本次可引用的全部事实，不得超出）',
    lines || '（本表为空，请只做通用性表述并留空 basis）',
    '',
    '【本章需填写的槽位】',
    slotDesc,
    '',
    `【格式要求】`,
    `方式一（首选）：直接调用 fill_report 工具，参数与上面槽位一一对应。`,
    `方式二（工具调用不可用时）：只输出一个 JSON 对象，键名与槽位名完全一致，不要包裹在解释文字里，不要使用 markdown 代码块以外的包装。`,
    '',
    `【basis 取值】只能从这些编号里选：${ids.join('、') || '（无）'}`,
  ]
    .filter((x) => x !== null)
    .join('\n');
}

/**
 * 重试时的精简 user（降温度 + 逐槽位点名长度）
 * 上一轮失败的典型原因是 max_tokens 截断导致模型只写到 summary 就收笔，
 * 所以重试要把「每项都必须填满、字数拉够」写在最前面。
 */
export function buildRetryUser(chapter, factLines) {
  const lines = factLines.map((f) => `${f.id} ${f.text}`).join('\n');
  const sum = chapter.slots?.summary || {};
  const sumLen = `${sum.min ?? 160}-${sum.max ?? 320} 字，务必写满，不要提前收笔`;
  const pts = chapter.slots?.points || {};
  const ptLen = `${pts.min ?? 3} 项，每项 t ≤ ${pts.item?.t?.max ?? 8} 字、d ${pts.item?.d?.min ?? 30}-${pts.item?.d?.max ?? 90} 字`;
  const adv = chapter.slots?.advice || {};
  const advLen = `${adv.min ?? 2}-${adv.max ?? 3} 条，每条 ≤ ${adv.item?.max ?? 60} 字`;

  return [
    `请重新填写章节「${chapter.title}」，这次必须把所有槽位写全。硬性要求：`,
    `1) 只输出一个 JSON 对象，不要调用工具，不要任何解释文字;`,
    `2) 键名与槽位完全一致：${Object.keys(chapter.slots || {}).join('、')}，一个都不能少;`,
    `3) summary ${sumLen};`,
    `4) points ${ptLen};`,
    `5) basis 只填事实编号（2-${chapter.slots?.basis?.max ?? 4} 个）;`,
    `6) advice ${advLen};`,
    `7) 不得添加事实编号表之外的任何命理信息。`,
    `事实：\n${lines}`,
  ].join('\n');
}

export { RULES as FACT_RULESET, GUARD_RULES };
