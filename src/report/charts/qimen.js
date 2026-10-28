/**
 * 奇门遁甲九宫盘 —— 对标热卜布局（暗干居左 + 芮禽寄干双显 + 天干地支五行着色 + 星门神纯墨 + 无横线清爽版）v2.8
 *
 * 视觉规范：
 *   1. 天干地支（四柱干支、藏干、顶栏四干、九宫暗干、天盘干/寄干、地盘干/寄干）均采用传统五行颜色；
 *   2. 九宫格内的「八神、九星（含芮禽）、八门」保持统一浓墨色（#1f1a14），主次分明；
 *   3. 每宫九星左侧清晰展示本宫「暗干（隐干）」，天芮天禽同宫显示「芮禽」与寄干（如丁戊），寄宫地盘同步显示寄干（如丁戊）；
 *   4. 九宫格单宫内部去掉所有横向分割线（.qr / .qg 无 border-top），宫面通透干净。
 */

import { esc, list, WX_COLOR } from './shared.js';
import {
  STAR_INFO, DOOR_INFO, SHEN_INFO, GAN_INFO, SIHAI_INFO,
  comboOf, CHANG12_INFO, DOOR_WX,
} from '../../core/qimenInfo.js';

const elColor = (e) => WX_COLOR[e] || '#1f1a14';
const PALACE_WX = { 1: '水', 2: '土', 3: '木', 4: '木', 5: '土', 6: '金', 7: '金', 8: '土', 9: '火' };
const ZHI_EL = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };

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

const HEAD_INFO = {
  节气: '节气定阴阳遁与用局：冬至后阳遁、夏至后阴遁；一个节气十五天分上中下三元，是奇门定局的依据。',
  三元: '上、中、下三元各五天，按符头（甲己日支的子午卯酉为上元、寅申巳亥为中元、辰戌丑未为下元）确定该用哪一局。',
  旬首: '当前时辰所在旬的首位干支。六甲遁于六仪之下：甲子戊、甲戌己、甲申庚、甲午辛、甲辰壬、甲寅癸。',
  值符: '值符为旬首六甲所遁六仪对应的九星，是八神之首，所到之处百恶消散；此处标注值符星与其落宫。',
  值使: '值使为旬首宫所对应的八门，掌管本旬人事出入的门路，值使门落宫主事体成败缓急。',
  空亡: '旬内两个地支无天干相配称空亡。落空之宫力量减弱，吉不成吉、凶不成凶；出旬或逢冲则填实。',
  马星: '驿马星主变动、出行、迁移。申子辰马在寅、寅午戌马在申、巳酉丑马在亥、亥卯未马在巳，由时支三合局起。',
};

const HORSE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:10px;height:10px;display:block">'
  + '<path d="M5 21c0-4.5 2-8 6.5-9L16 5l2.4 2.2-2.2 2.4c3 1.6 4 3.8 3.4 6.9l-1.1 3.6-3.6-1-2.9 1.7-2.9-1.7L6 21z"/>'
  + '<circle cx="17.6" cy="7.8" r="1.15" fill="#fff"/>'
  + '</svg>';

