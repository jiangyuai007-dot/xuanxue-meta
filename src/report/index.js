/**
 * 报告渲染：命盘可视化 + HTML 报告 + 国风宣纸分享卡 SVG
 * 只读事实包，不产生任何新的命理判断
 */

import { PALACE_NAME, PALACE_DIR } from '../engines/qimen.js';
import { renderBazi, renderLiuyao, renderQimen, renderZiwei, renderHePanChart } from './charts/index.js';
import { DISCLAIMER, DISCLAIMER_ENABLED } from '../compliance/gateway.js';

const CSS = `
:root{--bg:#f7f6f3;--card:#fff;--line:#e6e3dd;--ink:#2c2c2a;--sub:#6b6a66;--accent:#8a6f4b;--accent-bg:#f3ede3}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",-apple-system,sans-serif;line-height:1.75;font-size:15px}
.wrap{max-width:860px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:24px;margin:0 0 4px;font-weight:600}
h2{font-size:17px;margin:28px 0 12px;padding-left:10px;border-left:3px solid var(--accent);font-weight:600}
.meta{color:var(--sub);font-size:13px;margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:16px}
.pillars{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;text-align:center}
.pillar{background:var(--accent-bg);border-radius:10px;padding:14px 6px}
.pillar .label{font-size:12px;color:var(--sub);margin-bottom:6px}
.pillar .gz{font-size:22px;font-weight:600;letter-spacing:2px}
.pillar .ss{font-size:12px;color:var(--accent);margin-top:6px}
.pillar .na{font-size:11px;color:var(--sub);margin-top:2px}
.pillar .cg{font-size:11px;color:var(--sub);margin-top:6px;line-height:1.5}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left}
th{background:var(--accent-bg);font-weight:600}
.grid9{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.cell{border:1px solid var(--line);border-radius:8px;padding:10px;min-height:118px;background:var(--card);font-size:12px;line-height:1.6}
.cell .pn{font-weight:600;font-size:13px;margin-bottom:4px}
.cell .row{color:var(--sub)}
.cell .tag{display:inline-block;background:var(--accent-bg);color:var(--accent);border-radius:4px;padding:0 5px;margin-right:4px}
.cell.kw{opacity:.55}
.cell .kw-tag{color:#b3604f;font-weight:600}
.cell .mx-tag{color:#2f6f9f;font-weight:600}
.locked{background:#faf9f7;color:var(--sub);position:relative}
.badge{display:inline-block;font-size:11px;background:#e8e6e1;color:var(--sub);border-radius:4px;padding:1px 6px;margin-left:8px}
.disc{margin-top:28px;padding:14px 16px;background:#f0eee9;border-left:3px solid var(--accent);color:var(--sub);font-size:13px;border-radius:0 8px 8px 0}
.bars div{display:flex;align-items:center;gap:8px;margin:5px 0;font-size:13px}
.bar{height:10px;background:var(--accent);border-radius:5px}
.foot{margin-top:26px;color:var(--sub);font-size:12px;text-align:center}
`;

/** 命盘可视化：按体系分派到各自的盘式模块 */
export function renderChart(factPack) {
  const f = factPack.facts;
  if (!factPack || !f) return '';
  if (factPack.system === 'bazi') return renderBazi(factPack);
  if (factPack.system === 'liuyao') return renderLiuyao(f);
  if (factPack.system === 'qimen') return renderQimen(f);
  if (factPack.system === 'ziwei') return renderZiwei(f);
  if (factPack.system === 'hepan') return renderHePanChart(f);
  return '';
}

const SYSTEM_NAME = { bazi: '八字命盘', liuyao: '六爻卦象', qimen: '奇门遁甲', ziwei: '紫微斗数', hepan: '八字合盘' };

