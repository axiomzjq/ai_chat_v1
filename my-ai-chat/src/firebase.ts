import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Authing } from '@authing/web';
import { AuthenticationClient, SceneType } from 'authing-js-sdk';
import firebaseConfig from '../firebase-applet-config.json';

// ==================== Firebase App & Firestore ====================
let app: any;
let db: any;
let _firebaseInitError: Error | null = null;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
} catch (err) {
  _firebaseInitError = err instanceof Error ? err : new Error(String(err));
  console.error('Firebase/Firestore initialization failed:', _firebaseInitError);
  app = null;
  db = null;
}

export { db };
export const firebaseInitError = _firebaseInitError;

// ==================== Authing Integration (Replaces Firebase Auth) ====================
// 使用 Authing 替代 Firebase Auth，解决中国大陆网络访问问题

// 从环境变量读取 Authing 配置，避免凭据硬编码
const AUTING_APP_ID = import.meta.env.VITE_AUTHING_APP_ID || '';
const AUTING_DOMAIN = import.meta.env.VITE_AUTHING_DOMAIN || '';
const AUTING_USER_POOL_ID = import.meta.env.VITE_AUTHING_USER_POOL_ID || '';
const AUTING_APP_SECRET = import.meta.env.VITE_AUTHING_APP_SECRET || '';
const AUTING_HOST = AUTING_DOMAIN ? `https://${AUTING_DOMAIN}` : '';

console.log('[Auth] Env check:', {
  appId: AUTING_APP_ID ? '***' + AUTING_APP_ID.slice(-6) : '(empty)',
  domain: AUTING_DOMAIN || '(empty)',
  host: AUTING_HOST || '(empty)',
  userPoolId: AUTING_USER_POOL_ID ? '***' + AUTING_USER_POOL_ID.slice(-6) : '(empty)',
  hasSecret: !!AUTING_APP_SECRET,
  origin: typeof window !== 'undefined' ? window.location.origin : '(ssr)',
});

let authingClient: Authing | null = null;
let authClient: AuthenticationClient | null = null;
try {
  if (AUTING_APP_ID && AUTING_HOST) {
    authingClient = new Authing({
      domain: AUTING_HOST,
      appId: AUTING_APP_ID,
      userPoolId: AUTING_USER_POOL_ID,
      redirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
      scope: 'openid profile email offline_access',
      // HTTP 非安全上下文下 crypto API 不可用，降级为隐式授权模式
      useImplicitMode: typeof window !== 'undefined' && window.location.protocol !== 'https:',
    });
    // authing-js-sdk client for phone code login/register
    authClient = new AuthenticationClient({
      appId: AUTING_APP_ID,
      appHost: AUTING_HOST,
      secret: AUTING_APP_SECRET || undefined,
    });
    console.log('[Auth] Authing SDK initialized successfully');
  } else {
    console.warn('[Auth] Authing 未配置，请在 .env.local 中设置 VITE_AUTHING_APP_ID 和 VITE_AUTHING_DOMAIN');
  }
} catch (err: any) {
  console.error('[Auth] Authing init failed:', err?.message || String(err));
  console.error('[Auth] Error type:', err?.constructor?.name || typeof err);
  console.error('[Auth] Full error:', err);
  if (err?.stack) console.error('[Auth] Stack:', err.stack);
}

export type FirebaseUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId: string | null;
  providerData: any[];
};

let _currentUser: FirebaseUser | null = null;

const AUTH_CACHE_KEY = 'firebase_user_cache';

function setCurrentUser(user: FirebaseUser | null) {
  _currentUser = user;
  // 持久化到 localStorage，刷新后可恢复
  if (user) {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_CACHE_KEY);
  }
  // 触发所有监听器
  _authListeners.forEach(cb => cb(user));
}

// 页面刷新时：尝试从 localStorage 恢复登录状态
(function restoreAuthState() {
  if (typeof window === 'undefined') return;
  const cached = localStorage.getItem(AUTH_CACHE_KEY);
  if (cached) {
    try {
      _currentUser = JSON.parse(cached);
    } catch { /* ignore corrupt cache */ }
  }
})();

const _authListeners = new Set<(user: FirebaseUser | null) => void>();

// Auth object compatible with Firebase Auth
export const auth = {
  get currentUser() { return _currentUser; },
};

export const googleProvider = {};

