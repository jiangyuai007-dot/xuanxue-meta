/**
 * hepan-drill —— 合盘页运行时（双栏输入 + 排盘 + SSE 逐章报告）
 *
 * Phase 1 修复：
 *   1. 统一 `localStorage['xuanxue.purchases']` 为与 `app.js` / `src/commerce/purchases.js` 完全一致的 Array 结构，
 *      自动迁移旧版 Object 结构，彻底消除八字与合盘跨页切换时互相覆盖清空已购凭证的 Bug。
 *   2. 修复 `buy()` 中未解包 `o.order.id` 的 Bug，并补齐分享卡 `reportToken` 鉴权参数。
 */

const $ = (id) => document.getElementById(id);
const System = 'hepan';
let currentReportToken = '';

/* ------------------------------------------------------------------ */
/* 基础工具                                                             */
/* ------------------------------------------------------------------ */

async function api(path, body, method = 'POST', timeoutMs = 30000) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  const ent = entitlementsForHepan();
  if (ent.length) opt.headers['X-Entitlements'] = ent.join(',');
  if (body) opt.body = JSON.stringify(body);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    opt.signal = ac.signal;
    const res = await fetch(path, opt);
    let d = {};
    try {
      d = await res.json();
    } catch {
      /* ignore */
    }
    if (!res.ok) throw new Error(d.error || `请求失败（${res.status}）`);
    return d;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('请求超时，请稍后重试');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function msg(text, isErr) {
  const el = $('msg');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isErr ? 'var(--bad, #b3604f)' : 'var(--gold-deep, #8a6f4b)';
  if (text) setTimeout(() => {
    if (el.textContent === text) el.textContent = '';
  }, 6000);
}

function friendlyError(e) {
  const s = String(e && e.message ? e.message : e);
  if (/fetch|Failed to|Network/.test(s)) return '连不上本地服务（http://127.0.0.1:8787），确认服务已启动。';
  return s;
}

function setLoading(btn, busy, label) {
  if (!btn) return;
  if (busy) {
    btn.dataset.origin = btn.textContent;
    btn.textContent = '生成中…';
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.origin || label || btn.textContent;
    btn.disabled = false;
  }
}

function ensureReportCss() {
  if ($('rpCss')) return;
  const link = document.createElement('link');
  link.id = 'rpCss';
  link.rel = 'stylesheet';
  link.href = '/api/report/css';
  document.head.appendChild(link);
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ */
/* 已购 / 权益凭证（Phase 1 修复：与 app.js 统一使用标准 Array 结构）     */
/* ------------------------------------------------------------------ */

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
    /* ignore */
  }
}

function entitlementsForHepan() {
  return [...new Set(loadPurchases().map((p) => p.entitlement).filter(Boolean))];
}

function purchasedKeysForHepan() {
  const set = new Set();
  for (const p of loadPurchases()) {
    if (p.system === System && Array.isArray(p.sectionKeys)) {
      p.sectionKeys.forEach((k) => set.add(k));
    }
  }
  return [...set];
}

function addPurchase(system, sectionKeys, entitlement, orderMeta = {}) {
  const list = loadPurchases();
  const rec = {
    orderId: orderMeta.orderId || ('hp_' + Date.now()),
    skuId: orderMeta.skuId || 'hepan_unlock',
    skuName: orderMeta.skuName || '合盘解锁',
    system: system || System,
    sectionKeys: Array.isArray(sectionKeys) ? sectionKeys : [],
    amount: Number(orderMeta.amount || 0),
    paidAt: new Date().toISOString(),
    factPackId: PAN?.factPackId || null,
    entitlement: entitlement || null,
  };
  if (rec.entitlement && list.some((p) => p.entitlement === rec.entitlement)) {
    return;
  }
  list.unshift(rec);
  savePurchases(list.slice(0, 50));
}

/* ------------------------------------------------------------------ */
/* 表单                                                                */
/* ------------------------------------------------------------------ */

const FIELDS = ['Gender', 'Calendar', 'Year', 'Month', 'Day', 'Hour', 'Minute', 'City', 'IsLeap', 'Solar'];

