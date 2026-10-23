/**
 * P0-3 可访问性 + 对比度 门禁（静态结构 + 真浏览器实测）
 *
 * 段落 A（静态，无浏览器）
 *   A1 每个 <label> 都必须「有关联」：有 for 且指向存在的控件 / 隐式包裹控件 / 被 role=group 引用
 *   A2 每个可见控件都有可访问名（label 关联 / aria-label / aria-labelledby）
 *   A3 <main id="main"> + 顶部 skip-link + 关键状态区 aria-live
 *   A4 style.css 里 --sub / --gold-ink 两个色号存在
 *
 * 段落 B（真浏览器）
 *   B1 遍历页面所有可见文本，实测「前景色 vs 有效背景色」WCAG 对比度 ≥ 4.5:1
 *   B2 点 label 真的能聚焦到对应控件（读屏/键盘等价操作）
 *   B3 键盘 Tab 到控件时有可见焦点环（outline 非 none）
 *
 * 用法：node scripts/p0_a11y_check.mjs   （需服务在 8787 或 BASE 指定端口）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const PAGES = ['bazi.html', 'hepan.html', 'liuyao.html', 'qimen.html', 'ziwei.html'];

const errs = [];
const warns = [];
const oks = [];
const ok = (s) => oks.push(s);
const bad = (s) => { errs.push(s); console.log('  ✗ ' + s); };
const warn = (s) => { warns.push(s); console.log('  ! ' + s); };

/* ================= 段落 A：静态 ================= */
for (const f of PAGES) {
  const s = fs.readFileSync(path.join(web, f), 'utf8');
  const ids = new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]));

  // A1 label 关联
  const labels = [...s.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)];
  let associated = 0;
  for (const [i, m] of labels.entries()) {
    const attrs = m[1];
    const forId = (attrs.match(/for="([^"]+)"/) || [])[1];
    const ownId = (attrs.match(/id="([^"]+)"/) || [])[1];
    const wrapsCtrl = /<(input|select|textarea)\b/.test(m[2]);
    const referenced = ownId && new RegExp(`aria-labelledby="${ownId}"`).test(s);
    if ((forId && ids.has(forId)) || wrapsCtrl || referenced) associated += 1;
    else bad(`${f} label#${i} 无关联 <label${attrs.trim()}>${m[2].trim()}</label>`);
  }
  ok(`${f} label 关联 ${associated}/${labels.length}`);

  // A2 控件可访问名：显式 for / 包裹式 label（<label><input id=x></label>）/ aria-label / aria-labelledby
  const ctrls = [...s.matchAll(/<(input|select|textarea)\b([^>]*)>/g)];
  const labelBlocks = [...s.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)];
  let named = 0;
  for (const [i, m] of ctrls.entries()) {
    const attrs = m[2];
    const id = (attrs.match(/id="([^"]+)"/) || [])[1] || '';
    const hasAria = /aria-label(ledby)?=/.test(attrs);
    let viaLabel = false;
    if (id) {
      viaLabel = labelBlocks.some(
        (lb) => new RegExp(`for="${id}"`).test(lb[1]) || lb[2].includes(`id="${id}"`),
      );
    }
    if (hasAria || viaLabel) named += 1;
    else warn(`${f} 控件 ${id || '#' + i} 可能没有可访问名（无 label/aria-label）`);
  }
  ok(`${f} 控件有可访问名 ${named}/${ctrls.length}`);

  // A3 结构
  if (!/<main id="main"/.test(s)) bad(`${f} 缺 <main id="main">`);
  if (!/class="skip-link" href="#main"/.test(s)) bad(`${f} 缺 skip-link`);
  if (!/id="msg"[^>]*aria-live/.test(s)) bad(`${f} #msg 无 aria-live`);
  if (!/class="fb-hint" aria-live/.test(s)) bad(`${f} 提示区无 aria-live`);
  ok(`${f} main/skip-link/aria-live ✓`);
}

// A4 色号
const css = fs.readFileSync(path.join(web, 'style.css'), 'utf8');
for (const t of ['--sub:#6f6658', '--gold-ink:#7d5f12', '--gold-deep:#9a7720']) {
  if (!css.includes(t.split(':')[0] + ':')) bad(`style.css 缺 ${t.split(':')[0]}`);
}
if (!/:focus-visible/.test(css)) bad('style.css 缺 :focus-visible 焦点环');
if (!/prefers-reduced-motion/.test(css)) warn('style.css 缺 prefers-reduced-motion');
ok('style.css 色号 / 焦点环 / 减弱动效 ✓');

