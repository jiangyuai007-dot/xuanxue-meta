/**
 * parse —— 结构化解析与校验
 *
 * 降级链（每章独立）：tool_call → content 里的 JSON 块 → 首个 {...} → 正则点提取 → 失败
 * 校验不过不直接判死：先做「抢救性修补」（缺字段补默认值），再标记 warnings。
 * 只有「事实编号编造」和「结构完全对不上」才判 failed。
 */

const F_ID = /^F\d+$/;

/** 去 Markdown 装饰与首尾空白 */
function cleanText(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, (m) => (m.includes('\n') ? m : ' '))
    .replace(/\*\*|__|`|~~/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[-*+]\s+(?=\S)/gm, '')
    .trim();
}

/** 从任意字符串里抠出第一段 JSON：先找第一个 {，从它开始括号配平 */
function extractObject(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** 抠 `json` 代码块 */
function extractCodeBlock(text) {
  const m = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : null;
}

/** 兜底：按 "key": 后面的第一个字符串值抠出来 */
function extractByKey(text, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm');
  const m = String(text || '').match(re);
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1];
  }
}

/**
 * 从一次响应里取出原始对象
 * @param {object} body  chat/completions 响应体
 * @returns {{ obj:object|null, via:string }}
 */
export function extractPayload(body) {
  const msg = body?.choices?.[0]?.message;
  if (!msg) return { obj: null, via: 'none' };

  // 1) tool calling（主路径）
  const tc = msg.tool_calls && msg.tool_calls[0];
  if (tc?.function?.arguments) {
    try {
      return { obj: JSON.parse(tc.function.arguments), via: 'tool_call' };
    } catch {
      /* 掉进下面的兜底 */
    }
  }

  // 2) content 正文
  const content = cleanText(msg.content || '');
  if (!content) return { obj: null, via: 'none' };

  // 3) json 代码块
  const block = extractCodeBlock(content);
  if (block) {
    const o = extractObject(block);
    if (o) return { obj: o, via: 'code_block' };
  }

  // 4) 首个配平对象
  const o = extractObject(content);
  if (o && typeof o === 'object') return { obj: o, via: 'brace' };

  // 5) 逐 key 抠（最后手段）
  const partial = { headline: extractByKey(content, 'headline'), summary: extractByKey(content, 'summary') };
  if (partial.headline || partial.summary) return { obj: partial, via: 'regex' };

  return { obj: null, via: 'none' };
}

/**
 * 按章节 slots 校验 + 归一化
 * @param {object} obj       原始对象
 * @param {object} slots    章节 slots
 * @param {string[]} factIds 该章可用事实编号（用于 basis 白名单校验）
 * @returns {{ ok:boolean, data:object, errors:string[], warnings:string[] }}
 */
export function validateSlots(obj, slots, factIds = []) {
  const errors = [];
  const warnings = [];
  const out = {};
  const allowed = new Set(factIds);
  const slotNames = Object.keys(slots || {});

  if (!obj || typeof obj !== 'object') {
    return { ok: false, data: {}, errors: ['响应为空或非对象'], warnings };
  }

  // 1) 只收 slots 里声明过的键（AI 可能顺手塞额外键）
  for (const name of slotNames) {
    const def = slots[name];
    const raw = obj[name];

    if (raw === undefined || raw === null) {
      // 缺字段：给结构化默认值，标 warning（不判死，保证版式不塌）
      warnings.push(`${name} 缺失，已置空`);
      out[name] = def.type === 'array' ? [] : '';
      continue;
    }

    if (def.type === 'string') {
      const v = cleanText(raw);
      if (typeof def.max === 'number' && v.length > def.max) {
        warnings.push(`${name} 超长(${v.length}>${def.max})，已截断`);
        out[name] = v.slice(0, def.max);
      } else if (typeof def.min === 'number' && v.length < def.min) {
        warnings.push(`${name} 偏短(${v.length}<${def.min})`);
        out[name] = v;
      } else {
        out[name] = v;
      }
      continue;
    }

    if (def.type === 'array') {
      let arr = Array.isArray(raw) ? raw.slice() : [raw];
      // 对象数组被压成扁平对象时，尝试拆回 {t,d}
      arr = arr.map((x) => {
        if (x && typeof x === 'object' && !Array.isArray(x)) {
          return { t: cleanText(x.t ?? x.title ?? x.label ?? ''), d: cleanText(x.d ?? x.desc ?? x.text ?? x.value ?? '') };
        }
        return x;
      });

      const min = def.min ?? 0;
      const max = def.max ?? arr.length;
      if (arr.length < min) {
        warnings.push(`${name} 数量不足(${arr.length}<${min})`);
      }
      if (arr.length > max) {
        warnings.push(`${name} 数量超出(${arr.length}>${max})，已截断`);
        arr = arr.slice(0, max);
      }

      arr = arr.map((item) => {
        if (def.item && typeof def.item === 'object' && !def.item.type) {
          // points: { t, d }
          const t = cleanText(item?.t ?? '');
          const d = cleanText(item?.d ?? '');
          if (def.item.t?.max && t.length > def.item.t.max) {
            warnings.push(`${name}.t 超长，已截断`);
          }
          return {
            t: t.slice(0, def.item.t?.max ?? t.length),
            d: def.item.d?.max && d.length > def.item.d.max ? d.slice(0, def.item.d.max) : d,
          };
        }
        const s = typeof item === 'string' ? cleanText(item) : cleanText(item?.t ?? item?.d ?? item);
        if (def.item?.max && s.length > def.item.max) {
          warnings.push(`${name} 单项超长，已截断`);
          return s.slice(0, def.item.max);
        }
        return s;
      });

      out[name] = arr;
      continue;
    }

    // 未知类型：原样透传并告警
    warnings.push(`${name} 类型未声明，已原样透传`);
    out[name] = raw;
  }

  // 2) basis 白名单：只保留编号合法且真实存在的项
  const basis = Array.isArray(out.basis) ? out.basis : [];
  const kept = [];
  for (const b of basis) {
    const s = cleanText(b);
    if (!F_ID.test(s)) {
      warnings.push(`basis 引用了非编号内容，已丢弃：「${s.slice(0, 12)}」`);
      continue;
    }
    if (!allowed.has(s)) {
      warnings.push(`basis 引用了不存在的事实编号 ${s}，已丢弃`);
      continue;
    }
    if (!kept.includes(s)) kept.push(s);
  }
  // 注意：判的是「slots 里声明过 basis 这个槽位」，不是「slots.basis 是不是数组」——
  // 后者恒为 false，会让下面这段事实白名单校验整个失效（编造编号会直接漏网）。
  if (Object.prototype.hasOwnProperty.call(slots || {}, 'basis')) {
    if (!kept.length) warnings.push('basis 为空（无可用事实编号），渲染层将不显示依据溯源');
    out.basis = kept;
  }

  // 3) summary 分段归一化（AI 常用 \n\n，渲染层按 \n 分段，统一成 \n\n）
  if (typeof out.summary === 'string' && out.summary.includes('\n')) {
    out.summary = out.summary
      .split(/\n{1,}/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n\n');
    if (!warnings.length) warnings.push('summary 已统一为双换行分段');
  }

  // 4) 硬失败条件：连 headline/summary 都没有 = 结构对不上
  const hasHead = typeof out.headline === 'string' && out.headline.length > 0;
  const hasSum = typeof out.summary === 'string' && out.summary.length > 0;
  if (!hasHead && !hasSum) {
    errors.push('既无 headline 也无 summary，结构对不上');
    return { ok: false, data: out, errors, warnings };
  }
  if (!hasHead) out.headline = out.summary.slice(0, 24);
  if (!hasSum) {
    out.summary = '';
    warnings.push('summary 为空，渲染层将只显示要点');
  }

  return { ok: true, data: out, errors, warnings };
}

/**
 * 一步到位：响应 → 合法 slot 数据
 * @returns {{ ok, data, errors, warnings, via }}
 */
export function parseChapterResponse(body, slots, factIds = []) {
  const { obj, via } = extractPayload(body);
  if (!obj) return { ok: false, data: {}, errors: ['未能从响应中解析出对象'], warnings: [], via: 'none' };
  const r = validateSlots(obj, slots, factIds);
  return { ...r, via };
}

export { extractPayload as extract, F_ID as FACT_ID_RE, cleanText };
