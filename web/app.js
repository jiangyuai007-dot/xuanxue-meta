'use strict';

/**
 * 玄机前端逻辑 —— 单页单系统模式
 * 八字/六爻/奇门/紫微各自独立页面（bazi.html / liuyao.html / qimen.html / ziwei.html），
 * 本脚本按 <body data-sys> 识别当前体系；只读当前页面存在的表单元素（全部判空）。
 */

const $ = (id) => document.getElementById(id);
const CURRENT_SYS = document.body.dataset.sys || 'bazi';
let currentInput = null;
let currentFactPackId = null;
let currentReportToken = ''; // 报告页/分享卡访问令牌（服务端签发，10 分钟有效）
let currentData = null;
let currentFacts = null;
let currentPaySpec = null;

const SYS_META = {
  bazi: { name: '八字命盘' },
  liuyao: { name: '六爻占卜' },
  qimen: { name: '奇门遁甲' },
  ziwei: { name: '紫微斗数' },
};

// ---------------------------------------------------------------- 档案

const PROFILE_KEY = 'xuanxue.profiles';

function loadProfiles() {
  try {
    const v = JSON.parse(localStorage.getItem(PROFILE_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveProfiles(list) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式下可能不可写，忽略 */
  }
}

function profileLabel(p) {
  const g = p.input.gender ? (p.input.gender === 'male' ? '男' : '女') : '';
  const t = `${p.input.year}-${String(p.input.month).padStart(2, '0')}-${String(p.input.day).padStart(2, '0')} ${String(p.input.hour).padStart(2, '0')}:${String(p.input.minute).padStart(2, '0')}`;
  return { title: t, meta: `${SYS_META[p.system]?.name || p.system}　${g}　${p.input.city || ''}` };
}

function renderProfiles() {
  const box = $('profileList');
  if (!box) return;
  const list = loadProfiles().filter((p) => p.system === CURRENT_SYS);
  if (!list.length) {
    box.innerHTML = '<p class="rail-note" style="margin:0">暂无档案。排盘后点「保存当前」即可留存。</p>';
    return;
  }
  box.innerHTML = list.map((p) => {
    const l = profileLabel(p);
    return `<div class="profile-item" data-id="${p.id}">
      <button class="del" data-del="${p.id}" title="删除">×</button>
      <div class="pn">${escapeHtml(l.title)}</div>
      <div class="pm">${escapeHtml(l.meta)}</div>
    </div>`;
  }).join('');

  box.querySelectorAll('.profile-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.del) return;
      applyProfile(el.dataset.id);
    });
  });
  box.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveProfiles(loadProfiles().filter((p) => p.id !== btn.dataset.del));
      renderProfiles();
    });
  });
}

function saveCurrentProfile() {
  const input = collectInput();
  const list = loadProfiles();
  const dup = list.find((p) => p.system === input.type && JSON.stringify(p.input) === JSON.stringify(input));
  if (dup) {
    msg('该档案已在列表中');
    return;
  }
  list.unshift({ id: 'p' + Date.now(), system: input.type, input, savedAt: new Date().toISOString() });
  saveProfiles(list.slice(0, 20));
  renderProfiles();
  msg('已保存到「我的档案」');
}

function applyProfile(id) {
  const p = loadProfiles().find((x) => x.id === id);
  if (!p) return;
  const i = p.input;
  const set = (eid, v) => { const e = $(eid); if (e && v !== undefined) e.value = v; };
  set('year', i.year); set('month', i.month); set('day', i.day);
  set('hour', i.hour); set('minute', i.minute);
  set('city', i.city || '北京');
  if (i.gender) set('gender', i.gender);
  if (i.calendar) {
    set('calendar', i.calendar);
    if ($('leap-wrap')) $('leap-wrap').style.display = i.calendar === 'lunar' ? '' : 'none';
  }
  if ($('isLeap')) $('isLeap').checked = !!i.isLeapMonth;
  if (i.method) set('method', i.method);
  if (Array.isArray(i.numbers)) {
    set('n1', i.numbers[0]); set('n2', i.numbers[1]);
    set('m1', i.numbers[0]); set('m2', i.numbers[1]); set('m3', i.numbers[2] !== undefined ? i.numbers[2] : 1);
  }
  if (i.guaName) { set('guaName', i.guaName); set('bianGuaName', i.bianGuaName || i.guaName); }
  if (i.question !== undefined) set('question', i.question);
  if (i.purpose) set('purpose', i.purpose);
  syncMethodUi();
  msg('已载入档案，正在排盘…');
  runPaipan();
}

// ---------------------------------------------------------------- 已购（按档案维度持久化于本机，与合盘页统一 Array Schema）

const PURCHASE_KEY = 'xuanxue.purchases';

function normalizePurchases(raw) {
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === 'object');
  if (raw && typeof raw === 'object') {
    const migrated = [];
    const ents = Array.isArray(raw.entitlements) ? raw.entitlements.filter(Boolean) : [];
    for (const [sys, val] of Object.entries(raw)) {
      if (sys === 'entitlements' || !Array.isArray(val) || !val.length) continue;
      migrated.push({
        skuId: `${sys}_migrated`,
        skuName: '已解锁章节',
        system: sys,
        sectionKeys: val.filter((k) => typeof k === 'string'),
        amount: 0,
        paidAt: new Date().toISOString(),
        entitlement: ents[0] || null,
      });
    }
    for (let i = migrated.length ? 1 : 0; i < ents.length; i++) {
      migrated.push({
        skuId: 'entitlement_migrated',
        skuName: '已购凭证',
        system: 'hepan',
        sectionKeys: [],
        amount: 0,
        paidAt: new Date().toISOString(),
        entitlement: ents[i],
      });
    }
    return migrated;
  }
  return [];
}

function loadPurchases() {
  try {
    const raw = JSON.parse(localStorage.getItem(PURCHASE_KEY));
    const list = normalizePurchases(raw);
    if (raw && !Array.isArray(raw) && typeof raw === 'object') {
      savePurchases(list);
    }
    return list;
  } catch {
    return [];
  }
}
function savePurchases(list) {
  try {
    localStorage.setItem(PURCHASE_KEY, JSON.stringify(normalizePurchases(list)));
  } catch {
    /* 隐私模式下可能不可写，忽略 */
  }
}

