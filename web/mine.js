'use strict';

/**
 * 个人中心与意见反馈页（web/mine.js · v2.5）
 * 涵盖：
 *   1. 尊享会员注册与登录（支持称呼/道号、实时密码安全度检测、明文显示切换）
 *   2. 云端排盘报告列表（打开重排、7天分享链接、删除）
 *   3. 我的订单与一键自助退款闭环
 *   4. 意见反馈与产品改进建议工作台（提交反馈、实时受理回执、历史反馈管理）
 */

const $ = (id) => document.getElementById(id);
const CH = window.CloudHistory;
const SYS_NAME = { bazi: '八字', liuyao: '六爻', qimen: '奇门', ziwei: '紫微', hepan: '合盘', general: '全站通用' };
const STATUS_LABEL = {
  paid: '已支付',
  refunded: '已退款',
  pending: '待支付',
  closed: '已关闭',
};

function msg(text, isErr) {
  const el = $('msg');
  if (!el) return;
  el.textContent = text || '';
  el.className = isErr ? 'msg err' : 'msg';
}

// ---------------------------------------------------------------- 服务状态

async function checkService() {
  const dot = $('svcDot');
  const txt = $('svcTxt');
  const b = $('svcBanner');
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
      const r = await fetch('/api/health', { method: 'GET', signal: ac.signal });
      if (!r.ok) throw new Error('bad');
      dot.classList.remove('down');
      txt.textContent = '本地服务正常';
      b.style.display = 'none';
    } finally {
      clearTimeout(timer);
    }
  } catch {
    dot.classList.add('down');
    txt.textContent = '服务未启动';
    b.className = 'svc-banner down';
    b.style.display = 'flex';
    b.innerHTML = '<span class="ic">⚠️</span><span class="txt"><b>本地服务未启动</b>　我的报告暂不可用，请先启动服务再刷新本页。</span>';
  }
}

// ---------------------------------------------------------------- 账号区

function renderAccount(me) {
  $('acctOnline').hidden = !me;
  $('acctGuest').hidden = !!me;
  if (me) {
    const email = me.email || '';
    const nick = me.nickname || (email.split('@')[0] || '玄机命友');
    $('acctEmail').textContent = email;
    if ($('acctNickname')) $('acctNickname').textContent = nick;
    const head = ( email.split('@')[0] || '' ).trim();
    $('acctAvatar').textContent = head ? head[0].toUpperCase() : '玄';
    $('mrLead').textContent = `欢迎回来，${nick}！您的云端命谱与已购报告已自动同步，换设备登录同一邮箱即可随时查阅。`;
  } else {
    $('mrLead').textContent = '当前是本机临时保存模式。注册或登录账号后，换手机或电脑也能看到同一份命谱与已购章节。';
  }
}

function switchAuthTab(which) {
  const toRegister = which === 'register';
  $('tabLogin').setAttribute('aria-selected', String(!toRegister));
  $('tabRegister').setAttribute('aria-selected', String(toRegister));
  $('formLogin').hidden = toRegister;
  $('formRegister').hidden = !toRegister;
  if (toRegister) {
    $('rgEmail').value = '';
    $('rgPwd').value = '';
    if ($('rgNickname')) $('rgNickname').value = '';
    updatePwdStrength('');
  } else {
    $('lgEmail').value = '';
    $('lgPwd').value = '';
  }
  (toRegister ? $('rgEmail') : $('lgEmail')).focus();
}

function updatePwdStrength(pwd) {
  const s = String(pwd || '');
  const b1 = $('pmBar1');
  const b2 = $('pmBar2');
  const b3 = $('pmBar3');
  const tx = $('pmText');
  if (!b1 || !b2 || !b3 || !tx) return;
  b1.className = 'pm-bar';
  b2.className = 'pm-bar';
  b3.className = 'pm-bar';
  if (!s.length) {
    tx.textContent = '待输入（至少8位）';
    tx.style.color = '#7a6f5d';
    return;
  }
  if (s.length < 8) {
    b1.classList.add('weak');
    tx.textContent = `还差 ${8 - s.length} 位`;
    tx.style.color = '#b3392c';
    return;
  }
  const hasLetter = /[A-Za-z]/.test(s);
  const hasDigit = /\d/.test(s);
  const hasSym = /[^A-Za-z0-9]/.test(s);
  const kindCount = (hasLetter ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSym ? 1 : 0);
  if (s.length >= 10 && kindCount >= 2) {
    b1.classList.add('strong');
    b2.classList.add('strong');
    b3.classList.add('strong');
    tx.textContent = '强（安全可靠）';
    tx.style.color = '#1f6e43';
  } else {
    b1.classList.add('mid');
    b2.classList.add('mid');
    tx.textContent = '中（可用，建议字母+数字组合）';
    tx.style.color = '#9e731e';
  }
}

