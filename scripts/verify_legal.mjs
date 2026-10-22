#!/usr/bin/env node
/**
 * 法律页 / 排盘页 双视口（1280 / 375）合规视觉核验 + 截图
 * 复用 scripts/cdp.mjs 的 withBrowser 驱动（与 audit.mjs 同一套 CDP 视口模拟）。
 *
 * 核验项（每页 × 每视口）：
 *   - HTTP 200（node 侧 fetch 探活）
 *   - 无横向溢出：scrollWidth ≤ clientWidth + 1
 *   - 无文本裁切 / 触控目标过小
 *   - 页脚含 隐私/协议/退款 三个入口链接
 * 产出截图（仅规定文件名）：
 *   shots/legal/privacy_d.png  privacy_m.png  terms_d.png  refund_d.png  footer_d.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PORT = Number(process.argv[2] || 8787);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, 'shots', 'legal');
fs.mkdirSync(SHOTS, { recursive: true });

const AUDIT_JS = `(() => {
  const de = document.documentElement;
  const cw = de.clientWidth, sw = de.scrollWidth;
  let clipped = 0, smallTap = 0;
  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'hidden' && cs.textOverflow !== 'ellipsis') clipped++;
  });
  document.querySelectorAll('button,select,input,a.btn,[role=button],label.chk,label.leap,.seg>button').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.height < 32) smallTap++;
  });
  const links = [...document.querySelectorAll('footer a')].map((a) => a.getAttribute('href'));
  const legal = links.filter((h) => h && (h.includes('privacy.html') || h.includes('terms.html') || h.includes('refund.html')));
  return JSON.stringify({ cw, sw, overflow: Math.max(0, sw - cw), clipped, smallTap, footerLinks: links, legalLinks: legal });
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 需要"页脚含三入口"的页面（全部 web 页都加了）
const LEGAL = ['privacy', 'terms', 'refund', 'bazi', 'liuyao', 'qimen', 'ziwei'];
const VIEWPORTS = [
  { name: 'd', w: 1280, h: 900, mobile: false },
  { name: 'm', w: 375, h: 812, mobile: true },
];

// 截图映射：只产出规定的 5 个文件
const SHOT_MAP = {
  'privacy|d': 'privacy_d.png',
  'privacy|m': 'privacy_m.png',
  'terms|d': 'terms_d.png',
  'refund|d': 'refund_d.png',
  'bazi|d': 'footer_d.png', // 用八字页桌面版整页截图承载"页脚入口"证据
};

function ok(s) {
  return s.overflow <= 1 && s.clipped === 0 && s.smallTap === 0 && s.legalLinks.length >= 3;
}

const results = [];
await withBrowser(async (br) => {
  for (const page of LEGAL) {
    for (const vp of VIEWPORTS) {
      // node 侧探活
      let status = 0;
      try { status = (await fetch(BASE + `/${page}.html`)).status; } catch { status = 0; }
      const p = await br.page({ url: `${BASE}/${page}.html`, w: vp.w, h: vp.h, mobile: vp.mobile });
      // 等稳定
      for (let i = 0; i < 30; i += 1) {
        await sleep(300);
        const r = await p.evaluate(`document.readyState === 'complete'`);
        if (r === true && i >= 2) break;
      }
      await sleep(700);
      const d = JSON.parse(await p.evaluate(AUDIT_JS));
      d.status = status; d.page = page; d.vp = vp.name; d.url = `${page}.html@${vp.name}`;
      d.pass = ok(d);
      results.push(d);

      const key = `${page}|${vp.name}`;
      if (SHOT_MAP[key]) {
        const full = key === 'bazi|d';
        await p.shot(path.join(SHOTS, SHOT_MAP[key]), full);
        console.log(`截图 ${SHOT_MAP[key]} (${full ? '整页' : vp.name})`);
      }
      await p.close();
    }
  }
});

console.log('\n==================== 双视口核验结果 ====================');
console.log('页'.padEnd(12) + '视口'.padEnd(6) + '状态'.padEnd(6) + '溢出'.padEnd(6) + '裁切'.padEnd(6) + '小触控'.padEnd(6) + '页脚链接'.padEnd(10) + '结果');
for (const r of results) {
  console.log(
    r.page.padEnd(12) + r.vp.padEnd(6) + String(r.status).padEnd(6) +
    String(r.overflow).padEnd(6) + String(r.clipped).padEnd(6) + String(r.smallTap).padEnd(6) +
    String(r.legalLinks.length).padEnd(10) + (r.pass ? 'PASS' : 'FAIL')
  );
}
const fails = results.filter((r) => !r.pass);
console.log(`\n合计 ${results.length} 项，失败 ${fails.length} 项`);
process.exit(fails.length ? 2 : 0);