function addPurchase(rec) {
  const list = loadPurchases();
  if (rec.entitlement) {
    if (!list.some((p) => p.entitlement === rec.entitlement)) list.unshift(rec);
    savePurchases(list.slice(0, 50));
    return;
  }
  const dup = list.find(
    (p) => p.skuId === rec.skuId && p.system === rec.system &&
      JSON.stringify(p.sectionKeys) === JSON.stringify(rec.sectionKeys)
  );
  if (!dup) list.unshift(rec);
  savePurchases(list.slice(0, 50));
}
function entitlementsForRequest() {
  return [...new Set(loadPurchases().map((p) => p.entitlement).filter(Boolean))];
}
function purchasedKeysForCurrentSystem() {
  const sys = CURRENT_SYS;
  const set = new Set();
  for (const p of loadPurchases()) {
    if (p.system === sys && Array.isArray(p.sectionKeys)) p.sectionKeys.forEach((k) => set.add(k));
  }
  return [...set];
}

// ---------------------------------------------------------------- 表单

function setNow() {
  const d = new Date();
  const set = (eid, v) => { const e = $(eid); if (e) e.value = v; };
  set('year', d.getFullYear());
  set('month', d.getMonth() + 1);
  set('day', d.getDate());
  set('hour', d.getHours());
  set('minute', d.getMinutes());
}

function syncMethodUi() {
  if (!$('method')) return;
  const m = $('method').value;
  const show = (id, on) => { const e = $(id); if (e) e.style.display = on ? '' : 'none'; };
  show('numWrap', m === 'number');
  show('numWrap2', m === 'number2');
  show('coinWrap', m === 'coin');
  show('manualWrap', m === 'manual');
  show('nameWrap', m === 'name');
  if ($('methodSeg')) {
    $('methodSeg').querySelectorAll('button[data-v]').forEach((b) => {
      b.classList.toggle('on', b.dataset.v === m);
    });
    const timeMode = m === 'time' || m === 'auto';
    if ($('row-datetime')) $('row-datetime').style.display = m === 'auto' ? 'none' : '';
    if ($('row-liuyao')) $('row-liuyao').style.display = timeMode ? 'none' : '';
    const ctxLabel = $('methodCtxLabel');
    if (ctxLabel) {
      ctxLabel.textContent = {
        number: '两数参数', number2: '三数参数', coin: '在线摇卦',
        manual: '手动指定六爻', name: '选定卦名',
      }[m] || '起卦参数';
    }
  }
  const tips = {
    time: '以当前时间起卦，可在上方修改时间；动爻由年月日时派生，0~6 爻不定',
    number: '上卦取前数 %8、下卦取后数 %8，动爻由两数派生（可多爻齐动）',
    number2: '前两数定上下卦，第三数参入派生动爻（可多爻齐动）',
    coin: '点击铜钱摇出一爻，共摇六次（由下而上）；每爻三枚铜钱定阴阳动静',
    manual: '直接指定六爻的阴阳，装卦成静卦',
    name: '由上卦（外卦）+ 下卦（内卦）八纯卦叠加成卦；勾选「选变卦」可继续指定变卦上下卦',
    auto: '由系统随机摇出六爻（等同铜钱法）',
  };
  if ($('methodTip')) $('methodTip').textContent = tips[m] || '';
  if (m === 'manual') buildManualYaos();
  if (m === 'name' && $('guaName') && !$('guaName').dataset.built) buildGuaNameSelect();
  refreshCoinPaipanState();
}

const coinState = { lines: [], spinning: false };
const COIN_POS = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

function coinResultName(v) {
  return { 9: '老阳 ○（动）', 7: '少阳 ⚊', 8: '少阴 ⚋', 6: '老阴 ×（动）' }[v] || String(v);
}

function castOneYao() {
  if (coinState.spinning) return;
  if (coinState.lines.length >= 6) return;
  coinState.spinning = true;
  if (typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate([35, 40, 55]); } catch {} }
  const coins = document.querySelectorAll('#coinCoins .coin');
  coins.forEach((c) => c.classList.add('spin'));
  if ($('coinStatus')) $('coinStatus').textContent = '铜钱旋转中…';
  setTimeout(() => {
    const heads = (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1);
    const v = heads + 6;
    coinState.lines.push(v);
    coins.forEach((c) => c.classList.remove('spin'));
    const idx = coinState.lines.length;
    if ($('coinLines')) {
      const span = document.createElement('span');
      span.className = 'coin-yao' + (v === 6 || v === 9 ? ' dong' : '');
      span.innerHTML = `<i>${COIN_POS[idx - 1]}</i><b>${coinResultName(v)}</b>`;
      $('coinLines').appendChild(span);
    }
    if (idx >= 6) {
      if ($('coinStatus')) $('coinStatus').textContent = '六爻摇毕，点击「起卦排盘」装卦。';
      if ($('btnCoinReset')) $('btnCoinReset').style.display = '';
      refreshCoinPaipanState();
    } else if ($('coinStatus')) {
      $('coinStatus').textContent = `已得第 ${idx} 爻，再点铜钱摇第 ${idx + 1} 爻（${COIN_POS[idx]}）`;
    }
    coinState.spinning = false;
  }, 750);
}

function resetCoin() {
  coinState.lines = [];
  coinState.spinning = false;
  if ($('coinLines')) $('coinLines').innerHTML = '';
  if ($('btnCoinReset')) $('btnCoinReset').style.display = 'none';
  if ($('coinStatus')) $('coinStatus').textContent = '集中精神默想所占之事，点击铜钱开始摇卦（共六爻，由下而上）';
  refreshCoinPaipanState();
}

function coinValidationError() {
  if (CURRENT_SYS !== 'liuyao') return null;
  const m = $('method') ? $('method').value : 'time';
  if (m !== 'coin') return null;
  if (coinState.lines.length < 6) {
    return `在线摇卦需先摇满六爻（当前 ${coinState.lines.length}/6）。请逐爻点击铜钱摇出全部六爻后，再点「起卦排盘」。`;
  }
  return null;
}

