// Authing (GenAuth) 配置
// 从环境变量读取，避免凭据硬编码在源码中
// 开发环境：在 .env.local 中配置 VITE_AUTHING_APP_ID 和 VITE_AUTHING_DOMAIN
// 生产环境：在构建服务器上注入对应环境变量

export const AUTHING_APP_ID = import.meta.env.VITE_AUTHING_APP_ID || '';
export const AUTHING_HOST = `https://${import.meta.env.VITE_AUTHING_DOMAIN || ''}`;

export const AUTHING_CONFIG = {
  appId: AUTHING_APP_ID,
  host: AUTHING_HOST,
  redirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
};

export const isAuthingConfigured = !!AUTHING_APP_ID && !!AUTHING_HOST && AUTHING_HOST !== 'https://';

if (!isAuthingConfigured) {
  console.warn('[Authing] ⚠️ 未配置 VITE_AUTHING_APP_ID 或 VITE_AUTHING_DOMAIN，请在 .env.local 中设置');
}
