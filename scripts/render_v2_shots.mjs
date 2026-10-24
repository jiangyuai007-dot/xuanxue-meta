import fs from 'node:fs';
import { withBrowser } from './cdp.mjs';
import { build } from '../src/factpack.js';
import { renderChart } from '../src/report/index.js';
import { computeHePan } from '../src/engines/hepan.js';

const outDir = '/working_dir/c_543175706976880c/artifacts/file_generation/ttl=63d/output/shots';
fs.mkdirSync(outDir, { recursive: true });
const styleCss = fs.readFileSync('web/style.css', 'utf8');

const QUICK_BAR_HTML = {
  bazi: `<div id="xjQuickCastBar" class="fb-quick-bar"><div class="fbq-left"><span class="fbq-seal">☯ 四柱八字 · 子平真太阳时起盘台</span><span class="fbq-meta">节气交脱分秒定局 · 110项古籍神煞 · 六柱岁运同参</span></div><div class="fbq-right"><button type="button" class="fbq-chip">⚡ 此刻时辰起盘</button><button type="button" class="fbq-chip">👨 经典乾造命例</button><button type="button" class="fbq-chip">👩 经典坤造命例</button><button type="button" class="fbq-chip">📅 今日黄历宜忌</button></div></div>`,
  ziwei: `<div id="xjQuickCastBar" class="fb-quick-bar"><div class="fbq-left"><span class="fbq-seal">✦ 紫微斗数 · 文墨天机全星起盘台</span><span class="fbq-meta">108颗星曜竖排成列 · 十二宫本宫自化与向心四化 · 博士长生三神叠列</span></div><div class="fbq-right"><button type="button" class="fbq-chip">⚡ 此刻时辰排盘</button><button type="button" class="fbq-chip">👨 紫贪格男命例</button><button type="button" class="fbq-chip">👩 机月同梁女命例</button><button type="button" class="fbq-chip">📅 今日黄历宜忌</button></div></div>`,
  liuyao: `<div id="xjQuickCastBar" class="fb-quick-bar"><div class="fbq-left"><span class="fbq-seal">䷀ 六爻纳甲 · 京房易占演卦台</span><span class="fbq-meta">时间 / 报数 / 铜钱 / 手动 / 卦名五法齐备 · 旺相休囚死与应期直断</span></div><div class="fbq-right"><button type="button" class="fbq-chip">⚡ 此刻正时起卦</button><button type="button" class="fbq-chip">🎲 随机铜钱演卦</button><button type="button" class="fbq-chip">🔢 梅花报数示例</button><button type="button" class="fbq-chip">📅 今日黄历宜忌</button></div></div>`,
  hepan: `<div id="xjQuickCastBar" class="fb-quick-bar"><div class="fbq-left"><span class="fbq-seal">囍 八字合婚 · 双人命局同参台</span><span class="fbq-meta">天干五合 · 地支六合三合刑冲 · 日柱夫妻宫配合 · 六维契合度雷达</span></div><div class="fbq-right"><button type="button" class="fbq-chip">💑 天作之合命例</button><button type="button" class="fbq-chip">🔥 互补磨合命例</button><button type="button" class="fbq-chip">🔄 甲乙双方互换</button><button type="button" class="fbq-chip">📅 婚嫁择日黄历</button></div></div>`,
};

