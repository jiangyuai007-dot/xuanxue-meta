#!/usr/bin/env node
/**
 * 合规覆盖核验探针（PM 长期门禁工具）
 * ---------------------------------------------------------------------------
 * 目的：对「所有对外文案出口」做机器核验，输出清晰的 PASS/FAIL 表格。
 * 规则：
 *   a) 必须包含免责声明 —— 直接 import src/compliance/gateway.js 的 DISCLAIMER
 *      或其前 12 字（与 gateway.gate 的注入判定口径一致，不另抄一份）。
 *   b) 不得命中高风险词 —— 直接 import 同一文件的 HIGH_RISK（五类词表），不另抄。
 *   c) 不得出现断言性表述 —— 直接 import 同一文件的 ASSERTION_MAP 的 key。
 *
 * 覆盖出口（至少）：
 *   ① /api/report 返回的每个章节 text
 *   ② 图表 HTML 里的 tooltip（title / data-x / data-t 属性内容）
 *   ③ 分享卡 SVG（renderShareCardSvg）的文本
 *   ④ 报告页 HTML（/api/report/<id>/html）
 *   ⑤ 前端弹层文案（web/app.js 里的支付弹窗 / 提示，静态扫描）
 *   ⑥ 全站页脚入口（bazi/liuyao/qimen/ziwei/privacy/terms/refund 的页脚链接）
 *
 * 对未通过的出口：
 *   - 我能修的（分享卡渲染在 src/report/index.js，不在禁止清单）已在本任务内修复；
 *   - 我不能改的（tooltip 在 src/report/charts/* 与 src/core/*，弹层在 web/app.js）
 *     精确列出 文件:行号 + 具体文本 + 建议改法，交 PM 派工，绝不越权。
 *
 * 退出码：全部 PASS/N/A → 0；存在 FAIL → 1（可作 CI 门禁）。
 * 用法：node scripts/probe_compliance.mjs [port]
 */
import fs from 'node:fs';
import path from 'node:path';
import { DISCLAIMER, DISCLAIMER_ENABLED, HIGH_RISK, ASSERTION_MAP } from '../src/compliance/gateway.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PORT = Number(process.argv[2] || 8787);
const BASE = `http://127.0.0.1:${PORT}`;

const DISC = DISCLAIMER;
const DISC12 = DISCLAIMER.slice(0, 12);
const HIGH_WORDS = HIGH_RISK.flatMap((r) => r.words);
const ASSERT_WORDS = ASSERTION_MAP.map((a) => a[0]);

// ---------------------------------------------------------------- 源定位
const SCAN_DIRS = [
  path.join(ROOT, 'src', 'core'),
  path.join(ROOT, 'src', 'report', 'charts'),
  path.join(ROOT, 'src', 'engines'),
  path.join(ROOT, 'src', 'interpret'),
];
const _locCache = new Map();
function locate(substr) {
  if (_locCache.has(substr)) return _locCache.get(substr);
  const res = { file: '?', line: 0, text: '' };
  for (const dir of SCAN_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.js')) {
          const lines = fs.readFileSync(p, 'utf8').split('\n');
          for (let i = 0; i < lines.length; i += 1) {
            if (lines[i].includes(substr)) {
              res.file = path.relative(ROOT, p);
              res.line = i + 1;
              res.text = lines[i].trim().slice(0, 120);
              _locCache.set(substr, res);
              return true;
            }
          }
        }
      }
      return false;
    };
    if (walk(dir)) break;
  }
  _locCache.set(substr, res);
  return res;
}

// ---------------------------------------------------------------- HTTP
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function postApi(p, body) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
async function getText(p) {
  const r = await fetch(BASE + p);
  return { status: r.status, text: await r.text().catch(() => '') };
}