function refreshCoinPaipanState() {
  if (CURRENT_SYS !== 'liuyao') return;
  const m = $('method') ? $('method').value : 'time';
  const blocked = (m === 'coin' && coinState.lines.length < 6);
  ['btnPaipan', 'btnReport'].forEach((id) => {
    const b = $(id);
    if (b) b.disabled = blocked;
  });
}

const manualState = [7, 7, 7, 7, 7, 7];
const MANUAL_CYCLE = { 7: 9, 9: 8, 8: 6, 6: 7 };
function buildManualYaos() {
  if (!$('manualYaos') || $('manualYaos').dataset.built) return;
  $('manualYaos').dataset.built = '1';
  renderManualYaos();
}
function renderManualYaos() {
  if (!$('manualYaos')) return;
  const pos = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
  const info = {
    7: { bar: '━━━━━', mark: '', name: '少阳·静', cls: 'sy' },
    9: { bar: '━━━━━', mark: '○', name: '老阳·动', cls: 'dy' },
    8: { bar: '━━ ━━', mark: '', name: '少阴·静', cls: '' },
    6: { bar: '━━ ━━', mark: '×', name: '老阴·动', cls: 'dy' },
  };
  $('manualYaos').innerHTML = manualState
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.i - a.i)
    .map(({ v, i }) => {
      const it = info[v];
      return `<button type="button" class="manual-yao ${it.cls}" data-i="${i}" title="点击切换 静/动、阴/阳">
        <span class="my-bar">${it.bar}${it.mark ? `<span class="my-mark">${it.mark}</span>` : ''}</span>
        <i>${pos[i]} · ${it.name}</i>
      </button>`;
    }).join('');
  $('manualYaos').querySelectorAll('.manual-yao').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      manualState[i] = MANUAL_CYCLE[manualState[i]] || 7;
      renderManualYaos();
    });
  });
}

const GUA64 = [
  '乾为天', '天泽履', '天火同人', '天雷无妄', '天风姤', '天水讼', '天山遁', '天地否',
  '泽天夬', '兑为泽', '泽火革', '泽雷随', '泽风大过', '泽水困', '泽山咸', '泽地萃',
  '火天大有', '火泽睽', '离为火', '火雷噬嗑', '火风鼎', '火水未济', '火山旅', '火地晋',
  '雷天大壮', '雷泽归妹', '雷火丰', '震为雷', '雷风恒', '雷水解', '雷山小过', '雷地豫',
  '风天小畜', '风泽中孚', '风火家人', '风雷益', '巽为风', '风水涣', '风山渐', '风地观',
  '水天需', '水泽节', '水火既济', '水雷屯', '水风井', '坎为水', '水山蹇', '水地比',
  '山天大畜', '山泽损', '山火贲', '山雷颐', '山风蛊', '山水蒙', '艮为山', '山地剥',
  '地天泰', '地泽临', '地火明夷', '地雷复', '地风升', '地水师', '地山谦', '坤为地',
];
const GUA_BY_TRIGRAM = {
  乾: { 乾: "乾为天", 兑: "天泽履", 离: "天火同人", 震: "天雷无妄", 巽: "天风姤", 坎: "天水讼", 艮: "天山遁", 坤: "天地否" },
  兑: { 乾: "泽天夬", 兑: "兑为泽", 离: "泽火革", 震: "泽雷随", 巽: "泽风大过", 坎: "泽水困", 艮: "泽山咸", 坤: "泽地萃" },
  离: { 乾: "火天大有", 兑: "火泽睽", 离: "离为火", 震: "火雷噬嗑", 巽: "火风鼎", 坎: "火水未济", 艮: "火山旅", 坤: "火地晋" },
  震: { 乾: "雷天大壮", 兑: "雷泽归妹", 离: "雷火丰", 震: "震为雷", 巽: "雷风恒", 坎: "雷水解", 艮: "雷山小过", 坤: "雷地豫" },
  巽: { 乾: "风天小畜", 兑: "风泽中孚", 离: "风火家人", 震: "风雷益", 巽: "巽为风", 坎: "风水涣", 艮: "风山渐", 坤: "风地观" },
  坎: { 乾: "水天需", 兑: "水泽节", 离: "水火既济", 震: "水雷屯", 巽: "水风井", 坎: "坎为水", 艮: "水山蹇", 坤: "水地比" },
  艮: { 乾: "山天大畜", 兑: "山泽损", 离: "山火贲", 震: "山雷颐", 巽: "山风蛊", 坎: "山水蒙", 艮: "艮为山", 坤: "山地剥" },
  坤: { 乾: "地天泰", 兑: "地泽临", 离: "地火明夷", 震: "地雷复", 巽: "地风升", 坎: "地水师", 艮: "地山谦", 坤: "坤为地" },
};
function syncTrigramGuaUi() {
  const bUp = $("benUp") ? $("benUp").value : "乾";
  const bLow = $("benLow") ? $("benLow").value : "乾";
  const benName = (GUA_BY_TRIGRAM[bUp] && GUA_BY_TRIGRAM[bUp][bLow]) || "乾为天";
  if ($("benGuaPreview")) $("benGuaPreview").textContent = "→ " + benName;
  if ($("guaName")) $("guaName").value = benName;
  const hasBian = $("hasBianGua") ? $("hasBianGua").checked : false;
  if ($("bianGuaGroup")) $("bianGuaGroup").style.display = hasBian ? "inline-flex" : "none";
  const yUp = $("bianUp") ? $("bianUp").value : bUp;
  const yLow = $("bianLow") ? $("bianLow").value : bLow;
  const bianName = hasBian ? ((GUA_BY_TRIGRAM[yUp] && GUA_BY_TRIGRAM[yUp][yLow]) || benName) : benName;
  if ($("bianGuaPreview")) $("bianGuaPreview").textContent = "→ " + bianName;
  if ($("bianGuaName")) $("bianGuaName").value = bianName;
}
function buildGuaNameSelect() {
  if ($("guaName") && !$("guaName").dataset.built) {
    $("guaName").innerHTML = GUA64.map((n) => `<option value="${n}">${n}</option>`).join("");
    $("guaName").dataset.built = "1";
  }
  if ($("bianGuaName") && !$("bianGuaName").dataset.built) {
    $("bianGuaName").innerHTML = GUA64.map((n) => `<option value="${n}">${n}</option>`).join("");
    $("bianGuaName").dataset.built = "1";
  }
  ["benUp", "benLow", "hasBianGua", "bianUp", "bianLow"].forEach((id) => {
    const el = $(id);
    if (el && !el.dataset.bound) {
      el.dataset.bound = "1";
      el.addEventListener("change", syncTrigramGuaUi);
    }
  });
  syncTrigramGuaUi();
}

