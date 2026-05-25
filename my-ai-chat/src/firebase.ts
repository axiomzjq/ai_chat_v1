import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Authing } from '@authing/web';
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

let authingClient: Authing | null = null;
try {
  authingClient = new Authing({
    domain: 'https://fnbd4tjpcxb5-demo.authing.cn',
    appId: '6a13a72bc34d1d925e777d82',
    userPoolId: '6a13a72bc34d1d925e777d82',
    redirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
    scope: 'openid profile email offline_access',
  });
} catch (err) {
  console.error('Authing init failed:', err);
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

function setCurrentUser(user: FirebaseUser | null) {
  _currentUser = user;
  // 触发所有监听器
  _authListeners.forEach(cb => cb(user));
}

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
      uid: userInfo.sub,
      email: userInfo.email || null,
      displayName: userInfo.name || userInfo.nickname || null,
      photoURL: userInfo.picture || null,
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerData: [],
    };
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
  return () => _authListeners.delete(callback);
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
      uid: userInfo.sub,
      email: userInfo.email || null,
      displayName: userInfo.name || userInfo.nickname || null,
      photoURL: userInfo.picture || null,
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
      uid: userInfo.sub,
      email: userInfo.email || null,
      displayName: userInfo.name || userInfo.nickname || null,
      photoURL: userInfo.picture || null,
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
