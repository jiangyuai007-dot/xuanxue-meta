#!/usr/bin/env node
/**
 * 用户旅程验收（PM 用）—— 全站免费版：
 * 「排盘 → 报告 → 全部章节直接可读（0 锁定）→ 无付费入口 → 刷新仍可读 → 分享卡可用」
 * 每个关键节点截图到 shots/journey/，最终打印 PASS/FAIL 清单。
 * 用法：node scripts/journey.mjs [port] [system=bazi]
 */
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PORT = Number(process.argv[2] || 8787);
const SYS = process.argv[3] || 'bazi';
const SHOTS = path.join(ROOT, 'shots', 'journey');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const step = (name, ok, note) => {
  results.push({ name, ok, note: note || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

(async () => {
  await withBrowser(async (br) => {
    const p = await br.page({ url: `http://127.0.0.1:${PORT}/${SYS}.html`, w: 375, h: 812, mobile: true });

    // 1. 清空本机存储（模拟全新用户）
    await p.evaluate(`localStorage.clear(); 'cleared'`);

    // 2. 填表单并生成报告
    if (SYS === 'bazi') {
      await p.evaluate(`(function(){document.getElementById('year').value=1990;document.getElementById('month').value=5;document.getElementById('day').value=20;document.getElementById('hour').value=14;document.getElementById('minute').value=30;return 'ok'})()`);
    }
    await p.evaluate(`document.getElementById('btnReport').click(); 'clicked'`);
    await new Promise((r) => setTimeout(r, 4500));

    const readInfo = await p.evaluate(`(function(){
      const cards=[...document.querySelectorAll('.sections .card')];
      const locked=[...document.querySelectorAll('.card.locked')];
      const lens=cards.map(c=>(c.querySelector('.body')||c).textContent.length);
      return {total:cards.length, locked:locked.length,
        minLen:lens.length?Math.min.apply(null,lens):0, maxLen:lens.length?Math.max.apply(null,lens):0};
    })()`);
    await p.shot(path.join(SHOTS, `1_report_free_${SYS}.png`), true);
    step('报告生成且全部章节直接可读（0 锁定）', readInfo.total > 0 && readInfo.locked === 0,
      `共 ${readInfo.total} 章，锁定 ${readInfo.locked} 章，最短章 ${readInfo.minLen} 字`);

    // 3. 免费模式：正文完整展开（无「点击解锁」钩子占位）
    step('正文完整展开（无锁定钩子）', readInfo.total > 0 && readInfo.minLen >= 200,
      `最短章 ${readInfo.minLen} 字 / 最长章 ${readInfo.maxLen} 字`);

    // 4. 免费模式：付费 UI 全部退场
    const payUi = await p.evaluate(`(function(){
      return {buyButtons:document.querySelectorAll('[data-buy]').length,
        skuPanel:(function(){var s=document.getElementById('skuPanel');return s?(s.style.display==='none'||s.offsetParent===null?'hidden':'visible'):'absent'})(),
        payBtn:(function(){var b=document.getElementById('btnPay');return b?(b.style.display==='none'||b.offsetParent===null?'hidden':'visible'):'absent'})(),
        myOrders:!!document.getElementById('btnMyOrders')};
    })()`);
    await p.shot(path.join(SHOTS, `2_no_pay_ui_${SYS}.png`));
    step('无任何解锁/购买按钮', payUi.buyButtons === 0, `data-buy 按钮 ${payUi.buyButtons} 个`);
    step('SKU 面板隐藏或不存在', payUi.skuPanel !== 'visible', `SKU 面板=${payUi.skuPanel}`);
    step('支付入口隐藏或不存在', payUi.payBtn !== 'visible', `支付按钮=${payUi.payBtn}`);
    step('「我的已购」入口已移除', !payUi.myOrders);

    // 5. 刷新 → 重新生成报告 → 仍然全部可读（免费体验稳定）
    await p.goto(`http://127.0.0.1:${PORT}/${SYS}.html?t=${Date.now()}`, 1500);
    if (SYS === 'bazi') {
      await p.evaluate(`(function(){document.getElementById('year').value=1990;document.getElementById('month').value=5;document.getElementById('day').value=20;document.getElementById('hour').value=14;document.getElementById('minute').value=30;return 'ok'})()`);
    }
    await p.evaluate(`document.getElementById('btnReport').click(); 'clicked'`);
    await new Promise((r) => setTimeout(r, 4500));
    const afterReload = await p.evaluate(`(function(){
      const cards=[...document.querySelectorAll('.sections .card')];
      const locked=[...document.querySelectorAll('.card.locked')];
      const lens=cards.map(c=>(c.querySelector('.body')||c).textContent.length);
      return {total:cards.length, locked:locked.length, minLen:lens.length?Math.min.apply(null,lens):0};
    })()`);
    await p.shot(path.join(SHOTS, `3_after_reload_${SYS}.png`), true);
    step('刷新后仍全部可读（体验一致）',
      afterReload.total === readInfo.total && afterReload.locked === 0 && afterReload.minLen >= 200,
      `共 ${afterReload.total} 章，锁定 ${afterReload.locked} 章，最短章 ${afterReload.minLen} 字`);

    // 6. 分享卡可生成（页面内直接请求分享卡接口，校验返回 SVG）
    const SYS_INPUT = {
      bazi: { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
      ziwei: { type: 'ziwei', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
      qimen: { type: 'qimen', year: 2026, month: 9, day: 27, hour: 1, minute: 0, city: '北京', purpose: 'general' },
      liuyao: { type: 'liuyao', year: 2026, month: 9, day: 27, hour: 0, minute: 32, city: '北京', method: 'time', question: '测试', category: 'general' },
    };
    const card = await p.evaluate(`(async function(){
      try{
        var r=await fetch('/api/report',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({input:${JSON.stringify(SYS_INPUT[SYS] || SYS_INPUT.bazi)}})});
        var d=await r.json();
        if(!r.ok||!d.factPackId) return {ok:false, err:'report '+r.status};
        var r2=await fetch('/api/report/'+d.factPackId+'/sharecard.svg?t='+encodeURIComponent(d.reportToken||d.token||''));
        var t=await r2.text();
        return {ok:r2.ok&&t.indexOf('<svg')>=0, err:r2.ok?'':'svg '+r2.status};
      }catch(e){return {ok:false, err:e.message}}
    })()`);
    await p.shot(path.join(SHOTS, `4_share_card_${SYS}.png`));
    step('分享卡 SVG 可生成', card.ok, card.err || '返回合法 SVG');
  });

  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n旅程验收（免费模式）：${results.length - fails}/${results.length} 通过`);
  process.exit(fails ? 2 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