// ---------------------------------------------------------------- 校验
// 规则 a 随 DISCLAIMER_ENABLED 总开关双向校验（与渲染层严格同口径）：
//   开关开 → 各报告出口必须含免责声明；开关关 → 各报告出口必须不含免责声明。
const hasD = (t) => t.includes(DISC) || t.includes(DISC12);
const hasA = (t) => (DISCLAIMER_ENABLED ? hasD(t) : !hasD(t));
const hitB = (t) => HIGH_WORDS.filter((w) => t.includes(w));
const hitC = (t) => ASSERT_WORDS.filter((w) => t.includes(w));

// ---------------------------------------------------------------- 状态聚合
const rows = []; // 表格行
const fails = []; // FAIL 清单（精确：文件:行号 + 文本 + 建议）
let nPass = 0, nFail = 0, nNA = 0;
function rec(exit, id, a, b, c, detail = '') {
  rows.push({ exit, id, a, b, c, detail });
  if (a === 'N/A') nNA += 1; else if (a === true) nPass += 1; else nFail += 1;
  if (b === 'N/A') nNA += 1; else if (b === true) nPass += 1; else nFail += 1;
  if (c === 'N/A') nNA += 1; else if (c === true) nPass += 1; else nFail += 1;
}
function addFail(exit, where, text, file, line, orig, suggestion) {
  fails.push({ exit, where, text, file, line, orig, suggestion });
}
const sym = (v) => (v === true ? '✓' : v === false ? '✗' : 'N/A');