const CSS = `
.qm2{--ink:#1f1a14;--sub:#7a6f5d;--gold:#9e731e;--line:#dfd5be;--sep:#efe8d8;--red:#b3392c;
  max-width:760px;margin:0 auto;color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:13.5px}
.qm2 *{box-sizing:border-box}
.qm2 .hd{position:relative;background:linear-gradient(180deg,#fffdf8,#fbf5e9);border:1px solid var(--line);border-radius:12px 12px 0 0;padding:10px 12px 8px;text-align:center;margin:0 12px}
.qm2 .hd-top{display:flex;align-items:center;justify-content:center;position:relative;min-height:26px}
.qm2 .hd .t{font-family:"Noto Serif SC",serif;font-size:19.5px;font-weight:800;letter-spacing:3px;color:var(--ink)}
.qm2 .hd .b{display:flex;flex-wrap:wrap;justify-content:center;gap:5px 7px;margin-top:6px;font-size:11.5px;color:#5c5243}
.qm2 .hd .b i{font-style:normal;background:#f7f2e7;border:1px solid var(--line);border-radius:5px;padding:1.5px 6px}
.qm2 .hd .b i b{color:var(--ink);font-weight:700}
.qm2 .qm-q{margin-top:6px;padding-top:5px;border-top:1px dashed #e6dcc6;font-size:12.5px;color:#4a3f30;display:flex;align-items:center;justify-content:center;gap:6px}
.qm2 .qm-q b{color:#6e5832;font-weight:700;letter-spacing:1px}
.qm2 .qm-q span{font-weight:600;color:var(--ink)}
.qm2 .hd-stems{position:absolute;right:0;top:50%;transform:translateY(-50%);font-size:11.5px;color:#5c5243;text-align:right;line-height:1.4}
.qm2 .hd-stems .lab{color:#8a7e68;margin-right:3px}
.qm2 .hd-stems b{font-family:"Noto Serif SC",serif;font-size:14px;font-weight:800;margin:0 1px}
.qm2 .hd-stems .sgap{color:#c9bda3;margin:0 1px}
/* 四柱表：天干地支与藏干采用五行着色 */
.qm2 .sz{display:grid;grid-template-columns:52px repeat(4,1fr);border:1px solid var(--line);border-top:0;border-radius:0 0 10px 10px;overflow:hidden;margin:0 12px 8px;background:#fffdf8}
.qm2 .sz>div{display:flex;align-items:center;justify-content:center;gap:8px;padding:6px 4px;border-bottom:1px solid #f0e8d6;font-size:12.5px;min-width:0}
.qm2 .sz>div:nth-child(-n+5){background:#fbf6ea}
.qm2 .sz .k{font-size:12.5px;color:#6e5832;font-weight:600;letter-spacing:2px;text-indent:2px;border-right:1px solid #efe8d8}
.qm2 .sz .h{font-size:12.5px;font-weight:700;color:#4a3f30;letter-spacing:2px;text-indent:2px}
.qm2 .sz .rc{flex-direction:column;gap:2px}
.qm2 .sz .vcol{padding:8px 4px 6px;gap:0}
.qm2 .sz .gan,.qm2 .sz .zhi{font-family:"Noto Serif SC",serif;font-size:24px;font-weight:800;line-height:1.25;cursor:pointer;border-radius:6px;padding:0 6px}
.qm2 .sz .xk{font-size:13px;font-weight:600;color:#6e6250;letter-spacing:2px;text-indent:2px}
.qm2 .sz .cg{font-family:"Noto Serif SC",serif;font-size:14px;font-weight:700;letter-spacing:2px;text-indent:2px;white-space:nowrap}
.qm2 .sz .cg i{font-style:normal;cursor:pointer;padding:0 1px}
.qm2 .meth{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin:0 12px 10px}
.qm2 .meth i{font-style:normal;font-size:11.5px;background:#f7f2e7;border:1px solid var(--line);border-radius:5px;padding:2px 8px;color:#5c5243}
.qm2 .meth i b{color:var(--ink)}
/* 九宫格：单宫去掉内部横线（.qr / .qg 无 border-top），天干五行着色，八神九星八门统一浓墨色 */
.qm2 .g9{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:2px 12px 12px}
.qm2 .qp{--rh:22px;--rs:25px;--rt:26px;--rd:28px;
  --fs:16.5px;--fs-name:12px;--fs-tag:9px;
  position:relative;height:200px;
  display:grid;grid-template-rows:var(--rh) var(--rs) var(--rt) 1fr var(--rd);
  background:#fffdf8;border:1px solid var(--line);border-radius:10px;padding:6px 7px;overflow:hidden}
.qm2 .qp.mid{background:#f8f4ea;border-style:dashed}
.qm2 .qp.vf{box-shadow:0 0 0 2px var(--gold);border-color:var(--gold)}
.qm2 .qp.shi{background:#fffcf2}
.qm2 .qr{display:flex;align-items:center;justify-content:center;min-width:0;border-top:none;position:relative}
.qm2 .qel{cursor:pointer;border-radius:6px;display:inline-flex;align-items:center;justify-content:center}
.qm2 .qh{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden}
.qm2 .qn{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:3px;white-space:nowrap;overflow:hidden}
.qm2 .qn .id{font-style:normal;font-size:10px;color:#6e5832;background:#f3ece0;border-radius:3px;padding:0 3px;line-height:1.6;flex:0 0 auto}
.qm2 .qn .pn{font-family:"Noto Serif SC",serif;font-size:var(--fs-name);font-weight:700;color:var(--ink);flex:0 0 auto}
.qm2 .qn .dir{font-size:11px;color:#7a6f5d;flex:0 0 auto}
.qm2 .qtag{flex:0 0 auto;display:flex;align-items:center;gap:2px}
.qm2 .qtag i{font-style:normal;flex:0 0 auto;width:14px;height:14px;
  display:inline-flex;align-items:center;justify-content:center;
  font-size:var(--fs-tag);line-height:1;color:#fff;background:#7a6f5d;border-radius:3px;overflow:hidden}
.qm2 .qtag i.v{background:var(--gold)}
.qm2 .qtag i.k,.qm2 .qtag i.m,.qm2 .qtag i.p{background:#8c3b2b}
.qm2 .qtag i.d,.qm2 .qtag i.x{background:#6e5832}
/* 八神、九星、八门统一浓墨色；天盘干与地盘干采用五行颜色 */
.qm2 .qs,.qm2 .qstar,.qm2 .qd{
  font-family:"Noto Serif SC",serif;
  font-size:var(--fs);
  font-weight:800;
  line-height:1;
  white-space:nowrap;
  color:var(--ink) !important;
}
/* 暗干（隐干）：对标热卜，置于九星行左侧（中五宫亦置于左侧） */
.qm2 .qangan{
  position:absolute;
  left:10px;
  top:50%;
  transform:translateY(-50%);
  font-family:"Noto Serif SC",serif;
  font-size:15px;
  font-weight:700;
  line-height:1;
  opacity:0.82;
}
.qm2 .qgan b{
  font-family:"Noto Serif SC",serif;
  font-size:var(--fs);
  font-weight:800;
  line-height:1;
  white-space:nowrap;
}
.qm2 .qgan b.jigan{
  font-size:15.5px;
  margin-right:1px;
}
.qm2 .qdoor-row{display:flex;align-items:center;justify-content:flex-end;padding-right:12px}
.qm2 .qd{position:relative;line-height:1}
.qm2 .qg{display:flex;flex-direction:column;justify-content:center;gap:8px;min-width:0;border-top:none}
.qm2 .qgan-line{display:flex;align-items:center;justify-content:flex-start;gap:4px;padding-left:10px;min-width:0;flex-wrap:nowrap}
.qm2 .qgan{display:inline-flex;align-items:center;justify-content:flex-start;gap:3px;min-width:0}
.qm2 .qdash{font-size:var(--fs);color:#b8ad98;line-height:1}
.qm2 .mk,.qm2 .qcs,.qm2 .qpat{font-style:normal;text-decoration:none;font-size:9.5px;line-height:1.45;border-radius:3px;padding:0 3px;white-space:nowrap;flex:0 0 auto;color:#5c4e38;background:#f4ede0;border:1px solid #dfd3bc}
.qm2 .mk.ji{background:#efe5d0;color:#7a5820;border-color:#d8c49e}
.qm2 .qpo{position:absolute;right:100%;margin-right:3px;top:50%;transform:translateY(-50%);
  font-style:normal;font-size:9px;color:#fff;background:#8c3b2b;border-radius:3px;padding:0 3px;line-height:1.5;font-weight:600;white-space:nowrap}
.qm2 .lg{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 10px;margin:0 12px 10px;font-size:11px;color:#7a6f5d}
.qm2 .lg span{display:inline-flex;align-items:center;gap:3px}
.qm2 .lg i{font-style:normal;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;
  font-size:9px;line-height:1;color:#fff;background:#7a6f5d;border-radius:3px}
.qm2 .lg i.v{background:var(--gold)}.qm2 .lg i.k,.qm2 .lg i.m,.qm2 .lg i.p{background:#8c3b2b}.qm2 .lg i.d,.qm2 .lg i.x{background:#6e5832}
.qm2 .ft{padding:0 12px 12px}
.qm2 .adv{background:#fffdf8;border:1px solid var(--line);border-radius:11px;padding:11px 13px;font-size:12.5px;color:#4a4032;line-height:1.85}
.qm2 .adv b{color:var(--ink)}
.qm2 .adv .why{color:#7a6f5d;font-size:11.5px}
.qm2 .pat-bar{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin:4px 0}
.qm2 .pat-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;border-radius:5px;padding:1px 7px;cursor:pointer;background:#f4ede0;color:#3b3123;border:1px solid #dfd3bc}
.qm-pop{position:absolute;z-index:9999;max-width:320px;background:#2e2a22;color:#f3eddd;border-radius:10px;
  padding:10px 13px;font-size:12.5px;line-height:1.8;box-shadow:0 10px 30px rgba(30,20,5,.45);
  font-family:"PingFang SC","Microsoft YaHei",sans-serif;pointer-events:none}
.qm-pop .t{font-weight:700;color:#e7c878;margin-bottom:3px;font-size:13px;letter-spacing:1px}
.qm-pop .x{white-space:pre-line}
.qm-pop .cls{display:block;margin-top:6px;font-size:10.5px;color:#a99e88}
@media (max-width:560px){
  .qm2 .hd{margin:0 6px;padding:7px 8px 6px}
  .qm2 .hd .t{font-size:17px;letter-spacing:2px}
  .qm2 .hd .b{gap:3px 5px;margin-top:4px;font-size:10.5px}
  .qm2 .hd .b i{padding:1px 4px}
  .qm2 .sz{grid-template-columns:40px repeat(4,1fr);margin:0 6px 6px}
  .qm2 .sz>div{padding:4px 2px;font-size:11.5px}
  .qm2 .sz .vcol{padding:5px 2px;flex-direction:row;gap:2px}
  .qm2 .sz .gan,.qm2 .sz .zhi{font-size:18px;padding:0 1px;line-height:1.15}
  .qm2 .sz .cg{font-size:12.5px;letter-spacing:1px}
  .qm2 .sz .xk{font-size:12px;letter-spacing:1px}
  .qm2 .meth{margin:0 6px 6px;gap:4px}
  .qm2 .meth i{font-size:10.5px;padding:1px 5px}
  .qm2 .qp{--rh:18px;--rs:20px;--rt:21px;--rd:22px;--fs:14.5px;--fs-name:11.5px;--fs-tag:8px;height:152px;padding:4px 5px}
  .qm2 .qg{gap:3px}
  .qm2 .g9{gap:5px;padding:2px 6px 8px}
  .qm2 .hd-stems b{font-size:12.5px}.qm-pop{max-width:260px}
  .qm2 .qgan-line{padding-left:6px;gap:2px}
  .qm2 .qgan b.jigan{font-size:13.5px}
  .qm2 .qangan{left:6px;font-size:13px}
  .qm2 .qdoor-row{padding-right:6px}
}
@media (max-width:420px){
  .qm2 .qp{--rh:17px;--rs:19px;--rt:20px;--rd:21px;--fs:14px;--fs-name:11px;--fs-tag:7.5px;height:146px}
  .qm2 .g9{gap:4px;padding:2px 4px 8px}
  .qm2 .sz{grid-template-columns:38px repeat(4,1fr)}
  .qm2 .sz .gan,.qm2 .sz .zhi{font-size:18.5px;padding:0 1px}
  .qm2 .sz .k{font-size:11.5px;letter-spacing:0;text-indent:0}
  .qm2 .mk,.qm2 .qcs,.qm2 .qpo,.qm2 .qpat{font-size:8px;padding:0 2px}
  .qm2 .qtag i{width:13px;height:13px}
  .qm2 .qgan-line{padding-left:4px;gap:2px}
  .qm2 .qangan{left:4px;font-size:12.5px}
}
`;

