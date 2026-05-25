// Authing (GenAuth) 配置
// 请替换为你在 Authing 控制台获取的真实配置
// 控制台地址：https://console.authing.cn

export const AUTHING_CONFIG = {
  appId: import.meta.env.VITE_AUTHING_APP_ID || 'PLACEHOLDER_APP_ID',
  domain: import.meta.env.VITE_AUTHING_DOMAIN || 'PLACEHOLDER_DOMAIN.authing.cn',
  host: `https://${import.meta.env.VITE_AUTHING_DOMAIN || 'PLACEHOLDER_DOMAIN.authing.cn'}`,
  redirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
};

// 验证配置是否已填写
export function isAuthingConfigured(): boolean {
  return AUTHING_CONFIG.appId !== 'PLACEHOLDER_APP_ID' && AUTHING_CONFIG.domain !== 'PLACEHOLDER_DOMAIN.authing.cn';
}