// ---------------------------------------------------------------- 输入
const INPUTS = {
  bazi: { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
  liuyao: { type: 'liuyao', year: 2026, month: 9, day: 22, hour: 10, city: '北京', category: 'career', question: '今年工作变动如何' },
  qimen: { type: 'qimen', year: 2026, month: 9, day: 22, hour: 10, city: '北京', purpose: 'wealth' },
  ziwei: { type: 'ziwei', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
};

// ---------------------------------------------------------------- 主流程
(async () => {
  const banner = [];
  banner.push('==== 玄机 合规覆盖核验探针 ====');
  banner.push(`规则 a) 免责声明：DISCLAIMER_ENABLED=${DISCLAIMER_ENABLED} → 各报告出口${DISCLAIMER_ENABLED ? '必须包含' : '必须不包含'}（"${DISC12}…"）`);
  banner.push(`规则 b) 不命中 HIGH_RISK(${HIGH_WORDS.length}词)  c) 不出现 ASSERTION_MAP(${ASSERT_WORDS.length}组)断言词`);
  banner.push(`数据源：src/compliance/gateway.js（直接 import，未抄录）  目标服务：http://127.0.0.1:${PORT}`);
  banner.push('');

  for (const [sys, input] of Object.entries(INPUTS)) {
    // 排盘 → 拿 factPackId 与图表 HTML（含 tooltip）
    const pp = await postApi('/api/paipan', { input });
    await sleep(20);
    if (pp.status !== 200 || !pp.data.ok) {
      rows.push({ exit: '①/②/③/④', id: `${sys}`, a: false, b: false, c: false, detail: `排盘失败 status=${pp.status} ${pp.data.error || ''}` });
      nFail += 3;
      continue;
    }
    const fpId = pp.data.factPackId;
    const chartHtml = pp.data.chartHtml || '';

    // —— 出口① 报告章节（拉全量：下单+支付拿服务端权益凭证，走验签路径解锁全部章节）——
    const rep0 = await postApi('/api/report', { factPackId: fpId });
    const ord = await postApi('/api/order', { skuId: 'full_report', system: sys, factPackId: fpId });
    const paid = ord.status === 200 ? await postApi(`/api/order/${ord.data.order.id}/pay`, {}) : null;
    const ent = paid && paid.data && paid.data.order ? paid.data.order.entitlement : null;
    const rep = await postApi('/api/report', { factPackId: fpId, entitlements: ent ? [ent] : [] });
    await sleep(20);
    const sections = rep.data.interpretation?.sections || [];
    for (const s of sections) {
      const a = hasA(s.text);
      const b = hitB(s.text);
      const c = hitC(s.text);
      rec(`① 报告章节 ${sys}`, s.key, a, b.length === 0, c.length === 0, `title=${s.title || ''}`);
      if (!a) addFail('①报告章节', `${sys}/${s.key}`, DISCLAIMER_ENABLED ? '缺失免责声明' : '仍残留免责声明（开关已关闭）', 'src/report/index.js', 105, 'renderReportHtml 注入 disclaimer', DISCLAIMER_ENABLED ? '章节 text 由 gate() 注入免责声明，若缺失请检查 gate 是否覆盖该体系' : 'DISCLAIMER_ENABLED=false 时章节 text 不应再含免责声明，请检查 gate() 第 4 步是否漏掉开关判断');
      b.forEach((w) => { const L = locate(w); addFail('①报告章节', `${sys}/${s.key}`, `命中高风险词「${w}」`, L.file, L.line, L.text, '该词出现在上游文案，需经 gateway.gate 弱化/改写；请确认该体系解读已走 gateSections'); });
      c.forEach((w) => { const L = locate(w); addFail('①报告章节', `${sys}/${s.key}`, `含断言词「${w}」`, L.file, L.line, L.text, '将断言表述改为弱表述（参考 ASSERTION_MAP）'); });
    }

    // —— 出口② 图表 tooltip ——
    const tipRe = /(?:title|data-x|data-t)="([^"]*)"/g;
    const tips = new Set();
    let m;
    while ((m = tipRe.exec(chartHtml)) !== null) tips.add(m[1]);
    const tipFailsB = new Map(); // word -> {count, ex, file, line}
    const tipFailsC = new Map();
    let tipBClean = true, tipCClean = true;
    for (const t of tips) {
      const b = hitB(t);
      const c = hitC(t);
      if (b.length) { tipBClean = false; for (const w of b) { const L = locate(w); if (!tipFailsB.has(w)) tipFailsB.set(w, { count: 0, ex: t, file: L.file, line: L.line }); const o = tipFailsB.get(w); o.count += 1; o.ex = t; o.file = L.file; o.line = L.line; } }
      if (c.length) { tipCClean = false; for (const w of c) { const L = locate(w); if (!tipFailsC.has(w)) tipFailsC.set(w, { count: 0, ex: t, file: L.file, line: L.line }); const o = tipFailsC.get(w); o.count += 1; o.ex = t; o.file = L.file; o.line = L.line; } }
    }
    // 微文案：规则 a 在文档级（报告页 .disc / 页脚 / 分享卡）已覆盖，此处标 N/A
    rec(`② 图表tooltip ${sys}`, `共${tips.size}条`, 'N/A', tipBClean, tipCClean, tipBClean ? '' : `高风险词 ${[...tipFailsB.keys()].join('、')}`);
    for (const [w, o] of tipFailsB) addFail('②图表tooltip', `${sys}（示例「${o.ex.slice(0, 24)}…」）`, `命中高风险词「${w}」（${o.count}处）`, o.file, o.line, o.ex, 'tooltip 为微文案，无法容纳免责声明；请对应 owner 在源头数据（src/core/* 或 src/report/charts/*，本探针禁止修改）将高风险表述改为中性描述，或在渲染前对 tooltip 文本也套用 gateway 的改写');
    for (const [w, o] of tipFailsC) addFail('②图表tooltip', `${sys}（示例「${o.ex.slice(0, 24)}…」）`, `含断言词「${w}」（${o.count}处）`, o.file, o.line, o.ex, '将断言表述改为弱表述（参考 ASSERTION_MAP）');

    // —— 出口③ 分享卡 SVG ——
    const sc = await getText(`/api/report/${fpId}/sharecard.svg?t=${encodeURIComponent(rep.data.reportToken || '')}`);
    await sleep(20);
    if (sc.status === 200) {
      const a = hasA(sc.text);
      const b = hitB(sc.text);
      const c = hitC(sc.text);
      rec(`③ 分享卡 ${sys}`, 'svg', a, b.length === 0, c.length === 0, '');
      if (!a) addFail('③分享卡', sys, DISCLAIMER_ENABLED ? '缺失免责声明' : '仍残留免责声明（开关已关闭）', 'src/report/index.js', 144, 'renderShareCardSvg', DISCLAIMER_ENABLED ? '已在本次整改中于分享卡注入完整 DISCLAIMER（两行）' : 'DISCLAIMER_ENABLED=false 时分享卡 SVG 不应再输出 DISCLAIMER 两行文本');
      b.forEach((w) => addFail('③分享卡', sys, `命中高风险词「${w}」`, 'src/report/index.js', 144, '', '分享卡文案不应含高风险词'));
      c.forEach((w) => addFail('③分享卡', sys, `含断言词「${w}」`, 'src/report/index.js', 144, '', '分享卡文案不应含断言词'));
    } else {
      rec(`③ 分享卡 ${sys}`, 'svg', false, false, false, `status=${sc.status}`);
    }

    // —— 出口④ 报告页 HTML ——
    const html = await getText(`/api/report/${fpId}/html?t=${encodeURIComponent(rep.data.reportToken || '')}`);
    await sleep(20);
    if (html.status === 200) {
      const a = hasA(html.text);
      // 剥离图表卡（含 tooltip 的高风险词在图表内，已在②单独核验），仅查叙事文本+要点表
      let body = html.text;
      const i = body.indexOf('<h2>排盘图</h2>');
      if (i >= 0) { const j = body.indexOf('<h2>', i + 1); body = body.slice(0, i) + (j >= 0 ? body.slice(j) : ''); }
      const b = hitB(body);
      const c = hitC(body);
      rec(`④ 报告页HTML ${sys}`, 'html', a, b.length === 0, c.length === 0, a ? '' : (DISCLAIMER_ENABLED ? '缺免责声明(.disc)' : '仍残留免责声明(.disc)'));
      if (!a) addFail('④报告页HTML', sys, DISCLAIMER_ENABLED ? '缺失免责声明' : '仍残留免责声明（开关已关闭）', 'src/report/index.js', 105, 'renderReportHtml .disc', DISCLAIMER_ENABLED ? '报告页 .disc 应注入 disclaimer' : 'DISCLAIMER_ENABLED=false 时不应渲染 .disc 节点');
      b.forEach((w) => addFail('④报告页HTML', sys, `命中高风险词「${w}」`, 'src/report/index.js', 105, '', '要点表/章节不应含高风险词（图表 tooltip 已在②单列）'));
      c.forEach((w) => addFail('④报告页HTML', sys, `含断言词「${w}」`, 'src/report/index.js', 105, '', '要点表/章节不应含断言词'));
    } else {
      rec(`④ 报告页HTML ${sys}`, 'html', false, false, false, `status=${html.status}`);
    }
  }

  // —— 出口⑤ 前端弹层（web/app.js 静态扫描）——
  {
    const file = path.join(ROOT, 'web', 'app.js');
    const src = fs.readFileSync(file, 'utf8');
    const a = hasA(src);
    // 提取字符串字面量（含模板串，去除 ${...} 代码段）
    const strRe = /'([^']*)'|"([^"]*)"|`([^`]*)`/g;
    const frags = [];
    let mm;
    while ((mm = strRe.exec(src)) !== null) {
      let s = mm[1] ?? mm[2] ?? mm[3] ?? '';
      s = s.replace(/\$\{[^}]*\}/g, '');
      if (s.trim().length > 1) frags.push(s);
    }
    let bAll = [], cAll = [];
    for (const f of frags) { bAll = bAll.concat(hitB(f)); cAll = cAll.concat(hitC(f)); }
    bAll = [...new Set(bAll)]; cAll = [...new Set(cAll)];
    rec('⑤ 前端弹层', 'web/app.js', a, bAll.length === 0, cAll.length === 0, a ? '' : (DISCLAIMER_ENABLED ? '弹层整体缺失免责声明' : '弹层仍残留免责声明'));
    if (!a) addFail('⑤前端弹层', '支付弹层/已购弹层', DISCLAIMER_ENABLED ? '缺失免责声明' : '残留免责声明（开关已关闭）', 'web/app.js', 687, '$("xjPayNote").textContent = ...', DISCLAIMER_ENABLED ? '在支付/已购弹层内追加免责声明一行（如 xjPayNote 区或弹层底部），文案可复用 DISCLAIMER 或「本内容为传统文化参考，不构成任何决策建议」' : 'DISCLAIMER_ENABLED=false 时支付弹层不应再展示免责声明');
    bAll.forEach((w) => addFail('⑤前端弹层', 'web/app.js', `命中高风险词「${w}」`, 'web/app.js', 0, '', '移除/改写高风险表述'));
    cAll.forEach((w) => addFail('⑤前端弹层', 'web/app.js', `含断言词「${w}」`, 'web/app.js', 0, '', '改为弱表述'));
  }

  // —— 出口⑥ 全站页脚入口 ——
  {
    const pages = ['bazi', 'liuyao', 'qimen', 'ziwei', 'privacy', 'terms', 'refund'];
    const need = ['privacy.html', 'terms.html', 'refund.html'];
    const discLine = '不构成医疗、投资、法律或任何决策建议';
    for (const p of pages) {
      const f = path.join(ROOT, 'web', `${p}.html`);
      if (!fs.existsSync(f)) { rec('⑥ 页脚入口', p, false, false, false, '文件缺失'); nFail += 3; continue; }
      const c = fs.readFileSync(f, 'utf8');
      const a = need.every((n) => c.includes(`href="${n}"`));
      const disc = c.includes(discLine);
      rec('⑥ 页脚入口', p, a && disc, 'N/A', 'N/A', a ? (disc ? '' : '缺免责小字') : '缺页脚链接');
      if (!a) addFail('⑥页脚入口', p, '页脚缺少隐私/协议/退款入口链接', f, 0, '', '在页脚加入 privacy.html / terms.html / refund.html 链接');
      if (!disc) addFail('⑥页脚入口', p, '页脚缺免责小字', f, 0, '', `页脚加入「${discLine}」`);
    }
  }

  // ---------------------------------------------------------------- 输出
  console.log(banner.join('\n'));
  let cur = '';
  for (const r of rows) {
    if (r.exit !== cur) { cur = r.exit; console.log(`\n[${cur}]`); }
    console.log(`  ${String(r.id).padEnd(22)} A:${sym(r.a)}  B:${sym(r.b)}  C:${sym(r.c)}${r.detail ? '  ' + r.detail : ''}`);
  }

  console.log('\n==================== FAIL 清单（精确：文件:行号 → 原文 → 建议改法） ====================');
  if (fails.length === 0) {
    console.log('  （无）');
  } else {
    const order = { '②图表tooltip': 0, '④报告页HTML': 1, '①报告章节': 2, '③分享卡': 3, '⑤前端弹层': 4, '⑥页脚入口': 5 };
    fails.sort((x, y) => (order[x.exit] ?? 9) - (order[y.exit] ?? 9));
    for (const f of fails) {
      console.log(`\n● [${f.exit}] ${f.where}`);
      console.log(`  命中：${f.text}`);
      console.log(`  位置：${f.file}${f.line ? ':' + f.line : ''}`);
      if (f.orig) console.log(`  原文：${f.orig}`);
      console.log(`  建议：${f.suggestion}`);
    }
  }

  const total = nPass + nFail + nNA;
  console.log('\n==================== 汇总 ====================');
  console.log(`检查项总数=${total}  PASS=${nPass}  FAIL=${nFail}  N/A=${nNA}`);
  console.log(nFail === 0 ? '结论：无阻断项（FAIL=0）' : `结论：存在 ${nFail} 项 FAIL，需对应 owner 处理（见上）`);

  process.exit(nFail === 0 ? 0 : 1);
})().catch((e) => { console.error('探针异常：', e); process.exit(2); });
