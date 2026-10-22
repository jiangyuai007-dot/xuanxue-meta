/**
 * 奇门遁甲九宫盘 —— 统一字号 + 左干右门版（按用户规格重排）
 *
 * 排版铁律：
 *  ① 四类符号同规格：八神 / 九星 / 八门 / 天干（天盘+地盘）使用同一字体、
 *     同一字号（--fs 一档）、同一字重 —— 盘内不再有大小不一的符号。
 *  ② 天地盘干靠左：上天下地竖排于宫内左侧，干字起点逐宫固定 → 纵列对齐。
 *  ③ 八门固定右下角：纯文字按门五行着色，无药丸底。
 *  ④ 九宫严格同构：每宫 DOM 层级、行数、行高完全一致（中宫同构），
 *     行高用 CSS 变量集中管理，断点只改变量。
 *  ⑤ 年月日时干 / 十二长生小标记随干内联（干字起点固定，列对齐不受影响）；
 *     门迫徽标 absolute 贴门字左侧，不占文档流。
 *  ⑥ 徽标统一 14×14 方块；值符宫金框为 box-shadow 唯一来源，值使宫改底色。
 *
 * 结构（自上而下）：
 *  ① 局面抬头    遁局 / 三元 / 节气 / 旬首 / 值符 / 值使 / 空亡 / 马星
 *  ② 四柱表      干上支下竖排，各柱空亡严格对齐
 *  ③ 方法行      转盘/飞盘、起局法、寄宫、三元依据
 *  ④ 九宫盘      每宫五行：宫位头 / 八神 / 九星 / 天地盘干(左) / 八门(右下)
 *  ⑤ 徽标图例    符 使 空 日 马 刑 墓 迫
 *  ⑥ 结论        用神 / 吉方 / 次选
 *
 * 交互：宫内每个元素（神/星/门/干/宫头/徽标）均可点击，弹出解释气泡（qm-el + data-t/data-x）。
 * 铁律：只呈现事实包已有数据，不产生新的命理判断；解释文本取自 core/qimenInfo.js 通义库。
 */

import { esc, list, WX_COLOR } from './shared.js';
import {
  STAR_INFO, DOOR_INFO, SHEN_INFO, GAN_INFO, SIHAI_INFO,
  comboOf, CHANG12_INFO, DOOR_WX,
} from '../../core/qimenInfo.js';

const elColor = (e) => WX_COLOR[e] || '#6b5640';

const PALACE_WX = { 1: '水', 2: '土', 3: '木', 4: '木', 6: '金', 7: '金', 8: '土', 9: '火' };

/** 地支通义（点击解释用） */
const ZHI_INFO = {
  子: '子水：阳水，正北方，司仲冬。象意：暗昧、机谋、暗藏、流动；生肖鼠。',
  丑: '丑土：阴土，北偏东方，司季冬。象意：承载、孕育、迟滞、忠厚；生肖牛。',
  寅: '寅木：阳木，东北偏东，司初春。象意：生发、进取、官贵、文书；生肖虎。',
  卯: '卯木：阴木，正东方，司仲春。象意：门户、交易、平和、船车；生肖兔。',
  辰: '辰土：阳土，东偏东南，司季春。象意：水库、变化、网络、医药；生肖龙。',
  巳: '巳火：阴火，东南偏南，司初夏。象意：文书、炉冶、道路、蛇虫；生肖蛇。',
  午: '午火：阳火，正南方，司仲夏。象意：光彩、急躁、文采、马匹；生肖马。',
  未: '未土：阴土，南偏西南，司季夏。象意：酒食、田园、衣冠、乐趣；生肖羊。',
  申: '申金：阳金，西南偏西，司初秋。象意：驿马、道路、金属、传递；生肖猴。',
  酉: '酉金：阴金，正西方，司仲秋。象意：阴私、酒器、首饰、门户；生肖鸡。',
  戌: '戌土：阳土，西偏西北，司季秋。象意：火库、坟墓、牢狱、忠信；生肖狗。',
  亥: '亥水：阴水，西北偏北，司初冬。象意：江河、沟渠、布帛、暗沟；生肖猪。',
};