function buildFullHtml(pageFile, sys, chartHtml, summaryText, collapseForm = true) {
  let html = fs.readFileSync('web/' + pageFile, 'utf8');
  html = html.replace(/<link rel="stylesheet" href="style\.css[^"]*">/, `<style>${styleCss}</style>`);
  html = html.replace(/<link rel="stylesheet" href="fonts\/subset\.css">/, '');
  html = html.replace(/<script[\s\S]*?<\/script>/g, '');
  html = html.replace(/<body([^>]*)>/, `<body$1 class="has-paipan">`);
  html = html.replace(
    /<div class="fb-card">/,
    `<div class="fb-card">${QUICK_BAR_HTML[sys] || ''}`
  );
  html = html.replace(
    /<section class="formbar">/,
    `<section class="formbar${collapseForm ? ' is-collapsed' : ''}"><div id="formSummaryBar" class="form-summary-bar" style="display:flex"><div class="fsb-main"><span class="fsb-badge">${collapseForm ? '已排盘' : '实时命盘预览'}</span><span class="fsb-text">${summaryText}</span></div><div class="fsb-acts"><button type="button" class="mini">${collapseForm ? '展开修改' : '收起表单'}</button><button type="button" class="mini primary">生成海报</button></div></div>`
  );
  html = html.replace(
    /<div class="workbench">/,
    `<div class="workbench" data-mview="chart"><div id="stageViewTabs" class="stage-view-tabs"><button class="sv-tab on">① 专业命盘</button><button class="sv-tab">② AI 命书</button><button class="sv-tab">③ 大师追问</button><button class="sv-tab">④ 档案</button></div>`
  );
  html = html.replace(/<div id="intro"[\s\S]*?<\/div>\s*<\/div>/, '');
  html = html.replace(/<div id="chart" class="chart-stage" style="display:none"><\/div>/, `<div id="chart" class="chart-stage">${chartHtml}</div>`);
  html = html.replace(
    /<aside class="rail rail-right">([\s\S]*?)<\/aside>/,
    `<aside class="rail rail-right">$1<section id="xjFollowupBox" class="xj-followup-card"><div class="xj-fu-head"><div><div class="xj-fu-title">💬 命盘深度追问</div><div style="font-size:11.5px;color:#7a6850;">严格锚定当前 FactPack 排盘事实，零幻觉针对性推演</div></div><div><span class="xj-fu-badge" style="background:#e7f4ec;color:#1f6e43">已绑定命盘</span></div></div><div class="xj-fu-presets"><button class="xj-fu-chip">我近两年适合跳槽、转行或拓展副业吗？</button><button class="xj-fu-chip">我的正缘特征是什么？感情稳定期在何时？</button><button class="xj-fu-chip">当前大运与今年流年有哪些需要留意的冲合信号？</button></div><div class="xj-chat-list"><div class="xj-chat-empty">命盘事实护栏已就绪。点击上方快捷胶囊或直接输入具体问题即可开始多轮深度追问。</div></div></section></aside>`
  );
  html = html.replace(
    /<\/body>/,
    `<nav class="mobile-tabbar"><a class="mtab${sys === 'bazi' ? ' active' : ''}"><span class="mtab-ic">☯</span><span class="mtab-tx">八字</span></a><a class="mtab"><span class="mtab-ic">䷀</span><span class="mtab-tx">六爻</span></a><a class="mtab"><span class="mtab-ic">☷</span><span class="mtab-tx">奇门</span></a><a class="mtab${sys === 'ziwei' ? ' active' : ''}"><span class="mtab-ic">✦</span><span class="mtab-tx">紫微</span></a><a class="mtab${sys === 'hepan' ? ' active' : ''}"><span class="mtab-ic">囍</span><span class="mtab-tx">合盘</span></a><a class="mtab"><span class="mtab-ic">印</span><span class="mtab-tx">我的</span></a></nav></body>`
  );
  return html;
}

