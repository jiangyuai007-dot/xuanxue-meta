/**
 * schema —— slot 定义 → JSON Schema → tool calling 参数
 *
 * 目的：让「章节模板」和「AI 输出约束」之间只有一处定义（core/reportPlan.js）。
 * 本文件只做纯翻译，不做任何文案编排。
 *
 * 支持的 slot 形态：
 *   { type:'string',            min?, max?, pattern?, desc }
 *   { type:'array',             min?, max?, item:{ type:'string', ... }, desc }   // 字符串数组
 *   { type:'array', min?, max?, item:{ t:{...}, d:{...} }, desc }                 // 对象数组（points）
 */

import { fillDesc } from '../core/reportPlan.js';

export const TOOL_NAME = 'fill_report';

/** 数值型约束转成 JSON Schema 关键字 */
function scalarNode(def) {
  const node = { type: def.type };
  if (typeof def.max === 'number') node.maxLength = def.max;
  if (typeof def.min === 'number') node.minLength = def.min;
  if (def.pattern) node.pattern = def.pattern;
  if (def.desc) node.description = def.desc;
  return node;
}

/** 数组项 → items 节点 */
function itemNode(item) {
  if (!item) return { type: 'string' };
  if (item && typeof item === 'object' && !item.type) {
    // 对象形态（如 {t, d}）
    const props = {};
    const required = [];
    for (const [k, v] of Object.entries(item)) {
      props[k] = scalarNode(v);
      required.push(k);
    }
    return { type: 'object', properties: props, required, additionalProperties: false };
  }
  return scalarNode(item);
}

/**
 * 章节 slots → JSON Schema（strict 模式：additionalProperties:false，必填齐全）
 * @param {object} slots  core/reportPlan.js 里某章的 slots
 * @returns {object} JSON Schema
 */
export function slotsToJsonSchema(slots) {
  const properties = {};
  const required = [];
  for (const [name, def] of Object.entries(slots || {})) {
    if (def.type === 'array') {
      const node = {
        type: 'array',
        items: itemNode(def.item),
        additionalItems: false,
      };
      if (typeof def.min === 'number') node.minItems = def.min;
      if (typeof def.max === 'number') node.maxItems = def.max;
      if (def.desc) node.description = def.desc;
      properties[name] = node;
    } else {
      properties[name] = scalarNode(def);
    }
    required.push(name);
  }
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

/** slots → tool calling 的 parameters（OpenAI 兼容） */
export function slotsToTool(slots) {
  return {
    type: 'function',
    function: {
      name: TOOL_NAME,
      description: '按模板填写命理解读章节内容。只能使用已给出的事实编号，不得推算或补充命理事实。',
      parameters: slotsToJsonSchema(slots),
    },
  };
}

/** 构造一份可直连请求的 body（不含 messages） */
export function makeRequestSpec(chapter) {
  const schema = slotsToJsonSchema(chapter.slots);
  return {
    tool: slotsToTool(chapter.slots),
    toolChoice: { type: 'function', function: { name: TOOL_NAME } },
    schema,
    maxTokens: chapter.maxTokens || 700,
  };
}

/**
 * 生成一段给人看的 schema 摘要（写进 prompt，用于降级路径与调试）
 * @param {object} slots
 */
export function describeSchema(slots) {
  const lines = [];
  for (const [name, def] of Object.entries(slots || {})) {
    if (def.type === 'array') {
      const n = def.item && typeof def.item === 'object' && !def.item.type ? '对象' : '字符串';
      lines.push(`- ${name}：数组，${def.min ?? 1}-${def.max ?? ''} 项，每项为 ${n}`);
    } else {
      const len = def.type === 'string' ? `${def.min ? def.min + '-' : ''}${def.max || ''} 字` : def.type;
      lines.push(`- ${name}：${def.type}，${len}`);
    }
    if (def.desc) lines.push(`  ${fillDesc(def.desc)}`);
  }
  return lines.join('\n');
}

export { slotsToJsonSchema as toJsonSchema };
