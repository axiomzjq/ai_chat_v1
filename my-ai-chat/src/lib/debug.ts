/**
 * 调试模式配置
 * ──────────────────────────────────────
 * 控制所有调试入口（日志弹窗、日志拦截器、调试按钮等）的显示。
 * 
 * 一键关闭所有调试 UI：
 *   把下面 DEBUG_MODE 改为 false，重新构建即可。
 * 
 * 注意：关闭调试模式后，console 拦截器也会停用，
 * 浏览器原生 console 行为完全恢复。
 */

export const DEBUG_MODE = true;

/**
 * 调试用具：只在 DEBUG_MODE 为 true 时执行
 */
export function ifDebug<T>(fn: () => T): T | undefined {
  if (DEBUG_MODE) return fn();
  return undefined;
}