async function loadMe() {
  try {
    const d = await CH.api('/api/auth/me');
    renderAccount(d.user || null);
  } catch {
    renderAccount(null);
  }
}

async function submitAuth(kind) {
  const email = ($(kind === 'login' ? 'lgEmail' : 'rgEmail') || {}).value || '';
  const pwdEl = $(kind === 'login' ? 'lgPwd' : 'rgPwd');
  const nick = kind === 'register' && $('rgNickname') ? $('rgNickname').value.trim() : '';
  if (!email.trim() || !pwdEl.value) { msg('请填写完整的邮箱与密码', true); return; }
  try {
    const d = kind === 'login'
      ? await CH.login(email.trim(), pwdEl.value)
      : await CH.register(email.trim(), pwdEl.value, nick);
    CH.setToken(d.token || '');
    await loadMe();
    await loadList();
    await loadFeedbacks();
    msg(kind === 'login' ? '登录成功，已同步云端档案' : '注册成功，已自动登录并开启云同步');
  } catch (e) {
    msg(e.message || '操作失败', true);
  }
}

// ---------------------------------------------------------------- 报告列表

async function loadList() {
  const box = $('mrList');
  if (!box) return;
  box.setAttribute('aria-busy', 'true');
  box.innerHTML = '<p class="mr-empty">正在载入…</p>';
  try {
    const d = await CH.listReports();
    renderList(d.items || []);
  } catch (e) {
    box.innerHTML = '<p class="mr-empty">载入失败：' + CH.escapeHtml(e.message) + '</p>';
  } finally {
    box.setAttribute('aria-busy', 'false');
  }
}

function renderList(items) {
  const box = $('mrList');
  if (!box) return;
  if (!items.length) {
    box.innerHTML = '<p class="mr-empty">还没有保存过报告。去八字 / 六爻 / 奇门 / 紫微 / 合盘排一盘，点「保存到我的报告」即可。</p>';
    return;
  }
  box.innerHTML = items.map((it) => `
    <article class="mr-item" data-id="${CH.escapeHtml(it.id)}">
      <div class="mr-i-badge">${CH.escapeHtml(SYS_NAME[it.system] || it.system)}</div>
      <div class="mr-i-main">
        <h3 class="mr-i-t">${CH.escapeHtml(it.title || '未命名报告')}</h3>
        <p class="mr-i-m">${CH.escapeHtml(it.subtitle || '')}　·　保存于 ${CH.escapeHtml(CH.fmtTime(it.updatedAt))}</p>
      </div>
      <div class="mr-i-acts">
        <button class="mini" type="button" data-act="open">打开</button>
        <button class="mini" type="button" data-act="share">分享链接</button>
        <button class="mini" type="button" data-act="del">删除</button>
      </div>
    </article>`).join('');

  box.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.mr-item').dataset.id;
      const act = btn.dataset.act;
      if (act === 'del') {
        if (!confirm('删除后无法恢复，确认删除这份报告？')) return;
        btn.disabled = true;
        try {
          await CH.removeReport(id);
          msg('已删除');
          await loadList();
        } catch (e) {
          btn.disabled = false;
          msg(e.message, true);
        }
        return;
      }
      btn.disabled = true;
      try {
        const r = act === 'share' ? await CH.shareReport(id) : await CH.openReport(id);
        if (act === 'share') {
          const link = location.origin + r.reportUrl;
          const copied = await CH.copyText(link);
          msg('分享链接已生成' + (copied ? '并复制到剪贴板' : '') + '，7 天内有效');
        }
        location.href = r.reportUrl;
      } catch (e) {
        btn.disabled = false;
        msg(e.message, true);
      }
    });
  });
}

// ---------------------------------------------------------------- 意见反馈与产品建议

