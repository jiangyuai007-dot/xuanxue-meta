#!/usr/bin/env node
/** 奇门九宫盘对齐体检：宫格同构、行位一致、符号居中、字号统一 */
import path from 'node:path';
import fs from 'node:fs';
import { withBrowser } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PORT = Number(process.argv[2] || 8787);
const OUT = path.join(ROOT, 'shots', 'qm');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const step = (n, ok, note) => { results.push({ n, ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

const PROBE = `(function(){
  var halls=[...document.querySelectorAll('.qm2 .qp')];
  if(!halls.length) return JSON.stringify({err:'no palaces'});
  var rect=e=>e.getBoundingClientRect();
  var H=halls.map(e=>Math.round(rect(e).height));
  var W=halls.map(e=>Math.round(rect(e).width));
  function stat(sel, centerOnly){
    var off=[], cx=[], fs=[];
    halls.forEach(function(p){
      var e=p.querySelector(sel); if(!e) return;
      var r=rect(e), pr=rect(p);
      off.push(+(r.top - pr.top).toFixed(2));
      if(centerOnly!==false) cx.push(+((r.left+r.width/2)-(pr.left+pr.width/2)).toFixed(2));
      fs.push(Math.round(parseFloat(getComputedStyle(e).fontSize)*10)/10);
    });
    var rng=a=>a.length? +(Math.max.apply(null,a)-Math.min.apply(null,a)).toFixed(2) : -1;
    return {n:off.length, dy:rng(off), dx:rng(cx), fs:[...new Set(fs)]};
  }
  // 天地盘干：左对齐布局 —— 校验干字左缘相对宫左缘逐宫一致；
  // 并分组统计「有标记（长生/干标）」与「无标记」，验证标记不影响对齐
  function ganStat(sel){
    var withM=[], withoutM=[];
    halls.forEach(function(p){
      var g=p.querySelector(sel); if(!g) return;
      var b=g.querySelector('b'); if(!b) return;
      var pr=rect(p), br=rect(b);
      var d=+(br.left - pr.left).toFixed(2);
      (g.querySelector('.qcs')||g.querySelector('.mk') ? withM : withoutM).push(d);
    });
    var rng=a=>a.length? +(Math.max.apply(null,a)-Math.min.apply(null,a)).toFixed(2) : -1;
    var all=withM.concat(withoutM);
    return {withMark:withM.length, withoutMark:withoutM.length,
      rngWith:rng(withM), rngWithout:rng(withoutM), rngAll:all.length?rng(all):-1};
  }
  // 八门：右下角布局 —— 校验门字右缘相对宫右缘逐宫一致
  function doorStat(){
    var off=[];
    halls.forEach(function(p){
      var d=p.querySelector('.qd'); if(!d) return;
      var pr=rect(p), dr=rect(d);
      off.push(+((pr.right-dr.right)).toFixed(2));
    });
    var rng=a=>a.length? +(Math.max.apply(null,a)-Math.min.apply(null,a)).toFixed(2) : -1;
    return {n:off.length, dr:rng(off)};
  }
  var badges=[...document.querySelectorAll('.qm2 .qtag i')].map(function(e){var r=rect(e);return Math.round(r.width)+'x'+Math.round(r.height)});
  // 核心规格：八神/九星/八门/天干（天盘+地盘）四类符号必须同字号
  var symFs=[...new Set([...document.querySelectorAll('.qm2 .qs,.qm2 .qstar,.qm2 .qd,.qm2 .qgan b')].map(function(e){
    return Math.round(parseFloat(getComputedStyle(e).fontSize)*10)/10;
  }))];
  // 八门必须位于右下象限：门字中心在宫中线右侧、且在宫中线以下
  var doorCorner=true;
  halls.forEach(function(p){
    var d=p.querySelector('.qd'); if(!d) return;
    var pr=rect(p), dr=rect(d);
    if((dr.left+dr.width/2)<(pr.left+pr.width/2)-0.6) doorCorner=false;
    if((dr.top+dr.height/2)<(pr.top+pr.height/2)-0.6) doorCorner=false;
  });
  var framed=[...document.querySelectorAll('.qm2 .qp')].filter(e=>getComputedStyle(e).boxShadow!=='none').length;
  var hatch=!!document.querySelector('.qm2 .qp.kw') && getComputedStyle(document.querySelector('.qm2 .qp.kw')).backgroundImage.includes('repeating');
  return JSON.stringify({
    hallHeights:[...new Set(H)], hallWidths:[...new Set(W)],
    head:stat('.qh', false), shen:stat('.qs'), star:stat('.qstar'),
    door:doorStat(),
    tian:ganStat('.qgan.ti'), di:ganStat('.qgan.di'),
    badgeSizes:[...new Set(badges)], framed:framed, hatch:hatch,
    symFs:symFs, doorCorner:doorCorner,
    legend: !!document.querySelector('.qm2 .lg'),
    qmEl: document.querySelectorAll('.qm-el').length
  });
})()`;

(async () => {
  await withBrowser(async (br) => {
    for (const [tag, w, h, mobile] of [['d', 1280, 1000, false], ['m', 390, 900, true]]) {
      const p = await br.page({ url: `http://127.0.0.1:${PORT}/qimen.html`, w, h, mobile });
      await new Promise((r) => setTimeout(r, 1200));
      await p.evaluate(`document.getElementById('btnPaipan').click();1`);
      await new Promise((r) => setTimeout(r, 2800));
      const raw = await p.evaluate(PROBE);
      const Q = JSON.parse(raw);
      if (Q.err) { step(`奇门盘面渲染（${tag}）`, false, Q.err); await p.close(); continue; }
      const S = tag === 'd' ? '' : '（移动端）';
      step(`九宫等高${S}`, Q.hallHeights.length === 1, `高度集合=${JSON.stringify(Q.hallHeights)}`);
      step(`九宫等宽${S}`, Q.hallWidths.length === 1, `宽度集合=${JSON.stringify(Q.hallWidths)}`);
      for (const [k, label] of [['head', '宫位头'], ['shen', '八神'], ['star', '九星']]) {
        const s = Q[k];
        step(`${label}行：九宫垂直位置一致${S}`, s.dy <= 0.6, `最大偏差=${s.dy}px（${s.n}宫）`);
        if (k !== 'head') step(`${label}水平居中一致${S}`, s.dx <= 0.6, `中心最大偏差=${s.dx}px`);
      }
      step(`八门右下角：九宫右缘位置一致${S}`, Q.door.dr <= 0.6, `右缘最大偏差=${Q.door.dr}px（${Q.door.n}宫）`);
      step(`八门位于右下象限${S}`, Q.doorCorner);
      for (const [k, label] of [['shen', '八神'], ['star', '九星']]) {
        step(`${label}字号统一${S}`, Q[k].fs.length === 1, `字号集合=${JSON.stringify(Q[k].fs)}`);
      }
      step(`四类符号（神/星/门/干）同字号${S}`, Q.symFs.length === 1, `字号集合=${JSON.stringify(Q.symFs)}`);
      step(`天盘干左缘逐宫一致（长生/干标记不影响）${S}`, Q.tian.rngAll <= 0.6,
        `组内差 有标 ${Q.tian.rngWith}px / 无标 ${Q.tian.rngWithout}px，全体差 ${Q.tian.rngAll}px（${Q.tian.withMark}+${Q.tian.withoutMark} 宫）`);
      step(`地盘干左缘逐宫一致（干标记不影响）${S}`, Q.di.rngAll <= 0.6,
        `组内差 有标 ${Q.di.rngWith}px / 无标 ${Q.di.rngWithout}px，全体差 ${Q.di.rngAll}px（${Q.di.withMark}+${Q.di.withoutMark} 宫）`);
      step(`徽标尺寸统一${S}`, Q.badgeSizes.length === 1, `尺寸集合=${JSON.stringify(Q.badgeSizes)}`);
      step(`仅值符宫描边（无双框叠加）${S}`, Q.framed <= 1, `描边宫数=${Q.framed}`);
      step(`空亡宫无横纹${S}`, !Q.hatch);
      step(`徽标图例存在${S}`, Q.legend);
      step(`可点击解释元素充足${S}`, Q.qmEl >= 40, `qm-el x${Q.qmEl}`);
      await p.shot(path.join(OUT, `qm_align_${tag}.png`));
      await p.close();
    }
  });
  const bad = results.filter((r) => !r.ok);
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - bad.length}，失败 ${bad.length}`);
  if (bad.length) { console.log(bad.map((b) => '  ✗ ' + b.n + ' — ' + b.note).join('\n')); process.exitCode = 1; }
})().catch((e) => { console.log('ERROR: ' + e.message); process.exitCode = 1; });