/** 局面抬头可点击标签通用文案 */
const HEAD_INFO = {
  节气: '节气定阴阳遁与用局：冬至后阳遁、夏至后阴遁；一个节气十五天分上中下三元，是奇门定局的依据。',
  三元: '上、中、下三元各五天，按符头（甲己日支的子午卯酉为上元、寅申巳亥为中元、辰戌丑未为下元）确定该用哪一局。',
  旬首: '当前时辰所在旬的首位干支。六甲遁于六仪之下：甲子戊、甲戌己、甲申庚、甲午辛、甲辰壬、甲寅癸。',
  值符: '值符为旬首六甲所遁六仪对应的九星，是八神之首，所到之处百恶消散；此处标注值符星与其落宫。',
  值使: '值使为旬首宫所对应的八门，掌管本旬人事出入的门路，值使门落宫主事体成败缓急。',
  空亡: '旬内两个地支无天干相配称空亡。落空之宫力量减弱，吉不成吉、凶不成凶；出旬或逢冲则填实。',
  马星: '驿马星主变动、出行、迁移。申子辰马在寅、寅午戌马在申、巳酉丑马在亥、亥卯未马在巳，由时支三合局起。',
};

/** 驿马星图标：内联 SVG 手绘马头（纯路径绘制，非图片文件、非 emoji） */
const HORSE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:10px;height:10px;display:block">'
  + '<path d="M5 21c0-4.5 2-8 6.5-9L16 5l2.4 2.2-2.2 2.4c3 1.6 4 3.8 3.4 6.9l-1.1 3.6-3.6-1-2.9 1.7-2.9-1.7L6 21z"/>'
  + '<circle cx="17.6" cy="7.8" r="1.15" fill="#fff"/>'
  + '</svg>';

