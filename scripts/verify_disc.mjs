#!/usr/bin/env node
/**
 * 真人视角验证：免责声明已从所有报告出口移除
 *  ① 报告页无 .disc 节点（重点：不能残留空内容灰底块）
 *  ② 报告页全文不含免责文本
 *  ③ 分享卡 SVG 不含免责文本
 *  ④ 章节正文不含免责文本
 *  ⑤ 支付弹层不含免责文本（静态扫描 web/app.js）
 *  ⑥ 站内页脚法律入口仍在（不应被误删）
 * 四个体系各跑一遍
 */
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser } from './cdp.mjs';
import { DISCLAIMER } from '../src/compliance/gateway.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PORT = Number(process.argv[2] || 8787);
const BASE = `http://127.0.0.1:${PORT}`;
const D12 = DISCLAIMER.slice(0, 12);
const OUT = path.join(ROOT, 'shots', 'disc');
fs.mkdirSync(OUT, { recursive: true });

const INPUTS = {
  bazi: { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
  liuyao: { type: 'liuyao', year: 2026, month: 9, day: 22, hour: 10, city: '北京', category: 'wealth', question: '今年财运如何' },
  qimen: { type: 'qimen', year: 2026, month: 9, day: 22, hour: 10, city: '北京', method: 'chai' },
  ziwei: { type: 'ziwei', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
};

let pass = 0; let fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log(`PASS  ${n}${e ? ' — ' + e : ''}`); } else { fail++; console.log(`FAIL  ${n}${e ? ' — ' + e : ''}`); } };

const post = async (p, body) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

(async () => {
  // ⑥ 站内页脚法律入口仍在
  for (const p of ['bazi', 'liuyao', 'qimen', 'ziwei']) {
    const c = fs.readFileSync(path.join(ROOT, 'web', `${p}.html`), 'utf8');
    ok(`${p} 页脚法律入口仍在`, ['privacy.html', 'terms.html', 'refund.html'].every((n) => c.includes(`href="${n}"`)));
  }
  // ⑤ 支付弹层静态扫描
  const appSrc = fs.readFileSync(path.join(ROOT, 'web', 'app.js'), 'utf8');
  ok('app.js 不含免责文本', !appSrc.includes(D12) && !appSrc.includes(DISCLAIMER));

  await withBrowser(async (br) => {
    for (const [sys, input] of Object.entries(INPUTS)) {
      const rep = await post('/api/report', { input });
      const fpId = rep.data.factPackId;
      const tok = encodeURIComponent(rep.data.reportToken || '');
      if (!fpId) { ok(`${sys} 报告生成`, false, JSON.stringify(rep.data).slice(0, 120)); continue; }

      // ④ 章节正文
      const secs = rep.data.interpretation?.sections || [];
      ok(`${sys} 章节不含免责`, secs.length > 0 && secs.every((s) => !(s.text || '').includes(D12)), `章节数=${secs.length}`);

      // ③ 分享卡
      const card = await fetch(`${BASE}/api/report/${fpId}/sharecard.svg?t=${tok}`);
      const ctext = card.status === 200 ? await card.text() : '';
      ok(`${sys} 分享卡不含免责`, card.status === 200 && !ctext.includes(D12), `status=${card.status}`);

      // ①② 报告页：无 .disc 节点 + 全文不含免责
      const page = await br.page({ url: `${BASE}/api/report/${fpId}/html?t=${tok}`, w: 1280, h: 1000, mobile: false });
      // 轮询等待报告页渲染完成（首个页面最慢，固定等待不够）
      await new Promise((r) => setTimeout(r, 1500));
      let d = null;
      for (let i = 0; i < 12; i += 1) {
        d = await page.evaluate(`({
          disc: document.querySelectorAll('.disc').length,
          hit: document.body.innerText.includes(${JSON.stringify(D12)}),
          foot: document.body.innerText.includes('仅供文化参考'),
          zh: (document.body.innerText.match(/[\\u4e00-\\u9fa5]/g) || []).length
        })`);
        if (d.zh > 200) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      await page.shot(path.join(OUT, `${sys}_disc.png`));
      await page.close();
      ok(`${sys} 报告页无 .disc 节点`, d.disc === 0, `.disc 数=${d.disc}`);
      ok(`${sys} 报告页不含免责文本`, !d.hit);
      ok(`${sys} 报告页正文正常渲染`, d.zh > 200 && d.foot, `中文字=${d.zh}`);
    }
  });

  console.log(`\n合计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`);
  if (fail) process.exitCode = 1;
})().catch((e) => { console.log('ERROR: ' + e.message); process.exitCode = 1; });
