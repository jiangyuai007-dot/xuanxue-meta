/**
 * 解读引擎 —— 只做「把事实说成人话」，绝不自行推算命理事实
 * 本地规则解读器（默认，离线可复现） + 可插拔 LLM 适配器（配置 LLM_ENDPOINT 后启用）
 * 所有输出必须经 compliance/gateway 过滤后才可对外
 */

import { gateSections } from '../compliance/gateway.js';
import { baziSections as baziSectionsDeep } from './bazi/index.js';
import { liuyaoChapters } from './deep/liuyaoBuild.js';
import { qimenChapters } from './deep/qimenBuild.js';
import { ziweiChapters } from './deep/ziweiBuild.js';

// ------------------------------------------------------------------ 素材库

const ELEMENT_DESC = {
  木: '主生长与条达，表现为进取、有主见、不喜欢被过度约束',
  火: '主礼与文明，表现为热情、表达力强、行动节奏快',
  土: '主信与承载，表现为稳重、务实、重视承诺与积累',
  金: '主义与肃整，表现为果断、讲原则、重视规则与边界',
  水: '主智与润下，表现为灵活、善思、适应力强',
};

const SHISHEN_CAREER = {
  正官: '规则意识与责任心较强，适合制度健全、权责清晰的岗位',
  七杀: '抗压与开拓力强，适合挑战性高、需要快速决断的岗位',
  正财: '稳健务实，擅长把事情做实并持续积累',
  偏财: '对机会与资源敏感，适合拓展、商务与资源整合类工作',
  食神: '表达与创造力较好，适合内容、技术、服务与教育类工作',
  伤官: '善于突破与质疑，适合创新型、专业性强的工作',
  正印: '学习力与体系化能力强，适合研究、教育、专业支持类工作',
  偏印: '钻研精神强，适合需要深度专注的专项技术或冷门领域',
  比肩: '独立性与执行力较好，适合能独立承担结果的岗位',
  劫财: '行动与竞争意识强，宜在团队中明确分工与边界',
};

const SHISHEN_WEALTH = {
  正财: '财运倾向稳健，宜以长期积累为主，忌冒进',
  偏财: '对机会敏感，宜把握阶段性机会，但需注意分散风险',
  食神: '靠能力与输出变现的路径较顺，宜做长期复利型投入',
  伤官: '变现能力强但波动也大，宜建立稳定的现金流基本盘',
  正官: '财运与职位、资历绑定较紧，宜以稳健晋升带动收入',
  七杀: '财运波动较大，宜控制杠杆与高风险敞口',
  正印: '财富更多来自专业背书与长期积累，不宜投机',
  偏印: '有偏门或专项收益机会，但需警惕信息不对称风险',
  比肩: '合作与竞争并存，财务往来宜书面清晰',
  劫财: '钱财易被分流，宜避免合伙纠纷与冲动消费',
};

const SHISHEN_LOVE = {
  正财: '关系态度务实，重视稳定与承诺',
  偏财: '关系中的主动性较强，注重相处的轻松感',
  正官: '对关系有责任感，倾向长期稳定的相处模式',
  七杀: '关系中张力较强，需要学习沟通与退让',
  食神: '相处温和包容，重日常陪伴',
  伤官: '对伴侣要求较高，宜降低理想化期待',
  正印: '关系中偏照顾型，需注意保留自我空间',
  偏印: '情感表达偏内敛，宜主动沟通',
  比肩: '平等意识强，宜建立共同目标',
  劫财: '关系易有竞争感，宜明确边界与分工',
};

const STRENGTH_ADVICE = {
  偏强: '整体能量偏强，宜主动争取、承担主导角色，但需注意收敛锋芒',
  略强: '整体能量略偏强，适合主动推进事务',
  中和: '整体能量较为中和，宜顺势而为，不宜极端冒进或过度保守',
  略弱: '整体能量略偏弱，宜借力合作、稳步积累',
  偏弱: '整体能量偏弱，宜以守为攻、先补短板再图扩张',
};

// ------------------------------------------------------------------ 八字

