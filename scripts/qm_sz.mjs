#!/usr/bin/env node
/** 奇门四柱表（含藏干行）取证截图：桌面 + 移动端 */
import path from 'node:path';
import fs from 'node:fs';
import { withBrowser } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PORT = Number(process.argv[2] || 8787);
const OUT = path.join(ROOT, 'shots', 'qm');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  await withBrowser(async (br) => {
    for (const [tag, w, h, mobile] of [['d', 1280, 1000, false], ['m', 390, 844, true]]) {
      const p = await br.page({ url: `http://127.0.0.1:${PORT}/qimen.html`, w, h, mobile });
      await new Promise((r) => setTimeout(r, 2200));
      await p.evaluate(`document.getElementById('btnPaipan').click();1`);
      await new Promise((r) => setTimeout(r, 2800));
      await p.evaluate(`(function(){var e=document.querySelector('.qm2 .sz');if(e)e.scrollIntoView({block:'center'});return 1})()`);
      await new Promise((r) => setTimeout(r, 600));
      await p.shot(path.join(OUT, `qm_sz_${tag}.png`));
      await p.close();
      console.log(`saved qm_sz_${tag}.png`);
    }
  });
})().catch((e) => { console.log('ERROR: ' + e.message); process.exitCode = 1; });
