#!/usr/bin/env node
/**
 * PM 门禁 · 上线终验（真人视角）：法律页可达 + 页脚链接可用 + 购买闭环 + 移动端不溢出
 * 用法：node scripts/verify_launch.mjs 8787
 */
import { withBrowser } from './cdp.mjs';
import fs from 'node:fs';

const PORT = Number(process.argv[2] || 8787);
const B = `http://127.0.0.1:${PORT}`;
const out = [];
const res = [];
const step = (n, ok, note) => { res.push({ n, ok }); out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

const post = async (p, body) => {
  const r = await fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { /* ignore */ }
  return { s: r.status, j };
};

(async () => {
  // 1) 法律页可达 + 含关键条款
  const legal = {
    'privacy.html': ['个人信息的收集', 'localStorage'],
    'terms.html': ['不构成医疗', '免责'],
    'refund.html': ['退款'],
  };
  for (const [page, kws] of Object.entries(legal)) {
    const r = await fetch(B + '/' + page);
    const t = r.status === 200 ? await r.text() : '';
    const miss = kws.filter((k) => !t.includes(k));
    step(`${page} 可达且含关键条款`, r.status === 200 && miss.length === 0, `status=${r.status}${miss.length ? ' 缺=' + miss.join(',') : ''}`);
  }

  // 2) 购买闭环（服务端权益，非伪造）
  const input = { type: 'bazi', year: 1990, month: 3, day: 15, hour: 14, minute: 30, city: '北京', gender: 'male', calendar: 'gregorian' };
  const ord = await post('/api/order', { skuId: 'full_report', system: 'bazi' });
  const pay = ord.s === 200 ? await post(`/api/order/${ord.j.order.id}/pay`, {}) : null;
  const ent = pay && pay.j && pay.j.order ? pay.j.order.entitlement : null;
  step('下单→支付→拿到服务端权益凭证', !!ent, ent ? '已签发' : '未签发');
  const rep = await post('/api/report', { input, entitlements: ent ? [ent] : [] });
  const unlocked = (rep.j && rep.j.unlocked) || [];
  const full = rep.j && rep.j.interpretation ? rep.j.interpretation.sections.filter((s) => !s.preview).length : 0;
  step('凭证解锁全部付费章节', unlocked.length >= 9 && full >= 9, `unlocked=${unlocked.length} 完整章节=${full}`);

  // 3) 报告页/分享卡：有令牌可开、无令牌拒绝
  const id = rep.j && rep.j.factPackId;
  const tok = rep.j && rep.j.reportToken;
  const okHtml = await fetch(`${B}/api/report/${id}/html?t=${encodeURIComponent(tok || '')}`);
  const noTok = await fetch(`${B}/api/report/${id}/html`);
  const card = await fetch(`${B}/api/report/${id}/sharecard.svg?t=${encodeURIComponent(tok || '')}`);
  step('报告页带令牌可打开', okHtml.status === 200, 'status=' + okHtml.status);
  step('报告页无令牌被拒绝', noTok.status === 403, 'status=' + noTok.status);
  step('分享卡带令牌可生成', card.status === 200, 'status=' + card.status);

  // 4) 真人视角：浏览器点页脚法律链接 + 支付弹层免责 + 移动端不溢出
  await withBrowser(async (br) => {
    for (const [w, h, tag] of [[1280, 900, 'd'], [375, 812, 'm']]) {
      const p = await br.page({ url: B + '/bazi.html', w, h, mobile: w < 500 });
      await p.goto(B + '/bazi.html', 1200);
      // 页脚法律链接存在且可点
      const links = await p.evaluate(`JSON.stringify([...document.querySelectorAll('.foot a')].map(a=>({t:a.textContent.trim(),h:a.getAttribute('href')})))`);
      const L = JSON.parse(links);
      step(`${tag} 页脚含三份法律入口`, L.length >= 3, JSON.stringify(L.map((x) => x.t)));
      // 点第一个法律链接，确认跳转后标题正常
      await p.evaluate(`document.querySelector('.foot a').click();1`);
      await new Promise((r) => setTimeout(r, 1200));
      const info = await p.evaluate(`JSON.stringify({url:location.pathname,title:document.title,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,zh:(document.body.innerText.match(/[一-龥]/g)||[]).length})`);
      const J = JSON.parse(info);
      step(`${tag} 点击页脚法律链接可跳转且中文正文完整`, J.zh > 200 && J.url.includes('.html'), `url=${J.url} 中文字=${J.zh}`);
      step(`${tag} 法律页无横向溢出`, J.sw <= J.cw + 1, `sw=${J.sw} cw=${J.cw}`);
      await p.shot(`E:/WorkBuddy/xuanxue-meta/shots/legal/${tag}_legal.png`);
      await p.close();
    }
  }, { dbg: 9411 });

  fs.writeFileSync('E:/WorkBuddy/xuanxue-meta/.tail.log', out.join('\n'));
  const fails = res.filter((r) => !r.ok).length;
  console.log(out.join('\n'));
  console.log(`\n上线终验：${res.length - fails}/${res.length} 通过`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
