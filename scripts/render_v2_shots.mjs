import fs from "node:fs";
import { withBrowser } from "./cdp.mjs";
import { build } from "../src/factpack.js";
import { renderChart } from "../src/report/index.js";

const styleCss = fs.readFileSync("web/style.css", "utf8");
const outDir = "/working_dir/c_543175706976880c/artifacts/file_generation/ttl=63d/output/shots";
fs.mkdirSync(outDir, { recursive: true });

const QUICK_BAR = {
  qimen: `<div id="xjQuickCastBar" class="fb-quick-bar"><div class="fbq-left"><span class="fbq-seal">☷ 奇门遁甲时家起局台</span></div><div class="fbq-right"><button type="button" class="fbq-chip">⚡ 正时起局</button><button type="button" class="fbq-chip">💼 事业求财</button><button type="button" class="fbq-chip">❤️ 婚恋感情</button><button type="button" class="fbq-chip fbq-fold">▲ 收起</button></div></div>`,
  bazi: `<div id="xjQuickCastBar" class="fb-quick-bar"><div class="fbq-left"><span class="fbq-seal">☯ 八字真太阳时起盘台</span></div><div class="fbq-right"><button type="button" class="fbq-chip">⚡ 此刻起盘</button><button type="button" class="fbq-chip">👨 乾造示例</button><button type="button" class="fbq-chip">👩 坤造示例</button><button type="button" class="fbq-chip fbq-fold">▲ 收起</button></div></div>`,
};

function buildMobileHtml(pageFile, sys, chartHtml, collapsed) {
  let html = fs.readFileSync("web/" + pageFile, "utf8");
  html = html.replace(/<link rel="stylesheet" href="style\.css[^"]*">/, `<style>${styleCss}</style>`);
  html = html.replace(/<link rel="stylesheet" href="fonts\/subset\.css">/, "");
  html = html.replace(/<script[\s\S]*?<\/script>/g, "");
  html = html.replace(/<body([^>]*)>/, `<body$1 class="has-paipan">`);
  html = html.replace(/<div class="top-status">[\s\S]*?<\/div>/, `<div class="top-status"><span class="dot" id="svcDot"></span><span id="svcTxt">本地服务正常</span><button type="button" class="btn-top-almanac">📅 今日黄历</button></div>`);
  html = html.replace(/<div class="fb-card">/, `<div class="fb-card">${QUICK_BAR[sys]}`);
  html = html.replace(/<section class="formbar">/, `<section class="formbar${collapsed ? " is-collapsed" : ""}"><div id="formSummaryBar" class="form-summary-bar" style="display:flex"><div class="fsb-main"><span class="fsb-badge">已排盘</span><span class="fsb-text">${sys === "qimen" ? "阴遁8局 中元 · 值符天心 · 值使开门" : "庚午 辛巳 乙酉 癸未 · 日主乙木"}</span></div><div class="fsb-acts"><button type="button" class="mini">展开修改</button><button type="button" class="mini primary">生成海报</button></div></div>`);
  html = html.replace(/<div id="msg"[^>]*><\/div>/, `<div id="msg" class="msg">排盘完成 (2 ms)</div>`);
  html = html.replace(/<div class="workbench">/, `<div class="workbench" data-mview="chart"><div id="stageViewTabs" class="stage-view-tabs"><button class="sv-tab on">① 专业命盘</button><button class="sv-tab">② AI 命书</button><button class="sv-tab">③ 大师追问</button><button class="sv-tab">④ 档案</button></div>`);
  html = html.replace(/<div id="intro"[\s\S]*?<\/div>\s*<\/div>/, "");
  html = html.replace(/<div id="chart" class="chart-stage" style="display:none"><\/div>/, `<div id="chart" class="chart-stage">${chartHtml}</div>`);
  html = html.replace(/<\/body>/, `<nav class="mobile-tabbar"><a class="mtab${sys==="bazi"?" active":""}"><span class="mtab-ic">☯</span><span class="mtab-tx">八字</span></a><a class="mtab"><span class="mtab-ic">䷀</span><span class="mtab-tx">六爻</span></a><a class="mtab${sys==="qimen"?" active":""}"><span class="mtab-ic">☷</span><span class="mtab-tx">奇门</span></a><a class="mtab"><span class="mtab-ic">✦</span><span class="mtab-tx">紫微</span></a><a class="mtab"><span class="mtab-ic">囍</span><span class="mtab-tx">合盘</span></a><a class="mtab"><span class="mtab-ic">印</span><span class="mtab-tx">我的</span></a></nav></body>`);
  return html;
}

const qimenFp = build({ type: "qimen", year: 2026, month: 10, day: 24, hour: 13, minute: 4, purpose: "general", panType: "zhuan", juMethod: "chaibu" });
const baziFp = build({ type: "bazi", year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: "male", city: "北京" });

await withBrowser(async (br) => {
  {
    const p = await br.page({ w: 390, h: 844, mobile: true });
    const tree = await p.send("Page.getFrameTree");
    await p.send("Page.setDocumentContent", { frameId: tree.frameTree.frame.id, html: buildMobileHtml("qimen.html", "qimen", renderChart(qimenFp), true) });
    await new Promise((r) => setTimeout(r, 400));
    await p.shot(`${outDir}/v23-qimen-mobile.png`, true);
    await p.close();
  }
  {
    const p = await br.page({ w: 390, h: 844, mobile: true });
    const tree = await p.send("Page.getFrameTree");
    await p.send("Page.setDocumentContent", { frameId: tree.frameTree.frame.id, html: buildMobileHtml("bazi.html", "bazi", renderChart(baziFp), false) });
    await new Promise((r) => setTimeout(r, 400));
    await p.shot(`${outDir}/v23-bazi-expanded-mobile.png`, true);
    await p.close();
  }
});
