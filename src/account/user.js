/**
 * 轻量账号体系（零第三方依赖）
 *
 * 为什么需要：付费权益凭证目前只存在浏览器 localStorage，换设备 / 清缓存即丢失，
 * 用户「买了却用不了」，也没有自助查订单与退款的身份依据。本模块提供最小可用账号：
 *   - 邮箱 + 密码注册/登录；密码用 node:crypto scrypt 加盐哈希，绝不存明文
 *   - 会话令牌为 HMAC 签名串（与权益凭证共用服务端密钥），含过期时间
 *   - 同邮箱连续失败 5 次锁定 15 分钟，防暴力破解
 *   - 数据经统一存储层（src/storage/db.js：支持 node:sqlite WAL 与原子 JSON CAS 合并）落盘 data/users.json
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { getSecret } from '../commerce/entitle.js';
import { DATA_DIR, readCollection, writeCollection } from '../storage/db.js';
import { gate } from '../compliance/gateway.js';

const USER_FILE = path.join(DATA_DIR, 'users.json');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天
const MAX_FAIL = 5;
const LOCK_MS = 15 * 60 * 1000;

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function loadUsers() {
  return readCollection('users');
}

function saveUsers(list) {
  writeCollection('users', list);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'hex');
  const bb = Buffer.from(String(b), 'hex');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validate(email, password) {
  const e = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new Error('请输入有效的邮箱地址');
  if (!password || String(password).length < 8) throw new Error('密码至少 8 位');
  return e;
}

function publicUser(u) {
  const defaultName = (u.email || '').split('@')[0] || '玄机命友';
  return { id: u.id, email: u.email, nickname: u.nickname || defaultName, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null };
}

/** 签发会话令牌：base64url(载荷) + '.' + HMAC-SHA256 */
function issueToken(user) {
  const now = Date.now();
  const payload = { v: 1, uid: user.id, iat: now, exp: now + SESSION_TTL_MS };
  const sig = crypto.createHmac('sha256', getSecret()).update(JSON.stringify(payload)).digest('base64url');
  return b64url(JSON.stringify(payload)) + '.' + sig;
}

/**
 * 注册
 * @returns {{ user:object, token:string }}
 */
export function register({ email, password, nickname = '' } = {}) {
  const e = validate(email, password);
  const list = loadUsers();
  if (list.some((u) => u.email === e)) throw new Error('该邮箱已注册，请直接登录');
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: 'U' + crypto.randomBytes(6).toString('hex').toUpperCase(),
    email: e,
    nickname: String(nickname || '').trim().slice(0, 24) || e.split('@')[0],
    salt,
    hash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    fails: 0,
    lockedUntil: 0,
  };
  list.push(user);
  saveUsers(list);
  return { user: publicUser(user), token: issueToken(user) };
}

/**
 * 登录（含失败锁定）
 * @returns {{ user:object, token:string }}
 */
export function login({ email, password } = {}) {
  const e = normalizeEmail(email);
  if (!e || !password) throw new Error('请输入邮箱与密码');
  const list = loadUsers();
  const u = list.find((x) => x.email === e);
  if (!u) throw new Error('邮箱或密码不正确');
  if (u.lockedUntil && Date.now() < u.lockedUntil) {
    const min = Math.ceil((u.lockedUntil - Date.now()) / 60000);
    throw new Error(`连续输错次数过多，请 ${min} 分钟后重试`);
  }
  if (!safeEqual(hashPassword(password, u.salt), u.hash)) {
    u.fails = (u.fails || 0) + 1;
    if (u.fails >= MAX_FAIL) {
      u.lockedUntil = Date.now() + LOCK_MS;
      u.fails = 0;
      saveUsers(list);
      throw new Error('连续输错 5 次，账号已锁定 15 分钟');
    }
    saveUsers(list);
    throw new Error(`邮箱或密码不正确，还可尝试 ${MAX_FAIL - u.fails} 次`);
  }
  u.fails = 0;
  u.lockedUntil = 0;
  u.lastLoginAt = new Date().toISOString();
  saveUsers(list);
  return { user: publicUser(u), token: issueToken(u) };
}