function readParty(letter) {
  const o = { type: 'bazi' };
  for (const f of FIELDS) {
    const el = $(`${letter}${f}`);
    if (!el) continue;
    if (el.type === 'checkbox') o[f[0].toLowerCase() + f.slice(1)] = el.checked;
    else o[f[0].toLowerCase() + f.slice(1)] = el.value;
  }
  o.isLeapMonth = !!o.isLeapMonth;
  o.calendar = o.calendar === 'lunar' ? 'lunar' : 'gregorian';
  if (o.calendar !== 'lunar') o.isLeapMonth = false;
  return o;
}

function writeParty(letter, o) {
  if (!o) return;
  for (const f of FIELDS) {
    const el = $(`${letter}${f}`);
    if (!el) continue;
    const key = f[0].toLowerCase() + f.slice(1);
    if (key in (o || {})) el.value = o[key];
  }
  syncCalendarUi(letter);
}

function syncCalendarUi(letter) {
  const cal = $(`${letter}Calendar`);
  const wrap = $(`${letter}LeapWrap`);
  if (wrap) wrap.style.display = cal && cal.value === 'lunar' ? '' : 'none';
}

function validateParties(pa, pb) {
  const bad = [];
  for (const [ix, p] of [['甲方', pa], ['乙方', pb]]) {
    if (p.calendar !== 'lunar') continue;
    const y = Number(p.year);
    if (!Number.isFinite(y) || y < 1900 || y > 2100) bad.push(`${ix}年份需在 1900-2100`);
    if ($(`${ix[0]}IsLeap`) && $(`${ix[0]}IsLeap`).checked) {
      const m = Number(p.month);
      if (!(m >= 1 && m <= 12)) bad.push(`${ix}月份不合法`);
    }
  }
  return bad;
}

/* ------------------------------------------------------------------ */
/* 最近合盘（本机档案）                                                 */
/* ------------------------------------------------------------------ */

function loadPairs() {
  try {
    return JSON.parse(localStorage.getItem('xuanxue.pairs') || '[]');
  } catch {
    return [];
  }
}
function savePairs(list) {
  try {
    localStorage.setItem('xuanxue.pairs', JSON.stringify(list.slice(0, 8)));
  } catch {
    /* ignore */
  }
}
function renderPairs() {
  const list = loadPairs();
  const box = $('pairList');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<p class="rail-note">还没有记录。</p>';
    return;
  }
  box.innerHTML = list
    .map(
      (p, i) => `<div class="prof" data-i="${i}">
        <div class="prof-t"><b>${escapeHtml(p.label)}</b></div>
        <div class="prof-m">${escapeHtml(p.sub)}</div>
        <div class="prof-a"><button class="mini" data-act="use" data-i="${i}">重排</button>
        <button class="mini" data-act="del" data-i="${i}">删除</button></div>
      </div>`
    )
    .join('');
}
function pushPair(p) {
  const list = loadPairs().filter((x) => x.key !== p.key);
  list.unshift(p);
  savePairs(list);
  renderPairs();
}

/* ------------------------------------------------------------------ */
/* 排盘                                                                */
/* ------------------------------------------------------------------ */

let PAN = null;
let lastHepanInput = null;

function enableSaveReport() {
  const b = $('btnSaveReport');
  if (b) b.disabled = !lastHepanInput || !!b.dataset.busy;
}