async function loadFeedbacks() {
  const box = $('fbkList');
  if (!box) return;
  try {
    const d = await CH.listFeedbacks();
    renderFeedbacks(d.items || []);
  } catch (e) {
    box.innerHTML = '<p class="mr-empty">反馈记录载入失败：' + CH.escapeHtml(e.message) + '</p>';
  }
}

function renderFeedbacks(items) {
  const box = $('fbkList');
  if (!box) return;
  if (!items.length) {
    box.innerHTML = '<p class="mr-empty">您还没有提交过意见反馈。欢迎在上方填写使用体验或改进建议！</p>';
    return;
  }
  box.innerHTML = items.map((it) => {
    const stars = '★'.repeat(Number(it.rating) || 5) + '☆'.repeat(5 - (Number(it.rating) || 5));
    return `
    <article class="fbk-card" data-fbk-id="${CH.escapeHtml(it.id)}">
      <div class="fbk-card-hd">
        <div class="fbk-card-tags">
          <span class="fbk-badge status">${CH.escapeHtml(it.status || '已受理')}</span>
          <span class="fbk-badge cat">${CH.escapeHtml(it.categoryLabel || '建议')}</span>
          <span class="fbk-badge sys">${CH.escapeHtml(SYS_NAME[it.system] || '通用')}</span>
          <span class="fbk-stars" title="体验评分 ${it.rating || 5} 分">${stars}</span>
        </div>
        <div class="fbk-card-meta">
          <span>单号 ${CH.escapeHtml(it.id)} · ${CH.escapeHtml(CH.fmtTime(it.createdAt))}</span>
          <button type="button" class="mini" data-fbk-del="${CH.escapeHtml(it.id)}">删除</button>
        </div>
      </div>
      <div class="fbk-card-body">${CH.escapeHtml(it.content)}</div>
      ${it.reply ? `<div class="fbk-card-reply"><b>✦ 玄机团队回执：</b>${CH.escapeHtml(it.reply)}</div>` : ''}
    </article>`;
  }).join('');

  box.querySelectorAll('[data-fbk-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-fbk-del');
      if (!id) return;
      btn.disabled = true;
      try {
        await CH.removeFeedback(id);
        msg('已删除该条反馈记录');
        await loadFeedbacks();
      } catch (e) {
        btn.disabled = false;
        msg(e.message || '删除失败', true);
      }
    });
  });
}

async function handleFeedbackSubmit(e) {
  e.preventDefault();
  const contentEl = $('fbkContent');
  const content = contentEl ? contentEl.value.trim() : '';
  if (content.length < 4) {
    msg('请填写至少 4 个字的具体反馈内容', true);
    if (contentEl) contentEl.focus();
    return;
  }
  const btn = $('btnSubmitFeedback');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '提交中…';
  }
  try {
    await CH.submitFeedback({
      category: $('fbkCategory') ? $('fbkCategory').value : 'ui_ux',
      system: $('fbkSystem') ? $('fbkSystem').value : 'general',
      rating: $('fbkRating') ? Number($('fbkRating').value) : 5,
      content,
      contact: $('fbkContact') ? $('fbkContact').value.trim() : '',
      pageUrl: location.pathname,
    });
    if (contentEl) contentEl.value = '';
    msg('感谢您的反馈！工单已生成并录入系统');
    await loadFeedbacks();
  } catch (err) {
    msg(err.message || '提交失败，请稍后重试', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '提交意见反馈';
    }
  }
}

// ---------------------------------------------------------------- 我的订单（含 Phase 4 自助退款闭环）

function setOrdersModal(open) {
  const modal = $('xjOrdersModal');
  if (!modal) return;
  if (open) {
    modal.hidden = false;
    modal.classList.add('show');
    $('xjOrdersClose').focus();
  } else {
    modal.classList.remove('show');
    modal.hidden = true;
    $('btnOrders').focus();
  }
}