const ORDER = [4, 9, 2, 3, 5, 7, 8, 1, 6];

function el(title, text, inner, cls = '') {
  return `<span class="qel qm-el ${cls}" data-t="${esc(title)}" data-x="${esc(text)}">${inner}</span>`;
}

const markHtml = (marks) => (list(marks).length
  ? `<i class="mk qm-el" data-t="年月日时干标记：${esc(list(marks).join(''))}" data-x="该干与本局四柱的年干/月干/日干/时干相同，称为「同干」，常用于定位用神宫与事应时间。">${esc(list(marks).join(''))}</i>`
  : '');

function renderAnGan(p) {
  if (!p.anGan) return '';
  return el(
    `${p.name}宫暗干（隐干）「${p.anGan}」`,
    `${GAN_INFO[p.anGan]?.text || ''}\n起法：时干入值使门落宫（若与地盘干同则入中五宫），按阳顺阴逆沿洛书九宫飞布。暗干主隐藏之人事机兆。`,
    `<span style="color:${elColor(GAN_INFO[p.anGan]?.wx)}">${esc(p.anGan)}</span>`,
    'qangan'
  );
}

export function renderQimen(f) {
  const find = (id) => list(f.palaces).find((p) => p.id === id);

  const cells = ORDER.map((id) => {
    const p = find(id);
    if (!p) return '<div class="qp"></div>';

    const ruMuGanName = p.ruMuGan || p.tianPan || '';
    const tagDefs = [];
    if (p.isZhiFu) tagDefs.push(['v', '符', '值符宫', HEAD_INFO.值符]);
    if (p.isZhiShi) tagDefs.push(['v', '使', '值使宫', HEAD_INFO.值使]);
    if (p.kongWang) tagDefs.push(['k', '空', '时空亡', SIHAI_INFO.空亡]);
    if (p.dayKongWang) tagDefs.push(['d', '日', '日空亡', '日柱旬空落此宫，同主力量减弱，其应稍缓。']);
    if (p.maXing) tagDefs.push(['m', HORSE_SVG, '驿马星', HEAD_INFO.马星]);
    if (p.jiXing) tagDefs.push(['x', '刑', `六仪击刑（${p.tianPan || ''}落${p.name || ''}宫）`, SIHAI_INFO.击刑]);
    if (p.ruMu) tagDefs.push(['x', '墓', `奇仪入墓（${ruMuGanName}入${p.name || ''}宫墓库）`, SIHAI_INFO.入墓]);
    if (p.menPo) tagDefs.push(['p', '迫', `门迫（${p.door || ''}属${DOOR_WX[p.door] || ''}克${p.name || ''}宫${PALACE_WX[p.id]}）`, SIHAI_INFO.门迫]);
    const tags = tagDefs.map(([cls, label, t, x]) =>
      `<i class="qm-el ${cls}" data-t="${esc(t)}" data-x="${esc(x)}" title="${esc(t)}">${label}</i>`).join('');

    const sihaiTexts = [];
    if (p.kongWang) sihaiTexts.push(['空亡', SIHAI_INFO.空亡]);
    if (p.dayKongWang) sihaiTexts.push(['日空亡', '日柱旬空落此宫，同主力量减弱，其应稍缓。']);
    if (p.jiXing) sihaiTexts.push([`击刑（${p.tianPan}落${p.name}宫）`, SIHAI_INFO.击刑]);
    if (p.ruMu) sihaiTexts.push([`入墓（${ruMuGanName}入${p.name}宫墓库）`, SIHAI_INFO.入墓]);
    if (p.menPo) sihaiTexts.push([`门迫（${p.door}属${DOOR_WX[p.door]}克${p.name}宫${PALACE_WX[p.id]}）`, SIHAI_INFO.门迫]);

    const starInfo = STAR_INFO[p.star] || {};
    const doorInfo = DOOR_INFO[p.door] || {};
    const shenInfo = SHEN_INFO[p.shen] || {};
    const combo = comboOf(p.tianPan, p.diPan);
    const patSummary = list(p.patterns).map((pt) => `【${pt.name}·${pt.type}】${pt.desc}`).join(' ');
    const tianText = `${GAN_INFO[p.tianPan]?.text || ''}${combo ? `〔克应〕${combo}` : ''}${patSummary ? `\n${patSummary}` : ''}`;
    const csInfo = p.changsheng ? `${p.changsheng}｜${CHANG12_INFO[p.changsheng] || ''}` : '';

    const palaceWx = PALACE_WX[p.id];
    const headTitle = `${p.id}·${p.name}宫（${p.direction}）　地支：${esc(list(p.zhi).join('、'))}　暗干：${esc(p.anGan || '—')}`;
    const headText = `坎一、坤二、震三、巽四、中五、乾六、兑七、艮八、离九——洛书九宫配后天八卦，${p.name}宫属${palaceWx}，居${p.direction}方。${sihaiTexts.length ? '　本宫标记：' + sihaiTexts.map(([t]) => t).join('、') : ''}${patSummary ? '　本宫格局：' + patSummary : ''}`;

    if (p.isMiddle) {
      const midTarget = p.jiGongTarget || '坤';
      const midTian = p.tianPan
        ? el(`中宫天盘干「${esc(p.tianPan)}」`, `${GAN_INFO[p.tianPan]?.text || ''}　飞盘奇门中五宫天盘之干。`,
            `<b style="color:${elColor(GAN_INFO[p.tianPan]?.wx || '')}">${esc(p.tianPan)}</b>${markHtml(p.tianMarks)}`, 'qgan ti')
        : el('中宫天盘随寄', `转盘奇门中五宫天禽星与天干「${p.diPan || ''}」随寄于${midTarget}宫。`, '<span class="qdash">—</span>', 'qgan ti');
      return `<div class="qp mid${p.isZhiFu ? ' vf' : ''}${p.isZhiShi ? ' shi' : ''}">
        <div class="qh">${el('5·中宫（太极中枢）',
          `中五宫属中央戊己土，转盘奇门天禽星与地盘干「${p.diPan || ''}」寄于${midTarget}宫；左侧为中宫暗干「${p.anGan || ''}」。`,
          `<span class="qn"><i class="id">5</i><span class="pn">中</span><span class="dir">寄${esc(midTarget)}</span></span>`)}
          <span class="qtag">${tags}</span></div>
        <div class="qr">${el('中宫八神', `中五宫随${midTarget}宫论八神。`, '<span class="qdash">—</span>')}</div>
        <div class="qr">${renderAnGan(p)}${el(`九星「${esc(p.star || '天禽')}」`, `${starInfo.text || '天禽星：中宫之主星，五行属土。'}`,
          `<span class="qstar">${esc(p.star || '天禽')}</span>`)}</div>
        <div class="qg">
          <div class="qgan-line">${midTian}</div>
          <div class="qgan-line">${el(`中宫地盘干「${esc(p.diPan || '—')}」（寄${midTarget}宫）`, `${GAN_INFO[p.diPan]?.text || ''}　中五宫地盘之干，转盘寄于${midTarget}宫。`,
            `<b style="color:${elColor(GAN_INFO[p.diPan]?.wx || '')}">${esc(p.diPan || '—')}</b>${markHtml(p.diMarks)}`, 'qgan di')}</div>
        </div>
        <div class="qr qdoor-row">${el('中宫无八门', '中五宫不入八门排布。', '<span class="qdash qd">—</span>')}</div>
      </div>`;
    }

    const firstPat = list(p.patterns)[0];
    const patBadge = firstPat
      ? `<u class="qpat ${firstPat.type === '吉' ? 'good' : 'bad'} qm-el" data-t="格局「${esc(firstPat.name)}」（${esc(firstPat.type)}）" data-x="${esc(firstPat.desc)}">${esc(firstPat.name.slice(0, 4))}</u>`
      : '';

    // 天盘寄干（对标热卜：天芮天禽同宫时，展示「丁戊」双干，寄干在前或并列）
    const tianJiPrefix = (p.tianJiGan && p.tianJiGan !== p.tianPan)
      ? `<b class="jigan" style="color:${elColor(GAN_INFO[p.tianJiGan]?.wx || '')}" title="中五天禽随寄天盘干：${esc(p.tianJiGan)}">${esc(p.tianJiGan)}</b>`
      : '';

    // 地盘寄干（对标热卜：寄宫如坤二宫地盘展示「丁戊」双干）
    const diJiPrefix = (p.diJiGan && p.diJiGan !== p.diPan)
      ? `<b class="jigan" style="color:${elColor(GAN_INFO[p.diJiGan]?.wx || '')}" title="中五宫寄${esc(p.name)}宫地盘干：${esc(p.diJiGan)}">${esc(p.diJiGan)}</b>`
      : '';

    // 对标热卜：天芮与天禽同宫简写为「芮禽」（天任与天禽同宫简写为「任禽」）
    const starDispName = p.jiStar
      ? (p.star === '天芮' ? '芮禽' : p.star === '天任' ? '任禽' : `${p.star}·禽`)
      : (p.star || '—');

    return `<div class="qp${p.kongWang ? ' kw' : ''}${p.isZhiFu ? ' vf' : ''}${p.isZhiShi ? ' shi' : ''}">
      <div class="qh">
        ${el(headTitle, headText,
          `<span class="qn"><i class="id">${p.id}</i><span class="pn">${esc(p.name)}</span><span class="dir">${esc(p.direction)}</span></span>`)}
        <span class="qtag">${tags}</span>
      </div>
      <div class="qr">${el(`八神「${esc(p.shen || '—')}」`, shenInfo.text || '',
        esc(p.shen || '—'), 'qs')}</div>
      <div class="qr">${renderAnGan(p)}${el(`九星「${esc(p.star || '—')}${p.jiStar ? '·天禽' : ''}」`, `${starInfo.text || ''}${p.jiStar ? '\n〔天禽同宫〕中五宫天禽星随寄本宫，故合称「' + starDispName + '」。' : ''}${csInfo ? `　〔落宫状态〕${csInfo}` : ''}`,
        `<span>${esc(starDispName)}</span>`, 'qstar')}</div>
      <div class="qg">
        <div class="qgan-line">
          ${el(`天盘干「${esc(p.tianJiGan ? `${p.tianJiGan}${p.tianPan}` : (p.tianPan || '—'))}」加${esc(p.name)}宫`, tianText + (p.tianJiGan ? `\n〔中五寄干〕天禽携「${p.tianJiGan}」同落${p.name}宫（长生：${p.tianJiCs || '—'}）。` : ''),
            tianJiPrefix
            + `<b style="color:${elColor(GAN_INFO[p.tianPan]?.wx || '')}">${esc(p.tianPan || '—')}</b>`
            + markHtml(p.tianMarks)
            + (p.changsheng ? `<u class="qcs qm-el" data-t="十二长生「${esc(p.changsheng)}」" data-x="${esc(p.changsheng)}：${esc(CHANG12_INFO[p.changsheng] || '')}（以天盘干对本宫地支而言）">${esc(p.changsheng)}</u>` : ''),
            'qgan ti')}
        </div>
        <div class="qgan-line">
          ${el(`地盘干「${esc(p.diJiGan ? `${p.diJiGan}${p.diPan}` : (p.diPan || '—'))}」（${esc(p.name)}宫地盘之干）`, (GAN_INFO[p.diPan]?.text || '') + (p.diJiGan ? `\n〔中五寄干〕中五宫之「${p.diJiGan}」寄于${p.name}宫地盘。` : ''),
            diJiPrefix
            + `<b style="color:${elColor(GAN_INFO[p.diPan]?.wx || '')}">${esc(p.diPan || '—')}</b>`
            + markHtml(p.diMarks)
            + patBadge,
            'qgan di')}
        </div>
      </div>
      <div class="qr qdoor-row">${el(`八门「${esc(p.door || '—')}」`, `${doorInfo.text || ''}${p.menPo ? '　〔当前门迫，力量受损〕' : ''}`,
        `<span>${esc(p.door || '—')}</span>${p.menPo ? '<i class="qpo">迫</i>' : ''}`, 'qd')}</div>
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

  const fp = f.fourPillars || {};
  const LABELS = [['year', '年'], ['month', '月'], ['day', '日'], ['hour', '时']];
  const colGz = LABELS.map(([k, lab]) => {
    const p = fp[k];
    if (!p) return `<div class="rc vcol"><span class="gan">—</span><span class="zhi">—</span></div>`;
    return `<div class="rc vcol">
      <span class="gan qm-el" data-t="年月日时干「${esc(p.gan)}」（${lab}柱天干）" data-x="${esc(GAN_INFO[p.gan]?.text || '')}" style="color:${elColor(GAN_INFO[p.gan]?.wx)}">${esc(p.gan)}</span>
      <span class="zhi qm-el" data-t="地支「${esc(p.zhi)}」（${lab}柱地支）" data-x="${esc(ZHI_INFO[p.zhi] || '')}" style="color:${elColor(ZHI_EL[p.zhi])}">${esc(p.zhi)}</span>
    </div>`;
  }).join('');
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
    const title = p ? `${lab}柱旬空：${esc(p.xunkong)}` : '';
    return `<div class="rc" ${title ? `title="${esc(title)}"` : ''}><span class="xk">${esc(p?.xunkong || '—')}</span></div>`;
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
    <i>盘式 <b>${esc(f.panMethod === 'fei' ? '飞盘（九宫飞布）' : '转盘')}</b></i>
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
    <span><i class="x">墓</i>奇仪入墓</span>
    <span><i class="p">迫</i>门迫</span>
  </div>`;

  const allPats = list(f.patterns);
  const patBarHtml = allPats.length
    ? `<div class="pat-bar"><b>格局</b>${allPats.map((pt) =>
        `<span class="pat-chip ${pt.type === '吉' ? 'good' : 'bad'} qm-el" data-t="奇门${esc(pt.type)}格「${esc(pt.name)}」（${esc(pt.palaceName || '全局')}）" data-x="${esc(pt.desc)}">${esc(pt.name)}·${esc(pt.palaceName || '全局')}</span>`
      ).join('')}</div>`
    : '';

  return `<style class="qm2-style">${CSS}</style><div class="qm2">
    <div class="hd">
      <div class="hd-top">
        <div class="t">${esc(f.juName)}</div>
        <div class="hd-stems"><span class="lab">四干</span>${fpStems}</div>
      </div>
      <div class="b">${headRow}</div>
      ${f.question ? `<div class="qm-q"><b>所问事项</b><span>${esc(f.question)}</span></div>` : ''}
    </div>
    ${szTable}
    ${methChips}
    <div class="g9">${cells}</div>
    ${legend}
    <div class="ft">
      <div class="adv">
        ${f.question ? `<div><b>所问</b> ${esc(f.question)}（事由分类：${esc(f.purpose ? f.purpose.name : '通用')}）</div>` : ''}
        <div><b>用神</b> ${esc(f.purpose ? f.purpose.name : '通用')}：${esc(f.purpose ? f.purpose.note : '')}</div>
        <div><b>吉方</b> ${esc(fav.palaceName || '—')}宫（${esc(fav.direction || '—')}方）· ${esc(fav.door || '—')} · ${esc(fav.star || '—')}　评分 ${fav.score ?? '—'}</div>
        ${patBarHtml}
        ${top ? `<div class="why">次选：${esc(top)}</div>` : ''}
        <div class="why">盘面读法：每宫自上而下为 宫位头 → 八神 → 暗干（左）＋九星（中，天芮天禽同宫作「芮禽」） → 天盘干／地盘干（含中五寄干，如丁戊） → 八门（右下）；任一符号可点击查看解释。</div>
      </div>
    </div>
  </div>`;
}
