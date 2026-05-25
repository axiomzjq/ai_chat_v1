import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
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

// ==================== Auth Mock (Replaces Firebase Auth) ====================
// 使用 localStorage 模拟用户认证，为后续接入 Authing 做准备
// TODO: 接入 Authing 后，替换为真实认证 SDK

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

interface MockUser {
  uid: string;
  email: string;
  password: string;
  displayName: string;
  role: 'user' | 'admin';
}

const USERS_KEY = 'mock_firebase_users';
const CURRENT_USER_KEY = 'mock_firebase_current_user';

function getMockUsers(): MockUser[] {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
}

function saveMockUsers(users: MockUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getCurrentMockUser(): MockUser | null {
  try { return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || 'null'); } catch { return null; }
}

function saveCurrentMockUser(user: MockUser | null) {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
}

function mockUserToFirebaseUser(user: MockUser | null): FirebaseUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    tenantId: null,
    providerData: [],
  };
}

// Auth object compatible with Firebase Auth
export const auth = {
  get currentUser() { return mockUserToFirebaseUser(getCurrentMockUser()); },
};

export const googleProvider = {};

export async function signInWithPopup(_auth: any, _provider: any) {
  const mockUser: MockUser = {
    uid: 'google-' + Date.now(),
    email: 'demo@example.com',
    password: '',
    displayName: 'Demo User',
    role: 'user',
  };
  saveCurrentMockUser(mockUser);
  return { user: mockUserToFirebaseUser(mockUser) };
}

export async function signOut(_auth: any) {
  saveCurrentMockUser(null);
}

export function onAuthStateChanged(_auth: any, callback: (user: FirebaseUser | null) => void) {
  callback(mockUserToFirebaseUser(getCurrentMockUser()));
  const handler = () => callback(mockUserToFirebaseUser(getCurrentMockUser()));
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

export async function createUserWithEmailAndPassword(_auth: any, email: string, password: string) {
  const users = getMockUsers();
  if (users.find(u => u.email === email)) {
    throw { code: 'auth/email-already-in-use', message: '该邮箱已被注册。' };
  }
  const newUser: MockUser = {
    uid: 'local-' + Date.now(),
    email,
    password,
    displayName: email.split('@')[0],
    role: email === 'janeeric879@gmail.com' ? 'admin' : 'user',
  };
  users.push(newUser);
  saveMockUsers(users);
  saveCurrentMockUser(newUser);
  return { user: mockUserToFirebaseUser(newUser) };
}

export async function signInWithEmailAndPassword(_auth: any, email: string, password: string) {
  const users = getMockUsers();
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    throw { code: 'auth/invalid-credential', message: '邮箱或密码错误。' };
  }
  saveCurrentMockUser(user);
  return { user: mockUserToFirebaseUser(user) };
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
