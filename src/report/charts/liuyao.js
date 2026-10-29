/**
 * 六爻卦象 —— 热卜（移动端）版式 · 36神煞全表 + 世应发动同显精修版 v2.10
 *
 * 结构（自上而下）：
 *  ① 占断信息表  事项/日期/卦式/节气/干支四柱（天干墨黑，仅月支、日支标红）/空亡
 *  ② 神煞区      热卜式严格 4 列对齐网格（36 项全套神煞：含香闺、床帐、世身、胎爻、天马、生气、死气、游都、飞符等）+ 左侧「收起/展开」开关（不挤占第4列宽度）
 *  ③ 卦象区      智能区分【静卦】与【动变之卦】：
 *               - 静卦（无动爻且本变同卦）：对标热卜，居中仅展示单一本卦（五列：六兽｜六亲｜纳甲｜爻画｜世应），绝不重复渲染两个相同卦！
 *               - 动变卦（有动爻或指定变卦）：热卜式八列左右并排（本卦 + 变卦），世爻/应爻发动时同时显示「世/应」与「0→/X→」，绝不吞掉世应标记！
 */

import { esc, list } from './shared.js';
import { jdnToYmd } from '../../core/julian.js';
import { guaciOf } from '../../core/guaci.js';

/** 六神单字 */
const SHEN_CHAR = { 青龙: '龙', 朱雀: '雀', 勾陈: '勾', 螣蛇: '蛇', 白虎: '虎', 玄武: '玄' };

const METHOD_NAME = {
  time: '时间起卦', number: '两数起卦', number2: '三数起卦',
  coin: '摇卦（铜钱）', manual: '手动指定', name: '卦名起卦', auto: '自动起卦',
};

