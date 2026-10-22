/**
 * 八字流年 → 流月 → 流日 下钻交互（事件委托，移动端/桌面端通用）
 *
 * 服务端在每个流年 chip 上嵌入 data-m="[[月干支序,起始年,月,日,天数]×12]"，
 * 在 .bz-track 上嵌入 data-dm（日主天干索引）。本脚本：
 *   1. 点流年 chip → 展开该年十二流月条（再点收起；点其它流年自动切换）
 *   2. 点流月 chip → 展开该月逐日干支格（再点收起）
 * 干支/十神在浏览器本地推算，不产生额外请求。
 */
(function () {
  'use strict';
  if (window.__bzDrill) return;
  window.__bzDrill = true;

  var GAN = '甲乙丙丁戊己庚辛壬癸'.split('');
  var ZHI = '子丑寅卯辰巳午未申酉戌亥'.split('');
  var WXG = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
  var YANG = [true, false, true, false, true, false, true, false, true, false];
  var ZHI_BEN = { 子: '癸', 丑: '己', 寅: '甲', 卯: '乙', 辰: '戊', 巳: '丙', 午: '丁', 未: '己', 申: '庚', 酉: '辛', 戌: '戊', 亥: '壬' };
  var WX_COLOR = { 木: '#2f7d52', 火: '#c0392b', 土: '#9c6b3f', 金: '#c9a227', 水: '#2b6ba6' };
  var MN = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];

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
    // 插在整个流年行之后（不插在单个流年后面，避免把其余流年挤到下面）
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

  // —— 奇门解释气泡 ——
  var qmPop = null;
  function removeQimenPop() {
    if (qmPop && qmPop.parentElement) qmPop.parentElement.removeChild(qmPop);
    qmPop = null;
  }
  function showQimenPop(el) {
    var t = el.getAttribute('data-t') || '';
    var x = el.getAttribute('data-x') || '';
    if (!t && !x) return;
    var again = qmPop && qmPop.__for === el;
    removeQimenPop();
    if (again) return; // 再点同一元素 = 收起
    var pop = document.createElement('div');
    pop.className = 'qm-pop';
    pop.__for = el;
    pop.innerHTML = '<div class="t"></div><div class="x"></div><span class="cls">点击空白处关闭 · 再点该元素可收起</span>';
    pop.querySelector('.t').textContent = t;
    pop.querySelector('.x').textContent = x;
    document.body.appendChild(pop);
    var r = el.getBoundingClientRect();
    var pw = Math.min(320, window.innerWidth - 16);
    // 水平：限制在视口内
    var vLeft = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - pw - 8));
    pop.style.width = pw + 'px';
    pop.style.left = (vLeft + window.scrollX) + 'px';
    // 垂直：默认放元素下方，放不下则放上方
    var ph = pop.offsetHeight || 120;
    var below = r.bottom + 6;
    if (below + ph > window.innerHeight - 8 && r.top - ph - 8 > 8) {
      pop.style.top = (r.top - ph - 8 + window.scrollY) + 'px';
    } else {
      pop.style.top = (below + window.scrollY) + 'px';
    }
    qmPop = pop;
  }
  document.addEventListener('click', function (e) {
    // —— 奇门盘：点击元素弹出解释气泡 ——
    var qel = e.target.closest ? e.target.closest('.qm-el[data-t]') : null;
    if (qel) {
      showQimenPop(qel);
      return;
    }
    if (qmPop) removeQimenPop();

    var ly = e.target.closest ? e.target.closest('.bz-ly[data-m]') : null;
    if (ly) {
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
      // 收起已展开的流日（无论哪个月份的）
      if (old && old.classList.contains('bz-lri-grid')) old.remove();
      var ons = bar.querySelectorAll('.bz-lym.on');
      for (var i = 0; i < ons.length; i++) ons[i].classList.remove('on');
      if (!wasOpen) openDays(lym);
      return;
    }
  });
})();