async function showOrders() {
  const modal = $('xjOrdersModal');
  if (!modal) return;
  setOrdersModal(true);
  $('xjOrdersList').innerHTML = '<p style="color:var(--sub);">载入中…</p>';
  $('xjOrdersTotal').textContent = '';
  try {
    const d = await CH.orders();
    const list = d.orders || [];
    $('xjOrdersList').innerHTML = list.length
      ? list.map((o) => {
          const oid = o.id || o.orderId || '';
          const statusLabel = STATUS_LABEL[o.status] || o.status;
          const refundBtn = o.canRefund
            ? `<button type="button" class="mini" data-refund-id="${CH.escapeHtml(oid)}" style="margin-left:8px;">申请退款</button>`
            : '';
          return `
        <div class="xj-item">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div class="t">${CH.escapeHtml(o.skuName || o.skuId || '订单')}</div>
            <div style="display:flex;align-items:center;">
              <span style="color:var(--gold-ink);font-weight:700;">¥${Number(o.amount || 0).toFixed(2)}</span>
              ${refundBtn}
            </div>
          </div>
          <div class="m">${CH.escapeHtml(statusLabel)} · ${CH.escapeHtml(CH.fmtTime(o.createdAt || o.paidAt || o.updatedAt))}
            ${oid ? ' · 单号 ' + CH.escapeHtml(oid) : ''}
            ${o.refundId ? ' · 退款单 ' + CH.escapeHtml(o.refundId) : ''}</div>
        </div>`;
        }).join('')
      : '<p style="color:var(--sub);font-size:13px;padding:12px 0;">还没有订单记录。</p>';

    const paidSum = list
      .filter((o) => o.status === 'paid')
      .reduce((a, o) => a + Number(o.amount || 0), 0);
    $('xjOrdersTotal').textContent = '¥' + paidSum.toFixed(2);

    $('xjOrdersList').querySelectorAll('[data-refund-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const oid = btn.getAttribute('data-refund-id');
        if (!oid) return;
        if (!confirm(`确认对订单 ${oid} 申请退款？退款后对应解锁权益将立即回收。`)) return;
        btn.disabled = true;
        btn.textContent = '处理中…';
        try {
          await CH.refundOrder(oid, '用户订单中心自助申请退款');
          msg(`订单 ${oid} 已完成退款`);
          await showOrders();
        } catch (e) {
          btn.disabled = false;
          btn.textContent = '申请退款';
          alert(e.message || '退款失败');
        }
      });
    });
  } catch (e) {
    $('xjOrdersList').innerHTML = '<p style="color:var(--red);font-size:13px;padding:12px 0;">' + CH.escapeHtml(e.message) + '</p>';
  }
}

// ---------------------------------------------------------------- 启动

(async function init() {
  await checkService();
  await loadMe();
  await loadList();
  await loadFeedbacks();

  $('formLogin').addEventListener('submit', (e) => { e.preventDefault(); submitAuth('login'); });
  $('formRegister').addEventListener('submit', (e) => { e.preventDefault(); submitAuth('register'); });
  $('btnToRegister').addEventListener('click', () => switchAuthTab('register'));
  $('btnToLogin').addEventListener('click', () => switchAuthTab('login'));
  $('tabLogin').addEventListener('click', () => switchAuthTab('login'));
  $('tabRegister').addEventListener('click', () => switchAuthTab('register'));

  if ($('rgPwd')) {
    $('rgPwd').addEventListener('input', function () { updatePwdStrength(this.value); });
  }
  if ($('chkShowPwd')) {
    $('chkShowPwd').addEventListener('change', function () {
      const t = this.checked ? 'text' : 'password';
      if ($('lgPwd')) $('lgPwd').type = t;
      if ($('rgPwd')) $('rgPwd').type = t;
    });
  }
  if ($('btnJumpFeedback')) {
    $('btnJumpFeedback').addEventListener('click', () => {
      const sec = $('feedbackSection');
      if (sec) sec.scrollIntoView({ behavior: 'smooth' });
      if ($('fbkContent')) $('fbkContent').focus();
    });
  }
  if ($('formFeedback')) {
    $('formFeedback').addEventListener('submit', handleFeedbackSubmit);
  }

  $('btnLogout').addEventListener('click', async () => {
    try { await CH.logout(); } catch { /* ignore */ }
    CH.setToken('');
    switchAuthTab('login');
    await loadMe();
    await loadList();
    await loadFeedbacks();
    msg('已退出登录，现在保存的报告仅属于这台设备');
  });
  $('btnOrders').addEventListener('click', showOrders);
  $('xjOrdersClose').addEventListener('click', () => setOrdersModal(false));
  $('xjOrdersMask').addEventListener('click', () => setOrdersModal(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('xjOrdersModal') && !$('xjOrdersModal').hidden) setOrdersModal(false);
  });
})();