/* ================= 段落 B：真浏览器 ================= */
const CONTRAST_JS = `(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(',').map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  // 有效背景色：自底向上合成。
  // 关键：祖先若带 background-image（渐变），Chrome 会把色停序列化成 rgb()，直接取各色停均值 ——
  // 否则「墨底金字」的暗色顶栏会被误判成浅色纸底，报出一堆假阳性。
  const avg = (list) => ({
    r: Math.round(list.reduce((s, c) => s + c[0], 0) / list.length),
    g: Math.round(list.reduce((s, c) => s + c[1], 0) / list.length),
    b: Math.round(list.reduce((s, c) => s + c[2], 0) / list.length),
    a: 1,
  });
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const img = cs.backgroundImage;
      if (img && img !== 'none') {
        const stops = [...img.matchAll(/rgba?\\(([^)]+)\\)/g)].map((x) => x[1].split(',').map(Number));
        if (stops.length) return avg(stops);
      }
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0.5) return c;
      n = n.parentElement;
    }
    return { r: 246, g: 241, b: 230, a: 1 };
  };
  // opacity 要和背景合成，否则 .intro-ic 这类 opacity<1 的元素会被高估
  const opacityOf = (el) => {
    let n = el, o = 1;
    while (n && n !== document.documentElement) { o *= +getComputedStyle(n).opacity; n = n.parentElement; }
    return Math.min(1, o);
  };
  const blend = (fg, bg, a) => ({ r: bg.r + (fg.r - bg.r) * a, g: bg.g + (fg.g - bg.g) * a, b: bg.b + (fg.b - bg.b) * a, a: 1 });
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[style*="display:none"],[hidden]')) continue;
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
    // WCAG 1.4.3 明确豁免「失活的控件」及其文字（浏览器给 disabled 的 opacity≈0.45 会拉低对比度，属正常视觉语言）
    if (el.disabled || el.closest('[disabled]')) continue;
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!txt) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const fg = parse(cs.color); if (!fg) continue;
    if (fg.a < 0.1) continue;
    const bg = bgOf(el);
    // WCAG 大字符例外：≥24px，或 ≥18.66px 且粗体 → 门槛 3:1
    const px = parseFloat(cs.fontSize);
    const heavy = parseInt(cs.fontWeight, 10) >= 700;
    const large = px >= 24 || (px >= 18.66 && heavy);
    const need = large ? 3 : 4.5;
    const r = ratio(blend(fg, bg, opacityOf(el)), bg);
    if (r < need) out.push({ txt: txt.slice(0, 18), ratio: +r.toFixed(2), need, color: cs.color, size: cs.fontSize, cls: el.className && String(el.className).slice(0, 30) });
  }
  return out;
})()`;

const LABEL_CLICK_JS = `(() => {
  const lab = [...document.querySelectorAll('label[for]')].find((l) => {
    const t = l.textContent.trim();
    const el = document.getElementById(l.getAttribute('for'));
    return t && el && !el.disabled;
  });
  if (!lab) return { ok: false, why: 'no labelled control' };
  lab.click();
  const active = document.activeElement;
  return { ok: active && active.id === lab.getAttribute('for'), target: lab.getAttribute('for'), got: active && active.id };
})()`;

const FOCUS_JS = `(() => {
  const el = document.querySelector('#btnPaipan, .primary');
  if (!el) return { ok: false, why: 'no primary button' };
  el.focus();
  const cs = getComputedStyle(el);
  return { ok: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, outline: cs.outline, width: cs.outlineWidth };
})()`;

try {
  await withBrowser(async (br) => {
    for (const f of PAGES) {
      const url = `${BASE}/${f}`;
      const p = await br.page({ url, w: 1440, h: 900, mobile: false });
      const badc = await p.evaluate(CONTRAST_JS);
      if (Array.isArray(badc) && badc.length) {
        for (const c of badc.slice(0, 8)) bad(`${f} 对比度 ${c.ratio}:1（需 ${c.need}:1）  "${c.txt}"  ${c.color} ${c.size} .${c.cls}`);
        if (badc.length > 8) bad(`${f} …另有 ${badc.length - 8} 处`);
      } else ok(`${f} 对比度 AA 全过（实测 ${badc.length} 处文本）`);
      const lc = await p.evaluate(LABEL_CLICK_JS);
      lc.ok ? ok(`${f} label 点击可聚焦 → #${lc.got}`) : bad(`${f} label 点击未聚焦（${lc.why || 'got=' + lc.got}）`);
      const fc = await p.evaluate(FOCUS_JS);
      fc.ok ? ok(`${f} 焦点环 ${fc.outline}`) : warn(`${f} 无可焦点环（${fc.why || fc.outline}）`);
      await p.evaluate('window.close()');
    }
  });
} catch (e) {
  bad('浏览器检查失败: ' + e.message);
}

/* ================= 汇总 ================= */
console.log('\n' + '='.repeat(52));
console.log(`P0-3 门禁  通过 ${oks.length}  警告 ${warns.length}  失败 ${errs.length}`);
if (errs.length) { console.log('\n失败项:'); errs.forEach((e) => console.log('  ✗ ' + e)); }
if (warns.length) { console.log('\n警告项:'); warns.forEach((e) => console.log('  ! ' + e)); }
console.log('='.repeat(52));
process.exit(errs.length ? 1 : 0);
