/**
 * 八字「六柱同参 + 流年 → 流月 → 流日」下钻交互 & 奇门/紫微解释气泡与移动端 Bottom Sheet 抽屉
 *
 * Phase 2 & Phase 3 升级：
 *   1. 点击任意大运 chip (.bz-dy-chip) 或流年 chip (.bz-ly) → 实时更新「六柱同参」面板的大运柱、流年柱与岁运冲合刑害标签
 *   2. 点击流年 chip → 展开该年十二流月条；点流月 chip → 展开逐日干支格
 *   3. 奇门盘元素 (.qm-el) 与紫微单宫详情 (.zw-dtl-btn / 双击 .zp)：
 *      - 移动端（<=640px）或紫微单宫详情自动呼出底部半屏抽屉（Bottom Sheet .xx-bsheet），彻底解决窄屏气泡遮挡与溢出
 *      - 桌面端（>640px）奇门元素保持就近悬浮气泡 (.qm-pop)
 *   4. 紫微盘在窄屏（<=560px）首次渲染时自动开启「精简盘」（隐藏 48 杂曜），可随时点「精简/全盘」切换
 */
(function () {
  'use strict';
  if (window.__bzDrill) return;
  window.__bzDrill = true;

  var GAN = '甲乙丙丁戊己庚辛壬癸'.split('');
  var ZHI = '子丑寅卯辰巳午未申酉戌亥'.split('');
  var WXG = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
  var ZHI_WX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
  var YANG = [true, false, true, false, true, false, true, false, true, false];
  var ZHI_BEN = { 子: '癸', 丑: '己', 寅: '甲', 卯: '乙', 辰: '戊', 巳: '丙', 午: '丁', 未: '己', 申: '庚', 酉: '辛', 戌: '戊', 亥: '壬' };
  var WX_COLOR = { 木: '#2f7d52', 火: '#c0392b', 土: '#9c6b3f', 金: '#c9a227', 水: '#2b6ba6' };
  var MN = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shishen(dg, og) {
    var d = WXG[dg], o = WXG[og];
    var same = YANG[dg] === YANG[og];
    var SH = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
    var KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
    if (d === o) return same ? '比肩' : '劫财';
    if (SH[d] === o) return same ? '食神' : '伤官';
    if (KE[d] === o) return same ? '偏财' : '正财';
    if (KE[o] === d) return same ? '七杀' : '正官';
    return same ? '偏印' : '正印';
  }

  function colOf(ganIdx) { return WX_COLOR[WXG[ganIdx]] || '#6b5640'; }

  function colorGzHtml(gz) {
    var s = String(gz || '');
    if (s.length < 2) return escHtml(s);
    var g = s.charAt(0), z = s.charAt(1);
    var gc = colOf(GAN.indexOf(g));
    var zc = WX_COLOR[ZHI_WX[z]] || '#6b5640';
    return '<span style="color:' + gc + '">' + escHtml(g) + '</span><span style="color:' + zc + '">' + escHtml(z) + '</span>';
  }

  /** 更新六柱同参面板 */
  function updateSixPillarBar(el) {
    var track = el.closest ? el.closest('.bz-track') : null;
    if (!track) return;
    var dyGz = el.getAttribute('data-dy-gz');
    var dyAge = el.getAttribute('data-dy-age');
    var dySs = el.getAttribute('data-dy-ss');
    var lyYear = el.getAttribute('data-ly-year');
    var lyGz = el.getAttribute('data-ly-gz');
    var lySs = el.getAttribute('data-ly-ss');
    var sixRaw = el.getAttribute('data-six');

    var dyAgeEl = track.querySelector('[data-role="six-dy-age"]');
    var dyGzEl = track.querySelector('[data-role="six-dy-gz"]');
    var dySsEl = track.querySelector('[data-role="six-dy-ss"]');
    var lyYearEl = track.querySelector('[data-role="six-ly-year"]');
    var lyGzEl = track.querySelector('[data-role="six-ly-gz"]');
    var lySsEl = track.querySelector('[data-role="six-ly-ss"]');
    var relsEl = track.querySelector('[data-role="six-rels"]');

    if (dyAge && dyAgeEl) dyAgeEl.textContent = dyAge;
    if (dyGz && dyGzEl) dyGzEl.innerHTML = colorGzHtml(dyGz);
    if (dySs && dySsEl) dySsEl.textContent = dySs;
    if (lyYear && lyYearEl) lyYearEl.textContent = lyYear;
    if (lyGz && lyGzEl) lyGzEl.innerHTML = colorGzHtml(lyGz);
    if (lySs && lySsEl) lySsEl.textContent = lySs;

    if (sixRaw && relsEl) {
      try {
        var rels = JSON.parse(sixRaw);
        if (Array.isArray(rels) && rels.length) {
          relsEl.innerHTML = rels.map(function (r) {
            return '<span class="bz-rel-chip"><em style="background:' + escHtml(r.c || '#8b8172') + '">' + escHtml(r.b || '关') + '</em><b>' + escHtml(r.n) + '</b><i>' + escHtml(r.l) + '</i></span>';
          }).join('');
        } else {
          relsEl.innerHTML = '<span class="bz-rel-empty">当前岁运与原局无剧烈刑冲</span>';
        }
      } catch (err) {
        /* ignore */
      }
    }
  }

  function closeAll() {
    var els = document.querySelectorAll('.bz-lym-bar, .bz-lri-grid');
    for (var i = 0; i < els.length; i++) els[i].remove();
    var ons = document.querySelectorAll('.bz-ly.on, .bz-lym.on');
    for (var j = 0; j < ons.length; j++) ons[j].classList.remove('on');
  }

  function openMonths(ly) {
    var dm = Number((ly.closest('.bz-track') || {}).dataset ? ly.closest('.bz-track').dataset.dm : NaN);
    var months;
    try { months = JSON.parse(ly.getAttribute('data-m')); } catch (e) { return; }
    if (!Array.isArray(months) || !months.length || isNaN(dm)) return;
    var yearTxt = (ly.querySelector('em') || {}).textContent || '';
    var gzTxt = (ly.childNodes[1] || {}).textContent || '';
    var bar = document.createElement('div');
    bar.className = 'bz-lym-bar';
    var html = '<span class="bz-lym-head">' + yearTxt + ' 年 ' + gzTxt + ' · 十二流月（点流月展开逐日干支）</span>';
    for (var i = 0; i < months.length; i++) {
      var m = months[i];
      var gi = ((m[0] % 60) + 60) % 60;
      var g = gi % 10, z = gi % 12;
      var benGan = GAN.indexOf(ZHI_BEN[ZHI[z]]);
      html += '<span class="bz-lym" data-i="' + i + '" data-m=\'' + JSON.stringify(m) + '\''
        + ' title="' + MN[i] + '（' + m[1] + '年' + m[2] + '月' + m[3] + '日起，共' + m[4] + '天）· 点击展开流日">'
        + '<em>' + MN[i] + '</em>'
        + '<b style="color:' + colOf(g) + '">' + GAN[g] + ZHI[z] + '</b>'
        + '<i>' + shishen(dm, g) + '·' + shishen(dm, benGan) + '</i></span>';
    }
    bar.innerHTML = html;
    ly.classList.add('on');
    ly.parentElement.after(bar);
  }

  function openDays(lym) {
    var track = lym.closest('.bz-track');
    var dm = Number(track ? track.dataset.dm : NaN);
    var m;
    try { m = JSON.parse(lym.getAttribute('data-m')); } catch (e) { return; }
    if (!Array.isArray(m) || isNaN(dm)) return;
    var grid = document.createElement('div');
    grid.className = 'bz-lri-grid';
    var html = '<div class="bz-lri-head">' + m[1] + ' 年 ' + m[2] + ' 月 ' + m[3] + ' 日交节入月 · 共 ' + m[4] + ' 天（干支以节气月计）</div><div class="bz-lri-cells">';
    var d0 = new Date(m[1], m[2] - 1, m[3]);
    for (var k = 0; k < m[4]; k++) {
      var gi = (((m[0] + k) % 60) + 60) % 60;
      var g = gi % 10, z = gi % 12;
      var dt = new Date(d0.getTime() + k * 86400000);
      html += '<span class="bz-lri" title="' + (dt.getMonth() + 1) + '月' + dt.getDate() + '日 ' + GAN[g] + ZHI[z] + '">'
        + '<em>' + (dt.getMonth() + 1) + '/' + dt.getDate() + '</em>'
        + '<span style="color:' + colOf(g) + '">' + GAN[g] + ZHI[z] + '</span>'
        + '<i>' + shishen(dm, g) + '</i></span>';
    }
    grid.innerHTML = html + '</div>';
    lym.classList.add('on');
    lym.parentElement.after(grid);
  }

  // —— Phase 3：移动端 Bottom Sheet 抽屉 & 桌面端悬浮气泡 ——
  var qmPop = null;
  var bsheetEl = null;

  function removeQimenPop() {
    if (qmPop && qmPop.parentElement) qmPop.parentElement.removeChild(qmPop);
    qmPop = null;
  }

  function ensureBottomSheet() {
    if (bsheetEl) return bsheetEl;
    var wrap = document.createElement('div');
    wrap.className = 'xx-bsheet-wrap';
    wrap.innerHTML =
      '<div class="xx-bsheet-mask" data-bs-close="1"></div>' +
      '<div class="xx-bsheet" role="dialog" aria-modal="true" aria-label="盘面象意详情">' +
        '<div class="xx-bsheet-bar"><i></i></div>' +
        '<div class="xx-bsheet-hd">' +
          '<b class="xx-bsheet-title"></b>' +
          '<button type="button" class="xx-bsheet-cls" data-bs-close="1" aria-label="关闭详情">×</button>' +
        '</div>' +
        '<div class="xx-bsheet-bd"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    bsheetEl = wrap;
    return wrap;
  }

  function openBottomSheet(title, text) {
    removeQimenPop();
    var sheet = ensureBottomSheet();
    sheet.querySelector('.xx-bsheet-title').textContent = title || '详情释义';
    var lines = String(text || '').split('\n').filter(Boolean);
    sheet.querySelector('.xx-bsheet-bd').innerHTML = lines.map(function (line) {
      return '<p>' + escHtml(line) + '</p>';
    }).join('');
    sheet.classList.add('on');
  }

  function closeBottomSheet() {
    if (bsheetEl) bsheetEl.classList.remove('on');
  }

  function showQimenOrZiweiDetail(el) {
    var t = el.getAttribute('data-t') || el.getAttribute('data-zw-title') || '';
    var x = el.getAttribute('data-x') || el.getAttribute('data-zw-detail') || '';
    if (!t && !x) return;

    var forceDrawer = el.classList.contains('zw-dtl-btn') || el.hasAttribute('data-zw-title') || window.innerWidth <= 640;
    if (forceDrawer) {
      openBottomSheet(t, x);
      return;
    }

    var again = qmPop && qmPop.__for === el;
    removeQimenPop();
    if (again) return;
    var pop = document.createElement('div');
    pop.className = 'qm-pop';
    pop.__for = el;
    pop.innerHTML = '<div class="t"></div><div class="x"></div><span class="cls">点击空白处关闭 · 再点该元素可收起</span>';
    pop.querySelector('.t').textContent = t;
    pop.querySelector('.x').textContent = x;
    document.body.appendChild(pop);
    var r = el.getBoundingClientRect();
    var pw = Math.min(320, window.innerWidth - 16);
    var vLeft = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - pw - 8));
    pop.style.width = pw + 'px';
    pop.style.left = (vLeft + window.scrollX) + 'px';
    var ph = pop.offsetHeight || 120;
    var below = r.bottom + 6;
    if (below + ph > window.innerHeight - 8 && r.top - ph - 8 > 8) {
      pop.style.top = (r.top - ph - 8 + window.scrollY) + 'px';
    } else {
      pop.style.top = (below + window.scrollY) + 'px';
    }
    qmPop = pop;
  }

  // 紫微窄屏首次渲染自动开启精简模式（隐藏 48 杂曜，防小屏拥挤）
  function autoCompactZiweiOnMobile() {
    if (window.innerWidth > 560) return;
    var simp = document.getElementById('zw-simp');
    if (simp && !simp.dataset.autoInited) {
      simp.dataset.autoInited = '1';
      simp.checked = true;
    }
  }

  if (typeof MutationObserver !== 'undefined') {
    var mo = new MutationObserver(function () {
      autoCompactZiweiOnMobile();
    });
    if (document.body) {
      mo.observe(document.body, { childList: true, subtree: true });
    } else {
      window.addEventListener('DOMContentLoaded', function () {
        mo.observe(document.body, { childList: true, subtree: true });
      });
    }
  }

  document.addEventListener('dblclick', function (e) {
    var zp = e.target.closest ? e.target.closest('.zp[data-zw-title]') : null;
    if (zp) {
      showQimenOrZiweiDetail(zp);
    }
  });

  document.addEventListener('click', function (e) {
    var bsClose = e.target.closest ? e.target.closest('[data-bs-close]') : null;
    if (bsClose) {
      closeBottomSheet();
      return;
    }

    var qel = e.target.closest ? e.target.closest('.qm-el[data-t]') : null;
    if (qel) {
      if (qel.classList.contains('zw-dtl-btn')) {
        e.preventDefault();
        e.stopPropagation();
      }
      showQimenOrZiweiDetail(qel);
      return;
    }
    if (qmPop) removeQimenPop();

    var dyChip = e.target.closest ? e.target.closest('.bz-dy-chip[data-dy-gz]') : null;
    if (dyChip) {
      updateSixPillarBar(dyChip);
      return;
    }

    var ly = e.target.closest ? e.target.closest('.bz-ly[data-m]') : null;
    if (ly) {
      updateSixPillarBar(ly);
      var wasOpen = ly.classList.contains('on');
      closeAll();
      if (!wasOpen) openMonths(ly);
      return;
    }
    var lym = e.target.closest ? e.target.closest('.bz-lym') : null;
    if (lym) {
      var bar = lym.parentElement;
      var wasOpen = lym.classList.contains('on');
      var old = bar.nextElementSibling;
      if (old && old.classList.contains('bz-lri-grid')) old.remove();
      var ons = bar.querySelectorAll('.bz-lym.on');
      for (var i = 0; i < ons.length; i++) ons[i].classList.remove('on');
      if (!wasOpen) openDays(lym);
      return;
    }
  });
})();
