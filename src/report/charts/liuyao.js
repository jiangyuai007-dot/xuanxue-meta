/**
 * 六爻卦象 —— 热卜（移动端）版式
 *
 * 结构（自上而下）：
 *  ① 占断信息表  事项/日期/卦式/节气/干支四柱/空亡
 *  ② 神煞区      以日辰/月建/年君为锚的全部神煞（落卦者标注爻位）
 *  ③ 卦象区      热卜式八列，本卦与变卦同一行左右并排（两卦共用一套列定义，天然对齐）：
 *               左四列（本卦）六兽｜六亲｜纳甲（天干小字 + 地支大字，同一水平行）｜爻画
 *               中缝（动爻 0→ / X→；静爻位标 世 / 应）
 *               右四列（变卦）爻画｜纳甲｜六亲
 *
 * 爻画：阳爻实线，阴爻断开，本卦在左、变卦在右；六兽统一朱红，其余（六亲/纳甲/爻画/角标）统一墨色。
 * 角标：世 / 应 为金底小方块；身 / 破 / 空 为六亲右侧的小方块（灰 / 红 / 紫）；地支后不挂五行。
 * 铁律：只呈现事实包已有数据，不产生新的命理判断。
 */

import { esc, list, WX_COLOR } from './shared.js';
import { jdnToYmd } from '../../core/julian.js';
import { guaciOf } from '../../core/guaci.js';

/** 六神单字（统一墨色，不再按六神分六色） */
const SHEN_CHAR = { 青龙: '龙', 朱雀: '朱', 勾陈: '勾', 螣蛇: '蛇', 白虎: '虎', 玄武: '玄' };
/** 六亲统一墨色：一行之内六亲/六兽/爻画只靠字重与位置区分，不靠颜色 */

const METHOD_NAME = {
  time: '时间起卦', number: '数字起卦', number2: '数字起卦（三数）',
  coin: '摇卦（铜钱）', manual: '手动指定', name: '卦名起卦', auto: '自动起卦',
};

