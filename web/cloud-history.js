/**
 * 云历史客户端（P0-2）——「我的报告」共用的数据层
 *
 * 为什么单独成一个文件：排盘页（app.js）与「我的报告」页（mine.js）都要访问同一套
 * /api/reports 与账号接口。把会话令牌、请求封装收在这里，两边都不各写一份 fetch，
 * 避免字段/报错文案漂移。
 *
 * 会话：登录令牌存 localStorage['x-session-token']（与服务端 x-session-token 头对应）；
 * 游客不需要令牌，由服务端 httpOnly cookie 认设备。
 * 所有报错都转成「用户可读中文」，页面只管直接把 message 显示出来。
 */

'use strict';

(function () {
  const SESSION_KEY = 'xuanxue.session';

  function token() {
    try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
  }
  function setToken(t) {
    try {
      if (t) localStorage.setItem(SESSION_KEY, t);
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* 隐私模式：本次有效，刷新后需重新登录 */ }
  }

  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const tk = token();
    if (tk) headers['x-session-token'] = tk;
    const res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) throw new Error(data.error || ('请求失败（HTTP ' + res.status + '）'));
    return data;
  }

  function fmtTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function escapeHtml(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* 降级 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  window.CloudHistory = {
    api,
    token,
    setToken,
    fmtTime,
    escapeHtml,
    copyText,

    me: () => api('/api/auth/me'),
    login: (email, password) => api('/api/auth/login', { method: 'POST', body: { email, password } }),
    register: (email, password) => api('/api/auth/register', { method: 'POST', body: { email, password } }),
    logout: () => api('/api/auth/logout', { method: 'POST' }),
    orders: () => api('/api/orders'),

    saveReport: ({ system, title = '', subtitle = '', payload }) =>
      api('/api/reports', { method: 'POST', body: { system, title, subtitle, payload } }),
    listReports: () => api('/api/reports'),
    openReport: (id) => api('/api/reports/' + id + '/open', { method: 'POST' }),
    shareReport: (id) => api('/api/reports/' + id + '/share', { method: 'POST' }),
    removeReport: (id) => api('/api/reports/' + id, { method: 'DELETE' }),
  };
})();