/** 完整 HTML 报告 */
export function renderReportHtml({ factPack, interpretation, title }) {
  const f = factPack.facts;
  const sysName = SYSTEM_NAME[factPack.system] || factPack.system;
  const bars = factPack.system === 'bazi'
    ? Object.entries(f.elementPercent).map(([k, v]) => `<div><span style="width:28px">${k}</span><span class="bar" style="width:${v * 2.6}px"></span><span>${v}%</span></div>`).join('')
    : '';

  const sections = interpretation.sections.map((s) => `
    <h2>${s.title}${s.preview ? '<span class="badge">需解锁</span>' : ''}</h2>
    <div class="card ${s.preview ? 'locked' : ''}">${escapeHtml(s.text).replace(/\n/g, '<br>')}</div>`).join('');

  const extra = factPack.system === 'bazi' ? `
    <h2>命盘要点</h2>
    <div class="card">
      <table>
        <tr><th>日主</th><td>${f.dayMaster.gan}（${f.dayMaster.element}）</td><th>格局</th><td>${f.pattern.name}</td></tr>
        <tr><th>强弱</th><td>${f.strength.level}（${f.strength.score}）</td><th>用神</th><td>喜 ${f.yongshen.favorable.join('、')}／忌 ${f.yongshen.unfavorable.join('、')}</td></tr>
        <tr><th>农历</th><td>${f.lunar.yearGanzhi}年 ${f.lunar.monthName}${f.lunar.dayName}</td><th>节气</th><td>${f.solarTerms ? f.solarTerms.current : '—'}</td></tr>
        <tr><th>神煞</th><td colspan="3">${f.shensha.map((s) => s.name + '@' + s.position).join('、') || '—'}</td></tr>
      </table>
      <div style="margin-top:12px">${bars}</div>
    </div>` : factPack.system === 'ziwei' ? `
    <h2>命盘要点</h2>
    <div class="card">
      <table>
        <tr><th>命宫</th><td>${f.mingGong.zhi}宫（${f.mingGong.ganzhi}）</td><th>身宫</th><td>${f.shenGong.zhi}宫</td></tr>
        <tr><th>五行局</th><td>${f.wuXingJu.name}</td><th>起运</th><td>${f.wuXingJu.number} 岁</td></tr>
        <tr><th>紫微</th><td>${f.ziweiZhi}宫</td><th>天府</th><td>${f.tianfuZhi}宫</td></tr>
        <tr><th>四化</th><td colspan="3">禄 ${f.fourHua.lu.star}　权 ${f.fourHua.quan.star}　科 ${f.fourHua.ke.star}　忌 ${f.fourHua.ji.star}</td></tr>
        <tr><th>农历</th><td colspan="3">${f.lunar.yearGanzhi}年 ${f.lunar.isLeap ? '闰' : ''}${f.lunar.month}月${f.lunar.day}日</td></tr>
      </table>
    </div>` : '';

  const disc = DISCLAIMER_ENABLED ? (interpretation.disclaimer || DISCLAIMER) : '';

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title || sysName + '分析报告')}</title><style>${CSS}</style></head><body>
<div class="wrap">
  <h1>${escapeHtml(title || sysName + '分析报告')}</h1>
  <div class="meta">体系：${sysName}　｜　生成时间：${new Date(factPack.generatedAt).toLocaleString('zh-CN')}　｜　事实包：${factPack.id}　｜　解读来源：${interpretation.source === 'llm' ? '大模型' : '本地规则引擎'}</div>
  <h2>排盘图</h2>
  <div class="card">${renderChart(factPack)}</div>
  ${extra}
  ${sections}
  ${disc ? `<div class="disc">${escapeHtml(disc)}</div>` : ''}
  <div class="foot">本报告由本地命理内容产品原型生成 · 仅供文化参考</div>