const CSS = `
.qm2{--ink:#2f2a22;--sub:#8b8172;--gold:#b0812b;--line:#e3d9c4;--sep:#f1ead9;--red:#b3392c;
  max-width:760px;margin:0 auto;color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:13px}
.qm2 *{box-sizing:border-box}
.qm2 .hd{position:relative;background:linear-gradient(180deg,#fffdf8,#fbf5e9);border:1px solid var(--line);border-radius:12px 12px 0 0;padding:12px 14px;text-align:center}
.qm2 .hd .t{font-family:"Noto Serif SC",serif;font-size:20px;font-weight:700;letter-spacing:4px;margin-right:-4px;color:#2c2418}
.qm2 .hd .b{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 9px;margin-top:7px;font-size:11.5px;color:#6d6353}
.qm2 .hd .b i{font-style:normal;background:#f7f2e7;border:1px solid var(--line);border-radius:5px;padding:2px 7px;transition:.14s}
.qm2 .hd .b i.qm-el:hover{border-color:var(--gold);background:#fdf3dd}
.qm2 .hd .b i b{color:#3b332a;font-weight:600}
.qm2 .hd-stems{position:absolute;top:8px;right:12px;font-size:11px;color:#6d6353;text-align:right;line-height:1.5}
.qm2 .hd-stems .lab{color:#9b8f77;margin-right:3px}
.qm2 .hd-stems b{font-family:"Noto Serif SC",serif;font-size:14px;font-weight:800;margin:0 1px}
.qm2 .hd-stems .sgap{color:#c9bda3;margin:0 1px}
/* —— 四柱表：每柱竖排（干上支下），空亡行逐列对齐 —— */
.qm2 .sz{display:grid;grid-template-columns:56px repeat(4,1fr);border:1px solid var(--line);border-radius:0 0 10px 10px;border-top:0;overflow:hidden;margin:0 12px 10px;background:#fffdf8}
.qm2 .sz>div{display:flex;align-items:center;justify-content:center;gap:8px;padding:6px 4px;border-bottom:1px solid #f2ecdd;font-size:12px;min-width:0}
.qm2 .sz>div:nth-child(-n+5){background:#fbf6ea}
.qm2 .sz .k{font-size:12.5px;color:#b0812b;letter-spacing:2px;text-indent:2px;border-right:1px solid #efe8d8}
.qm2 .sz .h{font-size:12.5px;font-weight:600;color:#7d705a;letter-spacing:2px;text-indent:2px}
.qm2 .sz .rc{flex-direction:column;gap:2px}
.qm2 .sz .vcol{padding:9px 4px 7px;gap:0}
.qm2 .sz .gan,.qm2 .sz .zhi{font-family:"Noto Serif SC",serif;font-size:26px;font-weight:800;line-height:1.28;cursor:pointer;border-radius:8px;padding:0 8px;transition:background .12s}
.qm2 .sz .gan:hover,.qm2 .sz .zhi:hover{background:rgba(184,146,79,.14)}
.qm2 .sz .xk{font-size:12.5px;color:#9b8f77;letter-spacing:3px;text-indent:3px}
.qm2 .sz .xk.hot{color:#b3392c;font-weight:700}
.qm2 .sz .cg{font-family:"Noto Serif SC",serif;font-size:14px;font-weight:700;letter-spacing:2px;text-indent:2px;white-space:nowrap}
.qm2 .sz .cg i{font-style:normal;cursor:pointer;border-radius:4px;padding:0 2px}
.qm2 .meth{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin:0 12px 10px}
.qm2 .meth i{font-style:normal;font-size:11px;background:#f7f2e7;border:1px solid var(--line);border-radius:5px;padding:2px 8px;color:#6d6353}
.qm2 .meth i b{color:#3b332a}

/* ══════════ 九宫盘：统一字号 + 左干右门（用户规格） ══════════
   ① 八神/九星/八门/天干四类符号：同字体、同字号（--fs 一档）、同字重；
   ② 天盘干/地盘干靠左竖排（上天下地），干字起点逐宫一致 → 纵列对齐；
   ③ 八门固定右下角（无药丸底，纯文字按五行着色）；
   ④ 每宫仍为 grid 五行，行位逐宫一致，横向绝对对齐。            */
.qm2 .g9{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:2px 12px 12px}
.qm2 .qp{--rh:22px;--rs:26px;--rt:26px;--rd:30px;
  --fs:16px;--fs-name:12px;--fs-tag:9px;
  position:relative;height:200px;
  display:grid;grid-template-rows:var(--rh) var(--rs) var(--rt) 1fr var(--rd);
  background:#fffdf8;border:1px solid var(--line);border-radius:10px;padding:6px 7px;overflow:hidden}
.qm2 .qp.mid{background:#f8f4ea;border-style:dashed}
/* 值符宫：金框（全局唯一 box-shadow 来源）；值使宫：改底色不加框 —— 杜绝双框叠加错位 */
.qm2 .qp.vf{box-shadow:0 0 0 2px var(--gold);border-color:var(--gold)}
.qm2 .qp.shi{background:#fffcf2}
.qm2 .qp.kw{background:#fffdf8}
/* 通用行：严格居中，行分隔细线 */
.qm2 .qr{display:flex;align-items:center;justify-content:center;min-width:0;border-top:1px solid var(--sep)}
.qm2 .qel{cursor:pointer;border-radius:6px;transition:background .12s;display:inline-flex;align-items:center;justify-content:center}
.qm2 .qel:hover{background:rgba(184,146,79,.12)}

/* ① 宫位头：宫名 flex:1 可压缩，徽标 flex:0 定宽 */
.qm2 .qh{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden}
.qm2 .qn{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:3px;white-space:nowrap;overflow:hidden}
.qm2 .qn .id{font-style:normal;font-size:10px;color:#a1875c;background:#f5f0e4;border-radius:3px;padding:0 3px;line-height:1.6;flex:0 0 auto}
.qm2 .qn .pn{font-family:"Noto Serif SC",serif;font-size:var(--fs-name);font-weight:700;color:#3b332a;flex:0 0 auto}
.qm2 .qn .dir{font-size:11px;color:#a2977f;flex:0 0 auto}
.qm2 .qtag{flex:0 0 auto;display:flex;align-items:center;gap:2px}
/* 徽标统一 14×14 方块，宽度恒定 —— 宫头不会因徽标数量而参差 */
.qm2 .qtag i{font-style:normal;flex:0 0 auto;width:14px;height:14px;
  display:inline-flex;align-items:center;justify-content:center;
  font-size:var(--fs-tag);line-height:1;color:#fff;background:#b0a68f;border-radius:3px;overflow:hidden}
.qm2 .qtag i.v{background:var(--gold)}
.qm2 .qtag i.k{background:var(--red)}
.qm2 .qtag i.d{background:#c47a5a}
.qm2 .qtag i.x{background:#8a5fa0}
.qm2 .qtag i.p{background:#a3543f}
.qm2 .qtag i.m{background:#c0392b}

/* ②③⑤ 四类符号统一：八神/九星/八门/天干 —— 同字体、同字号、同字重 */
.qm2 .qs,.qm2 .qstar,.qm2 .qd,.qm2 .qgan b{font-family:"Noto Serif SC",serif;font-size:var(--fs);font-weight:700;line-height:1;white-space:nowrap}
.qm2 .qs{color:#8a6a28}

/* ⑤ 八门行：固定右下角（纯文字，按门五行着色） */
.qm2 .qdoor-row{display:flex;align-items:center;justify-content:flex-end;padding-right:12px}
.qm2 .qd{position:relative;line-height:1}

/* ④ 天地盘干区：靠左竖排（上天下地），干字起点逐宫一致 */
.qm2 .qg{display:flex;flex-direction:column;justify-content:center;gap:10px;min-width:0;border-top:1px solid var(--sep)}
.qm2 .qgan{display:flex;align-items:center;justify-content:flex-start;gap:5px;padding-left:14px;min-width:0}
.qm2 .qdash{font-size:var(--fs);color:#c6bda8;line-height:1}
/* —— 随干内联的小标记：年月日时干 / 十二长生（干字起点固定，列对齐不受影响） —— */
.qm2 .mk,.qm2 .qcs{font-style:normal;text-decoration:none;font-size:9px;line-height:1.5;border-radius:3px;padding:0 3px;white-space:nowrap;flex:0 0 auto}
.qm2 .mk{color:#8a6f4b;background:#f6f1e6;border:1px solid #e8e0cd}
.qm2 .qcs{color:#8a5fa0;background:#f5eff8;border:1px solid #e3d5ee}
/* 门迫徽标：贴在门字左侧（门靠右，右侧贴边） */
.qm2 .qpo{position:absolute;right:100%;margin-right:3px;top:50%;transform:translateY(-50%);
  font-style:normal;font-size:9px;color:#fff;background:#a3543f;border-radius:3px;padding:0 3px;line-height:1.5;font-weight:600;white-space:nowrap}

/* —— 徽标图例 —— */
.qm2 .lg{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 10px;margin:0 12px 10px;font-size:11px;color:#8b8172}
.qm2 .lg span{display:inline-flex;align-items:center;gap:3px}
.qm2 .lg i{font-style:normal;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;
  font-size:9px;line-height:1;color:#fff;background:#b0a68f;border-radius:3px}
.qm2 .lg i.v{background:var(--gold)}.qm2 .lg i.k{background:var(--red)}.qm2 .lg i.d{background:#c47a5a}
.qm2 .lg i.x{background:#8a5fa0}.qm2 .lg i.p{background:#a3543f}.qm2 .lg i.m{background:#c0392b}

.qm2 .ft{padding:0 12px 12px}
.qm2 .adv{background:#fffdf8;border:1px solid var(--line);border-radius:11px;padding:11px 13px;font-size:12px;color:#5f5647;line-height:1.9}
.qm2 .adv b{color:#3b332a}
.qm2 .adv .why{color:#a2977f;font-size:11px}
/* —— 点击解释气泡（全局，供 web 页与报告页共用） —— */
.qm-pop{position:absolute;z-index:9999;max-width:320px;background:#2e2a22;color:#f3eddd;border-radius:10px;
  padding:10px 13px;font-size:12.5px;line-height:1.8;box-shadow:0 10px 30px rgba(30,20,5,.45);
  font-family:"PingFang SC","Microsoft YaHei",sans-serif;pointer-events:none}
.qm-pop .t{font-weight:700;color:#e7c878;margin-bottom:3px;font-size:13px;letter-spacing:1px}
.qm-pop .x{white-space:pre-line}
.qm-pop .cls{display:block;margin-top:6px;font-size:10.5px;color:#a99e88}

/* —— 断点：只改行高变量与字号变量，结构不动 —— */
@media (max-width:560px){.qm2 .qp{--rh:20px;--rs:24px;--rt:24px;--rd:28px;--fs:15px;--fs-name:11.5px;--fs-tag:8.5px;height:184px}
  .qm2 .g9{gap:6px;padding:2px 8px 10px}
  .qm2 .sz{grid-template-columns:42px repeat(4,1fr);margin:0 8px 8px}
  .qm2 .sz .gan,.qm2 .sz .zhi{font-size:21px;padding:0 4px}
  .qm2 .hd-stems b{font-size:13px}.qm-pop{max-width:260px}
  .qm2 .qgan{padding-left:10px}}
@media (max-width:420px){.qm2 .qp{--rh:18px;--rs:22px;--rt:22px;--rd:26px;--fs:14px;--fs-name:11px;--fs-tag:8px;height:172px}
  .qm2 .g9{gap:4px;padding:2px 5px 8px}
  .qm2 .sz{grid-template-columns:36px repeat(4,1fr)}.qm2 .sz .gan,.qm2 .sz .zhi{font-size:18px;padding:0 2px}
  .qm2 .sz .k{font-size:11px;letter-spacing:0;text-indent:0}
  .qm2 .hd .t{font-size:17px;letter-spacing:2px;margin-right:-2px}.qm2 .meth i{font-size:10px;padding:2px 6px}
  .qm2 .mk,.qm2 .qcs,.qm2 .qpo{font-size:8px;padding:0 2px}
  .qm2 .qtag i{width:13px;height:13px}
  .qm2 .qgan{padding-left:8px;gap:3px}}
`;

