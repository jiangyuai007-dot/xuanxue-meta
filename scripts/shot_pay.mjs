/**
 * 支付弹层取证：确认「约 N 字」显示真实字数（而不是 0），并截图存档。
 * 用法：node scripts/shot_pay.mjs [port]
 */
import path from 'node:path';
import { withBrowser } from './cdp.mjs';

const PORT = process.argv[2] || 8787;
const B = `http://127.0.0.1:${PORT}`;
const OUT = 'E:/WorkBuddy/xuanxue-meta/shots/review/d_pay_modal.png';

const res = await withBrowser(async (br) => {
  const p = await br.page({ url: `${B}/bazi.html`, w: 1440, h: 900, mobile: false });
  await p.goto(`${B}/bazi.html`, 1500);
  await p.evaluate(`document.getElementById('btnReport')?.click();1`);
  await new Promise((r) => setTimeout(r, 3500));
  // 点第一个「解锁本章」按钮
  const clicked = await p.evaluate(`(function(){
    var b=document.querySelector('[data-buy]');
    if(b){ b.click(); return b.textContent.trim(); }
    return '';
  })()`);
  await new Promise((r) => setTimeout(r, 900));
  const info = await p.evaluate(`(function(){
    var m=document.getElementById('xjPayModal');
    if(!m) return JSON.stringify({state:'no-modal'});
    var list=document.getElementById('xjPayList');
    return JSON.stringify({
      state: m.style.display==='none'?'hidden':'shown',
      title: (document.getElementById('xjPayTitle')||{}).textContent||'',
      items: Array.prototype.map.call(list.querySelectorAll('.xj-item'), function(it){
        return { t:(it.querySelector('.t')||{}).textContent||'', m:(it.querySelector('.m')||{}).textContent||'' };
      }),
      total: (document.getElementById('xjPayTotal')||{}).textContent||''
    });
  })()`);
  await p.shot(OUT);
  await p.close();
  return { clicked, info };
}, { dbg: 9455 });

const j = JSON.parse(res.info);
console.log('点击按钮 =', res.clicked);
console.log('弹层状态 =', j.state, '| 标题 =', j.title, '| 合计 =', j.total);
for (const it of j.items) console.log('  清单项:', it.t, '||', it.m);
console.log('截图 =', OUT);
const bad = j.items.some((it) => /约 0 字/.test(it.m));
console.log(bad ? 'FAIL 仍存在「约 0 字」' : 'PASS 字数显示正常');
