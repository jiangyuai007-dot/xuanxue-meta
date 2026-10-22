#!/usr/bin/env node
/** 复审取证：四页桌面+移动、法律页、支付弹层、报告页、分享卡 截图 */
import { withBrowser } from './cdp.mjs';
import fs from 'node:fs';

const B = 'http://127.0.0.1:8787';
const S = 'E:/WorkBuddy/xuanxue-meta/shots/review/';
fs.mkdirSync(S, { recursive: true });
const out = [];

await withBrowser(async (br) => {
  // 桌面四页（首页态 + 排盘后）
  for (const [sys, name] of [['bazi', '八字'], ['liuyao', '六爻'], ['qimen', '奇门'], ['ziwei', '紫微']]) {
    const p = await br.page({ url: `${B}/${sys}.html`, w: 1440, h: 900, mobile: false });
    await p.goto(`${B}/${sys}.html`, 1400);
    await p.shot(`${S}d_${sys}_empty.png`);
    await p.evaluate(`document.getElementById('btnPaipan')?.click();1`);
    await new Promise((r) => setTimeout(r, 2200));
    await p.evaluate(`document.getElementById('btnReport')?.click();1`);
    await new Promise((r) => setTimeout(r, 3500));
    await p.shot(`${S}d_${sys}_report.png`);
    out.push(`${name}: 报告章节=${await p.evaluate(`document.querySelectorAll('.sections .card').length`)}`);
    await p.close();
  }

  // 移动端一页（看真实手机体验）
  const m = await br.page({ url: `${B}/bazi.html`, w: 390, h: 844, mobile: true });
  await m.goto(`${B}/bazi.html`, 1400);
  await m.shot(`${S}m_bazi_empty.png`);
  await m.evaluate(`document.getElementById('btnReport')?.click();1`);
  await new Promise((r) => setTimeout(r, 3500));
  await m.shot(`${S}m_bazi_report.png`);
  await m.close();

  // 支付弹层（点第一个解锁按钮）
  const pay = await br.page({ url: `${B}/bazi.html`, w: 1440, h: 900, mobile: false });
  await pay.goto(`${B}/bazi.html`, 1400);
  await pay.evaluate(`document.getElementById('btnReport')?.click();1`);
  await new Promise((r) => setTimeout(r, 3500));
  const clicked = await pay.evaluate(`(function(){
    var b=document.querySelector('.sku-box button, .sku-item button, #skuList button');
    if(b){ b.click(); return b.textContent.trim(); } return '';
  })()`);
  await new Promise((r) => setTimeout(r, 1200));
  const modal = await pay.evaluate(`(function(){var m=document.getElementById('xjPayModal');if(!m)return 'no-modal';return m.style.display==='none'?'hidden':'shown';})()`);
  await pay.shot(`${S}d_pay_modal.png`);
  out.push(`支付弹层: 点击按钮="${clicked}" 状态=${modal}`);
  await pay.close();

  // 法律页
  for (const pg of ['privacy', 'terms', 'refund']) {
    const l = await br.page({ url: `${B}/${pg}.html`, w: 1440, h: 900, mobile: false });
    await l.goto(`${B}/${pg}.html`, 1200);
    await l.shot(`${S}d_${pg}.png`);
    await l.close();
  }
}, { dbg: 9433 });

fs.writeFileSync('E:/WorkBuddy/xuanxue-meta/.tail.log', out.join('\n'));
console.log(out.join('\n'));