export async function signInWithPopup(_auth: any, _provider: any) {
  if (!authingClient) throw new Error('Authing 未初始化');
  try {
    const loginState = await authingClient.loginWithPopup();
    if (!loginState) throw new Error('登录取消');
    const userInfo = await authingClient.getUserInfo({ accessToken: loginState.accessToken });
    if ('apiCode' in userInfo) throw new Error((userInfo as any).message);
    const user = {
      uid: loginState.parsedIdToken?.sub || (userInfo as any).sub || userInfo.email || '',
      email: userInfo.email || null,
      displayName: userInfo.name || userInfo.nickname || null,
      photoURL: userInfo.photo || null,
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerData: [],
    };
    if (loginState.accessToken) {
      localStorage.setItem('authing_access_token', loginState.accessToken);
    }
    setCurrentUser(user);
    return { user };
  } catch (err: any) {
    console.error('Authing popup login failed:', err);
    throw { code: 'auth/popup-closed-by-user', message: err.message || '登录失败' };
  }
}

export async function signOut(_auth: any) {
  if (authingClient) {
    try {
      await authingClient.logoutWithRedirect({ redirectUri: window.location.origin });
    } catch (err) {
      console.error('Authing logout failed:', err);
    }
  }
  setCurrentUser(null);
}

export function onAuthStateChanged(_auth: any, callback: (user: FirebaseUser | null) => void) {
  // 初始调用
  callback(_currentUser);
  _authListeners.add(callback);
  return () => { _authListeners.delete(callback); };
}

export async function createUserWithEmailAndPassword(_auth: any, email: string, password: string) {
  if (!authingClient) throw new Error('Authing 未初始化');
  try {
    // Authing 的 loginByEmail 支持 autoRegister 自动注册
    const loginState = await authingClient.loginByEmail({
      passwordPayload: { email, password },
      options: { autoRegister: true },
    });
    const userInfo = await authingClient.getUserInfo({ accessToken: loginState.accessToken });
    if ('apiCode' in userInfo) throw new Error((userInfo as any).message);
    const user = {
      uid: loginState.parsedIdToken?.sub || (userInfo as any).sub || userInfo.email || '',
      email: userInfo.email || null,
      displayName: userInfo.name || userInfo.nickname || null,
      photoURL: userInfo.photo || null,
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerData: [],
    };
    setCurrentUser(user);
    return { user };
  } catch (err: any) {
    console.error('Authing register failed:', err);
    // 如果邮箱已存在，Authing 可能会返回特定错误码
    const msg = err.message || String(err);
    if (msg.includes('已存在') || msg.includes('exists')) {
      throw { code: 'auth/email-already-in-use', message: '该邮箱已被注册。' };
    }
    throw { code: 'auth/weak-password', message: msg };
  }
}

export async function signInWithEmailAndPassword(_auth: any, email: string, password: string) {
  if (!authingClient) throw new Error('Authing 未初始化');
  try {
    const loginState = await authingClient.loginByEmail({
      passwordPayload: { email, password },
    });
    const userInfo = await authingClient.getUserInfo({ accessToken: loginState.accessToken });
    if ('apiCode' in userInfo) throw new Error((userInfo as any).message);
    const user = {
      uid: loginState.parsedIdToken?.sub || (userInfo as any).sub || userInfo.email || '',
      email: userInfo.email || null,
      displayName: userInfo.name || userInfo.nickname || null,
      photoURL: userInfo.photo || null,
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerData: [],
    };
    setCurrentUser(user);
    return { user };
  } catch (err: any) {
    console.error('Authing login failed:', err);
    throw { code: 'auth/invalid-credential', message: '邮箱或密码错误。' };
  }
}

// ==================== Phone Code Login/Register (authing-js-sdk) ====================

export async function sendPhoneCode(phone: string, scene: 'login' | 'register' = 'login') {
  console.log('[Auth] 开始发送验证码:', { phone, scene });
  if (!authClient) {
    console.error('[Auth] Authing 客户端未初始化');
    throw new Error('Authing 未初始化');
  }
  const sceneType = scene === 'register' ? SceneType.SCENE_TYPE_REGISTER : SceneType.SCENE_TYPE_LOGIN;
  try {
    const result = await authClient.sendSmsCode(phone, '+86', sceneType);
    console.log('[Auth] 验证码发送成功:', { phone, result });
    return result;
  } catch (err: any) {
    console.error('[Auth] 发送验证码失败:', { phone, error: err.message, code: err.code });
    throw new Error(err.message || '发送验证码失败');
  }
}

