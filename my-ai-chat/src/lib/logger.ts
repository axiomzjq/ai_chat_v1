/**
 * 全局日志拦截器
 * 收集 console.log/error/warn、网络请求、未捕获异常，支持一键导出
 */

export interface LogEntry {
  type: 'log' | 'error' | 'warn' | 'info' | 'network' | 'event';
  time: string;
  message: string;
  detail?: any;
}

const MAX_LOGS = 500;
const LOGS: LogEntry[] = [];

function pushLog(type: LogEntry['type'], args: any[]) {
  const entry: LogEntry = {
    type,
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    message: args
      .map((a) => {
        if (a === null) return 'null';
        if (a === undefined) return 'undefined';
        if (typeof a === 'object') {
          try {
            return JSON.stringify(a);
          } catch {
            return '[Circular/Object]';
          }
        }
        return String(a);
      })
      .join(' '),
    detail: args.length === 1 && typeof args[0] === 'object' ? args[0] : undefined,
  };
  LOGS.push(entry);
  if (LOGS.length > MAX_LOGS) LOGS.shift();

  // 同时输出到原始控制台
  const originals = {
    log: (console as any)._origLog || console.log,
    error: (console as any)._origError || console.error,
    warn: (console as any)._origWarn || console.warn,
    info: (console as any)._origInfo || console.info,
  };
  const fn = type === 'error' ? originals.error : type === 'warn' ? originals.warn : type === 'info' ? originals.info : originals.log;
  fn.apply(console, args);
}

// 保存原始方法
const _origLog = console.log;
const _origError = console.error;
const _origWarn = console.warn;
const _origInfo = console.info;
(console as any)._origLog = _origLog;
(console as any)._origError = _origError;
(console as any)._origWarn = _origWarn;
(console as any)._origInfo = _origInfo;

console.log = (...args: any[]) => pushLog('log', args);
console.error = (...args: any[]) => pushLog('error', args);
console.warn = (...args: any[]) => pushLog('warn', args);
console.info = (...args: any[]) => pushLog('info', args);

// 拦截未捕获的 Promise 错误
window.addEventListener('unhandledrejection', (event) => {
  pushLog('error', [
    `[UnhandledRejection] ${event.reason?.message || String(event.reason)}`,
    event.reason,
  ]);
});

// 拦截全局 JS 错误
window.addEventListener('error', (event) => {
  pushLog('error', [
    `[GlobalError] ${event.message}`,
    { filename: event.filename, lineno: event.lineno, colno: event.colno, error: event.error?.stack },
  ]);
});

// 拦截 fetch
const origFetch = window.fetch;
window.fetch = async (...args) => {
  const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
  const method = (args[1]?.method || 'GET').toUpperCase();
  const start = performance.now();

  try {
    const response = await origFetch(...args);
    const duration = Math.round(performance.now() - start);

    // 尝试读取响应体（仅 JSON）
    let bodyPreview = '';
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const clone = response.clone();
        const json = await clone.json();
        bodyPreview = JSON.stringify(json).slice(0, 300);
      } catch {
        /* ignore */
      }
    }

    if (!response.ok) {
      pushLog('error', [
        `[HTTP ${response.status}] ${method} ${url} (${duration}ms)`,
        bodyPreview ? { response: bodyPreview } : undefined,
      ]);
    } else {
      pushLog('network', [
        `[HTTP ${response.status}] ${method} ${url} (${duration}ms)`,
        bodyPreview ? { response: bodyPreview } : undefined,
      ]);
    }
    return response;
  } catch (err: any) {
    pushLog('error', [`[Fetch Failed] ${method} ${url} - ${err.message}`]);
    throw err;
  }
};

// 拦截 XMLHttpRequest（某些库可能用 XHR）
const origXHROpen = XMLHttpRequest.prototype.open;
const origXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
  (this as any).__loggerMethod = method;
  (this as any).__loggerUrl = String(url);
  return origXHROpen.call(this, method, url, ...rest);
};

XMLHttpRequest.prototype.send = function (...args: any[]) {
  const xhr = this;
  const method = (xhr as any).__loggerMethod || 'GET';
  const url = (xhr as any).__loggerUrl || '';
  const start = performance.now();

  xhr.addEventListener('loadend', () => {
    const duration = Math.round(performance.now() - start);
    const status = xhr.status;
    const body = xhr.responseText?.slice(0, 300) || '';

    if (status >= 400) {
      pushLog('error', [
        `[XHR ${status}] ${method} ${url} (${duration}ms)`,
        body ? { response: body } : undefined,
      ]);
    } else {
      pushLog('network', [
        `[XHR ${status}] ${method} ${url} (${duration}ms)`,
        body ? { response: body } : undefined,
      ]);
    }
  });

  return origXHRSend.call(this, ...args);
};

// ====== 导出 API ======

export function getLogs(): LogEntry[] {
  return LOGS.slice();
}

export function exportLogs(): string {
  return LOGS.map((l) => `[${l.time}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
}

export function exportLogsJSON(): string {
  return JSON.stringify(LOGS, null, 2);
}

export function clearLogs() {
  LOGS.length = 0;
}

// 暴露到全局，方便控制台手动调用
(window as any).__getLogs = exportLogs;
(window as any).__getLogsJSON = exportLogsJSON;
(window as any).__clearLogs = clearLogs;

console.info('[Logger] 日志拦截器已初始化');
