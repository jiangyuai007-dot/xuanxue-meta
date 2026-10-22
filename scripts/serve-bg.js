/**
 * 后台静默模式入口：不开浏览器，直接复用 serve.js。
 * 供 Windows 计划任务开机自启使用。
 */
process.env.XZ_NO_BROWSER = '1';
await import('./serve.js');