function resetResult() {
  $('sections').innerHTML = '';
  $('sku').style.display = 'none';
  $('chart').style.display = 'none';
  $('chart').innerHTML = '';
  if ($('reportBody')) {
    $('reportBody').innerHTML = '';
    $('reportBody').style.display = 'none';
  }
  $('resultHead').style.display = 'none';
  $('warnings').style.display = 'none';
  $('intro').style.display = '';
  $('railEmpty').style.display = '';
  $('reportSrc').textContent = '';
  $('btnHtml').disabled = true;
  $('btnCard').disabled = true;
  if ($('btnSaveReport')) $('btnSaveReport').disabled = true;
  msg('');
}

function enableSaveReport() {
  const b = $('btnSaveReport');
  if (b) b.disabled = !(currentInput && !b.dataset.busy);
}

async function saveToMyReports() {
  const b = $('btnSaveReport');
  if (!b || b.dataset.busy) return;
  if (!currentInput) { msg('请先排盘', true); return; }
  const facts = currentFacts || {};
  let title = '';
  let subtitle = '';
  try {
    if (CURRENT_SYS === 'bazi') {
      title = (facts.fourPillars && facts.fourPillars.year ? facts.fourPillars.year.name : '') + '年八字';
      subtitle = facts.city || '';
    } else if (CURRENT_SYS === 'ziwei') {
      title = (facts.mingGong ? facts.mingGong.zhi : '') + '命宫紫微';
      subtitle = facts.city || '';
    } else if (CURRENT_SYS === 'liuyao') {
      title = (facts.benGua && facts.benGua.name ? facts.benGua.name : '') + '卦';
      subtitle = currentInput.question || '';
    } else if (CURRENT_SYS === 'qimen') {
      title = (facts.juName ? facts.juName : '') + '奇门';
      subtitle = currentInput.question || '';
    }
  } catch { /* ignore */ }
  b.dataset.busy = '1';
  b.disabled = true;
  const old = b.textContent;
  b.textContent = '保存中…';
  try {
    const r = await window.CloudHistory.saveReport({
      system: CURRENT_SYS,
      title,
      subtitle,
      payload: currentInput,
    });
    delete b.dataset.busy;
    b.textContent = old;
    msg(`已保存到我的报告（${r.updated ? '更新原有记录' : '新记录'}）`);
    enableSaveReport();
  } catch (e) {
    delete b.dataset.busy;
    b.textContent = old;
    enableSaveReport();
    msg(e && e.message ? e.message : '保存失败', true);
  }
}

function collectInput() {
  const num = (id, fb) => { const e = $(id); return e && e.value !== '' ? Number(e.value) : fb; };
  const val = (id, fb) => { const e = $(id); return e ? e.value : fb; };
  const base = {
    type: CURRENT_SYS,
    year: num('year', 1990),
    month: num('month', 1),
    day: num('day', 1),
    hour: num('hour', 12),
    minute: num('minute', 0),
    city: val('city', '北京') || '北京',
    useTrueSolarTime: $('useSolar') ? $('useSolar').checked : true,
  };
  if (CURRENT_SYS === 'bazi' || CURRENT_SYS === 'ziwei') {
    base.calendar = val('calendar', 'gregorian');
    base.gender = val('gender', 'male');
    if (base.calendar === 'lunar' && $('isLeap')) base.isLeapMonth = $('isLeap').checked;
  } else if (CURRENT_SYS === 'liuyao') {
    base.method = val('method', 'time');
    base.question = val('question', '');
    base.category = val('category', 'general');
    if (base.method === 'number') base.numbers = [Number(val('n1', 0)), Number(val('n2', 0))];
    else if (base.method === 'number2') base.numbers = [Number(val('m1', 0)), Number(val('m2', 0)), Number(val('m3', 1))];
    else if (base.method === 'coin') {
      base.lines = coinState.lines.slice();
    } else if (base.method === 'auto') {
      const lines = [];
      while (lines.length < 6) {
        const heads = (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1);
        lines.push(heads + 6);
      }
      base.lines = lines;
    } else if (base.method === 'manual') base.lines = manualState.slice();
    else if (base.method === 'name') {
      syncTrigramGuaUi();
      base.guaName = val('guaName', '乾为天');
      base.bianGuaName = ($('hasBianGua') && $('hasBianGua').checked) ? (val('bianGuaName', '') || base.guaName) : base.guaName;
    }
  } else if (CURRENT_SYS === 'qimen') {
    base.purpose = val('purpose', 'general');
    base.panType = val('panType', 'zhuan');
    base.jiGong = val('jiGong', 'kun2');
    base.juMethod = val('juMethod', 'chaibu');
    if (base.juMethod === 'custom') { base.customJu = Number(val('customJu', 1)); base.customYinYang = val('customYinYang', 'yang'); }
    base.useTrueSolarTime = $('useSolar') ? $('useSolar').checked : true;
  }
  return base;
}

// ---------------------------------------------------------------- 通用

async function api(path, body, method = 'POST', timeoutMs = 30000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
      signal: ac.signal,
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || '请求失败');
    return data;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('请求超时，请稍后重试');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function msg(text, isErr) {
  const el = $('msg');
  el.textContent = text || '';
  el.className = 'msg' + (isErr ? ' err' : '');
}

function friendlyError(e) {
  const m = (e && e.message) || '';
  if (/fetch|Failed to fetch|NetworkError|ECONNREFUSED|network|abort/i.test(m)) {
    return '服务未连接：本地服务已停止。请双击 start-server.bat 启动，或让助手帮你拉起后再试。';
  }
  return m;
}