const CSS = `
.ly3{--ink:#241f18;--sub:#8b8172;--gold:#b0812b;--line:#e7ddc9;--red:#c8281d;
  --ly8:26px 46px minmax(80px,1.2fr) minmax(76px,1.45fr) 56px minmax(76px,1.45fr) minmax(66px,1fr) 44px;
  --ly5:28px 50px 86px 104px 36px;
  max-width:860px;margin:0 auto;color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:13px}
.ly3 *{box-sizing:border-box}
.ly3 .sheet{background:linear-gradient(180deg,#fffdf8,#fbf7ee);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 10px 26px -18px rgba(80,60,30,.4)}
/* —— 信息表 —— */
.ly3 .iro{display:grid;grid-template-columns:64px 1fr;border-bottom:1px solid #efe8d8}
.ly3 .iro:last-of-type{border-bottom:0}
.ly3 .ik{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px 4px;font-size:13px;color:var(--gold);background:#fbf6ea;border-right:1px solid #efe8d8;letter-spacing:2px}
.ly3 .iv{padding:8px 10px;font-size:13px;display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0}
.ly3 .iv.center{justify-content:center}
.ly3 .gz4{display:grid;grid-template-columns:repeat(4,1fr);width:100%;gap:0}
.ly3 .gz4>span{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 0;border-right:1px solid #f0e8d6}
.ly3 .gz4>span:last-child{border-right:0}
.ly3 .gz4 b{font-family:"Noto Serif SC",serif;font-size:20px;line-height:1.22;text-align:center;letter-spacing:1px;font-weight:800;color:#241f18}
.ly3 .gz4 b.gz-key{color:#c8281d}
.ly3 .gz4 span>span{display:block;text-align:center;font-size:11px;color:var(--sub);margin-top:2px}
.ly3 .xk4{display:grid;grid-template-columns:repeat(4,1fr);width:100%;gap:0}
.ly3 .xk4 span{text-align:center;font-size:12.5px;color:#8a7e68;letter-spacing:2px;border-right:1px solid #f0e8d6}
.ly3 .xk4 span:last-child{border-right:0}
.ly3 .q{font-weight:600;color:#4a4032}
/* —— 神煞（热卜式 4 列严整网格 + 左侧收起/展开按钮，第4列不再被挤压截断） —— */
.ly3 .ss-wrap{width:100%}
.ly3 .ss-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 6px;width:100%;align-items:center}
.ly3 .iro.is-folded .ss-grid .ss-item:nth-child(n+5){display:none}
.ly3 .ss-item{font-size:13px;color:#241f18;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.5}
.ly3 .ss-item b{color:#241f18;font-weight:500}
.ly3 .ss-item.in b{color:#241f18}
.ly3 .ss-toggle{border:1px solid #c8dfd8;border-radius:4px;background:#f0f7f5;color:#1f7a68;font-size:11px;font-weight:600;cursor:pointer;padding:1px 5px;letter-spacing:0;line-height:1.4}
.ly3 .ss-toggle:hover{background:#e2f0ec}
/* —— 卦象区 —— */
.ly3 .wrap{display:flex;flex-direction:column;padding:12px 8px}
.ly3 .lrows{display:flex;flex-direction:column;gap:2px}
/* 双卦表头 */
.ly3 .ghd{display:grid;grid-template-columns:var(--ly8);align-items:end;height:34px;
  padding-bottom:6px;margin-bottom:4px;border-bottom:1px solid var(--line)}
.ly3 .ghd .gt{font-family:"Noto Serif SC",serif;font-size:17.5px;font-weight:700;letter-spacing:1px;
  color:#241f18;text-align:center;white-space:nowrap;overflow:hidden}
.ly3 .ghd .gt i{font-style:normal;font-family:inherit;font-size:12px;font-weight:600;letter-spacing:0;color:#1f7a68;margin-left:3px}
.ly3 .ghd .gt.b{grid-column:1/5}
.ly3 .ghd .gt.y{grid-column:5/9}
/* 静卦（单卦居中表头与五列居中行，对标热卜） */
.ly3 .ghd.single{display:flex;justify-content:center;align-items:center;height:36px}
.ly3 .ghd.single .gt.single{font-size:18.5px}
.ly3 .lrows.single{max-width:350px;width:100%;margin:0 auto}
.ly3 .lrow{display:grid;grid-template-columns:var(--ly8);align-items:center;height:46px;min-width:0;border-radius:6px}
.ly3 .lrow.single{grid-template-columns:var(--ly5);justify-content:center}
.ly3 .lrow.shi{background:#fdf6e8}
.ly3 .lrow.ying{background:#f2f4f8}
.ly3 .lrow.dong{background:#fdf0ec}
/* 六兽：朱红单字 */
.ly3 .ls{font-size:14px;font-weight:700;text-align:center;color:#b83222}
/* 六亲：墨色 */
.ly3 .lq{font-size:13.5px;font-weight:600;text-align:center;color:#241f18;white-space:nowrap;min-width:0}
.ly3 .lq i{font-style:normal;font-size:9px;font-weight:600;margin-left:1px;padding:0 2px;border-radius:3px;line-height:1.35;vertical-align:1px}
.ly3 .lq i.kk{background:#eee7d8;color:#8b8172}
.ly3 .lq i.po{background:#f6ded9;color:#b3604f}
.ly3 .lq i.bd{background:#ece4f1;color:#7a5ba0}
/* 纳甲：天干+地支固定居中锚点，伏神贴于正下方不挤歪干支 */
.ly3 .lzc{position:relative;display:flex;align-items:center;justify-content:center;height:100%;min-width:0}
.ly3 .lzc-core{display:inline-flex;align-items:baseline;justify-content:center;gap:2px}
.ly3 .lgan{font-size:11px;color:#7a6f5d;line-height:1;flex:0 0 auto}
.ly3 .lz{font-family:"Noto Serif SC",serif;font-size:15.5px;font-weight:700;color:#241f18;line-height:1;white-space:nowrap;flex:0 0 auto}
.ly3 .lfu-badge{position:absolute;left:50%;bottom:1px;transform:translateX(-50%);font-style:normal;display:inline-block;font-size:9px;font-weight:600;line-height:1.1;color:#b83222;background:#fcedea;border:1px solid #f0c9c2;padding:0.5px 4px;border-radius:3px;pointer-events:auto;white-space:nowrap;cursor:help}
.ly3 .lrow:has(.lfu-badge) .lzc-core{transform:translateY(-6px)}
.ly3 .lfu-badge em{font-style:normal;font-weight:700;margin-left:1px}
.ly3 .ltack{display:flex;align-items:center;justify-content:center;min-width:0}
/* 爻画与纳甲干支：统一采用沉稳墨黑（#241f18），仅中间动爻符号 0→ / X→ 标红 */
.ly3 .yao{width:88px;height:10px;border-radius:2px;background:#241f18;flex:0 0 auto}
.ly3 .yao.yin{background:transparent;display:flex;justify-content:space-between}
.ly3 .yao.yin::before,.ly3 .yao.yin::after{content:"";width:42%;height:10px;border-radius:2px;background:#241f18}
/* 中缝 / 世应列（世爻或应爻发动时，世/应标签与 0→/X→ 并列同显） */
.ly3 .lmc{display:flex;align-items:center;justify-content:center;gap:2px;min-width:0;white-space:nowrap}
.ly3 .lmk{font-style:normal;font-size:12px;font-weight:800;line-height:1;color:#c8281d;white-space:nowrap}
.ly3 .ltag{font-style:normal;font-size:11px;font-weight:700;line-height:1.35;padding:0 3.5px;border-radius:3px;white-space:nowrap;
  color:#241f18;background:#f3ead6;border:1px solid #dfd1b4}
.ly3 .ltag.shi{color:#8c2318;background:#fdeae6;border-color:#efb9b0}
/* —— 底部注记 —— */
.ly3 .props{margin:0 12px 12px;padding:9px 12px;background:#fffdf8;border:1px solid var(--line);border-radius:11px}
.ly3 .prow{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;color:#6d6353;line-height:1.8}
.ly3 .prow .k{color:#a2977f}
.ly3 .prow b{color:#3b332a;font-weight:600}
@media (max-width:640px){
  .ly3{--ly8:22px 38px minmax(0,1fr) minmax(0,1.1fr) 48px minmax(0,1.1fr) minmax(0,1fr) 36px;
       --ly5:26px 46px 82px 96px 34px}
  .ly3 .wrap{padding:10px 4px}
  .ly3 .ghd .gt{font-size:16px}
  .ly3 .lrow{gap:2px;height:44px}
  .ly3 .ls{font-size:13.5px}
  .ly3 .lq{font-size:12px}
  .ly3 .lz{font-size:14.5px}
  .ly3 .yao{width:100%;max-width:60px;height:9px}
  .ly3 .lrow.single .yao{max-width:86px;height:10px}
  .ly3 .yao.yin::before,.ly3 .yao.yin::after{height:9px}
  .ly3 .lrow.single .yao.yin::before,.ly3 .lrow.single .yao.yin::after{height:10px}
  .ly3 .gz4 b{font-size:19px}
  .ly3 .iv{padding:7px 8px}
  .ly3 .ss-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:5px 4px}
  .ly3 .ss-item{font-size:12px}
  .ly3 .ltag{font-size:10px;padding:0 2.5px}
  .ly3 .lmk{font-size:11px}
}
@media (max-width:420px){
  .ly3{--ly8:20px 34px minmax(0,1fr) minmax(0,1fr) 44px minmax(0,1fr) minmax(0,1fr) 34px;
       --ly5:24px 42px 76px 88px 32px}
  .ly3 .iro{grid-template-columns:48px 1fr}.ly3 .ik{letter-spacing:1px;padding:6px 2px;font-size:12px}
  .ly3 .iv{padding:6px 6px}
  .ly3 .ss-item{font-size:11.5px}
}
/* —— 卦辞解释 —— */
.ly3 .gc{margin:0 12px 12px;background:#fffdf8;border:1px solid var(--line);border-radius:11px;overflow:hidden}
.ly3 .gc input{display:none}
.ly3 .gc-tabs{order:-1;display:flex;border-bottom:1px solid var(--line)}
.ly3 .gc-tabs label{flex:1;text-align:center;padding:8px 0;font-size:13px;color:var(--sub);cursor:pointer;letter-spacing:1px}
.ly3 .gc-tabs label b{font-family:"Noto Serif SC",serif;font-size:14px}
.ly3 #gcBen:checked~.gc-tabs label[for=gcBen],
.ly3 #gcBian:checked~.gc-tabs label[for=gcBian]{background:#2a7e6e;color:#fff;font-weight:700}
.ly3 .gc-pane{display:none;padding:11px 14px;font-size:13px;line-height:1.85;color:#4a4438}
.ly3 #gcBen:checked~.gc-pane.ben,.ly3 #gcBian:checked~.gc-pane.bian{display:block}
.ly3 .gc-pane h4{margin:0 0 3px;font-size:11.5px;color:var(--gold);letter-spacing:1.5px}
.ly3 .gc-pane .gct{font-family:"Noto Serif SC",serif;font-size:14px;color:#2c2418}
.ly3 .gc-pane .gcx{color:#6d6353}
.ly3 .gc-pane .gcd{color:#8a5a28;font-weight:600}
`;