export async function loginByPhoneCode(phone: string, code: string) {
  console.log('[Auth] 开始手机号登录:', { phone, codeLength: code?.length });
  if (!authClient) {
    console.error('[Auth] Authing 客户端未初始化');
    throw new Error('Authing 未初始化');
  }
  try {
    // 先尝试登录
    console.log('[Auth] 调用 loginByPhoneCode...');
    let authingUser = await authClient.loginByPhoneCode(phone, code, { phoneCountryCode: '+86' });
    console.log('[Auth] loginByPhoneCode 返回:', { id: authingUser?.id, hasToken: !!authingUser?.token });
    const user: FirebaseUser = {
      uid: authingUser.id,
      email: authingUser.email || authingUser.phone || null,
      displayName: authingUser.name || authingUser.nickname || null,
      photoURL: authingUser.photo || null,
      emailVerified: authingUser.emailVerified || false,
      isAnonymous: false,
      tenantId: null,
      providerData: [],
    };
    // 保存 token 到 localStorage，供 API 客户端使用
    if (authingUser.token) {
      console.log('[Auth] 保存 token 到 localStorage');
      localStorage.setItem('authing_access_token', authingUser.token);
    } else {
      console.warn('[Auth] 登录成功但未返回 token');
    }
    setCurrentUser(user);
    console.log('[Auth] 登录成功，已设置当前用户:', { uid: user.uid, email: user.email });
    return user;
  } catch (err: any) {
    const msg = err.message || String(err);
    console.error('[Auth] loginByPhoneCode 失败:', { message: msg, code: err.code, raw: err });

    // 如果明确提示无权限，直接抛出配置提示
    if (msg.includes('无权限登录此应用') || msg.includes('1576')) {
      throw new Error('该用户没有权限访问此应用（错误码 1576）。请在 Authing 控制台 → 应用详情 → 访问授权 → 将访问控制设为「允许所有用户池用户访问」，或将该用户加入白名单。');
    }
    if (msg.includes('无权限') || msg.includes('权限') || msg.includes('无权') || msg.includes('未开启')) {
      throw new Error('当前应用未开启手机号验证码登录。请在 Authing 控制台 → 应用详情 → 登录控制 → 开启「手机号验证码」登录方式。');
    }

    // 如果用户不存在，尝试注册
    if (msg.includes('不存在') || msg.includes('not exists') || msg.includes('NOT_FOUND') || msg.includes('用户未找到') || msg.includes('未注册')) {
      try {
        const authingUser = await authClient.registerByPhoneCode(phone, code, undefined, undefined, { phoneCountryCode: '+86' });
        const user: FirebaseUser = {
          uid: authingUser.id,
          email: authingUser.email || authingUser.phone || null,
          displayName: authingUser.name || authingUser.nickname || null,
          photoURL: authingUser.photo || null,
          emailVerified: authingUser.emailVerified || false,
          isAnonymous: false,
          tenantId: null,
          providerData: [],
        };
        setCurrentUser(user);
        return user;
      } catch (regErr: any) {
        console.error('[Authing] registerByPhoneCode failed:', regErr);
        const regMsg = regErr.message || String(regErr);
        if (regMsg.includes('无权限') || regMsg.includes('权限') || regMsg.includes('无权') || regMsg.includes('未开启')) {
          throw new Error('当前应用未开启手机号验证码注册。请在 Authing 控制台 → 应用详情 → 登录控制 → 开启「手机号验证码」登录/注册方式。');
        }
        throw new Error(regMsg || '注册失败');
      }
    }
    throw new Error(msg || '登录失败');
  }
}

/**
 * [实验性] 直接调用 Authing REST API（v3）登录
 * 仅用于调试，确认 authing-js-sdk v2 GraphQL API 是否与 v3 控制台兼容
 * 需要先在 App.tsx 中替换 loginByPhoneCode 调用为 loginByPhoneCodeDirect 进行测试
 */
/*
export async function loginByPhoneCodeDirect(phone: string, code: string) {
  const appId = import.meta.env.VITE_AUTHING_APP_ID || '';
  const appHost = `https://${import.meta.env.VITE_AUTHING_DOMAIN || ''}`;
  const url = `${appHost}/api/v3/signin-by-passcode`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-authing-app-id': appId,
    },
    body: JSON.stringify({
      connection: 'PASSCODE',
      passCodePayload: {
        phone: phone,
        passCode: code,
        phoneCountryCode: '+86',
      },
    }),
  });

  const data = await response.json();
  console.log('[Authing Direct API] response:', data);

  if (!response.ok || data.statusCode !== 200) {
    const errMsg = data.message || JSON.stringify(data);
    throw new Error(`Authing API 错误: ${errMsg}`);
  }

  const authingUser = data.data;
  const user: FirebaseUser = {
    uid: authingUser.id || authingUser.sub || phone,
    email: authingUser.email || authingUser.phone || null,
    displayName: authingUser.name || authingUser.nickname || null,
    photoURL: authingUser.photo || null,
    emailVerified: authingUser.emailVerified || false,
    isAnonymous: false,
    tenantId: null,
    providerData: [],
  };
  setCurrentUser(user);
  return user;
}
*/

// ==================== Firestore Helpers ====================
export { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, addDoc, serverTimestamp, Timestamp };

// Error Handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
