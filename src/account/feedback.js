/**
 * 用户意见反馈模块（src/account/feedback.js）
 * 统一从 ./user.js 导出，兼容直接引用与合并引用。
 */
export {
  FEEDBACK_CATEGORIES,
  submitFeedback,
  listFeedbacks,
  removeFeedback,
} from './user.js';