const fmtJd = (jd) => {
  if (!Number.isFinite(jd)) return '';
  const ymd = jdnToYmd(Math.floor(jd + 0.5));
  const frac = (jd + 0.5) - Math.floor(jd + 0.5);
  const h = Math.floor(frac * 24);
  const m = Math.floor((frac * 24 - h) * 60);
  return `${ymd.year}.${String(ymd.month).padStart(2, '0')}.${String(ymd.day).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * 热卜标准 36 项六爻神煞排列序（严格 4 列 × 9 行对齐：包含香闺、世身、胎爻、床帐、天马、生气、死气、游都、飞符、血支、死神等）
 */
const SHENSHA_ORDER = [
  '卦身', '驿马', '桃花', '日禄',
  '月德', '灾煞', '劫煞', '贵人',
  '天医', '文昌', '将星', '华盖',
  '香闺', '世身', '胎爻', '床帐',
  '羊刃', '天马', '生气', '死气',
  '亡神', '病符', '丧门', '吊客',
  '破碎', '游都', '飞符', '血支',
  '孤辰', '寡宿', '官符', '死神',
  '天德', '谋星', '红鸾', '天喜',
];

function buildCleanShenshaList(f) {
  const map = new Map();
  if (f.guaShen?.zhi) {
    map.set('卦身', { name: '卦身', val: f.guaShen.zhi, inGua: true, tip: f.guaShen.source || '卦身' });
  }
  const raw = list(f.shensha);
  const guirenZhis = [];

  const SHORT_NAME = {
    天乙贵人: '贵人',
    禄神: '日禄',
  };

  for (const s of raw) {
    if (!s || !s.name) continue;
    if (s.name.includes('（年）') || s.name.includes('(年)')) continue;
    const target = s.zhi || s.gan || '';
    if (!target) continue;
    if (s.name === '天乙贵人') {
      if (!guirenZhis.includes(target)) guirenZhis.push(target);
      continue;
    }
    const cleanName = SHORT_NAME[s.name] || s.name;
    if (map.has(cleanName)) continue;
    map.set(cleanName, {
      name: cleanName,
      val: target,
      inGua: s.lineIndex !== null && s.lineIndex !== undefined,
      tip: `${s.name}：${s.source || ''}`,
    });
  }

  if (guirenZhis.length) {
    map.set('贵人', {
      name: '贵人',
      val: guirenZhis.join(''),
      inGua: false,
      tip: '天乙贵人：甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，六辛逢马虎',
    });
  }

  const out = [];
  for (const key of SHENSHA_ORDER) {
    if (map.has(key)) {
      out.push(map.get(key));
      map.delete(key);
    }
  }
  for (const item of map.values()) out.push(item);
  return out;
}

export function renderLiuyao(f) {
  const ben = f.benGua || {};
  const bian = f.bianGua || {};
  const siZhu = f.siZhu || {};
  const guaShen = f.guaShen || {};
  const guaShenZhi = guaShen.zhi || '';

  // 判定是否为【静卦】（无动爻，且变卦与本卦相同）
  const isStaticGua = list(f.dongYao).length === 0 && (!bian.name || bian.name === ben.name);

  // —— ① 信息表 ——
  const dayNumber = Math.floor((f.time?.jdSolar ?? 0) + 0.5);
  const solarYmd = dayNumber ? jdnToYmd(dayNumber) : null;
  const dateStr = solarYmd
    ? `${solarYmd.year}年${solarYmd.month}月${solarYmd.day}日${f.lunar ? `（${f.lunar.monthName}${f.lunar.dayName}）` : ''}`
    : (f.lunar ? `农历${f.lunar.monthName}${f.lunar.dayName}` : '—');
  const jieRange = f.yueJian?.jieName
    ? `${f.yueJian.jieName}${fmtJd(f.yueJian.jieJd)} ~ ${f.yueJian.nextName || ''}${fmtJd(f.yueJian.nextJd)}`
    : '—';

  // 四柱干支：天干全部墨黑，唯独【月支（月建）】【日支（日辰）】标红
  const gzCell = (k, label) => {
    const p = siZhu[k];
    if (!p) return `<span><b>—</b></span>`;
    const isKeyZhi = k === 'month' || k === 'day';
    return `<span><b>${esc(p.name[0])}</b><b${isKeyZhi ? ' class="gz-key"' : ''}>${esc(p.zhi)}</b><span>${label}</span></span>`;
  };
  const xkCell = (k) => `<span>${esc(siZhu[k]?.xunkong?.join('') || '—')}</span>`;

  const infoRows = [
    ['事项', `<span class="q">${esc(f.question || '（未填写所问事项）')}</span>`],
    ['日期', esc(dateStr)],
    ['卦式', `【${esc(METHOD_NAME[f.method] || f.method || '—')}】`],
    ['节气', esc(jieRange)],
    ['干支', `<div class="gz4">${gzCell('year', '年柱')}${gzCell('month', '月柱')}${gzCell('day', '日柱')}${gzCell('hour', '时柱')}</div>`],
    ['空亡', `<div class="xk4">${xkCell('year')}${xkCell('month')}${xkCell('day')}${xkCell('hour')}</div>`],
  ].map(([k, v]) => `<div class="iro"><div class="ik">${k}</div><div class="iv">${v}</div></div>`).join('');

  // —— ② 神煞区（严格 4 列网格 + 左侧栏收起/展开按钮，不挤占第 4 列） ——
  const cleanSs = buildCleanShenshaList(f);
  const ssCells = cleanSs.map((s) =>
    `<span class="ss-item${s.inGua ? ' in' : ''}" title="${esc(s.tip)}"><b>${esc(s.name)}</b>--${esc(s.val)}</span>`
  ).join('');

  const shenshaBlock = ssCells
    ? `<div class="iro"><div class="ik"><span>神煞</span><button type="button" class="ss-toggle" onclick="var r=this.closest('.iro');r.classList.toggle('is-folded');this.textContent=r.classList.contains('is-folded')?'展开':'收起'">收起</button></div><div class="iv"><div class="ss-wrap"><div class="ss-grid">${ssCells}</div></div></div></div>`
    : '';

  // —— ③ 卦象区（静卦单卦居中 vs 动卦双卦并排） ——
  const genTag = (g) => (g && g !== '本宫' ? `·${esc(g)}` : '');
  const benRaw = list(f.lines);
  const benLines = benRaw.slice().reverse();
  const bianRaw = list(f.bianLines).length ? list(f.bianLines) : benRaw;
  const bianLines = bianRaw.slice().reverse();

  let guaHead = '';
  let guaBlock = '';

  if (isStaticGua) {
    guaHead = `<div class="ghd single">
      <div class="gt single">${esc(ben.name)}<i>(${esc(ben.gong || '')}${genTag(ben.generation)})</i></div>
    </div>`;
    const singleRows = benLines.map((l) => {
      const y = !!l.yang;
      const cls = ['lrow single', l.isShi ? 'shi' : '', l.isYing ? 'ying' : ''].filter(Boolean).join(' ');
      const fuBadge = (l.fuShow && l.fuZhi)
        ? `<i class="lfu-badge" title="伏神：${esc(l.fuLiuqin)}${esc(l.fuGan || '')}${esc(l.fuZhi)}">伏神: ${esc(l.fuLiuqin)}<em>${esc(l.fuZhi)}</em></i>`
        : '';
      const marks = [
        (guaShenZhi && l.zhi === guaShenZhi) ? '身' : '',
        l.yuePo ? '破' : '',
        l.xunkong ? '空' : '',
      ].filter(Boolean);
      const mark = marks.map((m) => `<i class="ymk ${{ 身: 'bd', 破: 'po', 空: 'kk' }[m]}">${m}</i>`).join('');
      const shiYingTag = l.isShi ? '<i class="ltag shi">世</i>' : (l.isYing ? '<i class="ltag">应</i>' : '');
      return `<div class="${cls}">
        <div class="ls">${esc(SHEN_CHAR[l.liushen] || '—')}</div>
        <div class="lq">${esc(l.liuqin)}${mark}</div>
        <div class="lzc">
          <span class="lzc-core"><span class="lz">${esc(l.zhi)}${esc(l.zhiElement || '')}</span><span class="lgan">${esc(l.gan || '')}</span></span>${fuBadge}
        </div>
        <div class="ltack"><span class="yao ${y ? 'yang' : 'yin'}"></span></div>
        <div class="lmc">${shiYingTag}</div>
      </div>`;
    }).join('');
    guaBlock = `<div class="lrows single">${singleRows}</div>`;
  } else {
    guaHead = `<div class="ghd">
      <div class="gt b">${esc(ben.name)}<i>(${esc(ben.gong || '')}${genTag(ben.generation)})</i></div>
      <div class="gt y">${esc(bian.name)}${esc(bian.gong || '') ? `<i>(${esc(bian.gong || '')}${genTag(bian.generation)})</i>` : ''}</div>
    </div>`;
    const dualRows = benLines.map((l, i) => {
      const y = !!l.yang;
      const cls = ['lrow', l.isShi ? 'shi' : '', l.isYing ? 'ying' : '', l.isDong ? 'dong' : ''].filter(Boolean).join(' ');
      const fuBadge = (l.fuShow && l.fuZhi)
        ? `<i class="lfu-badge" title="伏神：${esc(l.fuLiuqin)}${esc(l.fuGan || '')}${esc(l.fuZhi)}">伏${esc(l.fuLiuqin)}<em>${esc(l.fuZhi)}</em></i>`
        : '';
      const marks = [
        (guaShenZhi && l.zhi === guaShenZhi) ? '身' : '',
        l.yuePo ? '破' : '',
        l.xunkong ? '空' : '',
      ].filter(Boolean);
      const mark = marks.map((m) => `<i class="ymk ${{ 身: 'bd', 破: 'po', 空: 'kk' }[m]}">${m}</i>`).join('');
      // 关键修复：当世爻或应爻同时为动爻（世爻发动 / 应爻发动）时，必须同时渲染「世/应」与「0→/X→」，不可因动爻吞掉世应标记！
      const shiYingTag = l.isShi ? '<i class="ltag shi">世</i>' : (l.isYing ? '<i class="ltag">应</i>' : '');
      const dongTag = l.isDong ? `<i class="lmk">${y ? '0' : 'X'}→</i>` : '';
      const mid = shiYingTag + dongTag;
      const b = bianLines[i] || {};
      return `<div class="${cls}">
        <div class="ls">${esc(SHEN_CHAR[l.liushen] || '—')}</div>
        <div class="lq">${esc(l.liuqin)}${mark}</div>
        <div class="lzc">
          <span class="lzc-core"><span class="lgan">${esc(l.gan || '')}</span><span class="lz">${esc(l.zhi)}</span></span>${fuBadge}
        </div>
        <div class="ltack"><span class="yao ${y ? 'yang' : 'yin'}"></span></div>
        <div class="lmc">${mid}</div>
        <div class="ltack"><span class="yao ${b.yang ? 'yang' : 'yin'}"></span></div>
        <div class="lzc">
          <span class="lzc-core"><span class="lgan">${esc(b.gan || '')}</span><span class="lz">${esc(b.zhi || '—')}</span></span>
        </div>
        <div class="lq">${esc(b.liuqin || '')}</div>
      </div>`;
    }).join('');
    guaBlock = `<div class="lrows">${dualRows}</div>`;
  }

  // —— 卦辞解释 ——
  const gcPane = (name, cls, labId, checked) => {
    const gc = guaciOf(name) || { guaCi: '（暂无卦辞）', xiang: '', duan: '' };
    return `<input type="radio" name="gcTab" id="${labId}"${checked ? ' checked' : ''}>
      <div class="gc-pane ${cls}">
        <h4>卦辞</h4>
        <div class="gct">${esc(name)}：${esc(gc.guaCi)}</div>
        <h4 style="margin-top:6px">象曰</h4>
        <div class="gcx">${esc(gc.xiang)}</div>
        <h4 style="margin-top:6px">断语</h4>
        <div class="gcd">${esc(gc.duan)}</div>
      </div>`;
  };
  const guaciBlock = isStaticGua
    ? `<div class="gc">${gcPane(ben.name, 'ben', 'gcBen', true)}</div>`
    : `<div class="gc">
        ${gcPane(ben.name, 'ben', 'gcBen', true)}
        ${gcPane(bian.name, 'bian', 'gcBian', false)}
        <div class="gc-tabs">
          <label for="gcBen"><b>本卦：${esc(ben.name)}</b></label>
          <label for="gcBian"><b>变卦：${esc(bian.name)}</b></label>
        </div>
      </div>`;

  const benLinesAll = list(f.lines);
  const dongNames = list(f.dongYao).map((d) => {
    const bl = benLinesAll[d.index];
    return `${d.position}（${bl && bl.yang ? '老阳 0' : '老阴 X'}）`;
  }).join('、') || '六爻安静（静卦）';
  const fuList = benLinesAll.filter((l) => l.fuShow && l.fuZhi);
  const fuText = fuList.length
    ? fuList.map((l) => `${esc(l.fuLiuqin)}·伏${esc(l.fuGan || '')}${esc(l.fuZhi)}于${esc(l.position)}`).join('　')
    : '六亲俱全（不伏）';
  const prop = (k, v) => `<span><span class="k">${esc(k)}</span> <b>${v}</b></span>`;

  return `<style class="ly3-style">${CSS}</style><div class="ly3">
    <div class="sheet">
      ${infoRows}
      ${shenshaBlock}
      <div class="wrap">
        ${guaHead}
        ${guaBlock}
      </div>
      ${guaciBlock}
      <div class="props">
        <div class="prow">
          ${prop('月建', `${esc(f.yueJian.zhi)}月（${esc(f.yueJian.element)}）`)}
          ${prop('日辰', esc(f.riJian.ganzhi))}
          ${prop('卦宫', `${esc(ben.gong)}宫${esc(ben.gongElement)}`)}
          ${prop('世应', `世${esc(f.shiYing.shiPosition)} ／ 应${esc(f.shiYing.yingPosition)}`)}
          ${prop('动爻', esc(dongNames))}
          ${prop('伏神', fuText)}
          ${prop('卦身', esc(guaShenZhi || '—'))}
          ${prop('取用神', esc(f.yongshen))}
        </div>
      </div>
    </div>
  </div>`;
}
