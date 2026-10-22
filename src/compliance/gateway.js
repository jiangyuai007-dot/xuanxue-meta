/**
 * 合规网关 —— 所有对外文案的唯一出口
 * 三道处理：断言弱化 → 高风险内容改写 → 免责声明注入
 * 设计铁律：本模块不可被运营配置绕过；免责声明为硬编码
 *
 * 免责声明总开关 DISCLAIMER_ENABLED（2026-10-05 由产品负责人要求关闭）：
 *   产品侧需求是「报告每个结尾不要再出现免责声明」，故统一置 false。
 *   关闭后：① 章节正文不再追加声明 ② 报告页 .disc 不输出 ③ 分享卡 SVG 不输出
 *           ④ 锁定章钩子文本不再拼接声明 ⑤ 前端支付弹层不再展示声明。
 *   置回 true 即可全站一次性恢复，无需改任何调用点。
 *   注意：页脚小字与《条款与免责声明》页（web/terms.html）属站内法律入口，
 *         不在本开关管辖范围，始终保留。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const AUDIT_DIR = path.join(ROOT, 'data', 'audit');

export const DISCLAIMER =
  '本报告基于传统命理文化的规则化推演，属于文化与自我探索类参考内容，不构成医疗、投资、法律或任何决策建议，请结合现实情况独立判断。';

/** 免责声明总开关：false = 所有报告出口均不输出免责声明 */
export const DISCLAIMER_ENABLED = false;

/** 按开关取声明文本（关闭时返回空串，调用方据此决定是否渲染） */
export const disclaimerText = () => (DISCLAIMER_ENABLED ? DISCLAIMER : '');

/**
 * 断言性表述 → 弱表述
 * 注意：只做「词组级」替换，绝不用单字宽匹配——
 * 否则会把命理术语（空亡、亡神）与否定式（不必、不一定）改坏，反而暴露出机器痕迹。
 * 顺序敏感的否定式（不一定）必须排在宽规则（一定）之前。
 */
const ASSERTION_MAP = [
  ['不一定', '未必'], ['不必定', '未必'],
  ['百分之百', '大概率'], ['毫无疑问', '从倾向看'],
  ['必然会', '较可能'], ['一定会', '较可能'], ['肯定会', '较可能'], ['绝对会', '较可能'],
  ['必定', '较可能'], ['必然', '往往'], ['注定', '倾向'],
  ['难免会', '有可能'], ['逃不掉', '需要留意'],
  ['必能', '较可能'], ['必会', '较可能'], ['必将', '或将'], ['必主', '多主'],
  ['肯定', '可能'], ['绝对', '通常'], ['一定', '可能'],
];

/** 高风险类别：命中即整句改写 */
const HIGH_RISK = [
  { key: 'medical', words: ['绝症', '癌症', '不治', '死亡', '寿命', '死期', '重病', '残疾'], rewrite: '涉及健康与医疗的事项，请以专业医疗机构诊断为准，此处不作任何判断。' },
  { key: 'legal', words: ['牢狱', '判刑', '坐牢', '官非缠身', '诉讼必败', '犯罪'], rewrite: '涉及法律判断的事项，请咨询专业法律人士，此处不作任何判断。' },
  { key: 'invest', words: ['涨停', '荐股', '必涨', '翻倍', '彩票', '号码', '稳赚', '包赚'], rewrite: '涉及投资与财务收益的事项，请咨询持牌专业机构，此处不作任何判断。' },
  // 迷信类只拦「服务/法事」语义，不拦普通词——
  // 「化解」是现代汉语常用词（沟通化解矛盾），裸匹配会把正常句子整句改写掉。
  { key: 'superstition', words: ['改运', '做法事', '驱邪', '消灾', '转运改运', '破太岁', '开光', '符咒', '化解之法', '化解煞气', '请人化解', '化煞', '施法', '请符'], rewrite: '本产品不提供任何改运、化解类服务，也不建议为此付费。如需情绪支持，建议寻求专业心理咨询。' },
  { key: 'threat', words: ['血光', '灾祸', '大凶', '横死', '家破人亡', '破产', '车祸', '天灾'], rewrite: '此处仅作传统文化层面的象征性描述，不构成对现实事件的预测。请理性看待，注意日常安全即可。' },
];