async function checkService() {
  const dot = $('svcDot');
  const txt = $('svcTxt');
  const b = $('svcBanner');
  try {
    const r = await fetch('/api/health', { method: 'GET' });
    if (!r.ok) throw new Error('bad');
    dot.classList.remove('down');
    txt.textContent = '本地服务正常';
    b.style.display = 'none';
  } catch {
    dot.classList.add('down');
    txt.textContent = '服务未启动';
    b.className = 'svc-banner down';
    b.style.display = 'flex';
    b.innerHTML = `<span class="ic">⚠️</span><span class="txt"><b>本地服务未启动</b>　排盘功能暂不可用。请在项目目录双击 <code>start-server.bat</code> 启动服务，或让助手帮你拉起后再刷新本页。</span><button class="retry" id="svcRetry">重试连接</button>`;
    const btn = $('svcRetry');
    if (btn) btn.addEventListener('click', checkService);
  }
}

function setLoading(btn, busy, label) {
  if (busy) {
    if (btn.dataset.label === undefined) btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="sp"></span>' + (label || btn.dataset.label);
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.label || label || btn.textContent;
  }
}

function showResultHead(facts, system) {
  const head = $('resultHead');
  if (!facts) { head.style.display = 'none'; return; }
  let main = '';
  let sub = '';
  if (system === 'bazi') {
    const p = facts.fourPillars;
    main = `${p.year.name}　${p.month.name}　${p.day.name}　${p.hour.name}`;
    sub = `日主 ${facts.dayMaster.gan}（${facts.dayMaster.element}）　强弱 ${facts.strength.level}`;
  } else if (system === 'ziwei') {
    main = `命宫${facts.mingGong.zhi}　身宫${facts.shenGong.zhi}　${facts.wuXingJu.name}`;
    sub = `紫微${facts.ziweiZhi}宫　天府${facts.tianfuZhi}宫　命主${facts.mingZhu || '—'} · 身主${facts.shenZhu || '—'}`;
  } else if (system === 'liuyao') {
    main = `${facts.benGua.name} → ${facts.bianGua.name}`;
    sub = `${facts.benGua.gong}宫 ${facts.benGua.gongElement}`;
  } else if (system === 'qimen') {
    main = `${facts.juName}　${facts.yuan}`;
    sub = `值符 ${facts.zhiFu.star}　值使 ${facts.zhiShi.door}`;
  }
  head.innerHTML = `<div><div class="rh-main">${main}</div><div class="rh-sub">${sub}</div></div><span class="rh-tag">已排盘</span>`;
  head.style.display = '';
  if (typeof window.__xjCollapseForm === 'function') {
    window.__xjCollapseForm({ badge: '已排盘', summary: `${main}　${sub}`, onPoster: openCurrentPoster, factPackId: currentFactPackId, system, facts });
  }
}

function openCurrentPoster() {
  if (!currentFactPackId) return;
  if (typeof window.__xjOpenPosterModal === 'function') {
    const inp = currentInput || {};
    const subHeader = inp.year ? `${inp.gender === 'female' ? '女命' : '男命'} · ${inp.year}-${inp.month}-${inp.day} ${inp.hour ?? 0}:${String(inp.minute ?? 0).padStart(2, '0')} · ${inp.city || '北京'}` : '东方传统历算 · 本地确定性排盘';
    window.__xjOpenPosterModal({
      system: CURRENT_SYS,
      factPackId: currentFactPackId,
      reportToken: currentReportToken,
      facts: currentFacts || (currentData && currentData.facts) || {},
      input: inp,
      subHeader,
    });
  } else {
    window.open(`/api/report/${currentFactPackId}/sharecard.svg?t=${encodeURIComponent(currentReportToken)}`, '_blank');
  }
}


// ---------------------------------------------------------------- 排盘与报告

async function runPaipan() {
  const cerr = coinValidationError();
  if (cerr) { msg(cerr, true); return; }
  setLoading($('btnPaipan'), true, '排盘中…');
  try {
    currentInput = collectInput();
    const d = await api('/api/paipan', { input: currentInput });
    currentFactPackId = d.factPackId;
    currentFacts = d.facts;
    $('chart').innerHTML = d.chartHtml;
    $('chart').style.display = '';
    $('intro').style.display = 'none';
    showResultHead(d.facts, d.system);
    const w = d.warnings || [];
    $('warnings').style.display = w.length ? '' : 'none';
    $('warnings').textContent = w.join('　｜　');
    $('btnHtml').disabled = false;
    $('btnCard').disabled = false;
    enableSaveReport();
    msg(`排盘完成（${d.meta.buildMs} ms${d.meta.cacheHit ? '，缓存命中' : ''}）`);
  } catch (e) {
    msg(friendlyError(e), true);
  } finally {
    setLoading($('btnPaipan'), false);
  }
}

const CN_NUM = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

function ensureReportCss() {
  if (document.getElementById('rpCss')) return;
  const l = document.createElement('link');
  l.id = 'rpCss';
  l.rel = 'stylesheet';
  l.href = '/api/report/css';
  document.head.appendChild(l);
}

function renderReportSkeleton(list) {
  const box = $('reportBody');
  if (!box) return;
  box.innerHTML = (list || [])
    .map((c) => `<section class="rp-sk" data-skey="${escapeHtml(c.key)}">
      <div class="rp-ch-h"><span class="rp-no">${CN_NUM[(c.order || 1) - 1] || '·'}</span><h3 class="rp-ch-t">${escapeHtml(c.title)}</h3><span class="rp-tag">生成中</span></div>
      <div class="rp-sk-l w40"></div><div class="rp-sk-l w80"></div><div class="rp-sk-l w60"></div>
    </section>`)
    .join('');
  box.style.display = '';
}

function appendChapter(c) {
  const box = $('reportBody');
  if (!box || !c) return;
  const holder = document.createElement('div');
  holder.innerHTML = c.html || '';
  const card = holder.firstElementChild || holder;
  const slot = box.querySelector(`[data-skey="${c.key}"]`);
  if (slot) slot.replaceWith(card);
  else box.appendChild(card);
}

