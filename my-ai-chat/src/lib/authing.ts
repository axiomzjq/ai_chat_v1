// Authing (GenAuth) 配置
// 控制台地址：https://console.authing.cn

export const AUTHING_APP_ID = '6a13a72bc34d1d925e777d82';
export const AUTHING_HOST = 'https://fnbd4tjpcxb5-demo.authing.cn';

export const AUTHING_CONFIG = {
  appId: AUTHING_APP_ID,
  host: AUTHING_HOST,
  redirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
};

export const isAuthingConfigured = !!AUTHING_APP_ID && !!AUTHING_HOST;
