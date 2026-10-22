#!/usr/bin/env node
/**
 * 线上端到端探针：在正式站点上真实起一局奇门，检查
 *  ① 四柱表出现「藏干」行且四列非空
 *  ② 藏干按五行着色、可点解释
 *  ③ 四类符号（神/星/门/干）同字号
 *  ④ 八门位于右下象限、九宫右缘对齐
 *  ⑤ 天/地盘干左缘逐宫一致
 */
import { withBrowser } from './cdp.mjs';

const URL_QM = process.argv[2] || 'https://xuanji-mingli-98502.app.workbuddy.host/qimen.html';

let pass = 0; let fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log(`PASS  ${n}${e ? ' — ' + e : ''}`); } else { fail++; console.log(`FAIL  ${n}${e ? ' — ' + e : ''}`); } };

const PROBE = `(() => {
  const sz = document.querySelector('.qm2 .sz');
  if (!sz) return { err: 'no .sz（未渲染或尚未起局）' };
  const rows = []; let cur = null;
  for (const el of sz.children) {
    if (el.classList.contains('k')) { cur = { key: el.textContent.trim(), cols: [] }; rows.push(cur); }
    else if (cur) cur.cols.push({
      cx: +(el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2).toFixed(2),
      cang: [...el.querySelectorAll('.cg i')].map((i) => ({ t: i.textContent.trim(), c: getComputedStyle(i).color, el: i.classList.contains('qm-el') })),
    });
  }
  const cg = rows.find((r) => r.key === '藏干');
  const gz = rows.find((r) => r.key === '干支');

  // 四类符号字号
  const fs = (s) => [...new Set([...document.querySelectorAll(s)].map((e) => getComputedStyle(e).fontSize))];
  const symFs = [...new Set([...fs('.qm2 .qs'), ...fs('.qm2 .qstar'), ...fs('.qm2 .qd'), ...fs('.qm2 .qgan b')])];

  // 八门：右缘 + 象限
  const cells = [...document.querySelectorAll('.qm2 .qp')].filter((e) => !e.classList.contains('mid'));
  const doors = cells.map((cell) => {
    const d = cell.querySelector('.qd');
    if (!d) return null;
    const cr = cell.getBoundingClientRect(); const dr = d.getBoundingClientRect();
    return { right: +(cr.right - dr.right).toFixed(2),
      inSE: (dr.left + dr.width / 2) > cr.left + cr.width / 2 && (dr.top + dr.height / 2) > cr.top + cr.height / 2 };
  }).filter(Boolean);
  const doorRight = [...new Set(doors.map((d) => d.right))];

  // 天/地盘干左缘
  const ganLeft = [...document.querySelectorAll('.qm2 .qgan b')].map((b) => {
    const cell = b.closest('.qp');
    return +(b.getBoundingClientRect().left - cell.getBoundingClientRect().left).toFixed(2);
  });
  const gr = ganLeft.length ? +(Math.max(...ganLeft) - Math.min(...ganLeft)).toFixed(2) : -1;

  return {
    hasCg: !!cg, cgCols: cg ? cg.cols.length : 0,
    cgText: cg ? cg.cols.map((c) => c.cang.map((x) => x.t).join('')) : [],
    cgAllEl: cg ? cg.cols.every((c) => c.cang.length && c.cang.every((x) => x.el)) : false,
    cgColors: cg ? [...new Set(cg.cols.flatMap((c) => c.cang.map((x) => x.c)))] : [],
    cgAlign: cg && gz ? +Math.max(...cg.cols.map((c, i) => Math.abs(c.cx - gz.cols[i].cx))).toFixed(2) : -1,
    symFs, doorRight, doorSE: doors.every((d) => d.inSE), doorCount: doors.length,
    ganRange: gr, palaceCount: cells.length,
  };
})()`;

(async () => {
  // 线上走公网，本机系统代理（127.0.0.1:7897）会把无头 Chrome 挡在门外 → 必须 --no-proxy-server
  await withBrowser(async (br) => {
    const p = await br.page({ url: URL_QM, w: 1280, h: 1000, mobile: false });
    let ready = false;
    for (let i = 0; i < 15 && !ready; i += 1) {
      await new Promise((r) => setTimeout(r, 1500));
      ready = await p.evaluate(`!!document.getElementById('btnPaipan')`);
    }
    if (!ready) { ok('线上奇门页加载', false, '15 秒内未出现起局按钮'); await p.close(); return; }
    await p.evaluate(`document.getElementById('btnPaipan').click();1`);
    let rendered = false;
    for (let i = 0; i < 12 && !rendered; i += 1) {
      await new Promise((r) => setTimeout(r, 1200));
      rendered = await p.evaluate(`!!document.querySelector('.qm2 .sz')`);
    }
    if (!rendered) { ok('线上奇门盘渲染', false, '未渲染出四柱表'); await p.close(); return; }
    const d = await p.evaluate(PROBE);
    await p.close();
    if (d.err) { ok('线上奇门盘渲染', false, d.err); return; }
    ok('线上四柱表含「藏干」行', d.hasCg, `列数=${d.cgCols}`);
    ok('线上藏干四列非空', d.cgText.length === 4 && d.cgText.every((t) => t.length), `年[${d.cgText[0]}] 月[${d.cgText[1]}] 日[${d.cgText[2]}] 时[${d.cgText[3]}]`);
    ok('线上藏干可点解释', d.cgAllEl);
    ok('线上藏干按五行着色', d.cgColors.length >= 2 && !d.cgColors.includes('rgb(107, 86, 64)'), `色值=${d.cgColors.length} 种`);
    ok('线上藏干行逐列对齐', d.cgAlign >= 0 && d.cgAlign <= 1, `偏差=${d.cgAlign}px`);
    ok('线上四类符号同字号', d.symFs.length === 1, `字号集合=[${d.symFs.join(',')}]`);
    ok('线上八门位于右下象限', d.doorSE, `门数=${d.doorCount}`);
    ok('线上八门右缘逐宫一致', d.doorRight.length === 1, `偏差集合=[${d.doorRight.join(',')}]（相对宫右缘 px）`);
    ok('线上天/地盘干左缘逐宫一致', d.ganRange >= 0 && d.ganRange <= 0.6, `极差=${d.ganRange}px`);
  }, { dbg: 9341, extraArgs: ['--no-proxy-server'] });
  console.log(`\n合计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`);
  if (fail) process.exitCode = 1;
})().catch((e) => { console.log('ERROR: ' + e.message); process.exitCode = 1; });
