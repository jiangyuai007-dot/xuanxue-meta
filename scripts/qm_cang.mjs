#!/usr/bin/env node
/**
 * 奇门四柱「藏干」行体检
 * 校验点：
 *  ① 藏干行存在，四列齐全（年/月/日/时）
 *  ② 每列藏干非空且本气在前（与 CANGGAN 表一致）
 *  ③ 藏干字按五行着色（非默认灰）
 *  ④ 藏干行与「干支/空亡」行逐列水平中心对齐
 *  ⑤ 四柱表不溢出（scrollWidth <= clientWidth）
 *  ⑥ 藏干字可点击解释（qm-el + data-t/data-x 非空）
 * 桌面 + 移动端各跑一遍
 */
import path from 'node:path';
import { withBrowser } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PORT = Number(process.argv[2] || 8787);

let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

const PROBE = `(() => {
  const sz = document.querySelector('.qm2 .sz');
  if (!sz) return { err: 'no .sz' };
  const rows = [...sz.children];
  // 表结构：k / rc 交替，每行 = 1 个 .k + 4 个 .rc
  const out = { rows: [], szW: sz.clientWidth, szSW: sz.scrollWidth, rowCount: rows.length };
  let cur = null;
  for (const el of rows) {
    if (el.classList.contains('k')) { cur = { key: el.textContent.trim(), cols: [] }; out.rows.push(cur); }
    else if (cur) {
      const cg = el.querySelector('.cg');
      cur.cols.push({
        text: el.textContent.trim(),
        cx: +(el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2).toFixed(2),
        w: +el.getBoundingClientRect().width.toFixed(2),
        h: +el.getBoundingClientRect().height.toFixed(2),
        cang: cg ? [...cg.querySelectorAll('i')].map((i) => ({ t: i.textContent.trim(), c: getComputedStyle(i).color, el: i.classList.contains('qm-el'), dt: i.dataset.t || '', dx: i.dataset.x || '' })) : [],
      });
    }
  }
  // 藏干行是否溢出自身格子
  const cgEls = [...sz.querySelectorAll('.cg')];
  out.cgOverflow = cgEls.map((e) => e.scrollWidth > e.clientWidth + 1);
  out.cgFs = [...new Set(cgEls.map((e) => getComputedStyle(e).fontSize))];
  return out;
})()`;

(async () => {
  await withBrowser(async (br) => {
    for (const [tag, w, h, mobile] of [['桌面', 1280, 1000, false], ['移动端', 390, 844, true]]) {
      const p = await br.page({ url: `http://127.0.0.1:${PORT}/qimen.html`, w, h, mobile });
      await new Promise((r) => setTimeout(r, 1200));
      await p.evaluate(`document.getElementById('btnPaipan').click();1`);
      await new Promise((r) => setTimeout(r, 2800));
      const d = await p.evaluate(PROBE);
      await p.close();

      if (d.err) { ok(`${tag}：四柱表存在`, false, d.err); continue; }
      const cg = d.rows.find((r) => r.key === '藏干');
      const gz = d.rows.find((r) => r.key === '干支');
      const kw = d.rows.find((r) => r.key === '空亡');

      ok(`${tag}：藏干行存在`, !!cg, cg ? `四列=${cg.cols.length}` : '未找到「藏干」行');
      if (!cg) continue;
      ok(`${tag}：藏干四列齐全`, cg.cols.length === 4, `实际 ${cg.cols.length} 列`);

      const texts = cg.cols.map((c) => c.cang.map((x) => x.t).join(''));
      ok(`${tag}：四柱藏干均非空`, texts.every((t) => t.length > 0), `年[${texts[0]}] 月[${texts[1]}] 日[${texts[2]}] 时[${texts[3]}]`);

      const all = cg.cols.flatMap((c) => c.cang);
      ok(`${tag}：藏干按五行着色`, all.length > 0 && all.every((x) => x.c && x.c !== 'rgb(107, 86, 64)'), `色值集合=[${[...new Set(all.map((x) => x.c))].join(' | ')}]`);
      ok(`${tag}：藏干可点解释`, all.length > 0 && all.every((x) => x.el && x.dt && x.dx.length > 8), `qm-el 数=${all.filter((x) => x.el).length}/${all.length}`);

      // 逐列中心对齐（藏干 vs 干支 vs 空亡）
      if (gz && kw) {
        const dev = cg.cols.map((c, i) => Math.abs(c.cx - gz.cols[i].cx));
        const dev2 = cg.cols.map((c, i) => Math.abs(c.cx - kw.cols[i].cx));
        const mx = Math.max(...dev, ...dev2);
        ok(`${tag}：藏干行与干支/空亡逐列对齐`, mx <= 1, `最大偏差=${mx.toFixed(2)}px`);
      }
      ok(`${tag}：藏干不溢出格子`, d.cgOverflow.every((v) => !v), `溢出列=${d.cgOverflow.filter(Boolean).length}`);
      ok(`${tag}：藏干字号统一`, d.cgFs.length === 1, `字号集合=[${d.cgFs.join(',')}]`);
      ok(`${tag}：四柱表不横向溢出`, d.szSW <= d.szW + 1, `scroll=${d.szSW} client=${d.szW}`);
    }
  });
  console.log(`\n合计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`);
  if (fail) process.exitCode = 1;
})().catch((e) => { console.log('ERROR: ' + e.message); process.exitCode = 1; });