/**
 * 敏感词（直接替换，不改写整句）
 * 同 ASSERTION_MAP：不做单字宽匹配。
 * 「亡」已从表中移除——它是术语「空亡 / 亡神」的组成部分，替换会把专业文案改坏。
 */
const SENSITIVE_MAP = [
  ['克夫', '性格强势'], ['克妻', '关系磨合较多'], ['克子', '亲子相处需多沟通'],
  ['克父母', '与长辈观念差异较大'], ['孤寡', '独处时间较多'],
  ['贱命', '起伏较多'], ['夭折', '早年需多注意养护'],
];

/**
 * 切句：只按句末标点与换行切分。
 * 注意：不要用 trim() 过滤——纯换行片段被丢掉会让整份报告的空行全部消失、段落粘连。
 * 只丢弃真正的空串。
 */
function splitSentences(text) {
  return text.split(/(?<=[。！？；\n])/).filter((s) => s.length > 0);
}

/** 取出片段末尾的换行/空格，改写整句时沿用，避免段落被吃掉 */
const tailSpace = (s) => (s.match(/[\n\r\t ]+$/) || [''])[0];

/**
 * 合规过滤
 * @param {string} text
 * @param {{ system?:string, section?:string }} ctx
 * @returns {{ text:string, blocked:Array, disclaimer:string }}
 */
export function gate(text, ctx = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return { text: '', blocked: [], disclaimer: disclaimerText() };
  }
  const blocked = [];

  // 1) 高风险整句改写
  let sentences = splitSentences(text);
  sentences = sentences.map((s) => {
    for (const r of HIGH_RISK) {
      if (r.words.some((w) => s.includes(w))) {
        blocked.push({ type: r.key, original: s.trim().slice(0, 60), action: 'rewrite' });
        return r.rewrite + tailSpace(s);
      }
    }
    return s;
  });
  let out = sentences.join('');

  // 2) 敏感词替换
  for (const [from, to] of SENSITIVE_MAP) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
      blocked.push({ type: 'sensitive', original: from, action: 'replace', replacement: to });
    }
  }

  // 3) 断言弱化
  for (const [from, to] of ASSERTION_MAP) {
    if (out.includes(from)) {
      const before = out;
      out = out.split(from).join(to);
      if (before !== out) blocked.push({ type: 'assertion', original: from, action: 'soften', replacement: to });
    }
  }

  // 4) 免责声明注入（受 DISCLAIMER_ENABLED 总开关控制）
  if (DISCLAIMER_ENABLED && !out.includes(DISCLAIMER.slice(0, 12))) {
    out = out.replace(/\s*$/, '') + '\n\n' + DISCLAIMER;
  }

  audit(ctx, blocked);
  return { text: out, blocked, disclaimer: disclaimerText() };
}

let auditEnabled = true;
function audit(ctx, blocked) {
  if (!auditEnabled || blocked.length === 0) return;
  try {
    if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const line = JSON.stringify({ at: new Date().toISOString(), system: ctx.system || '', section: ctx.section || '', blocked }) + '\n';
    fs.appendFileSync(path.join(AUDIT_DIR, `${day}.log`), line, 'utf8');
  } catch {
    auditEnabled = false;
  }
}

/** 批量处理解读章节 */
export function gateSections(sections, ctx = {}) {
  const allBlocked = [];
  const out = sections.map((s) => {
    const g = gate(s.text, { ...ctx, section: s.key });
    allBlocked.push(...g.blocked.map((b) => ({ ...b, section: s.key })));
    return { ...s, text: g.text };
  });
  return { sections: out, blocked: allBlocked, disclaimer: disclaimerText() };
}

export { HIGH_RISK, ASSERTION_MAP, SENSITIVE_MAP };