async function saveHepanToMyReports() {
  const b = $('btnSaveReport');
  if (!b || b.dataset.busy) return;
  if (!lastHepanInput) return msg('请先合盘。', true);
  const names = lastHepanInput.names || {};
  b.dataset.busy = '1';
  b.disabled = true;
  const old = b.textContent;
  b.textContent = '保存中…';
  try {
    const r = await window.CloudHistory.saveReport({
      system: 'hepan',
      title: `${names.a || '甲方'} × ${names.b || '乙方'}`,
      subtitle: PAN && PAN.score !== undefined ? `契合指数 ${PAN.score} 分 · ${PAN.grade}` : '',
      payload: lastHepanInput,
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

function showResultHead(d) {
  const el = $('resultHead');
  if (!el) return;
  el.style.display = '';
  el.innerHTML = `<h2>合盘结果</h2>
    <div class="rh-meta">契合指数 <b>${escapeHtml(d.score)}</b> 分 · ${escapeHtml(d.grade)}${
    d.gradeDesc ? `<span class="rh-sub">${escapeHtml(d.gradeDesc)}</span>` : ''
  }</div>`;
  $('intro').style.display = 'none';
}

function renderChart(panHtml) {
  const box = $('chart');
  box.style.display = '';
  box.innerHTML = panHtml;
}

function renderSectionList(sections, activeKey) {
  const box = $('sections');
  box.innerHTML = (sections || [])
    .map((s) => `<div class="sec ${activeKey === s.key ? 'on' : ''}" data-key="${escapeHtml(s.key)}">
        <span class="sec-n">${escapeHtml(s.order)}</span>
        <span class="sec-t">${escapeHtml(s.title)}</span>
        ${s.unlocked ? '' : '<span class="sec-lock">锁</span>'}
      </div>`)
    .join('');
}

async function runPaipan() {
  const pa = readParty('a');
  const pb = readParty('b');
  const bad = validateParties(pa, pb);
  if (bad.length) return msg(bad[0], true);
  msg('正在排双方命盘…');
  setLoading($('btnPaipan'), true);
  try {
    const names = { a: ($('aName').value || '').trim(), b: ($('bName').value || '').trim() };
    lastHepanInput = { a: pa, b: pb, names };
    const d = await api('/api/hepan', { a: pa, b: pb, names });
    PAN = d;
    showResultHead(d);
    renderChart(d.panHtml);
    $('warnings').style.display = 'none';
    $('reportBody').style.display = 'none';
    $('reportBody').innerHTML = '';
    $('reportSrc').textContent = '';
    $('sections').innerHTML = '';
    $('sku').style.display = 'none';
    $('btnHtml').disabled = true;
    $('btnCard').disabled = true;
    enableSaveReport();
    msg(d.reused ? '已命中本机同组合盘，直接展示了排盘区。' : '合盘完成，可继续生成完整报告。');

    const label = `${pa.year}-${pa.month}-${pa.day} ${pa.hour}:${pa.minute} × ${pb.year}-${pb.month}-${pb.day} ${pb.hour}:${pb.minute}`;
    const sub = `${names.a || '甲方'} × ${names.b || '乙方'}　${d.score} 分 ${d.grade}`;
    pushPair({ key: d.factPackId, label, sub, a: pa, b: pb, names });
    $('btnReport').disabled = false;
    if ($('btnCard')) $('btnCard').disabled = false;
    if (typeof window.__xjCollapseForm === 'function') {
      window.__xjCollapseForm({ badge: '已合盘', summary: sub, onPoster: openHepanPoster, factPackId: d.factPackId, system: 'hepan', facts: d });
    }
  } catch (e) {
    msg(friendlyError(e), true);
  } finally {
    setLoading($('btnPaipan'), false);
  }
}

/* ------------------------------------------------------------------ */
/* 报告：SSE 逐章（失败降级 JSON，再降级一次性本地版式）                */
/* ------------------------------------------------------------------ */

function renderSkeleton(chapters) {
  const body = $('reportBody');
  body.style.display = '';
  body.innerHTML = chapters
    .map(
      (c) => `<section class="rp-sk" data-key="${escapeHtml(c.key)}">
      <div class="rp-ch-h"><span class="rp-no">${'①②③④⑤⑥'[c.order - 1] || '·'}</span><h3 class="rp-ch-t">${escapeHtml(c.title)}</h3><span class="rp-tag">生成中</span></div>
      <div class="rp-sk-l w40"></div><div class="rp-sk-l w80"></div><div class="rp-sk-l w60"></div>
    </section>`
    )
    .join('');
}

function appendChapter(c) {
  const body = $('reportBody');
  const slot = body.querySelector(`.rp-sk[data-key="${c.key}"]`) || body.querySelector(`section[data-key="${c.key}"]`);
  if (slot) {
    slot.outerHTML = c.html;
    return;
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = c.html;
  body.appendChild(tmp.firstElementChild);
}

function markFallback(key) {
  const body = $('reportBody');
  const card = body.querySelector(`section[data-key="${key}"]`);
  if (!card || card.querySelector('.rp-fb')) return;
  const tip = document.createElement('div');
  tip.className = 'rp-fb';
  tip.textContent = '本章 AI 暂时不可用，已用本地规则内容填充。';
  card.parentNode.insertBefore(tip, card.nextSibling);
}

function setReportSrc(source) {
  $('reportSrc').textContent = source === 'ai' ? 'AI 深度解读' : source === 'cache' ? 'AI（缓存）' : '本地规则解读';
}

function updateProgress(done, total) {
  $('reportSrc').textContent = `生成中 ${done}/${total}`;
}

function beginReport(start) {
  renderChart(start.panHtml);
  renderSkeleton(start.chapters);
  $('reportBody').style.display = '';
  $('btnHtml').disabled = true;
  setReportSrc('ai');
}

async function runReportSse(body) {
  const res = await fetch('/api/hepan/report/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let d = {};
    try {
      d = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(d.error || `请求失败（${res.status}）`);
  }
  const ct = res.headers.get('content-type') || '';
  if (!/text\/event-stream/.test(ct)) {
    consumeJsonReport(await res.json());
    return;
  }
  ensureReportCss();
  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '';
  let total = 0;
  let done = 0;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = parseSse(frame);
      if (!ev) continue;
      if (ev.name === 'start') {
        beginReport(ev.data);
        total = (ev.data.chapters || []).length;
      } else if (ev.name === 'chapter') {
        appendChapter(ev.data);
        done += 1;
        updateProgress(done, total);
      } else if (ev.name === 'fallback') {
        markFallback(ev.data.key);
      } else if (ev.name === 'done') {
        setReportSrc(ev.data.source);
        if (ev.data.reportToken) currentReportToken = ev.data.reportToken;
        if (ev.data.reportUrl) {
          $('btnHtml').disabled = false;
          $('btnHtml').onclick = () => window.open(ev.data.reportUrl, '_blank');
        }
        if ($('btnCard')) $('btnCard').disabled = false;
      }
    }
  }
}

function parseSse(frame) {
  let name = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) data = line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { name, data: JSON.parse(data) };
  } catch {
    return null;
  }
}

function consumeJsonReport(d) {
  ensureReportCss();
  if (!d || !Array.isArray(d.chapters)) throw new Error('报告格式有误');
  renderChart(d.panHtml);
  $('reportBody').style.display = '';
  $('reportBody').innerHTML = d.chapters.map((c) => c.html).join('');
  setReportSrc(d.source);
  renderSectionList(
    (d.chapters || []).map((c) => ({ key: c.key, title: c.title, order: c.order, unlocked: c.unlocked })),
    null
  );
  renderSkus(d.skus);
  if (d.reportToken) currentReportToken = d.reportToken;
  if (d.reportUrl) {
    $('btnHtml').disabled = false;
    $('btnHtml').onclick = () => window.open(d.reportUrl, '_blank');
  }
  if ($('btnCard')) $('btnCard').disabled = false;
}

async function runReport() {
  if (!PAN || !PAN.factPackId) return msg('请先点「合盘」生成双方命盘。', true);
  const body = {
    factPackId: PAN.factPackId,
    purchased: purchasedKeysForHepan(),
    entitlements: entitlementsForHepan(),
  };
  msg('报告逐章生成中，请稍候…');
  try {
    await runReportSse(body);
    msg('报告已生成。');
  } catch (e) {
    msg(friendlyError(e), true);
  }
}

/* ------------------------------------------------------------------ */
/* SKU / 解锁                                                          */
/* ------------------------------------------------------------------ */

const PRICE = { ganzhi: 9.9, riyu: 9.9, wuxing: 9.9, chongke: 9.9, xiangchu: 6.9 };

function renderSkus(skus) {
  const box = $('sku');
  const list = $('skuList');
  if (!skus || !skus.length) return;
  box.style.display = '';
  list.innerHTML = skus
    .filter((s) => s.id === 'hepan_full' || s.id === 'single_section' || s.id === 'member_month')
    .map(
      (s) => `<div class="sku">
        <div class="sku-h"><b>${escapeHtml(s.name)}</b><span>¥${escapeHtml(s.price)}</span></div>
        <div class="sku-d">${escapeHtml(s.desc || '')}</div>
        <button class="mini" data-sku="${escapeHtml(s.id)}"${s.id === 'single_section' ? ' data-section="riyu"' : ''}>购买</button>
      </div>`
    )
    .join('');
  list.querySelectorAll('button[data-sku]').forEach((b) => {
    b.onclick = () => buy(b.dataset.sku, b.dataset.section);
  });
}

async function buy(skuId, section) {
  try {
    const oRes = await api('/api/order', { skuId, system: System, sectionKey: section || null });
    const ord = oRes.order || oRes;
    const payRes = await api(`/api/order/${ord.id}/pay`, {});
    const pay = payRes.order || payRes;
    if (!pay.entitlement && pay.payInfo) return msg('请按页面提示完成支付（当前为演示环境，一般立即成功）。', true);
    const keys = pay.sectionKey ? [pay.sectionKey] : ['ganzhi', 'riyu', 'wuxing', 'chongke', 'xiangchu'];
    addPurchase(System, keys, pay.entitlement, {
      orderId: ord.id,
      skuId,
      skuName: ord.skuName || '合盘解锁',
      amount: ord.amount,
    });
    msg('已解锁，重新点「完整报告」即可查看剩余章节。');
  } catch (e) {
    msg(friendlyError(e), true);
  }
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

async function checkService() {
  try {
    const r = await fetch('/api/health');
    if (r.ok) {
      $('svcDot').className = 'dot on';
      $('svcTxt').textContent = '本地服务在线';
      const b = $('svcBanner');
      if (b) b.style.display = 'none';
    }
  } catch {
    $('svcDot').className = 'dot';
    $('svcTxt').textContent = '本地服务未启动';
    const b = $('svcBanner');
    if (b) {
      b.style.display = '';
      b.textContent = '未连上本地服务：请在项目根目录执行 start-server.bat（默认 http://127.0.0.1:8787）。';
    }
  }
}

function openHepanPoster() {
  if (!PAN || !PAN.factPackId) return msg('请先合盘。', true);
  if (typeof window.__xjOpenPosterModal === 'function') {
    const names = (lastHepanInput && lastHepanInput.names) || {};
    window.__xjOpenPosterModal({
      system: 'hepan',
      factPackId: PAN.factPackId,
      reportToken: currentReportToken,
      facts: PAN,
      subHeader: `${names.a || '甲方'} × ${names.b || '乙方'} · 八字合盘契合度推演`,
    });
  } else {
    window.open(`/api/report/${PAN.factPackId}/sharecard.svg?t=${encodeURIComponent(currentReportToken)}`, '_blank');
  }
}

async function init() {
  await checkService();
  try {
    const { cities } = await api('/api/cities', null, 'GET');
    for (const [al, cur] of [['a', '北京'], ['b', '上海']]) {
      const sel = $(`${al}City`);
      sel.innerHTML = cities.map((c) => `<option value="${escapeHtml(c.name || c)}">${escapeHtml(c.name || c)}</option>`).join('');
      sel.value = cur;
    }
  } catch {
    /* ignore */
  }

  for (const al of ['a', 'b']) {
    $(`${al}Calendar`).onchange = () => syncCalendarUi(al);
  }

  $('btnPaipan').onclick = runPaipan;
  $('btnReport').onclick = runReport;



  $('btnCard').onclick = openHepanPoster;
  if ($('btnSaveReport')) $('btnSaveReport').onclick = saveHepanToMyReports;

  $('pairList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    const p = loadPairs()[i];
    if (!p) return;
    if (btn.dataset.act === 'del') {
      savePairs(loadPairs().filter((_, ix) => ix !== i));
      renderPairs();
      return;
    }
    writeParty('a', p.a);
    writeParty('b', p.b);
    $('aName').value = (p.names && p.names.a) || '';
    $('bName').value = (p.names && p.names.b) || '';
    renderPairs();
    msg('已回填双方生辰，点「合盘」重排。');
  });

  $('btnClearPairs').onclick = () => {
    savePairs([]);
    renderPairs();
  };

  renderPairs();
  syncCalendarUi('a');
  syncCalendarUi('b');
}

init();