function legacyBaziSections(f) {
  const p = f.fourPillars;
  const dm = f.dayMaster;
  const pct = f.elementPercent;
  const top = Object.entries(pct).sort((a, b) => b[1] - a[1])[0];
  const bottom = Object.entries(pct).sort((a, b) => a[1] - b[1])[0];
  const monthShishen = f.shishen.month;
  const hourShishen = f.shishen.hour;
  const shens = [...new Set(f.shensha.map((s) => s.name))];

  const overview =
    `您的命盘为：${p.year.name}年 ${p.month.name}月 ${p.day.name}日 ${p.hour.name}时。` +
    `日主为${dm.gan}（${dm.element}，${dm.yang ? '阳' : '阴'}干），日主强弱判定为「${f.strength.level}」（${f.strength.score} 分）。` +
    `格局取「${f.pattern.name}」，${f.pattern.basis}。` +
    `农历为 ${f.lunar.yearGanzhi}年（生肖${f.lunar.zodiac}）${f.lunar.monthName}${f.lunar.dayName}，当前节气为${f.solarTerms ? f.solarTerms.current : '未知'}。`;

  const personality =
    `日主${dm.gan}属${dm.element}，${ELEMENT_DESC[dm.element]}。` +
    `命盘中${top[0]}的力量最为突出（约 ${top[1]}%），${ELEMENT_DESC[top[0]]}；` +
    `而${bottom[0]}相对偏弱（约 ${bottom[1]}%），在相关场景上可能需要刻意补足。` +
    `月干透出${monthShishen}，${SHISHEN_CAREER[monthShishen] || '对行事风格有一定影响'}；` +
    `时干透出${hourShishen}，${SHISHEN_LOVE[hourShishen] || '对晚景与对外表现有影响'}。` +
    `${f.strength.basis.slice(0, 3).join('；')}。${STRENGTH_ADVICE[f.strength.level]}。` +
    (shens.length ? `命带${shens.slice(0, 3).join('、')}，${f.shensha[0].note}。` : '');

  const career =
    `事业方向上，月令所透为${monthShishen}，${SHISHEN_CAREER[monthShishen] || '宜结合自身专业积累选择'}。` +
    `格局「${f.pattern.name}」提示：${f.pattern.shishen === '正官' || f.pattern.shishen === '七杀' ? '适合在规则明确的体系中争取权责' : f.pattern.shishen === '正财' || f.pattern.shishen === '偏财' ? '适合以结果为导向、与业绩挂钩的岗位' : f.pattern.shishen === '食神' || f.pattern.shishen === '伤官' ? '适合以专业输出与个人品牌立身' : f.pattern.shishen === '正印' || f.pattern.shishen === '偏印' ? '适合研究与专业支持类路线' : '适合在团队中承担协调与执行角色'}。` +
    `用神取${f.yongshen.favorable.join('、')}（${f.yongshen.basis}），${f.yongshen.note}。` +
    `从大运看，${f.dayun.steps[0].startAge}—${f.dayun.steps[0].startAge + 9} 岁走 ${f.dayun.steps[0].name}（${f.dayun.steps[0].shishen}），${SHISHEN_CAREER[f.dayun.steps[0].shishen] || '宜稳扎稳打'}。`;

  const wealth =
    `财运方面，${SHISHEN_WEALTH[monthShishen] || '财运特征需结合大运流年综合看待'}。` +
    `命盘中${top[0]}偏旺，说明资源与精力更多集中在${top[0]}所代表的领域。` +
    `用神喜${f.yongshen.favorable.join('、')}，可在相关行业与方向上多做布局；忌${f.yongshen.unfavorable.join('、')}方向的过度投入。` +
    `建议以「主业稳定现金流 + 小比例尝试」的方式管理财务，不宜以命理结论替代专业理财建议。`;

  const relationship =
    `感情与人际上，${SHISHEN_LOVE[hourShishen] || '相处模式受时柱与日支共同影响'}。` +
    `日支为${p.day.zhi}（藏${f.canggan.day.map((c) => c.gan).join('、')}），在亲密关系中倾向于${p.day.zhi === p.month.zhi ? '稳定而少变' : '寻求互补与新鲜感'}。` +
    (shens.includes('桃花') ? '命带桃花，人缘与异性缘较旺，宜注意关系中的边界感。' : '') +
    (shens.includes('华盖') ? '命带华盖，需要有独立的思考与独处空间。' : '') +
    `整体宜以「先理解差异、再建立规则」的方式经营关系。`;

  const dayunText =
    `大运：${f.dayun.basis}，${f.dayun.forward ? '顺' : '逆'}行。` +
    `起运约 ${f.dayun.startAge} 岁（约 ${f.dayun.startYear} 年）。\n` +
    f.dayun.steps
      .slice(0, 8)
      .map((s) => `${s.startAge}—${s.startAge + 9} 岁（${s.fromYear}—${s.toYear}）：${s.name}运，天干为${s.shishen}，${SHISHEN_CAREER[s.shishen] || '宜平稳过渡'}`)
      .join('；\n') + '。';

  const liunianText =
    `近年流年提示：\n` +
    f.liunian
      .slice(0, 5)
      .map((y) => `${y.year} 年（${y.ganzhi}）：天干为${y.shishen}，${SHISHEN_CAREER[y.shishen] || '宜顺势调整'}`)
      .join('；\n') + '。' +
    `\n流年仅为传统命理视角的节奏参考，具体安排请结合现实条件。`;

  return [
    { key: 'overview', title: '命盘概览', text: overview, locked: false },
    { key: 'personality', title: '性格特质', text: personality, locked: false },
    { key: 'career', title: '事业方向', text: career, locked: true },
    { key: 'wealth', title: '财运特征', text: wealth, locked: true },
    { key: 'relationship', title: '感情与人际', text: relationship, locked: true },
    { key: 'dayun', title: '大运走势', text: dayunText, locked: true },
    { key: 'liunian', title: '近年流年', text: liunianText, locked: true },
  ];
}