/** 校验会话令牌，返回用户公开信息或 null */
export function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const enc = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload;
  try {
    payload = JSON.parse(Buffer.from(enc, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || !payload.uid || !payload.exp) return null;
  const expect = crypto.createHmac('sha256', getSecret()).update(JSON.stringify(payload)).digest('base64url');
  if (expect !== sig) return null;
  if (Date.now() > payload.exp) return null;
  const u = loadUsers().find((x) => x.id === payload.uid);
  return u ? publicUser(u) : null;
}

/** 退出登录（服务端不保存会话表，令牌自校验；此接口仅用于对称前端行为与日志） */
export function logout() {
  return true;
}

export function getUserById(id) {
  const u = loadUsers().find((x) => x.id === id);
  return u ? publicUser(u) : null;
}

/** 账号概览（后台用） */
export function userStats() {
  const list = loadUsers();
  return { total: list.length, locked: list.filter((u) => u.lockedUntil && Date.now() < u.lockedUntil).length, file: USER_FILE };
}


// ------------------------------------------------------------------
// 用户意见反馈（直接内聚于 user.js，防止 git commit -a 漏掉新建未跟踪文件导致启动报错）
// ------------------------------------------------------------------

export const FEEDBACK_CATEGORIES = [
  { key: 'algorithm', label: '排盘与历法建议' },
  { key: 'ui_ux', label: '界面与手机适配' },
  { key: 'feature', label: '新功能许愿' },
  { key: 'bug', label: '异常与 Bug 报错' },
  { key: 'other', label: '其它建议' },
];

const VALID_FBK_CATS = new Set(FEEDBACK_CATEGORIES.map((c) => c.key));
const FBK_CAT_LABEL = Object.fromEntries(FEEDBACK_CATEGORIES.map((c) => [c.key, c.label]));

export function submitFeedback({
  owner = '',
  userEmail = '',
  userNickname = '',
  category = 'ui_ux',
  system = 'general',
  rating = 5,
  content = '',
  contact = '',
  pageUrl = '',
} = {}) {
  const rawContent = String(content || '').trim();
  if (rawContent.length < 4) {
    throw new Error('请填写至少 4 个字的具体反馈内容，以便我们改进');
  }
  if (rawContent.length > 1000) {
    throw new Error('单条反馈请控制在 1000 字以内');
  }

  const cat = VALID_FBK_CATS.has(category) ? category : 'other';
  const sys = ['bazi', 'liuyao', 'qimen', 'ziwei', 'hepan', 'mine', 'general'].includes(system)
    ? system
    : 'general';
  const stars = Math.max(1, Math.min(5, Math.round(Number(rating) || 5)));
  const cleanContact = String(contact || '').trim().slice(0, 80);
  const safeContent = gate(rawContent, { system: 'general', section: 'feedback' }).text;

  const now = new Date().toISOString();
  const id = 'FB' + crypto.randomBytes(5).toString('hex').toUpperCase();

  const autoReplyMap = {
    algorithm: '已收录至「玄机历算与排盘内核组」工单池，我们将核对古籍口径与万年历真值后在后续版本校准。',
    ui_ux: '已收录至「双端视觉与适老化体验组」工单池，我们会持续优化手机端与桌面端的排版可读性。',
    feature: '感谢您的功能许愿！已纳入玄机产品迭代路线图评估队列。',
    bug: '已触发高优异常排查工单，工程团队将根据您所在页面的上下文复现并热修。',
    other: '感谢您的宝贵建议！您的每一条反馈都是玄机持续打磨产品品质的动力。',
  };

  const item = {
    id,
    owner: String(owner || 'anonymous'),
    userEmail: String(userEmail || ''),
    userNickname: String(userNickname || ''),
    category: cat,
    categoryLabel: FBK_CAT_LABEL[cat] || '其它建议',
    system: sys,
    rating: stars,
    content: safeContent,
    contact: cleanContact,
    pageUrl: String(pageUrl || '').slice(0, 120),
    status: '已受理',
    reply: autoReplyMap[cat] || autoReplyMap.other,
    createdAt: now,
    updatedAt: now,
  };

  const list = readCollection('feedbacks');
  list.unshift(item);
  if (list.length > 500) list.length = 500;
  writeCollection('feedbacks', list);
  return item;
}

export function listFeedbacks(owner, { limit = 30 } = {}) {
  const list = readCollection('feedbacks');
  if (!owner) return list.slice(0, limit);
  return list
    .filter((x) => x && x.owner === owner)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, limit);
}

export function removeFeedback(id, owner) {
  if (!id || !owner) return false;
  const list = readCollection('feedbacks');
  const target = list.find((x) => x && x.id === id);
  if (!target || target.owner !== owner) return false;
  const next = list.filter((x) => x && x.id !== id);
  writeCollection('feedbacks', next, { deletedIds: [id] });
  return true;
}