function markFallback(key) {
  const box = $('reportBody');
  if (!box) return;
  const card = box.querySelector(`.rp-ch[data-key="${key}"], .rp-lock[data-key="${key}"]`);
  if (!card) return;
  card.dataset.fallback = '1';
  const note = document.createElement('div');
  note.className = 'rp-fb';
  note.textContent = 'AI 暂时不可用，本章已用本地规则引擎解读';
  card.after(note);
}

function srcLabel(source) {
  return source === 'ai' ? 'AI 深度解读' : source === 'cache' ? 'AI（缓存）' : '本地规则解读';
}

function setReportSrc(source) {
  const el = $('reportSrc');
  if (el) el.textContent = srcLabel(source);
}

function updateReportProgress(done, total) {
  const el = $('reportSrc');
  if (el && total) el.textContent = `AI 生成中 ${done}/${total} 章`;
}

function beginReport(start) {
  currentFactPackId = start.factPackId || currentFactPackId;
  const chart = $('chart');
  chart.innerHTML = start.panHtml || '';
  chart.style.display = '';
  $('intro').style.display = 'none';
  try {
    showResultHead(currentFacts || {}, start.system || CURRENT_SYS);
  } catch {
    /* ignore */
  }
  const w = start.warnings || [];
  $('warnings').style.display = w.length ? '' : 'none';
  $('warnings').textContent = w.join('　｜　');
  ensureReportCss();
  renderReportSkeleton(start.chapters || []);
  currentReportToken = start.reportToken || currentReportToken;
  $('btnHtml').disabled = false;
  $('btnCard').disabled = false;
  enableSaveReport();
  if ($('railEmpty')) $('railEmpty').style.display = 'none';
  msg('报告生成中，逐章展开…');
}

function consumeJsonReport(d) {
  beginReport({
    factPackId: d.factPackId,
    system: d.system,
    panHtml: d.panHtml,
    chapters: (d.chapters || []).map((c) => ({ key: c.key, title: c.title, order: c.order, free: c.free })),
    reportToken: d.reportToken,
  });
  (d.chapters || []).forEach(appendChapter);
  if (d.source) setReportSrc(d.source);
  renderSkus(d);
  msg('报告已生成（' + srcLabel(d.source) + '）');
  return (d.chapters || []).length > 0;
}

async function runReportLegacy(body) {
  const d = await api('/api/report', body);
  currentFactPackId = d.factPackId;
  currentReportToken = d.reportToken || '';
  currentData = d;
  $('chart').innerHTML = d.chartHtml || '';
  $('chart').style.display = '';
  $('intro').style.display = 'none';
  try {
    showResultHead(d.facts || currentFacts, d.system);
  } catch {
    /* ignore */
  }
  renderSections(d);
  renderSkus(d);
  setReportSrc('local');
  $('btnHtml').disabled = false;
  $('btnCard').disabled = false;
  enableSaveReport();
  msg('报告已生成（本地规则解读）');
}

function parseSseEvent(raw) {
  let event = '';
  let data = '';
  for (const line of String(raw).split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim();
  }
  if (!event) return null;
  let payload = {};
  try {
    payload = JSON.parse(data);
  } catch {
    payload = {};
  }
  return { event, data: payload };
}