const CSS = `
.ly3{--ink:#2f2a22;--sub:#8b8172;--gold:#b0812b;--line:#e7ddc9;--red:#b3392c;
  /* 卦象行八列：本卦(六兽·六亲·纳甲·爻画) | 中缝 | 变卦(爻画·纳甲·六亲)，本/变共用一套列定义故天然对齐 */
  --ly8:26px 42px minmax(62px,1fr) minmax(84px,1.7fr) 58px minmax(84px,1.7fr) minmax(62px,1fr) 42px;
  max-width:860px;margin:0 auto;color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:13px}
.ly3 *{box-sizing:border-box}
.ly3 .sheet{background:linear-gradient(180deg,#fffdf8,#fbf7ee);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 10px 26px -18px rgba(80,60,30,.4)}
/* —— 信息表 —— */
.ly3 .iro{display:grid;grid-template-columns:74px 1fr;border-bottom:1px solid #efe8d8}
.ly3 .iro:last-of-type{border-bottom:0}
.ly3 .ik{display:flex;align-items:center;justify-content:center;padding:9px 4px;font-size:13px;color:var(--gold);background:#fbf6ea;border-right:1px solid #efe8d8;letter-spacing:2px}
.ly3 .iv{padding:9px 12px;font-size:13px;display:flex;align-items:center;flex-wrap:wrap;gap:6px}
.ly3 .iv.center{justify-content:center}
.ly3 .gz4{display:grid;grid-template-columns:repeat(4,1fr);width:100%;gap:4px}
.ly3 .gz4 span{display:flex;flex-direction:column;align-items:center;gap:0}
.ly3 .gz4 b{font-family:"Noto Serif SC",serif;font-size:21px;line-height:1.25;text-align:center;letter-spacing:1px;font-weight:800}
.ly3 .gz4 span>span{display:block;text-align:center;font-size:11px;color:var(--sub);margin-top:2px}
.ly3 .xk4{display:grid;grid-template-columns:repeat(4,1fr);width:100%;gap:4px}
.ly3 .xk4 span{text-align:center;font-size:12.5px;color:#9b8f77;letter-spacing:2px}
.ly3 .q{font-weight:600;color:#4a4032}
/* —— 神煞 —— */
.ly3 .ss-grid{display:flex;flex-wrap:wrap;gap:4px 12px}
.ly3 .ss-item{font-size:12px;color:#6d6353;white-space:nowrap}
.ly3 .ss-item b{color:#4a4032;font-weight:600}
.ly3 .ss-item i{font-style:normal;color:#a89c85;font-size:11px;margin-left:1px}
.ly3 .ss-item.in{outline:none}
.ly3 .ss-item.in b{color:#b0812b}
.ly3 .ss-note{font-size:11px;color:#b3a98f;margin-top:2px}
/* —— 卦象：热卜式八列，本卦与变卦同一行左右并排、共用一条基线 —— */
.ly3 .wrap{display:flex;flex-direction:column;padding:10px 6px}
.ly3 .lrows{display:flex;flex-direction:column;gap:2px}
/* 表头：卦名各占一半、各自居中（对齐热卜「雷天大壮(坤) ｜ 雷火丰(炊)」） */
.ly3 .ghd{display:grid;grid-template-columns:var(--ly8);align-items:end;height:34px;
  padding-bottom:5px;margin-bottom:4px;border-bottom:1px solid var(--line)}
.ly3 .ghd .gt{font-family:"Noto Serif SC",serif;font-size:18px;font-weight:700;letter-spacing:1px;
  color:#2c2418;text-align:center;white-space:nowrap;overflow:hidden}
.ly3 .ghd .gt i{font-style:normal;font-family:inherit;font-size:11px;font-weight:400;letter-spacing:0;color:var(--sub);margin-left:3px}
.ly3 .ghd .gt.b{grid-column:1/5}
.ly3 .ghd .gt.y{grid-column:5/9}
/* 行：行高恒定 44px（height 非 min-height），任何内容不改行高 */
.ly3 .lrow{display:grid;grid-template-columns:var(--ly8);align-items:center;height:44px;min-width:0}
.ly3 .lrow.shi{background:#fdf6e8}
.ly3 .lrow.ying{background:#f2f4f8}
.ly3 .lrow.dong{background:#fdf0ec}
/* 六兽：朱红单字（整盘唯一保留红色的一列） */
.ly3 .ls{font-size:14px;font-weight:700;text-align:center;color:#b3392b}
/* 六亲：墨色；身 / 破 / 空 作六亲右侧极小角标，不另起列、不改行高 */
.ly3 .lq{font-size:13px;font-weight:600;text-align:center;color:#2b2721;white-space:nowrap;min-width:0}
.ly3 .lq i{font-style:normal;font-size:9px;font-weight:600;margin-left:1px;padding:0 2px;border-radius:3px;line-height:1.35;vertical-align:1px}
.ly3 .lq i.kk{background:#eee7d8;color:#8b8172}
.ly3 .lq i.po{background:#f6ded9;color:#b3604f}
.ly3 .lq i.bd{background:#ece4f1;color:#7a5ba0}
/* 纳甲：天干在前、地支在后，同一水平行；地支后不再挂「金木水火土」 */
.ly3 .lzc{display:inline-flex;flex-wrap:nowrap;align-items:baseline;justify-content:center;gap:2px;min-width:0}
.ly3 .lgan{font-size:9.5px;color:#9b8f77;line-height:1;flex:0 0 auto}
.ly3 .lz{font-family:"Noto Serif SC",serif;font-size:15.5px;font-weight:700;color:#2b2721;line-height:1;white-space:nowrap;flex:0 0 auto}
/* 伏神：金底小徽章，跟地支后内联，行高不受影响；底部 props 伏神行同步保留 */
.ly3 .lfu-badge{font-style:normal;display:inline-block;vertical-align:1px;margin-left:2px;font-size:9px;font-weight:700;line-height:1;color:#fff;background:linear-gradient(180deg,#c69c4e,#a87d22);padding:2px 4px;border-radius:4px;pointer-events:auto;white-space:nowrap;cursor:help;box-shadow:0 1px 2px rgba(120,90,30,.28);letter-spacing:.5px}
.ly3 .lfu-badge em{font-style:normal;font-weight:600;opacity:.95;margin-left:1px}
.ly3 .ltack{display:flex;align-items:center;justify-content:center;min-width:0}
/* 爻画：阳爻实线 / 阴爻断开，本卦在左、变卦在右 */
.ly3 .yao{width:88px;height:10px;border-radius:3px;background:#2b2721;flex:0 0 auto}
.ly3 .yao.yin{background:transparent;display:flex;justify-content:space-between}
.ly3 .yao.yin::before,.ly3 .yao.yin::after{content:"";width:41%;height:10px;border-radius:3px;background:#2b2721}
/* 中缝：动爻 0→ / X→（朱红），静爻位标 世 / 应（金底小方块，与角标同一套样式） */
.ly3 .lmc{display:flex;align-items:center;justify-content:center;gap:2px;min-width:0}
.ly3 .lmk{font-style:normal;font-size:11.5px;font-weight:700;line-height:1;color:#b3392c;white-space:nowrap}
.ly3 .ltag{font-style:normal;font-size:9.5px;line-height:1.5;padding:0 3px;border-radius:3px;white-space:nowrap;
  color:#8a6b16;background:#f7edd6;border:1px solid #e2d3ae}
.ly3 .ltag.kk{color:#8b8172;background:#eee7d8;border-color:#e2dcd0}
.ly3 .ltag.po{color:#b3604f;background:#f6ded9;border-color:#edd6d0}
.ly3 .ltag.bd{color:#7a5ba0;background:#ece4f1;border-color:#dcd2e6}
/* —— 底部注记 —— */
.ly3 .props{margin:0 12px 12px;padding:9px 12px;background:#fffdf8;border:1px solid var(--line);border-radius:11px}
.ly3 .prow{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;color:#6d6353;line-height:1.9}
.ly3 .prow .k{color:#a2977f}
.ly3 .prow b{color:#3b332a;font-weight:600}
.ly3 .legend{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;padding:0 12px 10px;font-size:11px;color:#a2977f}
.ly3 .legend em{font-style:normal;display:inline-flex;align-items:center;gap:5px}
.ly3 .legend i{width:24px;height:8px;border-radius:3px;background:#2b2721;display:inline-block}
.ly3 .legend i.yin{background:transparent;border-top:8px double #2b2721;height:6px}
/* 窄屏：八列整体按比例缩（flex 列用 minmax(0,·) 允许压到 0，避免 min-content 撑破视口），行高随断点降但逐行恒定 */
@media (max-width:640px){
  .ly3{--ly8:22px 40px minmax(0,1fr) minmax(0,1.15fr) 46px minmax(0,1.15fr) minmax(0,1fr) 40px}
  .ly3 .wrap{padding:8px 4px}
  .ly3 .lrows{gap:1px}
  .ly3 .ghd{height:30px;margin-bottom:3px;padding-bottom:3px}
  .ly3 .ghd .gt{font-size:16px}
  .ly3 .ghd .gt i{font-size:10.5px;margin-left:2px}
  .ly3 .lrow{gap:3px;height:38px}
  .ly3 .ls{font-size:13px}
  .ly3 .lq{font-size:11.5px}
  .ly3 .lq i{font-size:8.5px;padding:0 1px}
  .ly3 .lzc{gap:0}
  .ly3 .lgan{font-size:9px}
  .ly3 .lz{font-size:14px}
  .ly3 .lfu-badge{font-size:8.5px;padding:1px 3px}
  .ly3 .ltack{display:flex;justify-content:center}
  .ly3 .yao{width:100%;max-width:60px;height:9px}
  .ly3 .yao.yin::before,.ly3 .yao.yin::after{height:9px}
  .ly3 .lmk{font-size:12px}
  .ly3 .ltag{font-size:9px;padding:0 2px}
  .ly3 .gz4 b{font-size:19px}
}
@media (max-width:420px){
  .ly3{--ly8:20px 34px minmax(0,1fr) minmax(0,1fr) 38px minmax(0,1fr) minmax(0,1fr) 34px}
  .ly3 .ghd{height:28px}
  .ly3 .ghd .gt{font-size:15px}
  .ly3 .lrow{gap:2px;height:34px}
  .ly3 .ls{font-size:12px}
  .ly3 .lq{font-size:10.5px}
  .ly3 .lq i{display:none}
  .ly3 .lgan{font-size:8.5px}
  .ly3 .lz{font-size:13px}
  .ly3 .lfu-badge{font-size:8px;padding:1px 2px}
  .ly3 .lfu-badge em{display:none}
  .ly3 .yao{height:8px;max-width:52px}
  .ly3 .yao.yin::before,.ly3 .yao.yin::after{height:8px}
  .ly3 .lmk{font-size:11px}
  .ly3 .ltag{font-size:8.5px;padding:0 1px}
  .ly3 .iro{grid-template-columns:56px 1fr}.ly3 .ik{letter-spacing:1px;padding:9px 2px}
}
/* —— 卦辞解释（本卦/变卦 tab） —— */
.ly3 .gc{margin:0 12px 12px;background:#fffdf8;border:1px solid var(--line);border-radius:11px;overflow:hidden}
.ly3 .gc input{display:none}
.ly3 .gc-tabs{order:-1;display:flex;border-bottom:1px solid var(--line)}
.ly3 .gc-tabs label{flex:1;text-align:center;padding:9px 0;font-size:13.5px;color:var(--sub);cursor:pointer;letter-spacing:1px;transition:.15s}
.ly3 .gc-tabs label b{font-family:"Noto Serif SC",serif;font-size:14.5px}
.ly3 #gcBen:checked~.gc-tabs label[for=gcBen],
.ly3 #gcBian:checked~.gc-tabs label[for=gcBian]{background:#2a7e6e;color:#fff;font-weight:700}
.ly3 .gc-pane{display:none;padding:12px 15px;font-size:13px;line-height:2;color:#4a4438}
.ly3 #gcBen:checked~.gc-pane.ben,.ly3 #gcBian:checked~.gc-pane.bian{display:block}
.ly3 .gc-pane h4{margin:0 0 4px;font-size:12px;color:var(--gold);letter-spacing:2px}
.ly3 .gc-pane .gct{font-family:"Noto Serif SC",serif;font-size:14.5px;color:#2c2418;letter-spacing:.5px}
.ly3 .gc-pane .gcx{color:#6d6353}
.ly3 .gc-pane .gcd{color:#8a5a28;font-weight:600}
.ly3 .gc-note{padding:0 15px 10px;font-size:10.5px;color:#b3a98f}
`;

