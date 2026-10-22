'use strict';

/**
 * 我的报告页（P0-2 云历史）的页面控制层。
 * 数据访问统一走 web/cloud-history.js，这里只管：账号区、报告列表、订单弹层。
 *
 * 可访问性沿用 P0-3 规范：label 全带 for、消息区 aria-live、按钮可键盘到达。
 */

const $ = (id) => document.getElementById(id);
const CH = window.CloudHistory;
const SYS_NAME = { bazi: '八字', liuyao: '六爻', qimen: '奇门', ziwei: '紫微', hepan: '合盘' };

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
    $('acctEmail').textContent = email;
    // 头像取邮箱首字（@ 前的第一个有效字符），取不到就退回「玄」
    const head = (email.split('@')[0] || '').trim();
    $('acctAvatar').textContent = head ? head[0].toUpperCase() : '玄';
    $('mrLead').textContent = '已登录，下面列出云端保存的全部报告。换设备登录同一邮箱即可看到同一份历史。';
  } else {
    $('mrLead').textContent = '当前是临时保存（只在这台设备生效）。注册登录后，换设备也能看到同一份历史。';
  }
}

/** 分段切换「登录 / 注册」：同一时刻只留一套表单，且把另一套的已填内容清掉防误提交 */
function switchAuthTab(which) {
  const toRegister = which === 'register';
  $('tabLogin').setAttribute('aria-selected', String(!toRegister));
  $('tabRegister').setAttribute('aria-selected', String(toRegister));
  $('formLogin').hidden = toRegister;
  $('formRegister').hidden = !toRegister;
  if (toRegister) { $('rgEmail').value = ''; $('rgPwd').value = ''; }
  else { $('lgEmail').value = ''; $('lgPwd').value = ''; }
  // 焦点跟着走，键盘用户不用重新 Tab 一遍
  (toRegister ? $('rgEmail') : $('lgEmail')).focus();
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
  if (!email.trim() || !pwdEl.value) { msg('请填写邮箱与密码', true); return; }
  try {
    const d = kind === 'login'
      ? await CH.login(email.trim(), pwdEl.value)
      : await CH.register(email.trim(), pwdEl.value);
    CH.setToken(d.token || '');
    await loadMe();
    await loadList();
    msg(kind === 'login' ? '登录成功' : '注册成功，已自动登录');
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
    box.innerHTML = '<p class="mr-empty">还没有保存过报告。去八字 / 六爻 / 奇门 / 紫微排一盘，点「保存到我的报告」即可。</p>';
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

// ---------------------------------------------------------------- 我的订单

/**
 * 订单弹层开关。
 * 注意：.xj-modal 本体是 display:none、只有 .show 才 display:flex，
 * 光设 hidden=false 是打不开的（P0-2 踩过：hidden 被作者样式吃掉）。
 */
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
      ? list.map((o) => `
        <div class="xj-item">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div class="t">${CH.escapeHtml(o.skuName || o.skuId || '订单')}</div>
            <div style="color:var(--gold-ink);font-weight:700;">¥${Number(o.amount || 0).toFixed(2)}</div>
          </div>
          <div class="m">${CH.escapeHtml(o.status)} · ${CH.escapeHtml(CH.fmtTime(o.createdAt || o.paidAt || o.updatedAt))}
            ${o.orderId ? ' · 单号 ' + CH.escapeHtml(o.orderId) : ''}</div>
        </div>`).join('')
      : '<p style="color:var(--sub);font-size:13px;padding:12px 0;">还没有订单记录。</p>';
    $('xjOrdersTotal').textContent = '¥' + list.reduce((a, o) => a + Number(o.amount || 0), 0).toFixed(2);
  } catch (e) {
    $('xjOrdersList').innerHTML = '<p style="color:var(--red);font-size:13px;padding:12px 0;">' + CH.escapeHtml(e.message) + '</p>';
  }
}

// ---------------------------------------------------------------- 启动

(async function init() {
  await checkService();
  await loadMe();
  await loadList();

  $('formLogin').addEventListener('submit', (e) => { e.preventDefault(); submitAuth('login'); });
  $('formRegister').addEventListener('submit', (e) => { e.preventDefault(); submitAuth('register'); });
  $('btnToRegister').addEventListener('click', () => switchAuthTab('register'));
  $('btnToLogin').addEventListener('click', () => switchAuthTab('login'));
  $('tabLogin').addEventListener('click', () => switchAuthTab('login'));
  $('tabRegister').addEventListener('click', () => switchAuthTab('register'));
  $('btnLogout').addEventListener('click', async () => {
    try { await CH.logout(); } catch { /* 令牌自校验，失败也按退出处理 */ }
    CH.setToken('');
    switchAuthTab('login'); // 退出后回到登录态，切回登录表单
    await loadMe();
    await loadList();
    msg('已退出登录，现在保存的报告仅属于这台设备');
  });
  $('btnOrders').addEventListener('click', showOrders);
  $('xjOrdersClose').addEventListener('click', () => setOrdersModal(false));
  $('xjOrdersMask').addEventListener('click', () => setOrdersModal(false));
  // 键盘可达：Esc 关弹层
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('xjOrdersModal') && !$('xjOrdersModal').hidden) setOrdersModal(false);
  });
})();