async function runReportSse(body) {
  const res = await fetch('/api/report/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const ct = String(res.headers.get('content-type') || '');
  if (!res.ok) {
    let err = 'HTTP ' + res.status;
    try {
      const t = await res.json();
      err = t.error || err;
    } catch {
      /* ignore */
    }
    throw new Error(err);
  }
  if (!/text\/event-stream/.test(ct)) return consumeJsonReport(await res.json());
  if (!res.body || !res.body.getReader) throw new Error('当前浏览器不支持流式读取');

  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '';
  let done = 0;
  let total = 0;
  try {
    for (;;) {
      const { done: fin, value } = await reader.read();
      if (fin) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const ev = parseSseEvent(raw);
        if (!ev) continue;
        if (ev.event === 'start') {
          total = (ev.data.chapters || []).length;
          if (total > 0) beginReport(ev.data);
        } else if (ev.event === 'chapter') {
          appendChapter(ev.data);
          done += 1;
          updateReportProgress(done, total);
        } else if (ev.event === 'fallback') {
          markFallback(ev.data.key);
        } else if (ev.event === 'done') {
          if (ev.data.reportToken) currentReportToken = ev.data.reportToken;
          if (ev.data.reportUrl) currentData = { ...(currentData || {}), reportUrl: ev.data.reportUrl };
          if (ev.data.source) setReportSrc(ev.data.source);
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
  return done > 0 || total > 0;
}

async function runReport() {
  const cerr = coinValidationError();
  if (cerr) { msg(cerr, true); return; }
  setLoading($('btnReport'), true, '生成中…');
  currentInput = collectInput();
  const body = { input: currentInput, entitlements: entitlementsForRequest() };
  let rendered = false;
  try {
    rendered = await runReportSse(body);
  } catch {
    try {
      rendered = consumeJsonReport(await api('/api/report/stream?mode=json', body));
    } catch {
      rendered = false;
    }
  }
  if (!rendered) {
    try {
      await runReportLegacy(body);
    } catch (e) {
      msg(friendlyError(e), true);
    }
  }
  setLoading($('btnReport'), false);
}

function renderSections(d) {
  const box = $('sections');
  box.innerHTML = '';
  const all = d.interpretation.sections || [];
  all.forEach((s, i) => {
    const n = String(i + 1).padStart(2, '0');
    const el = document.createElement('div');
    el.className = 'card' + (s.preview ? ' locked' : '');
    const hookHtml = s.preview
      ? `<div class="body">${escapeHtml(s.hook || s.text)}</div>` +
        (s.words ? `<div style="font-size:12px;color:#9a8a66;margin:-4px 0 10px;">解锁后完整可读 · 约 ${s.words} 字</div>` : '')
      : `<div class="body">${escapeHtml(s.text)}</div>`;
    el.innerHTML = `
      <h3><span class="sec-no">${n}</span>${s.title}${s.preview ? '<span class="badge">需解锁</span>' : ''}</h3>
      ${hookHtml}
      ${s.preview ? `<div class="buy"><span class="price" data-price="${s.key}">¥–</span><button data-buy="${s.key}">解锁本章</button></div>` : ''}`;
    box.appendChild(el);
  });

  const discText = (d.interpretation && d.interpretation.disclaimer) || '';
  if (discText.trim()) {
    const disc = document.createElement('div');
    disc.className = 'disc';
    disc.textContent = discText;
    box.appendChild(disc);
  }

  $('railEmpty').style.display = all.length ? 'none' : '';

  const prices = priceMap(d.system);
  box.querySelectorAll('[data-price]').forEach((el) => {
    const p = prices[el.dataset.price];
    el.textContent = p ? '¥' + p : '¥6.9';
  });
  box.querySelectorAll('[data-buy]').forEach((btn) => {
    btn.addEventListener('click', () => buySection(btn.dataset.buy));
  });
}

function priceMap(system) {
  return {
    bazi: { xingge: 6.9, shiye: 6.9, caiyun: 6.9, ganqing: 6.9, jiankang: 6.9, shensha: 6.9, chenggu: 0.99, dayun: 9.9 },
    liuyao: { shiying: 6.9, dongyao: 6.9, advice: 9.9 },
    qimen: { direction: 9.9, palace: 6.9, advice: 9.9 },
    ziwei: { pattern: 9.9, fourhua: 9.9, dayun: 9.9, liunian: 6.9 },
  }[system] || {};
}

function renderSkus(d) {
  const box = $('sku');
  if (!box) return;
  box.style.display = 'none';
  if ($('skuList')) $('skuList').innerHTML = '';
}

function clientSkuSectionKeys(sku, system) {
  if (sku.id === 'single_section') return sku._sectionKey ? [sku._sectionKey] : [];
  if (sku.id === 'chenggu_detail') return ['chenggu'];
  if (sku.unlockAll) return Object.keys(priceMap(system));
  return [];
}

async function buySection(key) {
  openSectionModal(key);
}

function openSectionModal(key) {
  const sec = ((currentData && currentData.interpretation && currentData.interpretation.sections) || []).find((s) => s.key === key);
  const price = priceMap(CURRENT_SYS)[key] != null ? priceMap(CURRENT_SYS)[key] : 6.9;
  openPayModal({
    skuId: 'single_section',
    skuName: '单章解锁',
    price,
    system: CURRENT_SYS,
    sectionKeys: [key],
    items: [{ key, title: sec ? sec.title : key, hook: sec ? sec.hook || '' : '', words: sec ? sec.words || 0 : 0 }],
    title: '解锁章节：' + (sec ? sec.title : key),
  });
}

function openSkuModal(skuId) {
  const sku = ((currentData && currentData.skus) || []).find((s) => s.id === skuId);
  if (!sku) { msg('请先生成报告再选择套餐', true); return; }
  const sectionKeys = clientSkuSectionKeys(sku, CURRENT_SYS);
  const sections = (currentData.interpretation && currentData.interpretation.sections) || [];
  const items = sections
    .filter((s) => sectionKeys.includes(s.key))
    .map((s) => ({ key: s.key, title: s.title, hook: s.hook || '', words: s.words || 0 }));
  const title = sku.unlockAll ? (SYS_META[CURRENT_SYS].name + ' · 完整报告') : sku.name;
  openPayModal({ skuId: sku.id, skuName: sku.name, price: sku.price, system: CURRENT_SYS, sectionKeys, items, title });
}

async function confirmPay() {
  const spec = currentPaySpec;
  if (!spec) return;
  setPayModalState('paying');
  try {
    const body = { skuId: spec.skuId, system: CURRENT_SYS, factPackId: currentFactPackId };
    if (spec.skuId === 'single_section' && spec.sectionKeys[0]) body.sectionKey = spec.sectionKeys[0];
    const o = await api('/api/order', body);
    const paid = await api(`/api/order/${o.order.id}/pay`, {});
    const ent = paid && paid.order ? paid.order.entitlement : null;
    if (!ent) throw new Error('未取得服务端权益凭证，请重试或联系客服');
    addPurchase({
      orderId: o.order.id,
      skuId: spec.skuId,
      skuName: spec.skuName,
      system: CURRENT_SYS,
      sectionKeys: spec.sectionKeys,
      amount: o.order.amount,
      paidAt: new Date().toISOString(),
      factPackId: currentFactPackId,
      entitlement: ent,
    });
    setPayModalState('success');
    msg('支付成功，已为你解锁');
  } catch (e) {
    setPayModalState('confirm');
    msg(friendlyError(e), true);
  }
}

function ensurePayModal() {
  if ($('xjPayModal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <div id="xjPayModal" class="xj-modal">
    <div id="xjPayMask" class="xj-mask"></div>
    <div id="xjPayPanel" class="xj-panel">
      <div class="xj-head">
        <div id="xjPayTitle" class="xj-title"></div>
        <button id="xjPayClose" class="xj-close" type="button">×</button>
      </div>
      <div id="xjPayList" class="xj-list"></div>
      <div id="xjPayNote" class="xj-note"></div>
      <div id="xjPayFoot" class="xj-foot">
        <div class="xj-total">合计 <span id="xjPayTotal"></span></div>
        <button id="xjPayConfirm" class="xj-btn-gold" type="button">确认支付</button>
      </div>
      <p style="margin:8px 0 0;font-size:11.5px;line-height:1.7;color:#8b8172">
        付费内容为数字化虚拟内容，购买前请确认所需章节，详见《退款与售后说明》。
      </p>
      <div id="xjPayPaying" class="xj-paying">
        <div class="ring"></div>
        支付处理中…
      </div>
      <div id="xjPaySuccess" class="xj-success">
        <div class="xj-check">✓</div>
        <div class="ok-t">支付成功，已为你解锁</div>
        <button id="xjPayRead" class="xj-btn-green" type="button">开始阅读</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
  const style = document.createElement('style');
  style.textContent = '@keyframes xjspin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);
  $('xjPayClose').addEventListener('click', () => { $('xjPayModal').style.display = 'none'; });
  $('xjPayMask').addEventListener('click', () => { $('xjPayModal').style.display = 'none'; });
  $('xjPayConfirm').addEventListener('click', confirmPay);
  $('xjPayRead').addEventListener('click', () => { $('xjPayModal').style.display = 'none'; runReport(); });
}

function setPayModalState(state) {
  const m = $('xjPayModal');
  if (!m) return;
  $('xjPayFoot').style.display = state === 'confirm' ? 'flex' : 'none';
  $('xjPayPaying').style.display = state === 'paying' ? 'block' : 'none';
  $('xjPaySuccess').style.display = state === 'success' ? 'block' : 'none';
}

function openPayModal(spec) {
  ensurePayModal();
  currentPaySpec = spec;
  $('xjPayTitle').textContent = spec.title || '解锁内容';
  $('xjPayList').innerHTML = (spec.items || []).map((it) => `
    <div class="xj-item">
      <div class="t">${escapeHtml(it.title)}</div>
      <div class="h">${escapeHtml(it.hook || '')}</div>
      ${it.words ? `<div class="m">约 ${it.words} 字 · 解锁后完整可读</div>` : '<div class="m">解锁后完整可读</div>'}`).join('');
  $('xjPayTotal').textContent = '¥' + (spec.price != null ? Number(spec.price).toFixed(2) : '0.00');
  $('xjPayNote').textContent = (spec.items || []).length > 1 ? `共 ${spec.items.length} 个章节，一次解锁全部` : '单章解锁，立即生效';
  setPayModalState('confirm');
  $('xjPayModal').style.display = 'flex';
}

function ensureOrdersModal() {
  if ($('xjOrdersModal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <div id="xjOrdersModal" class="xj-modal">
    <div id="xjOrdersMask" class="xj-mask"></div>
    <div id="xjOrdersPanel" class="xj-panel">
      <div class="xj-head">
        <div class="xj-title">我的已购</div>
        <button id="xjOrdersClose" class="xj-close" type="button">×</button>
      </div>
      <div id="xjOrdersList" class="xj-list"></div>
      <div class="xj-orders-total">累计已购 <span id="xjOrdersTotal"></span></div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
  $('xjOrdersClose').addEventListener('click', () => { $('xjOrdersModal').style.display = 'none'; });
  $('xjOrdersMask').addEventListener('click', () => { $('xjOrdersModal').style.display = 'none'; });
}

function openMyOrders() {
  ensureOrdersModal();
  const list = loadPurchases();
  $('xjOrdersList').innerHTML = list.length
    ? list.map((p) => `
      <div class="xj-item">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="t">${escapeHtml(p.skuName)}</div>
          <div style="color:var(--gold-ink);font-weight:700;">¥${Number(p.amount || 0).toFixed(2)}</div>
        </div>
        <div class="m">${SYS_META[p.system] ? SYS_META[p.system].name : p.system} · ${p.sectionKeys ? p.sectionKeys.length : 0} 章 · ${new Date(p.paidAt).toLocaleString('zh-CN')}</div>
        <button data-read="1" class="xj-btn-outline-gold" type="button" style="margin-top:var(--sp-2)">重新阅读</button>
      </div>`).join('')
    : '<p style="color:var(--sub);font-size:13px;padding:12px 0;">还没有已购内容。生成报告后解锁任意章节，就会出现在「我的已购」。</p>';
  const total = list.reduce((a, p) => a + Number(p.amount || 0), 0);
  $('xjOrdersTotal').textContent = '¥' + total.toFixed(2);
  $('xjOrdersList').querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', () => { $('xjOrdersModal').style.display = 'none'; runReport(); }));
  $('xjOrdersModal').style.display = 'flex';
}

function injectMyOrdersButton() {
  return;
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------- 初始化

function init() {
  if ((CURRENT_SYS === 'liuyao' || CURRENT_SYS === 'qimen') && $('year')) setNow();
  if ($('juMethod')) {
    $('juMethod').addEventListener('change', () => {
      if ($('customJuWrap')) $('customJuWrap').style.display = $('juMethod').value === 'custom' ? 'inline-flex' : 'none';
    });
  }
  syncMethodUi();

  if ($('calendar')) {
    $('calendar').addEventListener('change', () => {
      if ($('leap-wrap')) $('leap-wrap').style.display = $('calendar').value === 'lunar' ? '' : 'none';
    });
  }
  if ($('method')) {
    $('method').addEventListener('change', () => {
      syncMethodUi();
      if ($('method').value === 'time') setNow();
    });
  }
  if ($('methodSeg')) {
    $('methodSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b || b.dataset.v === $('method').value) return;
      $('method').value = b.dataset.v;
      syncMethodUi();
      if (b.dataset.v === 'time') setNow();
    });
  }
  if ($('coinCoins')) $('coinCoins').addEventListener('click', castOneYao);
  if ($('btnCoinReset')) $('btnCoinReset').addEventListener('click', resetCoin);

  $('btnPaipan').addEventListener('click', runPaipan);
  $('btnReport').addEventListener('click', runReport);
  $('btnSaveProfile').addEventListener('click', saveCurrentProfile);
  $('btnHtml').addEventListener('click', () => {
    if (currentFactPackId) window.open(`/api/report/${currentFactPackId}/html?t=${encodeURIComponent(currentReportToken)}`, '_blank');
  });
  $('btnCard').addEventListener('click', () => {
    openCurrentPoster();
  });
  if ($('btnSaveReport')) $('btnSaveReport').addEventListener('click', saveToMyReports);

  fetch('/api/cities')
    .then((r) => r.json())
    .then((d) => {
      const sel = $('city');
      if (sel && Array.isArray(d.cities) && d.cities.length) {
        const cur = sel.value || '北京';
        const hasBeijing = d.cities.some((c) => c.name === '北京');
        sel.innerHTML = d.cities.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
        if (!hasBeijing) sel.innerHTML = `<option value="北京">北京</option>` + sel.innerHTML;
        sel.value = d.cities.some((c) => c.name === cur) ? cur : (hasBeijing ? '北京' : d.cities[0].name);
      }
    })
    .catch(() => {});

  renderProfiles();
  ensurePayModal();
  ensureOrdersModal();
  injectMyOrdersButton();
  checkService();
}

init();
