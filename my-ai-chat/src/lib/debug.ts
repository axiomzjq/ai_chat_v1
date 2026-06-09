/**
 * 调试模式配置
 * ──────────────────────────────────────
 * 控制所有调试入口（日志弹窗、日志拦截器、调试按钮等）的显示。
 *
 * 可选值：
 *   'dev'      — 开发测试模式：暴露一键登录 + 所有调试手段
 *   'internal' — 内部测试模式：保留所有调试手段，但不显示一键登录
 *   'off'      — 关闭所有调试功能，浏览器原生 console 行为完全恢复
 */

export const DEBUG_MODE: 'dev' | 'internal' | 'off' = 'dev';

/**
 * 调试用具：只在 DEBUG_MODE 不为 'off' 时执行
 */
export function ifDebug<T>(fn: () => T): T | undefined {
  if (DEBUG_MODE !== 'off') return fn();
  return undefined;
}
