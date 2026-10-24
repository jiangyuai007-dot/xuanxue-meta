/**
 * 玄机 Phase 3 双端 UI/UX 与 Canvas 高清命盘海报公共模块（web/poster.js）
 *
 * 职责：
 *   1. PWA Service Worker 注册（/sw.js）
 *   2. 移动端底部固定毛玻璃导航栏（.mobile-tabbar：八字/六爻/奇门/紫微/合盘/我的）
 *   3. 排盘后「吸顶折叠摘要条」（#formSummaryBar）：自动折叠冗长表单，支持一键展开修改与生成海报
 *   4. 移动端工作台二级胶囊视图切换（.stage-view-tabs：专业命盘 / AI 深度命书 / 我的档案）
 *   5. 1080×1560 竖版国风宣纸 Canvas 高清海报渲染与一键导出 PNG / SVG
 */
(function () {
  'use strict';
  if (window.__xjPhase3Init) return;
  window.__xjPhase3Init = true;

  var SYS_NAME = {
    bazi: '八字命盘',
    liuyao: '六爻占卜',
    qimen: '奇门遁甲',
    ziwei: '紫微斗数',
    hepan: '八字合盘',
    mine: '我的报告',
  };

  var NAV_ITEMS = [
    { sys: 'bazi', href: 'bazi.html', ic: '<svg viewBox="0 0 24 24" width="16" height="16" style="display:inline-block;vertical-align:-2px" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path fill="currentColor" fill-rule="evenodd" d="M12 2.8A4.6 4.6 0 0 1 12 12a4.6 4.6 0 0 0 0 9.2 9.2 9.2 0 0 1 0-18.4Zm0 3.1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/><circle cx="12" cy="16.6" r="1.5" fill="currentColor"/></svg>', label: '八字' },
    { sys: 'liuyao', href: 'liuyao.html', ic: '䷀', label: '六爻' },
    { sys: 'qimen', href: 'qimen.html', ic: '☷', label: '奇门' },
    { sys: 'ziwei', href: 'ziwei.html', ic: '✦', label: '紫微' },
    { sys: 'hepan', href: 'hepan.html', ic: '囍', label: '合盘' },
    { sys: 'mine', href: 'mine.html', ic: '印', label: '我的' },
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 1) 注册 PWA Service Worker
  function registerPwa() {
    try {
      if (window.caches && typeof window.caches.keys === 'function') {
        window.caches.keys().then(function (keys) {
          keys.forEach(function (k) {
            if (k.indexOf('v2.5') === -1) window.caches.delete(k);
          });
        });
      }
    } catch (e) {}
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js?v=20261024v25').then(function (reg) {
          if (reg && typeof reg.update === 'function') reg.update();
        }).catch(function () {});
      });
    }
  }

  // 2) 注入移动端底部固定导航栏 (.mobile-tabbar)
  function injectMobileTabBar() {
    if (document.querySelector('.mobile-tabbar')) return;
    var curSys = (document.body && document.body.dataset && document.body.dataset.sys) || 'bazi';
    var nav = document.createElement('nav');
    nav.className = 'mobile-tabbar';
    nav.setAttribute('aria-label', '移动端底部主导航');
    nav.innerHTML = NAV_ITEMS.map(function (it) {
      var active = it.sys === curSys ? ' active' : '';
      return '<a class="mtab' + active + '" href="' + it.href + '"' + (active ? ' aria-current="page"' : '') + '>' +
        '<span class="mtab-ic" aria-hidden="true">' + it.ic + '</span>' +
        '<span class="mtab-tx">' + it.label + '</span>' +
      '</a>';
    }).join('');
    document.body.appendChild(nav);
  }

  // 3) 注入排盘后吸顶折叠摘要条 (#formSummaryBar) 与移动端工作台二级视图切换 (.stage-view-tabs)
  var latestPosterTrigger = null;

  function ensureFormSummaryBar() {
    var formbar = document.querySelector('.formbar');
    if (!formbar) return null;
    var bar = document.getElementById('formSummaryBar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'formSummaryBar';
    bar.className = 'form-summary-bar';
    bar.style.display = 'none';
    bar.innerHTML =
      '<div class="fsb-main">' +
        '<span class="fsb-badge" id="fsbBadge">已排盘</span>' +
        '<span class="fsb-text" id="fsbText"></span>' +
      '</div>' +
      '<div class="fsb-acts">' +
        '<button type="button" class="mini" id="btnExpandForm">展开修改</button>' +
        '<button type="button" class="mini primary" id="btnPosterQuick">生成海报</button>' +
      '</div>';
    formbar.insertBefore(bar, formbar.firstChild);
    document.getElementById('btnExpandForm').addEventListener('click', function () {
      var isCollapsed = formbar.classList.toggle('is-collapsed');
      this.textContent = isCollapsed ? '展开修改' : '收起表单';
    });
    document.getElementById('btnPosterQuick').addEventListener('click', function () {
      if (typeof latestPosterTrigger === 'function') latestPosterTrigger();
    });
    return bar;
  }

  function ensureStageViewTabs() {
    var curSys = (document.body && document.body.dataset && document.body.dataset.sys) || '';
    if (curSys === 'mine') return null;
    var wb = document.querySelector('.workbench');
    if (!wb) return null;
    if (!wb.getAttribute('data-mview')) {
      wb.setAttribute('data-mview', 'chart');
    }
    var tabs = document.getElementById('stageViewTabs');
    if (tabs) return tabs;
    tabs = document.createElement('div');
    tabs.id = 'stageViewTabs';
    tabs.className = 'stage-view-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '移动端视图切换');
    tabs.innerHTML =
      '<button type="button" role="tab" data-mview="chart" class="sv-tab on" aria-selected="true">① 专业命盘</button>' +
      '<button type="button" role="tab" data-mview="report" class="sv-tab" aria-selected="false">② AI 命书</button>' +
      '<button type="button" role="tab" data-mview="chat" class="sv-tab" aria-selected="false">③ 大师追问</button>' +
      '<button type="button" role="tab" data-mview="profile" class="sv-tab" aria-selected="false">④ 档案</button>';
    wb.insertBefore(tabs, wb.firstChild);
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-mview]') : null;
      if (!btn) return;
      switchStageView(btn.getAttribute('data-mview'));
    });
    return tabs;
  }

  function switchStageView(mode) {
    var wb = document.querySelector('.workbench');
    if (!wb) return;
    wb.setAttribute('data-mview', mode || 'chart');
    var tabs = document.getElementById('stageViewTabs');
    if (tabs) {
      var btns = tabs.querySelectorAll('button[data-mview]');
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute('data-mview') === mode;
        btns[i].classList.toggle('on', on);
        btns[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }
    }
    if (mode === 'report') {
      var rp = document.getElementById('reportBody');
      var hasCards = rp && rp.children && rp.children.length > 0;
      if (!hasCards) {
        var btnRep = document.getElementById('btnReport');
        if (btnRep && !btnRep.disabled) btnRep.click();
      }
    }
  }

  /**
   * 排盘或报告完成后调用：折叠表单为摘要条并显示工作台视图切换
   */
  window.__xjCollapseForm = function (opts) {
    opts = opts || {};
    if (document.body) document.body.classList.add('has-paipan');
    var rh = document.getElementById('resultHead');
    if (rh) rh.style.display = 'none';
    var bar = ensureFormSummaryBar();
    ensureStageViewTabs();
    var formbar = document.querySelector('.formbar');
    if (bar && formbar) {
      var badge = document.getElementById('fsbBadge');
      var text = document.getElementById('fsbText');
      if (badge) badge.textContent = opts.badge || '已排盘';
      if (text) text.textContent = opts.summary || '';
      bar.style.display = 'flex';
      var expBtn = document.getElementById('btnExpandForm');
      var isMobile = window.innerWidth <= 820;
      if (window.__xjAutoPreviewing) {
        window.__xjAutoPreviewing = false;
        if (badge) badge.textContent = '已排盘';
        if (isMobile) {
          formbar.classList.add('is-collapsed');
          if (expBtn) expBtn.textContent = '展开修改';
        } else {
          formbar.classList.remove('is-collapsed');
          if (expBtn) expBtn.textContent = '收起表单';
        }
      } else {
        formbar.classList.add('is-collapsed');
        if (expBtn) expBtn.textContent = '展开修改';
      }
    }
    if (typeof opts.onPoster === 'function') {
      latestPosterTrigger = opts.onPoster;
    }
    if (opts.factPackId) {
      syncPhase4Context({
        factPackId: opts.factPackId,
        system: opts.system || ((document.body && document.body.dataset && document.body.dataset.sys) || 'bazi'),
        facts: opts.facts || null,
      });
    }
    if (opts.view) {
      switchStageView(opts.view);
    } else {
      var wb = document.querySelector('.workbench');
      if (wb && !wb.getAttribute('data-mview')) wb.setAttribute('data-mview', 'chart');
    }
  };

  window.__xjSwitchStageView = switchStageView;

  // 4) Canvas 1080×1560 竖版高清宣纸命书海报生成器
  var posterModal = null;
  var currentPosterOpts = null;

  function ensurePosterModal() {
    if (posterModal) return posterModal;
    var wrap = document.createElement('div');
    wrap.id = 'xjPosterModal';
    wrap.className = 'xj-modal';
    wrap.innerHTML =
      '<div class="xj-mask" data-poster-close="1"></div>' +
      '<div class="xj-panel xj-poster-panel" role="dialog" aria-modal="true" aria-labelledby="xjPosterTitle">' +
        '<div class="xj-head">' +
          '<div class="xj-title" id="xjPosterTitle">国风命盘高清海报</div>' +
          '<button type="button" class="xj-close" data-poster-close="1" aria-label="关闭海报弹窗">×</button>' +
        '</div>' +
        '<div class="xj-poster-body">' +
          '<canvas id="xjPosterCanvas" width="1080" height="1560"></canvas>' +
        '</div>' +
        '<div class="xj-foot xj-poster-foot">' +
          '<button type="button" class="mini" id="btnOpenSvgShare">查看 SVG 简卡</button>' +
          '<button type="button" class="xj-btn-gold" id="btnDownloadPoster">保存高清 PNG 海报</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    posterModal = wrap;

    wrap.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-poster-close]')) {
        wrap.style.display = 'none';
      }
    });

    document.getElementById('btnDownloadPoster').addEventListener('click', function () {
      var canvas = document.getElementById('xjPosterCanvas');
      if (!canvas) return;
      try {
        var url = canvas.toDataURL('image/png');
        var a = document.createElement('a');
        var id = (currentPosterOpts && currentPosterOpts.factPackId) || 'chart';
        a.href = url;
        a.download = 'xuanji-poster-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '_') + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (err) {
        /* ignore */
      }
    });

    document.getElementById('btnOpenSvgShare').addEventListener('click', function () {
      if (!currentPosterOpts || !currentPosterOpts.factPackId) return;
      var u = '/api/report/' + encodeURIComponent(currentPosterOpts.factPackId) + '/sharecard.svg?t=' + encodeURIComponent(currentPosterOpts.reportToken || '');
      window.open(u, '_blank');
    });

    return wrap;
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    var chars = String(text || '').replace(/\s+/g, ' ').trim().split('');
    var lines = [];
    var cur = '';
    for (var i = 0; i < chars.length; i++) {
      var test = cur + chars[i];
      if (ctx.measureText(test).width > maxWidth && cur.length > 0) {
        lines.push(cur);
        cur = chars[i];
        if (maxLines && lines.length >= maxLines) {
          lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + '…';
          return lines;
        }
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPosterCanvas(opts) {
    var canvas = document.getElementById('xjPosterCanvas');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var W = 1080, H = 1560;
    ctx.clearRect(0, 0, W, H);

    // 1. 宣纸底纹渐变
    var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#fbf7ee');
    bgGrad.addColorStop(0.5, '#f6efe0');
    bgGrad.addColorStop(1, '#ede3ce');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. 双层古典烫金边框
    ctx.strokeStyle = '#b0812b';
    ctx.lineWidth = 4;
    roundRect(ctx, 36, 36, W - 72, H - 72, 24);
    ctx.stroke();

    ctx.strokeStyle = '#d8cba9';
    ctx.lineWidth = 2;
    roundRect(ctx, 50, 50, W - 100, H - 100, 18);
    ctx.stroke();

    // 3. 顶部黑金抬头卡与朱砂正印
    var sys = opts.system || 'bazi';
    var sysTitle = SYS_NAME[sys] || '命理排盘';
    roundRect(ctx, 84, 88, 240, 58, 12);
    ctx.fillStyle = '#241d14';
    ctx.fill();
    ctx.fillStyle = '#e5c878';
    ctx.font = 'bold 28px "Noto Serif SC","PingFang SC",serif';
    ctx.textAlign = 'center';
    ctx.fillText('玄机 · ' + sysTitle, 204, 127);

    // 朱砂方印
    roundRect(ctx, W - 184, 82, 96, 96, 12);
    ctx.fillStyle = '#b3392c';
    ctx.fill();
    ctx.strokeStyle = '#f6f1e6';
    ctx.lineWidth = 2.5;
    roundRect(ctx, W - 176, 90, 80, 80, 8);
    ctx.stroke();
    ctx.fillStyle = '#f6f1e6';
    ctx.font = 'bold 28px "Noto Serif SC",serif';
    ctx.fillText('玄机', W - 136, 126);
    ctx.fillText('命书', W - 136, 158);

    // 4. 命主摘要副标题
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6b5640';
    ctx.font = '24px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(opts.subHeader || '东方传统历算 · 本地确定性排盘', 84, 196);

    // 5. 核心排盘卡片区 (y = 230 .. 760)
    roundRect(ctx, 84, 224, W - 168, 520, 20);
    ctx.fillStyle = '#fffdf8';
    ctx.fill();
    ctx.strokeStyle = '#dfd3ba';
    ctx.lineWidth = 2;
    ctx.stroke();

    var f = opts.facts || {};
    if (sys === 'bazi' && f.fourPillars) {
      var keys = ['year', 'month', 'day', 'hour'];
      var labels = ['年柱', '月柱', '日柱·日元', '时柱'];
      var colW = (W - 240) / 4;
      for (var i = 0; i < 4; i++) {
        var p = f.fourPillars[keys[i]] || {};
        var cx = 120 + i * colW;
        roundRect(ctx, cx, 260, colW - 20, 320, 16);
        ctx.fillStyle = i === 2 ? '#f3e8cf' : '#faf6ee';
        ctx.fill();
        ctx.strokeStyle = i === 2 ? '#c9a961' : '#e7ddc9';
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#8b8172';
        ctx.font = '22px "PingFang SC",sans-serif';
        ctx.fillText(labels[i], cx + (colW - 20) / 2, 302);

        ctx.fillStyle = '#2f2a22';
        ctx.font = 'bold 68px "Noto Serif SC",serif';
        ctx.fillText(p.gan || '—', cx + (colW - 20) / 2, 392);
        ctx.fillText(p.zhi || '—', cx + (colW - 20) / 2, 476);

        ctx.fillStyle = '#9a7720';
        ctx.font = '22px "PingFang SC",sans-serif';
        ctx.fillText(i === 2 ? '日主·我' : (p.shishen || ''), cx + (colW - 20) / 2, 526);
        ctx.fillStyle = '#8b8172';
        ctx.font = '19px "PingFang SC",sans-serif';
        ctx.fillText(p.nayin || '', cx + (colW - 20) / 2, 558);
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = '#3a332c';
      ctx.font = 'bold 26px "PingFang SC",sans-serif';
      var baziLine = '格局：' + (f.pattern && f.pattern.name ? f.pattern.name : '—') +
        '　｜　强弱：' + (f.strength && f.strength.level ? f.strength.level : '—') +
        '　｜　喜用神：' + ((f.yongshen && f.yongshen.favorable) ? f.yongshen.favorable.join('、') : '—');
      ctx.fillText(baziLine, 120, 642);
      var sixLine = f.sixPillars && f.sixPillars.dayun
        ? '当前大运：' + f.sixPillars.dayun.name + '　当前流年：' + (f.sixPillars.liunian ? f.sixPillars.liunian.year + f.sixPillars.liunian.name : '') +
          '　称骨：' + (f.chengGu ? f.chengGu.totalText : '')
        : '胎元：' + (f.taiyuan ? f.taiyuan.name : '—') + '　命宫：' + (f.mingGong ? f.mingGong.name : '—');
      ctx.fillStyle = '#6b5640';
      ctx.font = '24px "PingFang SC",sans-serif';
      ctx.fillText(sixLine, 120, 696);
    } else if (sys === 'hepan') {
      var parties = f.parties || [];
      var pA = parties[0] || {}, pB = parties[1] || {};
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9a7720';
      ctx.font = 'bold 88px "Noto Serif SC",serif';
      ctx.fillText(String(f.score != null ? f.score : '—') + ' 分', W / 2, 355);
      ctx.fillStyle = '#2f2a22';
      ctx.font = 'bold 34px "Noto Serif SC",serif';
      ctx.fillText(f.grade || '契合度推演', W / 2, 412);

      ctx.textAlign = 'left';
      ctx.font = 'bold 28px "PingFang SC",sans-serif';
      ctx.fillStyle = '#2f2a22';
      ctx.fillText('甲方 · ' + (pA.name || '甲方') + '：日柱 ' + (pA.dayGanzhi || '—') + '（生肖' + (pA.zodiac || '—') + '）', 130, 500);
      ctx.fillText('乙方 · ' + (pB.name || '乙方') + '：日柱 ' + (pB.dayGanzhi || '—') + '（生肖' + (pB.zodiac || '—') + '）', 130, 560);
      ctx.fillStyle = '#6b5640';
      ctx.font = '25px "PingFang SC",sans-serif';
      ctx.fillText('相合项：' + ((f.he || []).length) + ' 处　｜　需磨合刑冲：' + ((f.conflicts || []).length) + ' 处', 130, 632);
      ctx.fillText(f.headline || f.gradeDesc || '', 130, 692);
    } else if (sys === 'ziwei' && f.mingGong) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#2f2a22';
      ctx.font = 'bold 44px "Noto Serif SC",serif';
      ctx.fillText('命宫在' + f.mingGong.zhi + '（' + f.mingGong.ganzhi + '） · 身宫在' + f.shenGong.zhi + ' · ' + f.wuXingJu.name, 120, 320);
      ctx.fillStyle = '#6b5640';
      ctx.font = '28px "PingFang SC",sans-serif';
      ctx.fillText('紫微坐' + f.ziweiZhi + '宫　｜　天府坐' + f.tianfuZhi + '宫　｜　命主 ' + (f.mingZhu || '—') + ' · 身主 ' + (f.shenZhu || '—'), 120, 396);
      var fh = f.fourHua || {};
      ctx.fillStyle = '#9a7720';
      ctx.font = 'bold 28px "PingFang SC",sans-serif';
      ctx.fillText('生年四化：禄[' + (fh.lu ? fh.lu.star : '—') + ']　权[' + (fh.quan ? fh.quan.star : '—') + ']　科[' + (fh.ke ? fh.ke.star : '—') + ']　忌[' + (fh.ji ? fh.ji.star : '—') + ']', 120, 472);
      var sz = f.siZhu || {};
      ctx.fillStyle = '#3a332c';
      ctx.font = '26px "PingFang SC",sans-serif';
      ctx.fillText('生辰四柱：' + (sz.year || '') + ' ' + (sz.month || '') + ' ' + (sz.day || '') + ' ' + (sz.hour || ''), 120, 548);
      var mingFly = f.palaceSihua && f.palaceSihua['命宫'];
      if (mingFly && mingFly.lu) {
        ctx.fillText('命宫飞化：禄入' + mingFly.lu.targetPalace + '(' + mingFly.lu.star + ') · 忌入' + mingFly.ji.targetPalace + '(' + mingFly.ji.star + ')', 120, 622);
      }
    } else if (sys === 'qimen' && f.juName) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#2f2a22';
      ctx.font = 'bold 46px "Noto Serif SC",serif';
      ctx.fillText(f.juName + ' · ' + f.yuan + '（' + (f.panMethod === 'fei' ? '飞盘奇门' : '转盘奇门') + '）', 120, 320);
      ctx.fillStyle = '#6b5640';
      ctx.font = '28px "PingFang SC",sans-serif';
      ctx.fillText('节气：' + f.solarTerm + '　｜　旬首：' + f.xunShou + '（' + f.xunShouYi + '）', 120, 396);
      ctx.fillText('值符：' + (f.zhiFu ? f.zhiFu.star + '@' + f.zhiFu.palaceName + '宫' : '—') + '　｜　值使：' + (f.zhiShi ? f.zhiShi.door + '@' + f.zhiShi.palaceName + '宫' : '—'), 120, 470);
      ctx.fillStyle = '#2f7d52';
      ctx.font = 'bold 28px "PingFang SC",sans-serif';
      var fav = f.favorable || {};
      ctx.fillText('首选吉方：' + (fav.direction || '—') + '方（' + (fav.palaceName || '—') + '宫 · ' + (fav.door || '—') + ' · ' + (fav.star || '—') + '）', 120, 548);
      var pats = (f.patterns || []).slice(0, 5).map(function (x) { return x.name + '(' + x.type + ')'; }).join(' · ');
      ctx.fillStyle = '#9a7720';
      ctx.font = '25px "PingFang SC",sans-serif';
      ctx.fillText('命中格局：' + (pats || '格局中正平稳'), 120, 626);
    } else if (sys === 'liuyao' && f.benGua) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#2f2a22';
      ctx.font = 'bold 48px "Noto Serif SC",serif';
      var isStaticLy = (!f.dongYao || !f.dongYao.length) && (!f.bianGua || f.bianGua.name === f.benGua.name);
      ctx.fillText(isStaticLy ? ('本卦：' + f.benGua.name + '（六爻安静 · 静卦）') : ('本卦：' + f.benGua.name + '　→　变卦：' + f.bianGua.name), 120, 325);
      ctx.fillStyle = '#6b5640';
      ctx.font = '28px "PingFang SC",sans-serif';
      ctx.fillText(f.benGua.gong + '宫' + f.benGua.gongElement + ' · ' + f.benGua.generation + '卦　｜　世爻：' + (f.shiYing ? f.shiYing.shiPosition : '—') + ' · 应爻：' + (f.shiYing ? f.shiYing.yingPosition : '—'), 120, 405);
      ctx.fillStyle = '#9a7720';
      ctx.font = 'bold 28px "PingFang SC",sans-serif';
      ctx.fillText('取用神：' + (f.yongshen || '官鬼') + '　｜　月建：' + (f.yueJian ? f.yueJian.zhi : '—') + '　｜　日辰：' + (f.riJian ? f.riJian.ganzhi : '—'), 120, 485);
      ctx.fillStyle = '#3a332c';
      ctx.font = '26px "PingFang SC",sans-serif';
      ctx.fillText('卦身：' + (f.guaShen ? f.guaShen.zhi : '—') + '　｜　旬空：' + ((f.xunkong || []).join('、') || '—'), 120, 565);
      if (f.question) ctx.fillText('所占事项：' + f.question, 120, 635);
    }

    // 6. 核心命书批断区 (y = 780 .. 1340)
    roundRect(ctx, 84, 780, W - 168, 540, 20);
    ctx.fillStyle = '#faf5e8';
    ctx.fill();
    ctx.strokeStyle = '#d8cba9';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#9a7720';
    ctx.font = 'bold 28px "Noto Serif SC",serif';
    ctx.fillText('【核心命理批断 · 摘要】', 116, 840);

    var summaryText = opts.aiSummary || '';
    if (!summaryText) {
      var firstCard = document.querySelector('#reportBody .rp-ch, #sections .card');
      if (firstCard) {
        summaryText = firstCard.textContent.replace(/\s+/g, ' ').trim();
      }
    }
    if (!summaryText) {
      summaryText = '本命盘已由玄机天文历算内核完成确定性排定。点击页面「完整报告」即可生成基于 F1..Fn 事实编号溯源的结构化深度命书章节。';
    }

    ctx.fillStyle = '#2f2a22';
    ctx.font = '26px "PingFang SC","Microsoft YaHei",sans-serif';
    var wrapped = wrapLines(ctx, summaryText, W - 240, 9);
    for (var L = 0; L < wrapped.length; L++) {
      ctx.fillText(wrapped[L], 120, 904 + L * 44);
    }

    // 7. 底部防伪编号与文化声明
    ctx.strokeStyle = '#d8cba9';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(84, 1370);
    ctx.lineTo(W - 84, 1370);
    ctx.stroke();

    ctx.fillStyle = '#6b5640';
    ctx.font = '22px "PingFang SC",sans-serif';
    ctx.fillText('档案编号：' + (opts.factPackId || 'LOCAL') + '　｜　生成时间：' + new Date().toLocaleString('zh-CN', { hour12: false }), 84, 1418);
    ctx.fillStyle = '#8b8172';
    ctx.font = '20px "PingFang SC",sans-serif';
    ctx.fillText('玄机（xuanxue-meta）· 零幻觉确定性排盘工具 · 内容仅供传统文化交流参考，不构成医疗/投资/法律建议', 84, 1464);
  }

  window.__xjOpenPosterModal = function (opts) {
    currentPosterOpts = opts || {};
    var modal = ensurePosterModal();
    drawPosterCanvas(currentPosterOpts);
    modal.style.display = 'flex';
  };

  // =========================================================================
  // 5) Phase 4：每日运势黄历（结合个人八字日柱）& 基于 FactPack 护栏的大师多轮追问
  // =========================================================================
  var activeFactPackId = '';
  var activeSystem = (document.body && document.body.dataset && document.body.dataset.sys) || 'bazi';
  var almanacModal = null;
  var currentAlmDate = '';

  var DEFAULT_PRESETS = {
    bazi: [
      '我近两年适合跳槽、转行或拓展副业吗？',
      '我的正缘特征是什么？感情稳定期在何时？',
      '我的喜用神在日常办公方位与穿戴上怎么运用？',
      '当前大运与今年流年有哪些需要留意的冲合信号？'
    ],
    liuyao: [
      '本卦用神旺衰如何？所占之事最终趋势怎样？',
      '卦中动爻与变卦对结果有什么关键影响？',
      '这件事大致的应期（关键时间窗口）在什么时候？',
      '当下最稳妥的行动策略是主动推进还是暂缓观望？'
    ],
    qimen: [
      '此局最有利的求谋方位与行动时辰是哪个？',
      '日干与时干落宫生克反映当前怎样的主客局势？',
      '盘面有哪些吉凶格局或四害需要规避？',
      '此事目前宜主动出击还是守成等待时机？'
    ],
    ziwei: [
      '我命宫与三方四正的主星组合有什么核心优势与短板？',
      '生年四化与宫干飞化提示我的事业与财富重心在哪里？',
      '当前大限与今年流年需要重点关注哪些宫位变动？',
      '夫妻宫与福德宫体现怎样的感情互动模式与心态特征？'
    ],
    hepan: [
      '我们两人的五行与喜用神互补性强吗？',
      '双方日柱夫妻宫有哪些合冲关系需要在日常磨合？',
      '我们在财务规划与事业协同上适合怎样分工配合？',
      '长期相处最值得坚持的三条关系升温建议是什么？'
    ]
  };

  var feedbackModal = null;

  function ensureFeedbackModal() {
    if (feedbackModal) return feedbackModal;
    var curSys = (document.body && document.body.dataset && document.body.dataset.sys) || 'general';
    var wrap = document.createElement('div');
    wrap.id = 'xjFeedbackModal';
    wrap.className = 'xj-modal';
    wrap.innerHTML =
      '<div class="xj-mask" data-fbk-close="1"></div>' +
      '<div class="xj-panel" role="dialog" aria-modal="true" aria-labelledby="xjFbkTitle" style="max-width:520px;width:94%">' +
        '<div class="xj-head">' +
          '<div class="xj-title" id="xjFbkTitle">💬 意见反馈与产品建议</div>' +
          '<button type="button" class="xj-close" data-fbk-close="1" aria-label="关闭反馈弹窗">×</button>' +
        '</div>' +
        '<form id="xjModalFbkForm" style="padding:12px 16px;display:flex;flex-direction:column;gap:10px">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
            '<div>' +
              '<label for="xjFbkCat" style="font-size:12px;color:#6b5640;display:block;margin-bottom:3px">反馈类型</label>' +
              '<select id="xjFbkCat" class="mr-in mr-in-sm" style="width:100%">' +
                '<option value="ui_ux">📱 界面与手机适配</option>' +
                '<option value="algorithm">☯️ 排盘与历法建议</option>' +
                '<option value="feature">✨ 新功能许愿</option>' +
                '<option value="bug">🐞 异常与 Bug 报错</option>' +
                '<option value="other">💡 其它建议</option>' +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label for="xjFbkRate" style="font-size:12px;color:#6b5640;display:block;margin-bottom:3px">体验评分</label>' +
              '<select id="xjFbkRate" class="mr-in mr-in-sm" style="width:100%">' +
                '<option value="5">★★★★★ 5分（非常满意）</option>' +
                '<option value="4">★★★★☆ 4分（比较满意）</option>' +
                '<option value="3">★★★☆☆ 3分（有待改进）</option>' +
                '<option value="2">★★☆☆☆ 2分（体验欠佳）</option>' +
                '<option value="1">★☆☆☆☆ 1分（急需整改）</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<label for="xjFbkText" style="font-size:12px;color:#6b5640;display:block;margin-bottom:3px">具体问题描述或建议 <span style="color:#b3392c">*</span></label>' +
            '<textarea id="xjFbkText" class="fbk-ta" rows="3" maxlength="1000" placeholder="请直白写下您觉得不好用、看不清或希望改进的地方（至少 4 个字）…"></textarea>' +
          '</div>' +
          '<div>' +
            '<label for="xjFbkContact" style="font-size:12px;color:#6b5640;display:block;margin-bottom:3px">联系方式（选填）</label>' +
            '<input type="text" id="xjFbkContact" class="mr-in mr-in-sm" maxlength="80" placeholder="微信号 / 邮箱 / 手机号（选填）">' +
          '</div>' +
          '<div id="xjFbkMsg" style="font-size:12.5px;min-height:18px;color:#1f6e43"></div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
            '<a href="mine.html#feedbackSection" style="font-size:12px;color:#8c6418;text-decoration:underline">查看我的历史反馈记录 →</a>' +
            '<button type="submit" class="primary mini" id="xjFbkSubmitBtn" style="height:36px;padding:0 18px">提交反馈</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(wrap);
    feedbackModal = wrap;

    wrap.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-fbk-close]')) {
        wrap.style.display = 'none';
      }
    });

    document.getElementById('xjModalFbkForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var tx = document.getElementById('xjFbkText');
      var msgEl = document.getElementById('xjFbkMsg');
      var btn = document.getElementById('xjFbkSubmitBtn');
      var content = tx ? tx.value.trim() : '';
      if (content.length < 4) {
        if (msgEl) { msgEl.style.color = '#b3392c'; msgEl.textContent = '请填写至少 4 个字的具体反馈内容'; }
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }
      var headers = { 'Content-Type': 'application/json' };
      try {
        var tk = localStorage.getItem('xuanxue.session');
        if (tk) headers['x-session-token'] = tk;
      } catch (err) {}
      fetch('/api/feedback', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          category: document.getElementById('xjFbkCat').value,
          system: curSys,
          rating: Number(document.getElementById('xjFbkRate').value) || 5,
          content: content,
          contact: document.getElementById('xjFbkContact').value.trim(),
          pageUrl: location.pathname,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok) throw new Error((d && d.error) || '提交失败');
          if (tx) tx.value = '';
          if (msgEl) {
            msgEl.style.color = '#1f6e43';
            msgEl.textContent = '✓ 已收录（工单 ' + d.item.id + '）：' + (d.item.reply || '感谢您的反馈！');
          }
        })
        .catch(function (err) {
          if (msgEl) { msgEl.style.color = '#b3392c'; msgEl.textContent = err.message || '提交失败'; }
        })
        .finally(function () {
          if (btn) { btn.disabled = false; btn.textContent = '提交反馈'; }
        });
    });

    return wrap;
  }

  function openFeedbackModal() {
    var curSys = (document.body && document.body.dataset && document.body.dataset.sys) || '';
    if (curSys === 'mine' && document.getElementById('feedbackSection')) {
      document.getElementById('feedbackSection').scrollIntoView({ behavior: 'smooth' });
      var ta = document.getElementById('fbkContent');
      if (ta) ta.focus();
      return;
    }
    var modal = ensureFeedbackModal();
    var msgEl = document.getElementById('xjFbkMsg');
    if (msgEl) msgEl.textContent = '';
    modal.style.display = 'flex';
  }

  window.__xjOpenFeedbackModal = openFeedbackModal;

  function injectTopbarAlmanacBtn() {
    var topStatus = document.querySelector('.topbar .top-status');
    if (!topStatus || document.getElementById('btnTopAlmanac')) return;
    var fbkBtn = document.createElement('button');
    fbkBtn.type = 'button';
    fbkBtn.id = 'btnTopFeedback';
    fbkBtn.className = 'btn-top-almanac';
    fbkBtn.setAttribute('aria-label', '提交意见反馈');
    fbkBtn.innerHTML = '💬 反馈';
    fbkBtn.addEventListener('click', function () {
      openFeedbackModal();
    });
    topStatus.appendChild(fbkBtn);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btnTopAlmanac';
    btn.className = 'btn-top-almanac';
    btn.setAttribute('aria-label', '查看今日运势黄历');
    btn.innerHTML = '📅 今日黄历';
    btn.addEventListener('click', function () {
      openAlmanacModal();
    });
    topStatus.appendChild(btn);
  }

  function ensureAlmanacModal() {
    if (almanacModal) return almanacModal;
    var wrap = document.createElement('div');
    wrap.id = 'xjAlmanacModal';
    wrap.className = 'xj-modal';
    wrap.innerHTML =
      '<div class="xj-mask" data-alm-close="1"></div>' +
      '<div class="xj-panel xj-alm-panel" role="dialog" aria-modal="true" aria-labelledby="xjAlmTitle">' +
        '<div class="xj-head">' +
          '<div class="xj-title" id="xjAlmTitle">每日运势黄历 · 择吉与个人流日</div>' +
          '<button type="button" class="xj-close" data-alm-close="1" aria-label="关闭黄历弹窗">×</button>' +
        '</div>' +
        '<div class="xj-alm-body">' +
          '<div class="alm-toolbar">' +
            '<div class="alm-date-ctrl">' +
              '<label for="xjAlmDate" style="font-size:12.5px;color:#6b5640;">日期</label>' +
              '<input type="date" id="xjAlmDate" class="alm-date-in" aria-label="选择黄历日期">' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
              '<button type="button" class="mini" id="btnAlmPrev">前一天</button>' +
              '<button type="button" class="mini primary" id="btnAlmToday">今日</button>' +
              '<button type="button" class="mini" id="btnAlmNext">后一天</button>' +
            '</div>' +
          '</div>' +
          '<div id="xjAlmContent" aria-live="polite">正在推演今日历法与流日气机…</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    almanacModal = wrap;

    wrap.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-alm-close]')) {
        wrap.style.display = 'none';
      }
    });

    var dateIn = document.getElementById('xjAlmDate');
    dateIn.addEventListener('change', function () {
      if (this.value) loadAlmanacData(this.value);
    });

    function shiftDate(days) {
      var base = currentAlmDate ? new Date(currentAlmDate + 'T12:00:00Z') : new Date();
      base.setUTCDate(base.getUTCDate() + days);
      var iso = base.toISOString().slice(0, 10);
      loadAlmanacData(iso);
    }
    document.getElementById('btnAlmPrev').addEventListener('click', function () { shiftDate(-1); });
    document.getElementById('btnAlmNext').addEventListener('click', function () { shiftDate(1); });
    document.getElementById('btnAlmToday').addEventListener('click', function () { loadAlmanacData(''); });

    return wrap;
  }

  function renderAlmanacHtml(alm) {
    if (!alm) return '<p>暂无黄历数据</p>';
    var p = alm.pillars || {};
    var l = alm.lunar || {};
    var jc = alm.jianchu || {};
    var zs = alm.zhishen || {};
    var dir = alm.directions || {};
    var st = alm.solarTerm || {};
    var ps = alm.personal;

    var personalHtml = ps
      ? '<div class="alm-personal">' +
          '<div class="alm-personal-hd">' +
            '<span class="alm-personal-title">✦ 您的专属八字流日运势（本命日柱：' + esc(ps.userDayGanzhi) + ' · ' + esc(ps.userDayMaster) + '）</span>' +
            '<span class="alm-personal-score">' + esc(ps.score) + '分 · ' + esc(ps.grade) + '</span>' +
          '</div>' +
          '<div style="font-size:13px;line-height:1.65;color:#f3ead5;margin-bottom:8px;">' + esc(ps.summary) + '</div>' +
          '<div style="font-size:12px;color:#dcc798;display:flex;flex-wrap:wrap;gap:12px;">' +
            '<span><b>流日十神：</b>' + esc(ps.liuriShishen) + '</span>' +
            '<span><b>旺运色彩：</b>' + esc(ps.luckyColors) + '</span>' +
            '<span><b>黄金吉时：</b>' + esc((ps.luckyHours || []).join('、')) + '</span>' +
          '</div>' +
        '</div>'
      : '<div class="alm-kv" style="border-style:dashed;color:#6b5640;">💡 提示：在排盘页完成一次八字/紫微/奇门起盘后打开本黄历，即可自动结合您的<b>个人本命日柱与喜用神</b>推演专属流日十神与旺运吉时。</div>';

    var hoursHtml = (alm.hours || []).map(function (h) {
      var isGood = h.luck === '吉';
      return '<div class="alm-hr' + (isGood ? ' lucky' : '') + '">' +
        '<div><b>' + esc(h.ganzhi) + '</b> <span class="lk ' + (isGood ? 'good' : 'bad') + '">' + esc(h.shen) + esc(h.luck) + '</span></div>' +
        '<div style="color:#8b7961;font-size:10px;">' + esc(h.timeRange) + '</div>' +
      '</div>';
    }).join('');

    return (
      personalHtml +
      '<div class="alm-hero">' +
        '<div>' +
          '<div class="alm-lunar-big">' + esc(l.fullText) + '</div>' +
          '<div class="alm-sub">公历 ' + esc(alm.solar.dateStr) + '（' + esc(alm.solar.weekday) + '） · 纳音：' + esc(p.nayin) + ' · 当前节气：' + esc(st.current) + '（距' + esc(st.next) + '还有 ' + esc(st.daysUntilNext) + ' 天）</div>' +
        '</div>' +
        '<div class="alm-pillars">' +
          '<div class="alm-pil"><small>年柱</small><strong>' + esc(p.year) + '</strong></div>' +
          '<div class="alm-pil"><small>月柱</small><strong>' + esc(p.month) + '</strong></div>' +
          '<div class="alm-pil"><small>日柱</small><strong>' + esc(p.day) + '</strong></div>' +
        '</div>' +
      '</div>' +
      '<div class="alm-yiji">' +
        '<div class="alm-yj-box"><span class="alm-yj-tag yi">宜</span><div><div style="font-weight:700;color:#1f6e43;font-size:13px;">今日宜行</div><div style="font-size:12.5px;color:#2f2a22;margin-top:2px;">' + esc((alm.yi || []).join(' · ')) + '</div></div></div>' +
        '<div class="alm-yj-box"><span class="alm-yj-tag ji">忌</span><div><div style="font-weight:700;color:#b03024;font-size:13px;">今日忌行</div><div style="font-size:12.5px;color:#2f2a22;margin-top:2px;">' + esc((alm.ji || []).join(' · ')) + '</div></div></div>' +
      '</div>' +
      '<div class="alm-grid-info">' +
        '<div class="alm-kv"><b>建除十二神 · ' + esc(jc.title) + '（' + esc(jc.luck) + '）</b>' + esc(jc.desc) + '</div>' +
        '<div class="alm-kv"><b>值神与星宿</b>' + esc(zs.label) + ' · 二十八宿值日：' + esc(alm.xiu) + '</div>' +
        '<div class="alm-kv"><b>吉神方位（四神）</b>喜神：' + esc(dir.xi) + ' ｜ 财神：' + esc(dir.cai) + ' ｜ 福神：' + esc(dir.fu) + ' ｜ 阳贵：' + esc(dir.yangGui) + '</div>' +
        '<div class="alm-kv"><b>冲煞与彭祖百忌</b>' + esc(alm.chongSha && alm.chongSha.text) + '<br>' + esc(alm.pengzu) + '</div>' +
      '</div>' +
      '<div>' +
        '<div style="font-size:12.5px;font-weight:700;color:#6b5640;margin-bottom:6px;">十二时辰黄黑道吉凶一览</div>' +
        '<div class="alm-hours">' + hoursHtml + '</div>' +
      '</div>'
    );
  }

  function loadAlmanacData(dateStr) {
    var box = document.getElementById('xjAlmContent');
    if (!box) return;
    box.innerHTML = '<p style="color:#6b5640;font-size:13px;">正在推演历法与流日气机…</p>';
    var url = '/api/almanac?t=' + Date.now();
    if (dateStr) url += '&date=' + encodeURIComponent(dateStr);
    if (activeFactPackId) url += '&factPackId=' + encodeURIComponent(activeFactPackId);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.almanac) throw new Error((d && d.error) || '加载失败');
        currentAlmDate = d.almanac.solar.dateStr;
        var dateIn = document.getElementById('xjAlmDate');
        if (dateIn) dateIn.value = currentAlmDate;
        box.innerHTML = renderAlmanacHtml(d.almanac);
      })
      .catch(function (err) {
        box.innerHTML = '<p style="color:#b03024;font-size:13px;">' + esc(err.message || '黄历加载失败') + '</p>';
      });
  }

  function openAlmanacModal(dateStr) {
    var modal = ensureAlmanacModal();
    modal.style.display = 'flex';
    loadAlmanacData(dateStr || currentAlmDate || '');
  }

  window.__xjOpenAlmanacModal = openAlmanacModal;

  // -------------------------------------------------------------------------
  // AI 命盘多轮追问面板（挂载于右侧报告栏 .rail-right 底部）
  // -------------------------------------------------------------------------
  function ensureFollowupBox() {
    var curSys = (document.body && document.body.dataset && document.body.dataset.sys) || '';
    if (curSys === 'mine') return null;
    var railRight = document.querySelector('.rail-right');
    if (!railRight) return null;
    var box = document.getElementById('xjFollowupBox');
    if (box) return box;

    box = document.createElement('section');
    box.id = 'xjFollowupBox';
    box.className = 'xj-followup-card';
    box.setAttribute('aria-label', 'AI 命盘大师多轮追问');
    box.innerHTML =
      '<div class="xj-fu-head">' +
        '<div>' +
          '<div class="xj-fu-title">💬 命盘深度追问</div>' +
          '<div style="font-size:11.5px;color:#7a6850;">严格锚定当前 FactPack 排盘事实，零幻觉针对性推演</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span class="xj-fu-badge" id="xjFuStatusBadge">待起盘</span>' +
          '<button type="button" class="mini" id="btnClearChat" title="清空当前命盘追问记录">清空</button>' +
        '</div>' +
      '</div>' +
      '<div class="xj-fu-presets" id="xjFuPresets"></div>' +
      '<div class="xj-chat-list" id="xjChatList" aria-live="polite">' +
        '<div class="xj-chat-empty">先在上方完成一次起盘（或合盘），即可点击上方快捷问题或输入您最关心的具体事项（如跳槽时机、流年运势、正缘特征、吉方择时）向命理顾问发起多轮追问。</div>' +
      '</div>' +
      '<form class="xj-chat-form" id="xjChatForm" autocomplete="off">' +
        '<label for="xjChatInput" class="sr-only">输入向命理顾问追问的问题</label>' +
        '<input type="text" id="xjChatInput" class="xj-chat-in" maxlength="300" placeholder="基于当前命盘追问（如：我明年适合跳槽吗？）">' +
        '<button type="submit" class="primary mini" id="btnSendChat">发送追问</button>' +
      '</form>';

    railRight.appendChild(box);
    renderPresetChips(DEFAULT_PRESETS[curSys] || DEFAULT_PRESETS.bazi);

    document.getElementById('xjChatForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('xjChatInput');
      if (!input) return;
      var q = input.value.trim();
      if (!q) return;
      sendFollowupQuestion(q);
    });

    document.getElementById('btnClearChat').addEventListener('click', function () {
      if (!activeFactPackId) return;
      fetch('/api/chat/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factPackId: activeFactPackId }),
      })
        .then(function () {
          renderChatHistory([]);
        })
        .catch(function () {});
    });

    return box;
  }

  function renderPresetChips(presets) {
    var wrap = document.getElementById('xjFuPresets');
    if (!wrap) return;
    wrap.innerHTML = (presets || []).map(function (q) {
      return '<button type="button" class="xj-fu-chip" data-preset-q="' + esc(q) + '">' + esc(q) + '</button>';
    }).join('');
    wrap.querySelectorAll('[data-preset-q]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var q = btn.getAttribute('data-preset-q');
        var input = document.getElementById('xjChatInput');
        if (input) input.value = q;
        sendFollowupQuestion(q);
      });
    });
  }

  function renderChatHistory(messages) {
    var listEl = document.getElementById('xjChatList');
    if (!listEl) return;
    if (!messages || !messages.length) {
      listEl.innerHTML = '<div class="xj-chat-empty">命盘事实护栏已就绪。点击上方快捷胶囊或直接输入具体问题即可开始多轮深度追问。</div>';
      return;
    }
    listEl.innerHTML = messages.map(function (m) {
      if (m.role === 'user') {
        return '<div class="xj-msg user">' + esc(m.content) + '</div>';
      }
      var basisHtml = '';
      if (m.basis && m.basis.length) {
        var detailsMap = {};
        (m.basisDetails || []).forEach(function (b) { detailsMap[b.id] = b.text; });
        basisHtml =
          '<div class="xj-msg-basis"><span>事实溯源：</span>' +
          m.basis.map(function (id) {
            var tip = detailsMap[id] || id;
            return '<span class="xj-basis-pill" title="' + esc(tip) + '">' + esc(id) + '</span>';
          }).join('') +
          '</div>';
      }
      var sugsHtml = '';
      if (m.suggestions && m.suggestions.length) {
        sugsHtml =
          '<div class="xj-msg-sugs">' +
          m.suggestions.map(function (s) {
            return '<button type="button" class="xj-fu-chip" data-sug-q="' + esc(s) + '">追问：' + esc(s) + '</button>';
          }).join('') +
          '</div>';
      }
      var paragraphs = String(m.content || '').split('\n').filter(Boolean).map(function (p) {
        return '<p style="margin:0 0 6px 0;">' + esc(p) + '</p>';
      }).join('');
      return '<div class="xj-msg assistant">' + paragraphs + basisHtml + sugsHtml + '</div>';
    }).join('');

    listEl.querySelectorAll('[data-sug-q]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var q = btn.getAttribute('data-sug-q');
        sendFollowupQuestion(q);
      });
    });
    listEl.scrollTop = listEl.scrollHeight;
  }

  function sendFollowupQuestion(question) {
    ensureFollowupBox();
    if (!activeFactPackId) {
      // 若用户尚未点击起盘，自动触发一次起盘按钮再提示
      var btnPaipan = document.getElementById('btnPaipan');
      if (btnPaipan && !btnPaipan.disabled) {
        btnPaipan.click();
      }
      var listEl0 = document.getElementById('xjChatList');
      if (listEl0) {
        listEl0.innerHTML = '<div class="xj-chat-empty" style="color:#b03024;">请先点击页面「起盘 / 开始合盘」生成当前命盘，再发起针对性追问。</div>';
      }
      return;
    }

    var input = document.getElementById('xjChatInput');
    var btnSend = document.getElementById('btnSendChat');
    var listEl = document.getElementById('xjChatList');
    if (input) input.value = '';
    if (btnSend) {
      btnSend.disabled = true;
      btnSend.textContent = '推演中…';
    }

    var emptyEl = listEl ? listEl.querySelector('.xj-chat-empty') : null;
    if (emptyEl) emptyEl.remove();

    if (listEl) {
      var uDiv = document.createElement('div');
      uDiv.className = 'xj-msg user';
      uDiv.textContent = question;
      listEl.appendChild(uDiv);

      var aDiv = document.createElement('div');
      aDiv.className = 'xj-msg assistant';
      aDiv.textContent = '正在核对命盘 F1..Fn 事实编号并推演解答…';
      listEl.appendChild(aDiv);
      listEl.scrollTop = listEl.scrollHeight;
    }

    var entitlements = [];
    if (window.XuanxueStore && typeof window.XuanxueStore.entitlementTokens === 'function') {
      entitlements = window.XuanxueStore.entitlementTokens(activeSystem);
    }

    fetch('/api/chat/stream?mode=json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        factPackId: activeFactPackId,
        question: question,
        entitlements: entitlements,
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data || !res.data.ok) {
          throw new Error((res.data && res.data.error) || '追问请求失败');
        }
        renderChatHistory(res.data.messages || []);
      })
      .catch(function (err) {
        if (listEl) {
          var errDiv = document.createElement('div');
          errDiv.className = 'xj-msg assistant';
          errDiv.style.color = '#b03024';
          errDiv.textContent = err.message || '追问暂不可用，请稍后重试';
          listEl.appendChild(errDiv);
        }
      })
      .finally(function () {
        if (btnSend) {
          btnSend.disabled = false;
          btnSend.textContent = '发送追问';
        }
      });
  }

  function syncPhase4Context(ctx) {
    if (!ctx || !ctx.factPackId) return;
    activeFactPackId = ctx.factPackId;
    if (ctx.system) activeSystem = ctx.system;
    ensureFollowupBox();
    var badge = document.getElementById('xjFuStatusBadge');
    if (badge) {
      badge.textContent = '已绑定命盘';
      badge.style.background = '#e7f4ec';
      badge.style.color = '#1f6e43';
    }
    fetch('/api/chat/history?factPackId=' + encodeURIComponent(activeFactPackId) + '&system=' + encodeURIComponent(activeSystem))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        if (Array.isArray(d.presets) && d.presets.length) {
          renderPresetChips(d.presets);
        }
        renderChatHistory(d.messages || []);
      })
      .catch(function () {});
  }

  window.__xjSyncPhase4Context = syncPhase4Context;


  function ensureQuickCastBar() {
    var curSys = (document.body && document.body.dataset && document.body.dataset.sys) || '';
    if (!curSys || curSys === 'mine') return null;
    var fbCard = document.querySelector('.fb-card');
    if (!fbCard || document.getElementById('xjQuickCastBar')) return null;

    var cfgMap = {
      bazi: {
        seal: '☯\uFE0E 八字真太阳时起盘台',
        meta: '节气交脱分秒定局 · 110项古籍神煞 · 六柱岁运同参',
        chips: [
          { act: 'now', label: '⚡ 此刻起盘' },
          { act: 'male', label: '👨 乾造示例' },
          { act: 'female', label: '👩 坤造示例' },
        ],
      },
      ziwei: {
        seal: '✦ 紫微斗数 · 文墨起盘台',
        meta: '108星竖排成列 · 十二宫自化与向心四化 · 博士长生三神叠列',
        chips: [
          { act: 'now', label: '⚡ 此刻排盘' },
          { act: 'male', label: '👨 紫贪男命' },
          { act: 'female', label: '👩 机月女命' },
        ],
      },
      liuyao: {
        seal: '䷀ 六爻京房纳甲起卦台',
        meta: '时间 / 报数 / 铜钱 / 手动 / 卦名五法齐备 · 月建日辰纲领',
        chips: [
          { act: 'ly-now', label: '⚡ 正时起卦' },
          { act: 'ly-auto', label: '🎲 随机摇卦' },
          { act: 'ly-num', label: '🔢 报数示例' },
        ],
      },
      qimen: {
        seal: '☷ 奇门遁甲时家起局台',
        meta: '拆补 / 置闰 / 茅山三法定局 · 二十余种吉凶克应格局推演',
        chips: [
          { act: 'qm-now', label: '⚡ 正时起局' },
          { act: 'qm-career', label: '💼 事业求财' },
          { act: 'qm-love', label: '❤️ 婚恋感情' },
        ],
      },
      hepan: {
        seal: '囍 八字合婚双人同参台',
        meta: '天干五合 · 地支六合三合刑冲 · 夫妻宫十神 · 六维契合雷达',
        chips: [
          { act: 'hp-demo1', label: '💑 良缘示例' },
          { act: 'hp-demo2', label: '🔥 磨合示例' },
          { act: 'hp-swap', label: '🔄 甲乙互换' },
        ],
      },
    };

    var cfg = cfgMap[curSys];
    if (!cfg) return null;

    var qbar = document.createElement('div');
    qbar.id = 'xjQuickCastBar';
    qbar.className = 'fb-quick-bar';
    qbar.innerHTML =
      '<div class="fbq-left">' +
        '<span class="fbq-seal">' + esc(cfg.seal) + '</span>' +
        '<span class="fbq-meta">' + esc(cfg.meta) + '</span>' +
      '</div>' +
      '<div class="fbq-right">' +
        cfg.chips.map(function (c) {
          return '<button type="button" class="fbq-chip" data-qact="' + esc(c.act) + '">' + esc(c.label) + '</button>';
        }).join('') +
        '<button type="button" class="fbq-chip fbq-fold" data-qact="fold" title="收起起盘表单">▲ 收起</button>' +
      '</div>';

    fbCard.insertBefore(qbar, fbCard.firstChild);

    function setVal(id, v) {
      var el = document.getElementById(id);
      if (el) el.value = v;
    }
    function setNowFields() {
      var d = new Date();
      setVal('year', d.getFullYear());
      setVal('month', d.getMonth() + 1);
      setVal('day', d.getDate());
      setVal('hour', d.getHours());
      setVal('minute', d.getMinutes());
    }
    function clickPaipan() {
      var btn = document.getElementById('btnPaipan');
      if (btn && !btn.disabled) btn.click();
    }

    qbar.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-qact]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-qact');
      if (act === 'fold') {
        var fb = document.querySelector('.formbar');
        if (fb) fb.classList.add('is-collapsed');
        var exp = document.getElementById('btnExpandForm');
        if (exp) exp.textContent = '展开修改';
        return;
      }
      if (act === 'alm') {
        openAlmanacModal();
        return;
      }
      if (act === 'now' || act === 'qm-now') {
        setNowFields();
        clickPaipan();
      } else if (act === 'male') {
        setVal('gender', 'male');
        setVal('calendar', 'gregorian');
        setVal('year', 1990); setVal('month', 5); setVal('day', 20); setVal('hour', 14); setVal('minute', 30);
        setVal('city', '北京');
        clickPaipan();
      } else if (act === 'female') {
        setVal('gender', 'female');
        setVal('calendar', 'gregorian');
        setVal('year', 1993); setVal('month', 8); setVal('day', 16); setVal('hour', 9); setVal('minute', 30);
        setVal('city', '上海');
        clickPaipan();
      } else if (act === 'ly-now') {
        var segBtn = document.querySelector('#methodSeg button[data-v="time"]');
        if (segBtn) segBtn.click();
        setNowFields();
        setVal('question', '近期事业变动与财运顺逆如何？');
        clickPaipan();
      } else if (act === 'ly-auto') {
        var autoBtn = document.querySelector('#methodSeg button[data-v="auto"]');
        if (autoBtn) autoBtn.click();
        setVal('question', '所占事项吉凶与应期何时？');
        clickPaipan();
      } else if (act === 'ly-num') {
        var numBtn = document.querySelector('#methodSeg button[data-v="number"]');
        if (numBtn) numBtn.click();
        setVal('n1', 168); setVal('n2', 329);
        setVal('question', '合作求财能否顺利达成？');
        clickPaipan();
      } else if (act === 'qm-career') {
        setVal('purpose', 'career');
        setVal('juMethod', 'chaibu');
        setVal('panType', 'zhuan');
        clickPaipan();
      } else if (act === 'qm-love') {
        setVal('purpose', 'marriage');
        setVal('juMethod', 'zhirun');
        setVal('panType', 'zhuan');
        clickPaipan();
      } else if (act === 'hp-demo1') {
        setVal('aName', '林先生'); setVal('aGender', 'male');
        setVal('aYear', 1990); setVal('aMonth', 5); setVal('aDay', 20); setVal('aHour', 10); setVal('aMinute', 30);
        setVal('bName', '苏女士'); setVal('bGender', 'female');
        setVal('bYear', 1993); setVal('bMonth', 3); setVal('bDay', 8); setVal('bHour', 14); setVal('bMinute', 20);
        clickPaipan();
      } else if (act === 'hp-demo2') {
        setVal('aName', '周先生'); setVal('aGender', 'male');
        setVal('aYear', 1988); setVal('aMonth', 11); setVal('aDay', 12); setVal('aHour', 8); setVal('aMinute', 15);
        setVal('bName', '陈女士'); setVal('bGender', 'female');
        setVal('bYear', 1992); setVal('bMonth', 6); setVal('bDay', 25); setVal('bHour', 16); setVal('bMinute', 40);
        clickPaipan();
      } else if (act === 'hp-swap') {
        var fields = ['Name', 'Gender', 'Calendar', 'Year', 'Month', 'Day', 'Hour', 'Minute', 'City'];
        fields.forEach(function (f) {
          var ea = document.getElementById('a' + f);
          var eb = document.getElementById('b' + f);
          if (ea && eb) {
            var tmp = ea.value;
            ea.value = eb.value;
            eb.value = tmp;
          }
        });
        clickPaipan();
      }
    });

    return qbar;
  }

  function autoPreviewInitialChart() {
    var curSys = (document.body && document.body.dataset && document.body.dataset.sys) || '';
    if (!curSys || curSys === 'mine') return;
    setTimeout(function () {
      var chartEl = document.getElementById('chart');
      var btn = document.getElementById('btnPaipan');
      if (btn && !btn.disabled && chartEl && !chartEl.innerHTML.trim()) {
        window.__xjAutoPreviewing = true;
        btn.click();
      }
    }, 90);
  }

  function boot() {
    registerPwa();
    injectMobileTabBar();
    injectTopbarAlmanacBtn();
    ensureFormSummaryBar();
    ensureQuickCastBar();
    ensureStageViewTabs();
    ensureFollowupBox();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
