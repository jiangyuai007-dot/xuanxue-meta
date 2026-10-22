#!/usr/bin/env node
/** 一次性诊断：四柱表 2px 横向溢出的来源 */
import path from 'node:path';
import { withBrowser } from './cdp.mjs';
const PORT = Number(process.argv[2] || 8787);
const PROBE = `(() => {
  const sz = document.querySelector('.qm2 .sz');
  const sr = sz.getBoundingClientRect();
  const kids = [...sz.children].map((el, i) => {
    const r = el.getBoundingClientRect();
    return { i, cls: el.className, txt: el.textContent.trim().slice(0, 6),
      left: +(r.left - sr.left).toFixed(1), right: +(r.right - sr.left).toFixed(1),
      w: +r.width.toFixed(1), sw: el.scrollWidth, cw: el.clientWidth };
  });
  return { szW: sz.clientWidth, szSW: sz.scrollWidth, szRectW: +sr.width.toFixed(1),
    cs: getComputedStyle(sz).gridTemplateColumns, kids: kids.filter((k) => k.right > sz.clientWidth + 0.5) };
})()`;
(async () => {
  await withBrowser(async (br) => {
    const p = await br.page({ url: `http://127.0.0.1:${PORT}/qimen.html`, w: 1280, h: 1000, mobile: false });
    await new Promise((r) => setTimeout(r, 1200));
    await p.evaluate(`document.getElementById('btnPaipan').click();1`);
    await new Promise((r) => setTimeout(r, 2800));
    console.log(JSON.stringify(await p.evaluate(PROBE), null, 1));
    await p.close();
  });
})().catch((e) => { console.log('ERROR: ' + e.message); process.exitCode = 1; });