// ------------------------------------------------------------------ LLM 适配器

/**
 * 创建 LLM 适配器。未配置 LLM_ENDPOINT 时返回 null（回落到本地规则引擎）
 * 约定：兼容 OpenAI /chat/completions 协议
 */
export function createLlmAdapter() {
  const endpoint = process.env.LLM_ENDPOINT;
  const apiKey = process.env.LLM_API_KEY || '';
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  if (!endpoint) return null;

  return {
    name: 'llm',
    async generate(factPack, sectionKeys) {
      const sys =
        '你是传统命理文化的解读助手。只能基于下方 JSON 事实包中已有的命理事实进行表述，' +
        '严禁自行推算或补充任何命理事实，严禁给出医疗、投资、法律结论，严禁断言式预测，' +
        '所有结论必须写成倾向性、建议性表述。每段 150-260 字。';
      const user = `事实包：\n${JSON.stringify(factPack.facts).slice(0, 12000)}\n\n请输出章节：${sectionKeys.join('、')}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0.7 }),
      });
      if (!res.ok) throw new Error(`LLM 调用失败: ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    },
  };
}

// ------------------------------------------------------------------ 主入口

const BUILDERS = {
  // 四套体系均已升级为事实驱动 + 依据溯源深度版
  bazi: baziSectionsDeep,
  liuyao: liuyaoChapters,
  qimen: qimenChapters,
  ziwei: ziweiChapters,
};

/**
 * 生成解读报告
 * @param {object} factPack
 * @param {{ unlocked?:string[], adapter?:object|null }} opts
 */
export async function interpret(factPack, opts = {}) {
  const builder = BUILDERS[factPack.system];
  if (!builder) throw new Error(`无解读器：${factPack.system}`);
  const raw = builder(factPack.facts);
  const unlocked = new Set(opts.unlocked || []);

  let sections = raw;
  let source = 'local';

  const adapter = opts.adapter !== undefined ? opts.adapter : createLlmAdapter();
  if (adapter && typeof adapter.generate === 'function') {
    try {
      const text = await adapter.generate(factPack, raw.map((s) => s.title));
      if (text && text.trim()) {
        // 简单按段落映射到章节；不足则回落本地
        const paras = text.split(/\n{1,}/).filter((p) => p.trim().length > 20);
        if (paras.length >= raw.length) {
          sections = raw.map((s, i) => ({ ...s, text: paras[i] || s.text }));
          source = 'llm';
        }
      }
    } catch {
      source = 'local-fallback';
    }
  }

  // 锁定章节只给预览
  sections = sections.map((s) => {
    if (s.locked && !unlocked.has(s.key)) {
      return { ...s, text: preview(s.text), preview: true };
    }
    return { ...s, preview: false };
  });

  // 合规网关：唯一出口
  const gated = gateSections(sections, { system: factPack.system });

  return {
    system: factPack.system,
    factPackId: factPack.id,
    sections: gated.sections,
    disclaimer: gated.disclaimer,
    blocked: gated.blocked,
    source,
    generatedAt: new Date().toISOString(),
  };
}

function preview(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.slice(0, 68) + '…（本章完整内容需解锁后查看）';
}