const baziFp = build({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
const liuyaoFp = build({ type: "liuyao", method: "time", year: 2026, month: 10, day: 23, hour: 20, minute: 19, question: "近期事业财运走势如何？", city: "北京" });
const ziweiFp = build({ type: 'ziwei', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
const fa = build({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 10, minute: 30, gender: 'male', city: '北京' });
const fb = build({ type: 'bazi', year: 1993, month: 3, day: 8, hour: 14, minute: 20, gender: 'female', city: '上海' });
const hepanFp = { id: 'hepan:test', system: 'hepan', facts: computeHePan({ a: fa.facts, b: fb.facts, names: { a: '甲方', b: '乙方' } }) };

await withBrowser(async (br) => {
  // 1. Desktop Ziwei (WenMoTianJi + Expanded Command Card, 1440x1050)
  {
    const p = await br.page({ w: 1440, h: 1080, mobile: false });
    const tree = await p.send('Page.getFrameTree');
    const fid = tree.frameTree.frame.id;
    const html = buildFullHtml('ziwei.html', 'ziwei', renderChart(ziweiFp), '命宫戌 · 身宫辰 · 金四局 · 紫微辰宫 · 天府子宫', true);
    await p.send('Page.setDocumentContent', { frameId: fid, html });
    await new Promise((r) => setTimeout(r, 500));
    await p.shot(`${outDir}/v21-ziwei-desktop.png`, true);
    await p.close();
  }

  // 2. Desktop Hepan (Zero-Void Command Card + Live Radar & Pillars, 1440x1050)
  {
    const p = await br.page({ w: 1440, h: 1080, mobile: false });
    const tree = await p.send('Page.getFrameTree');
    const fid = tree.frameTree.frame.id;
    const html = buildFullHtml('hepan.html', 'hepan', renderChart(hepanFp), '甲方 × 乙方 · 契合指数 68 分 · 互补有成', true);
    await p.send('Page.setDocumentContent', { frameId: fid, html });
    await new Promise((r) => setTimeout(r, 500));
    await p.shot(`${outDir}/v21-hepan-desktop.png`, true);
    await p.close();
  }

  // 3. Desktop Bazi (Oriental Command Card + Live Four Pillars, 1440x1050)
  {
    const p = await br.page({ w: 1440, h: 1080, mobile: false });
    const tree = await p.send('Page.getFrameTree');
    const fid = tree.frameTree.frame.id;
    const html = buildFullHtml('bazi.html', 'bazi', renderChart(baziFp), '庚午 辛巳 乙酉 癸未 · 日主乙木 · 中和', true);
    await p.send('Page.setDocumentContent', { frameId: fid, html });
    await new Promise((r) => setTimeout(r, 500));
    await p.shot(`${outDir}/v21-bazi-desktop.png`, true);
    await p.close();
  }

  // 4. Mobile Ziwei (WenMoTianJi Vertical Columns + 3-Zone Footer, 390x844)
  {
    const p = await br.page({ w: 390, h: 844, mobile: true });
    const tree = await p.send('Page.getFrameTree');
    const fid = tree.frameTree.frame.id;
    const html = buildFullHtml('ziwei.html', 'ziwei', renderChart(ziweiFp), '命宫戌 · 身宫辰 · 金四局', true);
    await p.send('Page.setDocumentContent', { frameId: fid, html });
    await new Promise((r) => setTimeout(r, 500));
    const m2 = await p.evaluate(`({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      boardRect: document.querySelector(".zw2 .board")?.getBoundingClientRect()
    })`);
    console.log('Mobile Ziwei metrics:', JSON.stringify(m2));
    await p.shot(`${outDir}/v21-ziwei-mobile.png`, true);
    await p.shot(`${outDir}/v2-ziwei-mobile.png`, true);
    await p.close();
  }

  // 5. Mobile Bazi Core & Shensha (390x844)
  {
    const p = await br.page({ w: 390, h: 844, mobile: true });
    const tree = await p.send('Page.getFrameTree');
    const fid = tree.frameTree.frame.id;
    const html = buildFullHtml('bazi.html', 'bazi', renderChart(baziFp), '庚午 辛巳 乙酉 癸未 · 日主乙木', true);
    await p.send('Page.setDocumentContent', { frameId: fid, html });
    await new Promise((r) => setTimeout(r, 500));
    await p.shot(`${outDir}/v2-bazi-mobile-core.png`, true);
    await p.evaluate(`document.getElementById("bzv-shensha").checked = true;`);
    await new Promise((r) => setTimeout(r, 300));
    await p.shot(`${outDir}/v2-bazi-mobile-shensha.png`, true);
    await p.close();
  }

  // 5b. Desktop & Mobile Liuyao (1440x1080 & 390x844)
  {
    const p = await br.page({ w: 1440, h: 1080, mobile: false });
    const tree = await p.send("Page.getFrameTree");
    const fid = tree.frameTree.frame.id;
    const html = buildFullHtml("liuyao.html", "liuyao", renderChart(liuyaoFp), "山泽损 → 地火明夷 · 艮宫 土", true);
    await p.send("Page.setDocumentContent", { frameId: fid, html });
    await new Promise((r) => setTimeout(r, 400));
    await p.shot(`${outDir}/v21-liuyao-desktop.png`, true);
    await p.close();
  }
  {
    const p = await br.page({ w: 390, h: 844, mobile: true });
    const tree = await p.send("Page.getFrameTree");
    const fid = tree.frameTree.frame.id;
    const html = buildFullHtml("liuyao.html", "liuyao", renderChart(liuyaoFp), "山泽损 → 地火明夷 · 艮宫 土", true);
    await p.send("Page.setDocumentContent", { frameId: fid, html });
    await new Promise((r) => setTimeout(r, 400));
    await p.shot(`${outDir}/v21-liuyao-mobile.png`, true);
    await p.close();
  }

  // 6. Mobile Hepan (390x844)
  {
    const p = await br.page({ w: 390, h: 844, mobile: true });
    const tree = await p.send('Page.getFrameTree');
    const fid = tree.frameTree.frame.id;
    const html = buildFullHtml('hepan.html', 'hepan', renderChart(hepanFp), '甲方 × 乙方 · 68分 互补有成', true);
    await p.send('Page.setDocumentContent', { frameId: fid, html });
    await new Promise((r) => setTimeout(r, 500));
    await p.shot(`${outDir}/v2-hepan-mobile.png`, true);
    await p.close();
  }
});