const ORDER = [4, 9, 2, 3, 5, 7, 8, 1, 6];

/** 点击解释元素通用包裹：单一 span，避免嵌套造成的基线漂移 */
function el(title, text, inner, cls = '') {
  return `<span class="qel qm-el ${cls}" data-t="${esc(title)}" data-x="${esc(text)}">${inner}</span>`;
}

/** 年月日时干标记（不占文档流，贴在干字左侧） */
const markHtml = (marks) => (list(marks).length
  ? `<i class="mk qm-el" data-t="年月日时干标记：${esc(list(marks).join(''))}" data-x="该干与本局四柱的年干/月干/日干/时干相同，称为「同干」，常用于定位用神宫与事应时间。">${esc(list(marks).join(''))}</i>`
  : '');

export function renderQimen(f) {
  const find = (id) => list(f.palaces).find((p) => p.id === id);

  const cells = ORDER.map((id) => {
    const p = find(id);
    if (!p) return '<div class="qp"></div>';

    // —— 宫头徽标：统一 14×14 方块，一字一标，宽度恒定 ——
    const tagDefs = [];
    if (p.isZhiFu) tagDefs.push(['v', '符', '值符宫', HEAD_INFO.值符]);
    if (p.isZhiShi) tagDefs.push(['v', '使', '值使宫', HEAD_INFO.值使]);
    if (p.kongWang) tagDefs.push(['k', '空', '时空亡', SIHAI_INFO.空亡]);
    if (p.dayKongWang) tagDefs.push(['d', '日', '日空亡', '日柱旬空落此宫，同主力量减弱，其应稍缓。']);
    if (p.maXing) tagDefs.push(['m', HORSE_SVG, '驿马星', HEAD_INFO.马星]);
    if (p.jiXing) tagDefs.push(['x', '刑', `六仪击刑（${p.tianPan || ''}落${p.name || ''}宫）`, SIHAI_INFO.击刑]);
    if (p.ruMu) tagDefs.push(['x', '墓', `三奇入墓（${p.tianPan || ''}入${p.name || ''}宫墓库）`, SIHAI_INFO.入墓]);
    if (p.menPo) tagDefs.push(['p', '迫', `门迫（${p.door || ''}属${DOOR_WX[p.door] || ''}克${p.name || ''}宫${PALACE_WX[p.id]}）`, SIHAI_INFO.门迫]);
    const tags = tagDefs.map(([cls, label, t, x]) =>
      `<i class="qm-el ${cls}" data-t="${esc(t)}" data-x="${esc(x)}" title="${esc(t)}">${label}</i>`).join('');

    // —— 四害完整文本（点击宫头区域可见）——
    const sihaiTexts = [];
    if (p.kongWang) sihaiTexts.push(['空亡', SIHAI_INFO.空亡]);
    if (p.dayKongWang) sihaiTexts.push(['日空亡', '日柱旬空落此宫，同主力量减弱，其应稍缓。']);
    if (p.jiXing) sihaiTexts.push([`击刑（${p.tianPan}落${p.name}宫）`, SIHAI_INFO.击刑]);
    if (p.ruMu) sihaiTexts.push([`入墓（${p.tianPan}入${p.name}宫墓库）`, SIHAI_INFO.入墓]);
    if (p.menPo) sihaiTexts.push([`门迫（${p.door}属${DOOR_WX[p.door]}克${p.name}宫${PALACE_WX[p.id]}）`, SIHAI_INFO.门迫]);

    const starInfo = STAR_INFO[p.star] || {};
    const doorInfo = DOOR_INFO[p.door] || {};
    const shenInfo = SHEN_INFO[p.shen] || {};
    const starColor = elColor(starInfo.wx || '土');
    const doorWx = DOOR_WX[p.door] || '';
    const doorColor = doorWx ? elColor(doorWx) : '#8c8579';
    const combo = comboOf(p.tianPan, p.diPan);
    const tianText = `${GAN_INFO[p.tianPan]?.text || ''}${combo ? `〔克应〕${combo}` : ''}`;
    const csInfo = p.changsheng ? `${p.changsheng}｜${CHANG12_INFO[p.changsheng] || ''}` : '';

    const palaceWx = PALACE_WX[p.id];
    const headTitle = `${p.id}·${p.name}宫（${p.direction}）　地支：${esc(list(p.zhi).join('、'))}`;
    const headText = `坎一、坤二、震三、巽四、中五、乾六、兑七、艮八、离九——洛书九宫配后天八卦，${p.name}宫属${palaceWx}，居${p.direction}方。${sihaiTexts.length ? '　本宫标记：' + sihaiTexts.map(([t]) => t).join('、') : ''}`;

    // 中宫与其它八宫走完全相同的五行结构，保证九宫同构对齐
    if (p.isMiddle) {
      return `<div class="qp mid${p.isZhiFu ? ' vf' : ''}${p.isZhiShi ? ' shi' : ''}">
        <div class="qh">${el('5·中宫（寄坤二宫）　地支：寄四隅',
          '中五宫无卦无地支，天禽星寄坤二宫（本局寄宫方式见方法行）。中宫为太极之所，一般不直接取用，其力并入寄宫。',
          `<span class="qn"><i class="id">5</i><span class="pn">中</span><span class="dir">中宫</span></span>`)}
          <span class="qtag">${tags}</span></div>
        <div class="qr">${el('中宫无八神', '中五宫不入九宫飞泊，故无八神、无八门。', '<span class="qdash">—</span>')}</div>
        <div class="qr">${el(`九星「${esc(p.star || '天禽')}」`, `${starInfo.text || '天禽星：中宫之主星，五行属土，为九星之首，主中正、承载。'}　本局寄坤二宫。`,
          `<span class="qstar" style="color:${starColor}">${esc(p.star || '天禽')}</span>`)}</div>
        <div class="qg">
          ${el('中宫无天盘干', '中五宫不参与天盘飞布，故无天盘干。', '<span class="qdash">—</span>', 'qgan ti')}
          ${el(`中宫地盘干「${esc(p.diPan || '—')}」`, `${GAN_INFO[p.diPan]?.text || ''}　中五宫地盘之干，寄坤二宫时随寄宫论。`,
            `<b style="color:${elColor(GAN_INFO[p.diPan]?.wx || '')}">${esc(p.diPan || '—')}</b>${markHtml(p.diMarks)}`, 'qgan di')}
        </div>
        <div class="qr qdoor-row">${el('中宫无八门', '中五宫不入八门飞布，故无八门。', '<span class="qdash">—</span>')}</div>
      </div>`;
    }

    return `<div class="qp${p.kongWang ? ' kw' : ''}${p.isZhiFu ? ' vf' : ''}${p.isZhiShi ? ' shi' : ''}">
      <div class="qh">
        ${el(headTitle, headText,
          `<span class="qn"><i class="id">${p.id}</i><span class="pn">${esc(p.name)}</span><span class="dir">${esc(p.direction)}</span></span>`)}
        <span class="qtag">${tags}</span>
      </div>
      <div class="qr">${el(`八神「${esc(p.shen || '—')}」`, shenInfo.text || '',
        esc(p.shen || '—'), 'qs')}</div>
      <div class="qr">${el(`九星「${esc(p.star || '—')}」`, `${starInfo.text || ''}${csInfo ? `　〔落宫状态〕${csInfo}` : ''}`,
        `<span style="color:${starColor}">${esc(p.star || '—')}</span>`, 'qstar')}</div>
      <div class="qg">
        ${el(`天盘干「${esc(p.tianPan || '—')}」加${esc(p.name)}宫`, tianText,
          `<b style="color:${elColor(GAN_INFO[p.tianPan]?.wx || '')}">${esc(p.tianPan || '—')}</b>`
          + markHtml(p.tianMarks)
          + (p.changsheng ? `<u class="qcs qm-el" data-t="十二长生「${esc(p.changsheng)}」" data-x="${esc(p.changsheng)}：${esc(CHANG12_INFO[p.changsheng] || '')}（以天盘干对本宫地支而言）">${esc(p.changsheng)}</u>` : ''),
          'qgan ti')}
        ${el(`地盘干「${esc(p.diPan || '—')}」（${esc(p.name)}宫原始之干）`, GAN_INFO[p.diPan]?.text || '',
          `<b style="color:${elColor(GAN_INFO[p.diPan]?.wx || '')}">${esc(p.diPan || '—')}</b>` + markHtml(p.diMarks),
          'qgan di')}
      </div>
      <div class="qr qdoor-row">${el(`八门「${esc(p.door || '—')}」`, `${doorInfo.text || ''}${p.menPo ? '　〔当前门迫，力量受损〕' : ''}`,
        `<span style="color:${doorColor}">${esc(p.door || '—')}</span>${p.menPo ? '<i class="qpo">迫</i>' : ''}`, 'qd')}</div>
    </div>`;
  }).join('');

  const hdChip = (key, label, value) =>
    `<i class="qm-el" data-t="${esc(label)}「${esc(value)}」" data-x="${esc(HEAD_INFO[key])}" style="cursor:pointer">${esc(label)} <b>${esc(value)}</b></i>`;
  const headRow = [
    hdChip('节气', '节气', f.solarTerm),
    hdChip('三元', '', f.yuan),
    hdChip('旬首', '旬首', `${f.xunShou}（${f.xunShouYi}）`),
    hdChip('值符', '值符', `${f.zhiFu.star}@${f.zhiFu.palaceName}宫`),
    hdChip('值使', '值使', `${f.zhiShi.door}@${f.zhiShi.palaceName}宫`),
    hdChip('空亡', '空亡', list(f.kongWang).join('、')),
    f.maXing && f.maXing.palaceName ? hdChip('马星', '马星', `${f.maXing.zhi}@${f.maXing.palaceName}宫`) : '',
  ].filter(Boolean).join('');

  const fav = f.favorable || {};
  const top = list(f.ranking).slice(0, 3).map((r) =>
    `${r.palaceName}宫（${r.direction}）${r.door}·${r.star}·${r.shen}　评分 ${r.score}`).join('　｜　');

  // —— 四柱表：每柱竖排（天干上、地支下），空亡行逐列对齐，落空标红 ——
  const fp = f.fourPillars || {};
  const LABELS = [['year', '年'], ['month', '月'], ['day', '日'], ['hour', '时']];
  const ZHI_EL = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
  const hourKw = f.kongWang ? list(f.kongWang).join('') : '';
  const colGz = LABELS.map(([k, lab]) => {
    const p = fp[k];
    if (!p) return `<div class="rc vcol"><span class="gan">—</span><span class="zhi">—</span></div>`;
    return `<div class="rc vcol">
      <span class="gan qm-el" data-t="年月日时干「${esc(p.gan)}」（${lab}柱天干）" data-x="${esc(GAN_INFO[p.gan]?.text || '')}" style="color:${elColor(GAN_INFO[p.gan]?.wx)}">${esc(p.gan)}</span>
      <span class="zhi qm-el" data-t="地支「${esc(p.zhi)}」（${lab}柱地支）" data-x="${esc(ZHI_INFO[p.zhi] || '')}" style="color:${elColor(ZHI_EL[p.zhi])}">${esc(p.zhi)}</span>
    </div>`;
  }).join('');
  // —— 藏干行：本气在前，按五行着色，可点解释 ——
  const colCg = LABELS.map(([k, lab]) => {
    const p = fp[k];
    const cang = list(p?.canggan);
    if (!cang.length) return `<div class="rc"><span class="cg">—</span></div>`;
    return `<div class="rc"><span class="cg">${cang.map((g) =>
      `<i class="qm-el" data-t="${lab}柱地支「${esc(p.zhi)}」藏干·${esc(g)}" data-x="${esc(GAN_INFO[g]?.text || '')}（${esc(p.zhi)}支藏干，本气在前）" style="color:${elColor(GAN_INFO[g]?.wx)}">${esc(g)}</i>`
    ).join('')}</span></div>`;
  }).join('');
  const colKw = LABELS.map(([k, lab]) => {
    const p = fp[k];
    const hot = p && p.xunkong === hourKw;
    const title = hot ? `${lab}柱空亡与时空亡一致：此柱落空，力量减弱` : p ? `${lab}柱旬空：${esc(p.xunkong)}` : '';
    return `<div class="rc" ${title ? `title="${esc(title)}"` : ''}><span class="xk${hot ? ' hot' : ''}">${esc(p?.xunkong || '—')}</span></div>`;
  }).join('');
  const fpStems = ['year', 'month', 'day', 'hour'].map((k) => {
    const g = fp[k]?.gan;
    return g ? `<b style="color:${elColor(GAN_INFO[g]?.wx)}">${esc(g)}</b>` : '—';
  }).join('<span class="sgap">·</span>');
  const szTable = fp.day ? `<div class="sz">
    <div class="k h"></div><div class="h">年柱</div><div class="h">月柱</div><div class="h">日柱</div><div class="h">时柱</div>
    <div class="k">干支</div>${colGz}
    <div class="k">藏干</div>${colCg}
    <div class="k">空亡</div>${colKw}
  </div>` : '';
  const methChips = `<div class="meth">
    <i>${esc(f.panMethod === 'fei' ? '飞盘（暂按转盘计算）' : '转盘')}</i>
    <i>起局 <b>${esc(f.juMethodName || '拆补法')}</b></i>
    <i>寄宫 <b>${esc(f.jiGongName || '寄坤二宫')}</b></i>
    <i>${esc(f.yuanBasis || '')}</i>
  </div>`;

  const legend = `<div class="lg">
    <span><i class="v">符</i>值符宫</span>
    <span><i class="v">使</i>值使宫</span>
    <span><i class="k">空</i>时旬空亡</span>
    <span><i class="d">日</i>日旬空亡</span>
    <span><i class="m">${HORSE_SVG}</i>驿马星</span>
    <span><i class="x">刑</i>六仪击刑</span>
    <span><i class="x">墓</i>三奇入墓</span>
    <span><i class="p">迫</i>门迫</span>
  </div>`;

  return `<style class="qm2-style">${CSS}</style><div class="qm2">
    <div class="hd">
      <div class="t">${esc(f.juName)}</div>
      <div class="b">${headRow}</div>
      <div class="hd-stems"><span class="lab">四干</span>${fpStems}</div>
    </div>
    ${szTable}
    ${methChips}
    <div class="g9">${cells}</div>
    ${legend}
    <div class="ft">
      <div class="adv">
        <div><b>用神</b> ${esc(f.purpose ? f.purpose.name : '通用')}：${esc(f.purpose ? f.purpose.note : '')}</div>
        <div><b>吉方</b> ${esc(fav.palaceName || '—')}宫（${esc(fav.direction || '—')}方）· ${esc(fav.door || '—')} · ${esc(fav.star || '—')}　评分 ${fav.score ?? '—'}</div>
        ${top ? `<div class="why">次选：${esc(top)}</div>` : ''}
        <div class="why">盘面读法：每宫自上而下为 宫位头 → 八神 → 九星 → 天盘干／地盘干（居左，上天下地）→ 八门（右下）；八神、九星、八门、天干四类符号同一字号；天盘干右侧小字为年月日时干标记与十二长生；金框为值符宫。宫内任一符号与右上角徽标均可点击查看解释。</div>
      </div>
    </div>
  </div>`;
}

const GAN_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
function ganEl(g) { return GAN_EL[g] || ''; }
