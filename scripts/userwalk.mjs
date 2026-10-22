#!/usr/bin/env node
/** 用户视角走查：六爻/奇门/紫微/八字 排盘 + 六爻手动指定 + 奇门空亡宫无横纹 */
import path from 'node:path';
import fs from 'node:fs';
import { withBrowser } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PORT = Number(process.argv[2] || 8787);
const OUT = path.join(ROOT, 'shots', 'final');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const step = (n, ok, note) => { results.push({ n, ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await withBrowser(async (br) => {
    // —— 六爻：时间起卦（含动爻/空亡/世应）——
    let p = await br.page({ url: `http://127.0.0.1:${PORT}/liuyao.html`, w: 1280, h: 900, mobile: false });
    await sleep(1200);
    await p.evaluate(`(function(){var y=document.getElementById('year');if(y)y.value=2026;var m=document.getElementById('month');if(m)m.value=9;var d=document.getElementById('day');if(d)d.value=30;var h=document.getElementById('hour');if(h)h.value=9;var mi=document.getElementById('minute');if(mi)mi.value=0;return 1})()`);
    await p.evaluate(`document.getElementById('btnPaipan').click();1`);
    await new Promise((r) => setTimeout(r, 2500));
    const ly = await p.evaluate(`JSON.stringify({
      fuInline: /伏 [甲乙丙丁戊己庚辛壬癸]/.test(document.querySelector('.ly3').innerHTML),
      fuBadge: !!document.querySelector('.lfu-badge'),
      heights: [...document.querySelectorAll('.ly3 .lrow')].map(e=>Math.round(e.getBoundingClientRect().height)).filter((v,i,a)=>a.indexOf(v)===i),
      rows: document.querySelectorAll('.ly3 .lrow').length
    })`);
    const L = JSON.parse(ly);
    await p.shot(path.join(OUT, 'u_liuyao_d.png'));
    step('六爻新渲染生效（无行内伏神文字）', !L.fuInline, `角标=${L.fuBadge}（本卦六亲齐全时无角标属正常）`);
    step('六爻行高恒定', L.heights.length === 1, `行高集合=${JSON.stringify(L.heights)}（应只有一个值）`);
    await p.close();

    // —— 六爻：手动指定全阴 → 必须是坤为地（引擎修复用户可见验证）——
    p = await br.page({ url: `http://127.0.0.1:${PORT}/liuyao.html`, w: 1280, h: 900, mobile: false });
    await sleep(1200);
    await p.evaluate(`(function(){
      var seg=document.querySelector('#methodSeg button[data-v=manual]'); if(seg) seg.click();
      var m=document.getElementById('method'); if(m) m.value='manual';
      if(m) m.dispatchEvent(new Event('change'));
      document.querySelectorAll('#manualYaos .manual-yao').forEach(function(b){ // 每爻点到阴静(8)：7->9->8
        var want=2; while(want--) b.click();
      });
      return 1;
    })()`);
    await new Promise((r) => setTimeout(r, 600));
    await p.evaluate(`document.getElementById('btnPaipan').click();1`);
    await new Promise((r) => setTimeout(r, 2500));
    const manual = await p.evaluate(`JSON.stringify({gua:(document.querySelector('.ly3 .gh .gn')||{textContent:''}).textContent.trim()})`);
    step('六爻手动指定：全阴静卦=坤为地（不再是乾为天）', manual.includes('坤为地'), manual);
    await p.shot(path.join(OUT, 'u_liuyao_manual.png'));
    await p.close();

    // —— 奇门：九宫对齐 + 无横纹 + 单一描边 ——
    p = await br.page({ url: `http://127.0.0.1:${PORT}/qimen.html`, w: 1280, h: 950, mobile: false });
    await new Promise((r) => setTimeout(r, 1200));
    await p.evaluate(`document.getElementById('btnPaipan').click();1`);
    await new Promise((r) => setTimeout(r, 2800));
    const qm = await p.evaluate(`(function(){
      var hatch = !!document.querySelector('.qm2 .qp.kw') && getComputedStyle(document.querySelector('.qm2 .qp.kw')).backgroundImage.includes('repeating');
      var halls=[...document.querySelectorAll('.qm2 .qp')];
      var hs=halls.map(e=>Math.round(e.getBoundingClientRect().height));
      // 同行三宫天盘 top
      var rows=[[],[],[]];
      halls.forEach((e,i)=>{ var g=e.querySelector('.qg'); if(g) rows[Math.floor(i/3)].push(Math.round(g.getBoundingClientRect().top)); });
      var maxDiff=Math.max.apply(null, rows.map(r=>Math.max.apply(null,r)-Math.min.apply(null,r)));
      var framed=[...document.querySelectorAll('.qm2 .qp')].filter(e=>{var s=getComputedStyle(e);return s.boxShadow!=='none';}).length;
      return JSON.stringify({hatch:hatch, hallHeights:[...new Set(hs)], rowTopDiff:maxDiff, framedCount:framed});
    })()`);
    const Q = JSON.parse(qm);
    await p.shot(path.join(OUT, 'u_qimen_d.png'));
    step('奇门空亡宫无横纹', !Q.hatch);
    step('奇门九宫同高', Q.hallHeights.length === 1, `高度集合=${JSON.stringify(Q.hallHeights)}`);
    step('奇门同行天盘 top 差 ≤1px', Q.rowTopDiff <= 1, `最大差=${Q.rowTopDiff}px`);
    step('奇门描边宫 ≤1（值符金框，无双框叠加）', Q.framedCount <= 1, `带描边宫数=${Q.framedCount}`);
    await p.close();

    // —— 八字 + 紫微排盘不破 ——
    for (const sys of ['bazi', 'ziwei']) {
      p = await br.page({ url: `http://127.0.0.1:${PORT}/${sys}.html`, w: 1280, h: 950, mobile: false });
      await new Promise((r) => setTimeout(r, 1200));
      await p.evaluate(`document.getElementById('btnReport').click();1`);
      await new Promise((r) => setTimeout(r, 4500));
      const cards = await p.evaluate(`document.querySelectorAll('.sections .card').length`);
      const sw = await p.evaluate(`document.documentElement.scrollWidth`);
      await p.shot(path.join(OUT, `u_${sys}_d.png`));
      step(`${sys} 报告生成且页面不溢出`, cards > 0 && sw <= 1281, `章节=${cards} sw=${sw}`);
      await p.close();
    }
  });

  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n用户走查：${results.length - fails}/${results.length} 通过`);
  process.exit(fails ? 2 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
