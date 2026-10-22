/**
 * agnes 结构化输出能力探针（诊断用，换模型/排查"槽位填不满"时跑）
 *
 * 背景：2026-10-05 P0 首跑时，10 章里 8 章的 points/basis/advice 全空，
 * 一度怀疑是"agnes 的 tool calling 不支持 array 类型"。探针一跑就推翻了这个假设——
 * 同样的 schema 单独调用时数组字段返回完整（1003 completion tokens）。
 * 真凶是 **max_tokens 给太小**（reasoning_tokens 占 completion 约 45%，
 * 给 500 时模型写到 summary 就被截断，后续字段直接省略）。
 *
 * 三种写法对比，跑出来能直接回答：
 *   A tool calling（含 array 的完整 schema）→ 主路径是否可用
 *   B response_format json_object          → 是否可作降级路径（实测支持）
 *   C 纯文本里夹 json 代码块               → 兜底解析能否救回来
 *
 * 用法：node scripts/agnes_structured.mjs
 */

import fs from 'node:fs';

const keyFile = 'C:/Users/Administrator/Desktop/agnes.txt';
process.env.AGNES_API_KEY = (fs.existsSync(keyFile)
  ? fs.readFileSync(keyFile, 'utf8').split('\n').map((s) => s.trim()).find((s) => s.startsWith('sk-'))
  : '') || process.env.AGNES_API_KEY;

const BASE = 'https://apihub.agnes-ai.com/v1';
const MODEL = 'agnes-2.5-flash';
const KEY = process.env.AGNES_API_KEY;

const SYSTEM =
  '你是中文传统命理解读助手。铁律：只能使用下方 F 编号事实，不得推算、不得编造编号、不得给医疗投资法律结论、不得断言式预测，一律用「更倾向/往往」类表述。';

const USER = [
  '填写章节「性格特点」。',
  '【事实编号表】',
  'F1 日主：庚（金，阳干）',
  'F2 月令：巳月（5）',
  'F3 格局：偏印格（月支巳火本气丙火，为偏印）',
  'F4 强弱：略弱（46 分）｜判定依据：月支不助日主（不得令）',
  'F5 喜用神：火、土｜忌神：金、水',
  '',
  '槽位：headline 一句话结论；summary 180-320 字；points 三个要点（每项 t≤8 字标题 + d 30-90 字说明）；basis 引用 F 编号；advice 2-3 条建议。',
  '输出方式二选一：要么调用 fill_report 工具，要么只输出一个 JSON 对象。',
].join('\n');

const SLOTS_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: '一句话结论' },
    summary: { type: 'string', description: '核心解读 180-320 字' },
    points: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      description: '3 个要点',
      items: {
        type: 'object',
        properties: {
          t: { type: 'string', description: '小标题≤8字' },
          d: { type: 'string', description: '说明 30-90 字' },
        },
        required: ['t', 'd'],
        additionalProperties: false,
      },
    },
    basis: { type: 'array', minItems: 1, maxItems: 4, description: '事实编号如 F1', items: { type: 'string' } },
    advice: { type: 'array', minItems: 2, maxItems: 3, description: '建议', items: { type: 'string' } },
  },
  required: ['headline', 'summary', 'points', 'basis', 'advice'],
  additionalProperties: false,
};

async function call(name, body) {
  const t = Date.now();
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: MODEL, temperature: 0.35, ...body }),
    });
    const txt = await res.text();
    console.log(`\n===== ${name} :: HTTP ${res.status} (${Date.now() - t}ms) =====`);
    if (!res.ok) {
      console.log('BODY:', txt.slice(0, 300));
      return null;
    }
    const j = JSON.parse(txt);
    const msg = j.choices?.[0]?.message || {};
    console.log('finish_reason:', j.choices?.[0]?.finish_reason);
    if (msg.tool_calls?.[0]) {
      console.log('TOOL NAME:', msg.tool_calls[0].function.name);
      console.log('ARGS:', msg.tool_calls[0].function.arguments);
    }
    if (msg.content) console.log('CONTENT:', String(msg.content).slice(0, 1200));
    console.log('USAGE:', JSON.stringify(j.usage));
    return j;
  } catch (e) {
    console.log(`\n===== ${name} :: ERROR ${e.message}`);
    return null;
  }
}

// A: tool calling（当前主路径）
await call('A tool_calling(ARRAY schema)', {
  messages: [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: USER },
  ],
  tools: [{ type: 'function', function: { name: 'fill_report', description: '填写章节槽位', parameters: SLOTS_SCHEMA } }],
  tool_choice: { type: 'function', function: { name: 'fill_report' } },
});

// B: response_format json_object
await call('B response_format json_object', {
  messages: [
    { role: 'system', content: SYSTEM + '\n必须用 response_format 要求的 JSON 输出，键名必须包含 headline/summary/points/basis/advice 全部五个，一个都不能少，只输出 JSON 本身，不要任何解释文字。' },
    { role: 'user', content: USER },
  ],
  response_format: { type: 'json_object' },
});

// C: 纯 JSON + 无 response_format（对照组）
await call('C plain json in text', {
  messages: [
    { role: 'system', content: SYSTEM + '\n务必只输出一个 JSON 对象，包含 headline/summary/points/basis/advice 五个键，一个都不能省略。' },
    { role: 'user', content: USER },
  ],
});

process.exit(0);