const fmtJd = (jd) => {
  if (!Number.isFinite(jd)) return '';
  const ymd = jdnToYmd(Math.floor(jd + 0.5));
  const frac = (jd + 0.5) - Math.floor(jd + 0.5);
  const h = Math.floor(frac * 24);
  const m = Math.floor((frac * 24 - h) * 60);
  return `${ymd.year}.${String(ymd.month).padStart(2, '0')}.${String(ymd.day).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export function renderLiuyao(f) {
  const ben = f.benGua || {};
  const bian = f.bianGua || {};
  const siZhu = f.siZhu || {};
  const guaShen = f.guaShen || {};

  // —— ① 信息表 ——
  const dayNumber = Math.floor((f.time?.jdSolar ?? 0) + 0.5);
  const solarYmd = dayNumber ? jdnToYmd(dayNumber) : null;
  const dateStr = solarYmd
    ? `${solarYmd.year}年${solarYmd.month}月${solarYmd.day}日${f.lunar ? `（农历${f.lunar.monthName}${f.lunar.dayName}）` : ''}`
    : (f.lunar ? `农历${f.lunar.monthName}${f.lunar.dayName}` : '—');
  const jieRange = f.yueJian?.jieName
    ? `${f.yueJian.jieName} ${fmtJd(f.yueJian.jieJd)} ~ ${f.yueJian.nextName || ''} ${fmtJd(f.yueJian.nextJd)}`
    : '—';
  const gzCell = (k, label) => {
    const p = siZhu[k];
    if (!p) return `<span><b>—</b></span>`;
    const col = (c) => WX_COLOR[{ 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' }[c]]
      || WX_COLOR[{ 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' }[c]] || '#3a352c';
    return `<span><b style="color:${col(p.gan)}">${esc(p.name[0])}</b><b style="color:${col(p.zhi)}">${esc(p.zhi)}</b><span>${label}</span></span>`;
  };
  const xkCell = (k) => `<span>${esc(siZhu[k]?.xunkong?.join('') || '—')}</span>`;

  const infoRows = [
    ['事项', `<span class="q">${esc(f.question || '（未填写所问事项）')}</span>`],
    ['日期', esc(dateStr)],
    ['卦式', esc(METHOD_NAME[f.method] || f.method || '—')],
    ['节气', esc(jieRange)],
    ['干支', `<div class="gz4">${gzCell('year', '年柱')}${gzCell('month', '月柱')}${gzCell('day', '日柱')}${gzCell('hour', '时柱')}</div>`],
    ['空亡', `<div class="xk4">${xkCell('year')}${xkCell('month')}${xkCell('day')}${xkCell('hour')}</div>`],
  ].map(([k, v]) => `<div class="iro"><div class="ik">${k}</div><div class="iv">${v}</div></div>`).join('');

  // —— ② 神煞区 ——
  const ssItems = list(f.shensha).map((s) => {
    const inGua = s.lineIndex !== null && s.lineIndex !== undefined;
    const target = s.zhi || s.gan || '—';
    return `<span class="ss-item${inGua ? ' in' : ''}" title="${esc(s.source || '')}（${esc(s.anchor || '')}起）">
      <b>${esc(s.name)}</b>--${esc(target)}${inGua ? `<i>${esc(list(f.lines)[s.lineIndex]?.position || '')}</i>` : ''}
    </span>`;
  }).join('');
  const shenshaBlock = ssItems
    ? `<div class="iro"><div class="ik">神煞</div><div class="iv" style="display:block"><div class="ss-grid">${ssItems}</div>
        <div class="ss-note">神煞以日辰、月建、年君为锚起出；金色者落于卦中（标注爻位），悬停可看起法口诀</div></div></div>`
    : '';

  // —— ③ 卦象区 ——
  const guaShenZhi = guaShen.zhi || '';

  const genTag = (g) => (g && g !== '本宫' ? `·${esc(g)}` : '');

  /** 一行 = 本卦四列（六兽·六亲·纳甲·爻画）｜中缝｜变卦四列（爻画·纳甲·六亲）
   *  地支后不再挂金木水火土；世/应/身/破/空 一律作小方块角标保留 */
  const guaRows = (benLines, bianLines) => benLines.map((l, i) => {
    const y = !!l.yang;
    const cls = ['lrow', l.isShi ? 'shi' : '', l.isYing ? 'ying' : '', l.isDong ? 'dong' : ''].filter(Boolean).join(' ');
    const rowTitle = l.isDong
      ? ' title="' + esc(l.position + ' · ' + (y ? '老阳（0）动而变阴' : '老阴（X）动而变阳')) + '"'
      : '';
    // 伏神：实心金底徽章「伏·六亲·支」随地支内联（行高固定不受影响）；悬停给完整文案，底部 props「伏神」行同步保留
    const fuBadge = (l.fuShow && l.fuZhi)
      ? '<i class="lfu-badge" title="伏神：' + esc(l.fuLiuqin) + esc(l.fuGan || '') + esc(l.fuZhi) + '，伏于' + esc(l.position) + '（本爻' + esc(l.liuqin) + esc(l.gan || '') + esc(l.zhi) + '）">伏' + esc(l.fuLiuqin) + '<em>' + esc(l.fuZhi) + '</em></i>'
      : '';
    // 身 / 破 / 空：六亲右侧极小方块角标，不另起列、不改行高（l 取自本卦行，故变卦六亲列不会重复标）
    const marks = [
      (guaShenZhi && l.zhi === guaShenZhi) ? '身' : '',
      l.yuePo ? '破' : '',
      l.xunkong ? '空' : '',
    ].filter(Boolean);
    const mark = marks.map((m) => `<i class="${{ 身: 'bd', 破: 'po', 空: 'kk' }[m]}">${m}</i>`).join('');
    const markTitle = marks.length
      ? ' title="六亲：' + esc(l.liuqin) + '（' + esc(l.position) + '）' + marks.map((m) => ({ 身: '卦身', 破: '月破', 空: '旬空' })[m]).join('、') + '"'
      : '';
    // 中缝：动爻 0→ / X→（朱红），静爻位标 世 / 应（金底小方块）
    const mid = l.isDong
      ? `<i class="lmk">${y ? '0' : 'X'}→</i>`
      : (l.isShi ? '<i class="ltag">世</i>' : (l.isYing ? '<i class="ltag">应</i>' : ''));
    const b = bianLines[i] || {};
    return `<div class="${cls}"${rowTitle}>
      <div class="ls">${esc(SHEN_CHAR[l.liushen] || '—')}</div>
      <div class="lq"${markTitle}>${esc(l.liuqin)}${mark}</div>
      <div class="lzc">
        <span class="lgan">${esc(l.gan || '')}</span>
        <span class="lz">${esc(l.zhi)}${fuBadge}</span>
      </div>
      <div class="ltack"><span class="yao ${y ? 'yang' : 'yin'}"></span></div>
      <div class="lmc">${mid}</div>
      <div class="ltack"><span class="yao ${b.yang ? 'yang' : 'yin'}"></span></div>
      <div class="lzc">
        <span class="lgan">${esc(b.gan || '')}</span>
        <span class="lz">${esc(b.zhi || '—')}</span>
      </div>
      <div class="lq">${esc(b.liuqin || '')}</div>
    </div>`;
  }).join('');

  // 两卦共用一套行序（自下而上：上爻→初爻），各自 reverse 后会首尾颠倒，故不要让 benLines 与 bianLines 复用同一数组
  const benRaw = list(f.lines);
  const benLines = benRaw.slice().reverse();
  const bianRaw = list(f.bianLines).length ? list(f.bianLines) : benRaw;
  const bianLines = bianRaw.slice().reverse();

  const guaHead = `<div class="ghd">
      <div class="gt b">${esc(ben.name)}<i>${esc(ben.gong || '')}宫${esc(ben.gongElement || '')}${genTag(ben.generation)}</i></div>
      <div class="gt y">${esc(bian.name)}${esc(bian.gong || '') ? `<i>${esc(bian.gong || '')}宫${esc(bian.gongElement || '')}</i>` : ''}</div>
    </div>`;
  const guaBlock = `<div class="lrows">${guaRows(benLines, bianLines)}</div>`;

  // —— 卦辞解释（本卦 / 变卦 tab） ——
  const gcPane = (name, cls, paneId, labId, checked) => {
    const gc = guaciOf(name) || { guaCi: '（暂无卦辞）', xiang: '', duan: '' };
    return `<input type="radio" name="gcTab" id="${labId}"${checked ? ' checked' : ''}>
      <div class="gc-pane ${cls}">
        <h4>卦辞</h4>
        <div class="gct">${esc(name)}：${esc(gc.guaCi)}</div>
        <h4 style="margin-top:8px">象曰</h4>
        <div class="gcx">${esc(gc.xiang)}</div>
        <h4 style="margin-top:8px">断语</h4>
        <div class="gcd">${esc(gc.duan)}</div>
      </div>`;
  };
  const guaciBlock = `<div class="gc">
    ${gcPane(ben.name, 'ben', 0, 'gcBen', true)}
    ${gcPane(bian.name, 'bian', 0, 'gcBian', false)}
    <div class="gc-tabs">
      <label for="gcBen"><b>本卦：${esc(ben.name)}</b></label>
      <label for="gcBian"><b>变卦：${esc(bian.name)}</b></label>
    </div>
    <div class="gc-note">卦辞、象曰引自《周易》；断语为通义概括，具体吉凶须结合所测之事与动爻定夺。</div>
  </div>`;

  // 动爻：以 老阳(0) / 老阴(X) 记于卦象中缝；伏神：只列所缺六亲及其伏藏爻位
  const benLinesAll = list(f.lines);
  const dongNames = list(f.dongYao).map((d) => {
    const bl = benLinesAll[d.index];
    return `${d.position}（${bl && bl.yang ? '老阳 0' : '老阴 X'}）`;
  }).join('、') || '无（静卦）';
  const fuList = benLinesAll.filter((l) => l.fuShow && l.fuZhi);
  const fuText = fuList.length
    ? fuList.map((l) => `${esc(l.fuLiuqin)}·伏${esc(l.fuGan || '')}${esc(l.fuZhi)}于${esc(l.position)}`).join('　')
    : '无（六亲俱全，不伏）';
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
      <div class="legend">
        <em><i></i>阳爻</em><em><i class="yin"></i>阴爻</em>
        <em><b style="color:#b3392c">0→</b> 老阳·动</em><em><b style="color:#b3392c">X→</b> 老阴·动</em>
        <em><span class="ltag">世</span>世爻</em><em><span class="ltag">应</span>应爻</em>
        <em><span class="ltag kk">空</span>旬空 · <span class="ltag po">破</span>月破 · <span class="ltag bd">身</span>卦身</em>
        <em>朱红单字为六兽；纳甲「天干小字 + 地支大字」同排</em>
        <em><span class="lfu-badge" style="vertical-align:baseline">伏父母</span>伏神（悬停看干支与爻位）</em>
      </div>
      <div class="props">
        <div class="prow">
          ${prop('月建', `${esc(f.yueJian.zhi)}月（${esc(f.yueJian.element)}）`)}
          ${prop('日辰', esc(f.riJian.ganzhi))}
          ${prop('卦宫', `${esc(ben.gong)}宫${esc(ben.gongElement)}`)}
          ${prop('世应', `世${esc(f.shiYing.shiPosition)} ／ 应${esc(f.shiYing.yingPosition)}`)}
          ${prop('动爻', esc(dongNames))}
          ${prop('伏神', fuText)}
          ${prop('卦身', esc(guaShenZhi || '—'))}
          ${prop('用神', esc(f.yongshen))}
        </div>
        ${f.yongshenNote ? `<div class="prow" style="color:#a08b62">${esc(f.yongshenNote)}</div>` : ''}
      </div>
    </div>
  </div>`;
}
