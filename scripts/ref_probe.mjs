#!/usr/bin/env node
/** 参照页版面测绘：只提取「哪个位置放什么、各多大」的排版规格，不取任何代码 */
import { withBrowser } from './cdp.mjs';

const URL_ = process.argv[2] || 'https://www.yrydai.com/p2.php?mod=index&act=index&ruid=335497';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await withBrowser(async (br) => {
    const p = await br.page({ url: URL_, w: 1280, h: 1000, mobile: false });
    await sleep(3500);
    const info = await p.evaluate(`(function(){
      var out={title:document.title, url:location.href, len:document.body.innerHTML.length};
      // 候选宫格容器：类名/ID 含宫/pan/cell/gong/grid 的元素
      var cands=[];
      document.querySelectorAll('div,table,td,li,span').forEach(function(e){
        var c=(e.className||'')+' '+(e.id||'');
        if(/宫|gong|pan|cell|grid|ju|palace/i.test(c)) cands.push(c.trim().slice(0,40));
      });
      out.cands=[...new Set(cands)].slice(0,40);
      out.text=(document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,2500);
      return JSON.stringify(out);
    })()`);
    const I = JSON.parse(info);
    console.log('=== 标题 ===\n' + I.title);
    console.log('\n=== 容器候选 ===\n' + I.cands.join('\n'));
    console.log('\n=== 文本（版面顺序） ===\n' + I.text);
    await p.close();
  });
})().catch((e) => { console.log('ERROR: ' + e.message); process.exitCode = 1; });