</div><script src="/bazi-drill.js"></script></body></html>`;
}

/** Phase 3 升级：国风宣纸烫金朱印 SVG 分享卡 */
export function renderShareCardSvg(factPack) {
  const f = factPack.facts;
  const sysName = SYSTEM_NAME[factPack.system] || factPack.system;
  let line1 = '';
  let line2 = '';
  let line3 = '';
  let line4 = '';
  if (factPack.system === 'bazi') {
    line1 = `${f.fourPillars.year.name}　${f.fourPillars.month.name}　${f.fourPillars.day.name}　${f.fourPillars.hour.name}`;
    line2 = `日主 ${f.dayMaster.gan}（${f.dayMaster.element}）　强弱：${f.strength.level}（${f.strength.score}分）`;
    line3 = `格局：${f.pattern.name}　喜用神：${f.yongshen.favorable.join('、')}`;
    line4 = `胎元 ${f.taiyuan?.name || '—'} · 命宫 ${f.mingGong?.name || '—'} · 身宫 ${f.shenGong?.name || '—'}`;
  } else if (factPack.system === 'liuyao') {
    line1 = `${f.benGua.name} → ${f.bianGua.name}`;
    line2 = `${f.benGua.gong}宫${f.benGua.gongElement}（${f.benGua.generation}卦）　世爻：${f.shiYing?.shiPosition || '—'}`;
    line3 = `用神：${f.yongshen}　月建 ${f.yueJian.zhi}（${f.yueJian.element}）　日辰 ${f.riJian.ganzhi}`;
    line4 = `卦身 ${f.guaShen?.zhi || '—'} · 旬空 ${(f.xunkong || []).join('、')}`;
  } else if (factPack.system === 'hepan') {
    const f0 = f.parties || [];
    line1 = `${f0[0]?.name || '甲方'}(${f0[0]?.dayGanzhi || ''}) × ${f0[1]?.name || '乙方'}(${f0[1]?.dayGanzhi || ''})`;
    line2 = `契合指数 ${f.score} 分 · ${f.grade}`;
    line3 = `相合 ${(f.he || []).length} 项 ／ 冲刑害破 ${(f.conflicts || []).length} 项`;
    line4 = f.headline || f.gradeDesc || '';
  } else if (factPack.system === 'ziwei') {
    line1 = `命宫 ${f.mingGong.zhi}（${f.mingGong.ganzhi}） · 身宫 ${f.shenGong.zhi} · ${f.wuXingJu.name}`;
    line2 = `紫微坐${f.ziweiZhi}宫 · 天府坐${f.tianfuZhi}宫 · 命主${f.mingZhu || '—'} / 身主${f.shenZhu || '—'}`;
    line3 = `生年四化：禄${f.fourHua.lu.star} · 权${f.fourHua.quan.star} · 科${f.fourHua.ke.star} · 忌${f.fourHua.ji.star}`;
    line4 = `四柱：${f.siZhu?.year || ''} ${f.siZhu?.month || ''} ${f.siZhu?.day || ''} ${f.siZhu?.hour || ''}`;
  } else {
    line1 = `${f.juName} · ${f.yuan}（${f.panMethod === 'fei' ? '飞盘' : '转盘'}）`;
    line2 = `值符 ${f.zhiFu.star}@${f.zhiFu.palaceName}宫 · 值使 ${f.zhiShi.door}@${f.zhiShi.palaceName}宫`;
    line3 = `吉方：${f.favorable.direction}方（${f.favorable.palaceName}宫 · ${f.favorable.door} · ${f.favorable.star}）`;
    line4 = (f.patterns || []).length ? `格局：${f.patterns.slice(0, 4).map((x) => x.name).join(' · ')}` : `节气：${f.solarTerm} · 旬首 ${f.xunShou}`;
  }
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="460" viewBox="0 0 720 460">
  <defs>
    <linearGradient id="xjPaper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fbf7ee"/>
      <stop offset="100%" stop-color="#f1ead8"/>
    </linearGradient>
    <linearGradient id="xjGold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#9a7720"/>
      <stop offset="50%" stop-color="#c9a961"/>
      <stop offset="100%" stop-color="#9a7720"/>
    </linearGradient>
  </defs>
  <rect width="720" height="460" rx="16" fill="url(#xjPaper)"/>
  <rect x="14" y="14" width="692" height="432" rx="12" fill="none" stroke="url(#xjGold)" stroke-width="2"/>
  <rect x="20" y="20" width="680" height="420" rx="9" fill="none" stroke="#dfd3ba" stroke-width="1" stroke-dasharray="4 3"/>
  <rect x="42" y="42" width="116" height="32" rx="6" fill="#241d14"/>
  <text x="100" y="63" text-anchor="middle" font-family="Noto Serif SC,Songti SC,serif" font-size="15" font-weight="700" fill="#e5c878" letter-spacing="2">${esc(sysName)}</text>
  <g transform="translate(618, 38)">
    <rect width="54" height="54" rx="6" fill="#b3392c"/>
    <rect x="3" y="3" width="48" height="48" rx="4" fill="none" stroke="#f6f1e6" stroke-width="1.2"/>
    <text x="27" y="24" text-anchor="middle" font-family="Noto Serif SC,serif" font-size="16" font-weight="700" fill="#f6f1e6">玄机</text>
    <text x="27" y="44" text-anchor="middle" font-family="Noto Serif SC,serif" font-size="16" font-weight="700" fill="#f6f1e6">正印</text>
  </g>
  <text x="42" y="138" font-family="Noto Serif SC,PingFang SC,serif" font-size="32" font-weight="700" fill="#2c2418">${esc(line1)}</text>
  <text x="42" y="192" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="18" font-weight="600" fill="#5b4930">${esc(line2)}</text>
  <text x="42" y="234" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="17" fill="#6b5640">${esc(line3)}</text>
  <text x="42" y="274" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="15" fill="#8b7d66">${esc(line4)}</text>
  <line x1="42" y1="312" x2="678" y2="312" stroke="#dfd3ba" stroke-width="1"/>
  <text x="42" y="346" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="13" fill="#8a7e6b">玄机 · 东方命理排盘与AI解读平台　｜　档案号：${esc(factPack.id)}</text>
  ${DISCLAIMER_ENABLED ? `<text x="42" y="378" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="11.5" fill="#9c9282">${esc(DISCLAIMER.slice(0, 42))}</text>
  <text x="42" y="398" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="11.5" fill="#9c9282">${esc(DISCLAIMER.slice(42))}</text>` : `<text x="42" y="382" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="12" fill="#9c9282">本命盘由确定性天文历算内核排定 · 仅供传统文化研习参考</text>`}
</svg>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export { SYSTEM_NAME };
