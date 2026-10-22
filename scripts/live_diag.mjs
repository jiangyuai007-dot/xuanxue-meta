#!/usr/bin/env node
/** 线上奇门页诊断：看页面到底加载成什么样 */
import { withBrowser } from './cdp.mjs';
const U = process.argv[2] || 'https://xuanji-mingli-98502.app.workbuddy.host/qimen.html';
(async () => {
  await withBrowser(async (br) => {
    const p = await br.page({ url: U, w: 1280, h: 1000, mobile: false });
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await p.evaluate(`({rs:document.readyState,title:document.title,btns:[...document.querySelectorAll('button,[id]')].slice(0,25).map(e=>e.tagName+'#'+e.id+'.'+e.className).join(' | '),bodyLen:document.body?document.body.innerHTML.length:0,hasQm:!!document.querySelector('.qm2')})`);
      console.log(`t=${(i + 1) * 2}s readyState=${s.rs} bodyLen=${s.bodyLen} hasQm=${s.hasQm} title="${s.title}"`);
      console.log(`   ${s.btns}`);
      if (s.rs === 'complete' && s.bodyLen > 500) break;
    }
    await p.close();
  });
})().catch((e) => { console.log('ERROR: ' + e.message); process.exitCode = 1; });
