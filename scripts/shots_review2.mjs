#!/usr/bin/env node
/** 复审取证（精简版）：紫微桌面、移动端、支付弹层、法律页 */
import { withBrowser } from './cdp.mjs';
import fs from 'node:fs';

const B = 'http://127.0.0.1:8787';
const S = 'E:/WorkBuddy/xuanxue-meta/shots/review/';
fs.mkdirSync(S, { recursive: true });
const out = [];

await withBrowser(async (br) => {
  const p = await br.page({ url: `${B}/ziwei.html`, w: 1440, h: 900, mobile: false });
  await p.goto(`${B}/ziwei.html`, 1400);
  await p.evaluate(`document.getElementById('btnReport')?.click();1`);
  await new Promise((r) => setTimeout(r, 3500));
  await p.shot(`${S}d_ziwei_report.png`);
  out.push('紫微章节=' + await p.evaluate(`document.querySelectorAll('.sections .card').length`));
  await p.close();

  const m = await br.page({ url: `${B}/bazi.html`, w: 390, h: 844, mobile: true });
  await m.goto(`${B}/bazi.html`, 1400);
  await m.evaluate(`document.getElementById('btnReport')?.click();1`);
  await new Promise((r) => setTimeout(r, 3500));
  await m.shot(`${S}m_bazi_report.png`);
  out.push('移动端章节=' + await m.evaluate(`document.querySelectorAll('.sections .card').length`));
  await m.close();

  const pay = await br.page({ url: `${B}/bazi.html`, w: 1440, h: 900, mobile: false });
  await pay.goto(`${B}/bazi.html`, 1400);
  await pay.evaluate(`document.getElementById('btnReport')?.click();1`);
  await new Promise((r) => setTimeout(r, 3500));
  const clicked = await pay.evaluate(`(function(){var b=document.querySelector('#skuList button, .sku-box button');if(b){b.click();return b.textContent.trim();}return '';})()`);
  await new Promise((r) => setTimeout(r, 1500));
  const st = await pay.evaluate(`(function(){var m=document.getElementById('xjPayModal');return m?(m.style.display==='none'?'hidden':'shown'):'no-modal';})()`);
  await pay.shot(`${S}d_pay_modal.png`);
  out.push(`支付弹层: 按钮="${clicked}" 状态=${st}`);
  await pay.close();

  for (const pg of ['privacy', 'terms', 'refund']) {
    const l = await br.page({ url: `${B}/${pg}.html`, w: 1440, h: 1000, mobile: false });
    await l.goto(`${B}/${pg}.html`, 1200);
    await l.shot(`${S}d_${pg}.png`);
    await l.close();
  }
}, { dbg: 9455 });

fs.writeFileSync('E:/WorkBuddy/xuanxue-meta/.tail.log', out.join('\n'));
console.log(out.join('\n'));
