/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import * as deepseek from './lib/deepseek';
import {
  INTERVIEW_SYSTEM_PROMPT,
  INFO_SYSTEM_PROMPT,
  POSITIONING_SYSTEM_PROMPT,
  COPYWRITING_SYSTEM_PROMPT,
  COPYWRITING_GENERATE_SYSTEM_PROMPT,
  TOPIC_SYSTEM_PROMPT,
} from './lib/prompts';

// 智谱知识库 ID（用于对话调用知识库进行 RAG 问答）
// 配置方式：在前端 .env.local 中设置 VITE_ZHIPU_KNOWLEDGE_ID=xxx
// 或在后端 server/.env 中设置 ZHIPU_KNOWLEDGE_ID=xxx（后端会自动 fallback）
const ZHIPU_KNOWLEDGE_ID = (import.meta.env.VITE_ZHIPU_KNOWLEDGE_ID as string | undefined) || undefined;
import { 
  Target, 
  FileText, 
  ChevronRight, 
  Send, 
  Loader2, 
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  MessageSquare,
  LayoutDashboard,
  Video,
  Copy,
  Download,
  Database,
  PenTool,
  X,
  Phone,
  MessageCircle,
  ChevronLeft,
  ChevronDown,
  Users,
  User,
  ShieldCheck,
  LogOut,
  Upload,
  Clock,
  FileSearch,
  Trash2,
  Plus,
  FileDown,
  Bug,
  Settings,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { AUTHING_APP_ID, AUTHING_HOST } from './lib/authing';
import * as api from './lib/api';
import { exportLogs, clearLogs, copyToClipboard } from './lib/logger';
import { DEBUG_MODE } from './lib/debug';
import { 
  auth,
  onAuthStateChanged,
  sendPhoneCode,
  loginByPhoneCode,
  signInWithPopup,
  googleProvider,
  signOut,
  FirebaseUser
} from './firebase';

// ============================================================
// 参考文件加载工具
// 从 public/refs/ 加载各步骤的参考 .txt 文件
// ============================================================

const REFS_BASE = '/refs';

type StepRefs = {
  interview: string[];
  positioning: string[];
  topic: string[];
  copywriting: string[];
};

/** 各步骤需要加载的参考文件列表 */
export const STEP_REFS: StepRefs = {
  interview: ['interview/客户访谈参考手册.txt'],
  positioning: [
    'positioning/客户定位访谈参考手册.txt',
    'positioning/写作技巧提示词_精华版.txt',
  ],
  topic: [
    'topic/选题提示词_基于访谈结果.txt',
    'topic/写作技巧提示词_精华版.txt',
  ],
  copywriting: [
    'copywriting/客户采访与选题提示词.txt',
    'copywriting/文案审核提示词.txt',
  ],
};

/** 加载单个参考文件内容 */
export async function loadRefFile(path: string): Promise<string> {
  try {
    const res = await fetch(`${REFS_BASE}/${path}`);
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

/** 加载指定步骤的所有参考文件，合并为一个字符串 */
export async function loadStepRefs(step: keyof StepRefs): Promise<string> {
  const files = STEP_REFS[step] || [];
  const contents = await Promise.all(files.map(f => loadRefFile(f)));
  return contents.filter(Boolean).join('\n\n' + '='.repeat(60) + '\n\n');
}

// ============================================================
// 结果文件保存工具
// ============================================================

/** 触发浏览器下载文本文件 */
export function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 保存结果到 localStorage（按用户隔离） */
export function saveResultToStorage(key: string, data: any, userId?: string) {
  try {
    const scopedKey = userId ? `result_${key}_${userId}` : `result_${key}`;
    localStorage.setItem(scopedKey, JSON.stringify({
      data,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    // localStorage 满了
  }
}

/** 从 localStorage 读取结果（按用户隔离） */
export function loadResultFromStorage(key: string, userId?: string): any | null {
  try {
    const scopedKey = userId ? `result_${key}_${userId}` : `result_${key}`;
    const saved = localStorage.getItem(scopedKey);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return parsed.data;
  } catch {
    return null;
  }
}

/** 获取用户隔离的 localStorage key */
export function getUserScopedKey(baseKey: string, userId: string): string {
  return `${baseKey}_${userId}`;
}

// --- Types ---

type Step = 'interview' | 'information' | 'positioning' | 'topic' | 'copywriting' | 'history';

// 步骤解锁：访谈和历史始终可进；后续步骤需完成访谈（生成深度报告）后才解锁
const isStepUnlocked = (stepId: Step, interviewReport: string, topicPool: any[], userRole?: 'user' | 'admin') => {
  if (stepId === 'interview' || stepId === 'history') return true;
  if (userRole === 'admin') return true;
  if (stepId === 'positioning') return !!interviewReport;
  if (stepId === 'topic') return !!interviewReport; // 需要访谈报告
  if (stepId === 'copywriting') return !!topicPool.length; // 需要选题池
  return false;
};
type View = 'login' | 'app' | 'admin';

interface UserProfile {
  uid: string;
  email: string;
  phone: string | null;
  role: 'user' | 'admin';
  subscriptionStartAt: string | null;
  subscriptionDays: number;
  tokenQuota: number;
  tokenUsed: number;
  createdAt: any;
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface HistoryItem {
  id: string;
  date: string;
  title: string; // 历史记录标题（自动生成）
  // 访谈阶段
  messages: Message[];
  interviewPhase: 'basic' | 'deep';
  interviewReport: string;
  // 信息阶段
  companyInfo: string;
  infoReport: string;
  // 定位阶段
  positioningOptions: string[];
  selectedPositioningIndex: number | null;
  positioningReport: string;
  // 文案阶段
  copywritingMessages: Message[];
  isCopywritingChatMode: boolean;
  copywritingOutput: {
    titles: string[];
    selectedTitleIndex: number | null;
    content: string;
  };
  // 通用
  uploadedMaterials: UploadedMaterial[];
}

interface UploadedMaterial {
  name: string;
  type: string;
  size: string;
  content: string;
}

interface AppState {
  interviewPhase: 'basic' | 'deep';
  interviewReport: string;
  infoReport: string;
  positioningOptions: string[];
  selectedPositioningIndex: number | null;
  positioningReport: string;
  topicPool: any[]; // 选题池
  selectedTopic: any | null; // 选中的选题
  topicGenerationStatus: 'idle' | 'generating' | 'completed' | 'demo_fallback'; // 选题生成状态
  copywritingOutput: {
    titles: string[];
    selectedTitleIndex: number | null;
    content: string;
  };
  copywritingMessages: Message[];
  isCopywritingChatMode: boolean;
  history: HistoryItem[];
  user: UserProfile | null;
  view: View;
  isAdminLogin: boolean;
  isDebugLogin: boolean;
  knowledgeBase: any[];
  uploadedMaterials: UploadedMaterial[];
}

// --- AI Service ---

const organizeContentWithAI = async (rawText: string) => {
  if (!rawText.trim()) return "";
  try {
    const text = await deepseek.generateText({
      model: deepseek.MODELS.fast,
      system: "你是一个专业的内容整理专家。你的任务是优化文本的结构和排版，但严禁删除、概括或精简任何具体信息。你必须确保整理后的内容包含原始文本中的所有细节。",
      prompt: `请将以下原始文本整理为AI能精确理解的、有序排版的语言。
【核心要求】：
1. 不得删减、遗漏或减少原始文本中的任何信息。
2. 仅进行结构化排版（如使用 Markdown 标题、列表、表格等），使内容更易于被 AI 检索和理解。
3. 保持原始数据的完整性和准确性。
4. 如果是表格数据，请整理为清晰的 Markdown 表格。

原始文本：
${rawText}`,
    });
    return text || rawText;
  } catch (error) {
    console.error("AI Organize Error:", error);
    return rawText;
  }
};

/**
 * 构建上传资料的上下文字符串，限制总长度避免超出模型上下文窗口
 */
const buildMaterialsContext = (materials: UploadedMaterial[], maxTotalChars = 12000): string => {
  if (!materials || materials.length === 0) return '';
  let result = '';
  let usedChars = 0;
  const header = '\n\n【已上传参考资料】：\n';
  usedChars += header.length;
  result += header;

  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    const itemHeader = `资料 ${i + 1}《${m.name}》：\n`;
    const remaining = maxTotalChars - usedChars - itemHeader.length - 100; // 预留结尾提示空间
    if (remaining <= 0) {
      result += '\n（更多资料已省略，仅保留以上部分用于本次对话）';
      break;
    }
    const content = m.content.length > remaining ? m.content.slice(0, remaining) + '\n（该资料后续内容已截断）' : m.content;
    result += itemHeader + content + '\n\n';
    usedChars += itemHeader.length + content.length + 2;
  }

  result += '访谈中如遇到与这些资料相关的点，可自然引用、核对或追问；不要一次性要求用户上传更多资料，只在聊到值得展开的点时引导补充。';
  return result;
};

const BOT_AVATAR = "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&q=80&w=200&h=200";
const USER_AVATAR = "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=200&h=200";

// --- Components ---

function StepIndicator({ currentStep, onStepClick, state }: {
  currentStep: Step,
  onStepClick: (step: Step) => void,
  state: AppState
}) {
  const steps: { id: Step; label: string; icon: any }[] = [
    { id: 'interview', label: '访谈', icon: MessageSquare },
    { id: 'positioning', label: '定位', icon: Target },
    { id: 'topic', label: '选题', icon: FileText },
    { id: 'copywriting', label: '文案', icon: PenTool },
    { id: 'history', label: '历史', icon: CheckCircle2 },
  ];

  return (
    <div className="flex items-center justify-between w-full max-w-4xl mx-auto mb-8 md:mb-12 px-2 md:px-4 overflow-x-auto no-scrollbar py-2">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = currentStep === step.id;
        const isPast = steps.findIndex(s => s.id === currentStep) > index;
        const unlocked = isStepUnlocked(step.id, state.interviewReport, state.topicPool, state.user?.role);

        return (
          <React.Fragment key={step.id}>
            <button
              onClick={() => unlocked && onStepClick(step.id)}
              disabled={!unlocked}
              className={cn(
                "flex flex-col items-center relative z-10 flex-shrink-0 outline-none transition-all",
                unlocked ? "cursor-pointer" : "cursor-not-allowed opacity-50"
              )}
            >
              <div className={cn(
                "w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-300 border-2",
                isActive ? "bg-black text-white border-black scale-110 shadow-lg" :
                isPast ? "bg-green-500 text-white border-green-500" :
                "bg-white text-gray-400 border-gray-200"
              )}>
                {isPast ? <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6" /> : <Icon className="w-5 h-5 md:w-6 md:h-6" />}
              </div>
              <span className={cn(
                "mt-2 text-[10px] md:text-xs font-medium tracking-wider uppercase whitespace-nowrap",
                isActive ? "text-black" : "text-gray-400"
              )}>
                {step.label}
              </span>
            </button>
            {index < steps.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 min-w-[20px] md:mx-4 transition-all duration-500",
                isPast ? "bg-green-500" : "bg-gray-200"
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const CollapsibleSection = ({ title, children, icon: Icon, defaultOpen = false }: { 
  title: string; 
  children: React.ReactNode; 
  icon?: any;
  defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm transition-all duration-300">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 md:p-6 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className="w-5 h-5 text-gray-400" />}
          <span className="font-bold text-gray-900">{title}</span>
        </div>
        <ChevronDown className={cn("w-5 h-5 text-gray-400 transition-transform duration-300", isOpen && "rotate-180")} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="p-4 md:p-6 pt-0 border-t border-gray-50">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const CollapsibleMarkdown = ({ content }: { content: string }) => {
  // Split the content by H2 headers (## Section Name)
  // We use a positive lookahead to keep the delimiter
  const sections = content.split(/(?=^##\s)/m);
  
  // The first part might be the title (# Title) and some intro
  const intro = sections[0];
  const rest = sections.slice(1);

  return (
    <div className="space-y-4">
      {intro && (
        <div className="markdown-body prose prose-sm max-w-none mb-6">
          <ReactMarkdown>{intro}</ReactMarkdown>
        </div>
      )}
      
      {rest.map((section, index) => {
        // Extract the title from the first line of the section
        const lines = section.split('\n');
        const titleLine = lines[0].replace(/^##\s+/, '').trim();
        const body = lines.slice(1).join('\n');
        
        // If it's the TOC, we might want to keep it open or style it differently
        const isTOC = titleLine.includes('目录');

        return (
          <details 
            key={index} 
            open={isTOC}
            className={`group border border-gray-100 rounded-2xl ${isTOC ? 'bg-blue-50/30' : 'bg-gray-50/50'} overflow-hidden transition-all duration-300`}
          >
            <summary className="flex items-center justify-between p-4 cursor-pointer list-none hover:bg-gray-100/50 transition-colors">
              <span className="font-bold text-gray-900 flex items-center gap-2">
                {isTOC ? <FileText size={18} className="text-blue-500" /> : <Sparkles size={18} className="text-amber-500" />}
                {titleLine}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform duration-300" />
            </summary>
            <div className="p-4 pt-0 border-t border-gray-100 bg-white">
              <div className="markdown-body prose prose-sm max-w-none mt-4">
                <ReactMarkdown>{body}</ReactMarkdown>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
};

const UI_STATE_KEY = 'ai_chat_ui_state';

function loadUIState(userId?: string): { currentStep: Step; isStarted: boolean; lastView: View | null; adminActiveTab: 'users' | 'feedback' | 'knowledge' } {
  const key = userId ? getUserScopedKey(UI_STATE_KEY, userId) : UI_STATE_KEY;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      // 兼容旧版已移除的 information 步骤
      if (parsed.currentStep === 'information') {
        parsed.currentStep = 'interview';
      }
      return parsed;
    }
  } catch { /* ignore */ }
  return { currentStep: 'interview', isStarted: false, lastView: null, adminActiveTab: 'users' };
}

const initialState: AppState = {
  interviewPhase: 'basic',
  interviewReport: '',
  infoReport: '',
  positioningOptions: [],
  selectedPositioningIndex: null,
  positioningReport: '',
  topicPool: [],
  selectedTopic: null,
  topicGenerationStatus: 'idle', // 'idle' | 'generating' | 'completed' | 'demo_fallback'
  copywritingOutput: {
    titles: [],
    selectedTitleIndex: null,
    content: '',
  },
  copywritingMessages: [],
  isCopywritingChatMode: false,
  history: [],
  user: null,
  view: 'login',
  isAdminLogin: false,
  isDebugLogin: false,
  knowledgeBase: [],
  uploadedMaterials: [],
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-red-50">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <X className="text-red-500 w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-red-900 mb-2">出错了</h2>
          <p className="text-red-600 mb-6 max-w-md">
            应用程序遇到了一个意外错误。这可能是由于 Firebase 配置或网络问题引起的。
          </p>
          <div className="bg-white p-4 rounded-xl border border-red-100 text-left text-xs font-mono text-red-500 mb-6 overflow-auto max-w-full">
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="bg-red-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-red-700 transition-all"
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Login({ onLogin, isAdmin, setIsAdmin, onDebugLogin }: { 
  onLogin: (user: FirebaseUser, role: 'user' | 'admin') => void,
  isAdmin: boolean,
  setIsAdmin: (val: boolean) => void,
  onDebugLogin?: (asAdmin: boolean) => void
}) {
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendCode = async () => {
    if (!phone || phone.length < 11) {
      alert('请输入有效的手机号码');
      return;
    }
    if (countdown > 0) return;
    try {
      setLoading(true);
      await sendPhoneCode(phone);
      setCountdown(60);
      alert('验证码已发送');
    } catch (error: any) {
      console.error('Send code error:', error);
      alert(error.message || '发送验证码失败');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // 从后端 API 获取用户角色（替代 Firestore）
      const token = localStorage.getItem('authing_access_token');
      let role: 'user' | 'admin' = 'user';
      
      if (token) {
        try {
          const authData = await api.verifyAuth(token);
          role = authData.user.role;
        } catch (e) {
          console.error('获取用户信息失败:', e);
          // 不再根据手机号硬编码判断管理员，角色完全由后端数据库决定
        }
      }

      if (isAdmin && role !== 'admin') {
        alert('您没有管理员权限，请使用普通用户登录。');
        await signOut(auth);
        return;
      }

      onLogin(user, role);
    } catch (error: any) {
      console.error('Google Login error:', error);
      alert('登录失败，请重试。');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !code) return;
    
    setLoading(true);
    try {
      const user = await loginByPhoneCode(phone, code);
      
      // 从后端 API 获取用户角色（替代 Firestore）
      const token = localStorage.getItem('authing_access_token');
      let role: 'user' | 'admin' = 'user';
      
      if (token) {
        try {
          const authData = await api.verifyAuth(token);
          role = authData.user.role;
        } catch (e) {
          console.error('获取用户信息失败:', e);
          // 不再根据手机号硬编码判断管理员，角色完全由后端数据库决定
        }
      }

      if (isAdmin && role !== 'admin') {
        alert('您没有管理员权限，请使用普通用户登录。');
        await signOut(auth);
        return;
      }

      onLogin(user, role);
    } catch (error: any) {
      console.error('Auth error:', error);
      const errMsg = error.message || '登录失败，请检查验证码';
      alert(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8 text-center"
      >
        <div className="space-y-2">
          <div className="w-20 h-20 bg-black rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-black/20 mb-6">
            <Sparkles className="text-white w-10 h-10" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-gray-900">创始人 IP 顾问</h1>
          <p className="text-gray-500 font-medium tracking-tight">
            {isAdmin ? '管理员控制台' : '手机号登录 / 注册'}
          </p>
        </div>

        <div className="bg-gray-50 p-8 rounded-[40px] border border-gray-100 space-y-6">
          {/* Tab 切换 */}
          <div className="flex bg-gray-200 rounded-2xl p-1">
            <button
              type="button"
              onClick={() => setIsAdmin(false)}
              className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                !isAdmin
                  ? 'bg-black text-white shadow-lg shadow-black/10'
                  : 'text-gray-500 hover:text-black'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <User size={16} /> 用户登录
              </span>
            </button>
            <button
              type="button"
              onClick={() => setIsAdmin(true)}
              className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                isAdmin
                  ? 'bg-black text-white shadow-lg shadow-black/10'
                  : 'text-gray-500 hover:text-black'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <ShieldCheck size={16} /> 管理员登录
              </span>
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-2">手机号码</label>
              <input 
                type="tel" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                maxLength={11}
                className="w-full bg-white border border-gray-200 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all shadow-sm text-sm"
                placeholder="请输入手机号码"
              />
            </div>
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-2">验证码</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={6}
                  className="flex-1 bg-white border border-gray-200 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all shadow-sm text-sm"
                  placeholder="请输入验证码"
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={loading || countdown > 0 || !phone}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-2xl font-bold text-sm hover:bg-gray-300 transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {countdown > 0 ? `${countdown}秒后重发` : '获取验证码'}
                </button>
              </div>
            </div>
            <button 
              type="submit"
              disabled={loading || !phone || !code}
              className="w-full bg-black text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-gray-800 transition-all shadow-xl shadow-black/10 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck size={20} />}
              {isAdmin ? '管理员登录' : '登录 / 注册'}
            </button>
          </form>
        </div>

        {DEBUG_MODE !== 'off' && (
          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={async () => {
                const logs = exportLogs();
                const ok = await copyToClipboard(logs);
                alert(ok ? '日志已复制到剪贴板，请粘贴给开发者' : '复制失败，请手动全选复制');
              }}
              className="text-[10px] text-gray-400 hover:text-amber-600 transition-colors flex items-center justify-center gap-1"
            >
              <Bug className="w-3 h-3" /> 导出调试日志
            </button>
            {DEBUG_MODE === 'dev' && (
              <button
                onClick={() => onDebugLogin?.(isAdmin)}
                className="text-[10px] text-red-400 hover:text-red-600 transition-colors flex items-center justify-center gap-1 font-bold"
              >
                🛠️ 调试：{isAdmin ? '管理员' : '用户'}一键登录 (17388978910)
              </button>
            )}
          </div>
        )}

        <p className="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-bold">
          Powered by ZhipuAI & Authing
        </p>
      </motion.div>
    </div>
  );
}

function AdminPanel({ user, onLogout, onDebugLogin, onSwitchToApp }: { user: UserProfile, onLogout: () => void, onDebugLogin?: () => void, onSwitchToApp?: () => void }) {
  const [activeTab, setActiveTab] = useState<'users' | 'feedback' | 'knowledge'>(() => loadUIState().adminActiveTab);

  useEffect(() => {
    const raw = localStorage.getItem(UI_STATE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({ ...saved, adminActiveTab: activeTab }));
  }, [activeTab]);
  const [users, setUsers] = useState<any[]>([]);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: '', content: '', type: 'interview' as any });
  const [preCreateForm, setPreCreateForm] = useState({ phone: '', subscription_days: 7, token_quota: 100000, role: 'user' as 'user' | 'admin' });
  const [preCreating, setPreCreating] = useState(false);
  const [showPreCreateModal, setShowPreCreateModal] = useState(false);

  // 用户编辑弹窗
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editForm, setEditForm] = useState({ subscription_days: 7, token_quota: 100000, token_used: 0 });
  const [savingEdit, setSavingEdit] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const usersRes = await api.getAdminUsers();
      setUsers(usersRes.data || []);
      const fbRes = await api.getFeedback({ pageSize: 100 });
      setFeedbacks(fbRes.data || []);
      const kbRes = await api.getKnowledgeBase({ pageSize: 100 });
      setKnowledge(kbRes.data || []);
    } catch (err) {
      console.error('Admin panel load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddKnowledge = async () => {
    if (!newDoc.title || !newDoc.content) return;
    setUploading(true);
    try {
      await api.addKnowledgeBase({
        title: newDoc.title,
        content: newDoc.content,
        category: newDoc.type,
        source: 'manual',
      });
      setNewDoc({ title: '', content: '', type: 'interview' });
      alert('上传成功！');
    } catch (error: any) {
      alert('上传失败：' + (error.message || '未知错误'));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    if (!confirm('确定删除该文档吗？')) return;
    try {
      await api.deleteKnowledgeBase(id);
    } catch (error: any) {
      alert('删除失败：' + (error.message || '未知错误'));
    }
  };

  const handleUpdateRole = async (uid: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!confirm(`确定将该用户设为 ${newRole === 'admin' ? '管理员' : '普通用户'} 吗？`)) return;
    try {
      await api.updateUserRole(uid, { role: newRole as 'user' | 'admin' });
      alert('角色更新成功');
      // 刷新列表
      const usersRes = await api.getAdminUsers();
      setUsers(usersRes.data || []);
    } catch (error: any) {
      alert('更新失败：' + (error.message || '未知错误'));
    }
  };

  const handlePreCreateUser = async () => {
    if (!preCreateForm.phone || preCreateForm.phone.length < 11) {
      alert('请输入有效的手机号码');
      return;
    }
    setPreCreating(true);
    try {
      await api.preCreateUser({
        phone: preCreateForm.phone,
        subscription_days: preCreateForm.subscription_days,
        token_quota: preCreateForm.token_quota,
        role: preCreateForm.role,
      });
      alert('预创建成功！');
      setPreCreateForm({ phone: '', subscription_days: 7, token_quota: 100000, role: 'user' });
      const usersRes = await api.getAdminUsers();
      setUsers(usersRes.data || []);
    } catch (error: any) {
      alert('预创建失败：' + (error.message || '该手机号可能已存在'));
    } finally {
      setPreCreating(false);
    }
  };

  const openEditModal = (u: any) => {
    setEditingUser(u);
    setEditForm({
      subscription_days: u.subscription_days || 0,
      token_quota: u.token_quota || 100000,
      token_used: u.token_used || 0,
    });
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setSavingEdit(false);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      await api.updateUserSubscription(editingUser.id, {
        subscription_days: editForm.subscription_days,
        token_quota: editForm.token_quota,
        token_used: editForm.token_used,
      });
      alert('用户配置更新成功');
      closeEditModal();
      const usersRes = await api.getAdminUsers();
      setUsers(usersRes.data || []);
    } catch (error: any) {
      alert('更新失败：' + (error.message || '未知错误'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleResetTokenUsed = async (uid: string) => {
    if (!confirm('确定重置该用户的 Token 已用量为 0 吗？')) return;
    try {
      await api.resetUserTokenUsed(uid);
      alert('Token 已用量已重置为 0');
      const usersRes = await api.getAdminUsers();
      setUsers(usersRes.data || []);
    } catch (error: any) {
      alert('重置失败：' + (error.message || '未知错误'));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      const isDocx = file.name.endsWith('.docx');
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        let content = '';
        if (isExcel) {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          content = XLSX.utils.sheet_to_txt(worksheet);
        } else if (isDocx) {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          const result = await mammoth.extractRawText({ arrayBuffer });
          content = result.value;
        } else {
          content = event.target?.result as string;
        }
        
        // AI 自动整理
        const organizedContent = await organizeContentWithAI(content);
        setNewDoc(prev => ({ ...prev, title: file.name, content: organizedContent }));
        setUploading(false);
      };

      if (isExcel || isDocx) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    } catch (error) {
      console.error("File read error:", error);
      setUploading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-100 flex flex-col p-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-lg shadow-black/20">
            <ShieldCheck className="text-white w-6 h-6" />
          </div>
          <h1 className="font-black text-lg tracking-tight">管理后台</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <button 
            onClick={() => setActiveTab('users')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all",
              activeTab === 'users' ? "bg-black text-white shadow-lg shadow-black/10" : "text-gray-400 hover:bg-gray-50 hover:text-black"
            )}
          >
            <Users size={18} /> 用户管理
          </button>
          <button 
            onClick={() => setActiveTab('feedback')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all",
              activeTab === 'feedback' ? "bg-black text-white shadow-lg shadow-black/10" : "text-gray-400 hover:bg-gray-50 hover:text-black"
            )}
          >
            <FileSearch size={18} /> 反馈报告
          </button>
          <button 
            onClick={() => setActiveTab('knowledge')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all",
              activeTab === 'knowledge' ? "bg-black text-white shadow-lg shadow-black/10" : "text-gray-400 hover:bg-gray-50 hover:text-black"
            )}
          >
            <Upload size={18} /> 知识库训练
          </button>
        </nav>

        <div className="pt-6 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
              <img src={USER_AVATAR} alt="Admin" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{user.email}</p>
              <p className="text-[10px] text-gray-400 uppercase font-bold">超级管理员</p>
            </div>
          </div>
          {DEBUG_MODE !== 'off' && (
            <div className="flex flex-col gap-2 mb-3">
              <button
                onClick={async () => {
                  const logs = exportLogs();
                  const ok = await copyToClipboard(logs);
                  alert(ok ? '日志已复制到剪贴板' : '复制失败，请手动全选复制');
                }}
                className="w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-[10px] text-amber-600 hover:bg-amber-50 transition-all"
              >
                <Bug size={14} /> 导出调试日志
              </button>
              {DEBUG_MODE === 'dev' && (
                <button
                  onClick={() => onDebugLogin?.()}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-[10px] text-red-500 hover:bg-red-50 transition-all"
                >
                  🛠️ 调试：一键回到登录页
                </button>
              )}
            </div>
          )}
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut size={18} /> 退出登录
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-10">
        <header className="mb-10">
          <h2 className="text-3xl font-black tracking-tight text-gray-900">
            {activeTab === 'users' && '用户账号管理'}
            {activeTab === 'feedback' && '用户反馈报告'}
            {activeTab === 'knowledge' && 'AI 知识库训练'}
          </h2>
          <p className="text-gray-500 font-medium">
            {activeTab === 'users' && '查看、管理所有注册用户及其使用时长'}
            {activeTab === 'feedback' && '实时接收来自用户的反馈与改进建议'}
            {activeTab === 'knowledge' && '上传行业语料与文档，持续提升智能体专业度'}
          </p>
        </header>

        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* 手机号搜索 */}
            <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">按手机号搜索用户</label>
                  <input
                    type="text"
                    value={phoneSearch}
                    onChange={(e) => setPhoneSearch(e.target.value)}
                    placeholder="输入手机号查找..."
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
                <div className="pt-5 flex items-center gap-2">
                  <button
                    onClick={() => setShowPreCreateModal(true)}
                    className="px-4 py-3 text-xs font-bold bg-black text-white rounded-xl hover:bg-gray-800 transition-colors"
                  >
                    + 预创建用户
                  </button>
                  <button
                    onClick={loadData}
                    disabled={loading}
                    className="px-4 py-3 text-xs font-bold text-black hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {loading ? '刷新中...' : '刷新'}
                  </button>
                  <button
                    onClick={() => setPhoneSearch('')}
                    className="px-4 py-3 text-xs font-bold text-gray-400 hover:text-black transition-colors"
                  >
                    清除
                  </button>
                </div>
              </div>
            </div>

            {/* 用户列表 */}
            <div className="bg-white rounded-[32px] border border-gray-100 overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">用户</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">角色</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">订阅天数</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Token 使用</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">注册时间</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users
                    .filter((u) => {
                      if (!phoneSearch) return true;
                      const search = phoneSearch.trim();
                      return (u.phone || '').includes(search) || (u.email || '').includes(search);
                    })
                    .map((u) => {
                      const tokenRemaining = (u.token_quota || 0) - (u.token_used || 0);
                      const tokenPct = (u.token_quota || 1) > 0 ? Math.min(100, ((u.token_used || 0) / u.token_quota) * 100) : 0;
                      const isTokenDepleted = tokenRemaining <= 0;
                      const start = u.subscription_start_at ? new Date(u.subscription_start_at) : null;
                      const expires = start ? new Date(start.getTime() + (u.subscription_days || 0) * 24 * 60 * 60 * 1000) : null;
                      const isExpired = expires ? new Date() > expires : false;
                      const remainingDays = expires ? Math.max(0, Math.ceil((expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0;
                      return (
                        <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="space-y-0.5">
                              <p className="font-bold text-sm">{u.email || '—'}</p>
                              <p className="text-[10px] text-gray-400 font-mono">{u.phone || '无手机号'}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              u.role === 'admin' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                            )}>
                              {u.role === 'admin' ? '管理员' : '普通用户'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-mono font-bold">{u.subscription_days || 0}</span>
                                <span className="text-[10px] text-gray-400 font-bold">天</span>
                              </div>
                              <span className={cn("text-[10px] font-bold", isExpired ? "text-red-500" : "text-green-600")}>
                                {u.subscription_start_at ? (isExpired ? `已过期` : `剩余 ${remainingDays} 天`) : '未开始'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-mono font-bold">{((u.token_used || 0) / 1000).toFixed(1)}K</span>
                                <span className="text-gray-300">/</span>
                                <span className={cn("font-mono font-bold", isTokenDepleted ? "text-red-500" : "text-green-600")}>
                                  {((u.token_quota || 0) / 1000).toFixed(0)}K
                                </span>
                              </div>
                              {/* 进度条 */}
                              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full", isTokenDepleted ? "bg-red-400" : "bg-green-400")}
                                  style={{ width: `${tokenPct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-500">
                            {u.created_at ? new Date(u.created_at).toLocaleString('zh-CN') : '未知'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => openEditModal(u)}
                                className="text-[10px] font-bold text-black hover:underline"
                              >
                                编辑
                              </button>
                              <button
                                onClick={() => handleUpdateRole(u.id, u.role)}
                                className="text-[10px] font-bold text-gray-600 hover:underline"
                              >
                                切换角色
                              </button>
                              <button
                                onClick={() => handleResetTokenUsed(u.id)}
                                className="text-[10px] font-bold text-gray-400 hover:text-green-600 transition-colors"
                              >
                                重置 Token
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {users.filter((u) => {
                if (!phoneSearch) return true;
                const search = phoneSearch.trim();
                return (u.phone || '').includes(search) || (u.email || '').includes(search);
              }).length === 0 && (
                <div className="p-10 text-center text-gray-400 text-sm">
                  暂无用户数据
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'feedback' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {feedbacks.map((f) => (
              <div key={f.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                      <MessageCircle size={14} className="text-gray-400" />
                    </div>
                    <p className="text-xs font-bold">{f.email}</p>
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold">
                    {f.createdAt?.toDate ? f.createdAt.toDate().toLocaleString() : ''}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl text-sm text-gray-700 leading-relaxed italic">
                  "{f.message}"
                </div>
              </div>
            ))}
            {feedbacks.length === 0 && (
              <div className="col-span-full py-20 text-center text-gray-400">
                <FileSearch size={48} className="mx-auto mb-4 opacity-20" />
                <p className="font-bold">暂无反馈报告</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'knowledge' && (
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">文档标题</label>
                  <input 
                    type="text" 
                    value={newDoc.title}
                    onChange={(e) => setNewDoc(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="例如：餐饮行业深度洞察报告"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">目标智能体</label>
                  <select 
                    value={newDoc.type}
                    onChange={(e) => setNewDoc(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm appearance-none"
                  >
                    <option value="interview">访谈顾问</option>
                    <option value="ip">IP 定位顾问</option>
                    <option value="copywriting">文案顾问</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">文档内容 / 语料</label>
                <div className="relative">
                  <textarea 
                    value={newDoc.content}
                    onChange={(e) => setNewDoc(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="粘贴语料或文档内容..."
                    rows={6}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm resize-none"
                  />
                  <div className="absolute bottom-4 right-4">
                    <label className="cursor-pointer bg-white border border-gray-100 rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
                      <Upload size={14} />
                      上传本地文件
                      <input type="file" className="hidden" onChange={handleFileUpload} accept=".txt,.md,.doc,.docx,.xlsx,.xls" />
                    </label>
                  </div>
                </div>
              </div>
              <button 
                onClick={handleAddKnowledge}
                disabled={uploading || !newDoc.title || !newDoc.content}
                className="w-full bg-black text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-gray-800 transition-all shadow-xl shadow-black/10 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="animate-spin" /> : <Plus size={20} />}
                上传并训练
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {knowledge.map((k) => (
                <div key={k.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      k.category === 'interview' ? "bg-purple-100 text-purple-700" : 
                      k.category === 'ip' ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                    )}>
                      {k.category === 'interview' ? '访谈' : k.category === 'ip' ? 'IP' : '文案'}
                    </span>
                    <button 
                      onClick={() => handleDeleteKnowledge(k.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <h3 className="font-bold text-sm mb-2 line-clamp-1">{k.title}</h3>
                  <p className="text-xs text-gray-500 line-clamp-3 mb-4 flex-1">{k.content}</p>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold">
                    <Clock size={12} />
                    {k.createdAt?.toDate ? k.createdAt.toDate().toLocaleDateString() : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 预创建用户弹窗 */}
        <AnimatePresence>
          {showPreCreateModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setShowPreCreateModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 md:p-10 shadow-2xl relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute top-0 left-0 w-full h-2 bg-black" />
                <button
                  onClick={() => setShowPreCreateModal(false)}
                  className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-6">
                  <User className="w-8 h-8 text-black" />
                </div>

                <h2 className="text-2xl font-bold mb-2">预创建用户账户</h2>
                <p className="text-gray-400 text-sm mb-8">输入手机号并设置订阅参数，用户首次登录时自动激活</p>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">手机号码</label>
                    <input
                      type="tel"
                      value={preCreateForm.phone}
                      onChange={(e) => setPreCreateForm(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="输入 11 位手机号"
                      maxLength={11}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">订阅天数</label>
                      <input
                        type="number"
                        min={1}
                        value={preCreateForm.subscription_days}
                        onChange={(e) => setPreCreateForm(prev => ({ ...prev, subscription_days: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Token 额度</label>
                      <input
                        type="number"
                        min={1000}
                        step={1000}
                        value={preCreateForm.token_quota}
                        onChange={(e) => setPreCreateForm(prev => ({ ...prev, token_quota: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">用户角色</label>
                    <select
                      value={preCreateForm.role}
                      onChange={(e) => setPreCreateForm(prev => ({ ...prev, role: e.target.value as 'user' | 'admin' }))}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm appearance-none"
                    >
                      <option value="user">普通用户</option>
                      <option value="admin">管理员</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 mt-8">
                  <button
                    onClick={() => setShowPreCreateModal(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-sm border border-gray-100 hover:bg-gray-50 transition-all"
                  >
                    取消
                  </button>
                  <button
                    onClick={handlePreCreateUser}
                    disabled={preCreating || !preCreateForm.phone || preCreateForm.phone.length < 11}
                    className="flex-1 bg-black text-white py-4 rounded-2xl font-bold text-sm hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {preCreating ? <Loader2 className="animate-spin w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {preCreating ? '创建中...' : '确认创建'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 编辑用户弹窗 */}
        <AnimatePresence>
          {editingUser && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={closeEditModal}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 md:p-10 shadow-2xl relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute top-0 left-0 w-full h-2 bg-black" />
                <button
                  onClick={closeEditModal}
                  className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-6">
                  <Settings className="w-8 h-8 text-black" />
                </div>

                <h2 className="text-2xl font-bold mb-2">编辑用户配置</h2>
                <p className="text-gray-400 text-sm mb-8">
                  {editingUser.email || editingUser.phone || '用户'} / {editingUser.role === 'admin' ? '管理员' : '普通用户'}
                </p>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">会员剩余天数</label>
                    <input
                      type="number"
                      min={0}
                      value={editForm.subscription_days}
                      onChange={(e) => setEditForm(prev => ({ ...prev, subscription_days: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm"
                    />
                    <p className="text-[10px] text-gray-400">保存后会将订阅起始时间重置为当前时间，确保“剩余 X 天”显示准确。</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Token 额度</label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={editForm.token_quota}
                        onChange={(e) => setEditForm(prev => ({ ...prev, token_quota: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Token 已用量</label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={editForm.token_used}
                        onChange={(e) => setEditForm(prev => ({ ...prev, token_used: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-8">
                  <button
                    onClick={closeEditModal}
                    className="flex-1 py-4 rounded-2xl font-bold text-sm border border-gray-100 hover:bg-gray-50 transition-all"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="flex-1 bg-black text-white py-4 rounded-2xl font-bold text-sm hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingEdit ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {savingEdit ? '保存中...' : '保存配置'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 管理员浮动切换按钮：切换到对话页面 */}
        {user.role === 'admin' && onSwitchToApp && (
          <button
            onClick={onSwitchToApp}
            className="fixed bottom-6 right-6 z-[150] w-14 h-14 bg-black text-white rounded-full shadow-2xl shadow-black/30 flex items-center justify-center hover:bg-gray-800 transition-all hover:scale-105"
            title="切换到对话页面"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const _uiState = loadUIState();
  const [isStarted, setIsStarted] = useState(_uiState.isStarted);
  const [showGuide, setShowGuide] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>(_uiState.currentStep);
  const [topicStage, setTopicStage] = useState(1); // 当前选题阶段标签
  const [selectedTopic, setSelectedTopic] = useState<any>(null); // 选中的选题
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false); // 选题生成中

  // 参考文件缓存（避免重复 fetch）
  const refsCache = useRef<Record<string, string>>({});

  /** 获取缓存的参考文件内容 */
  const getRefContent = async (path: string): Promise<string> => {
    if (refsCache.current[path]) return refsCache.current[path];
    const content = await loadRefFile(path);
    refsCache.current[path] = content;
    return content;
  };

  /** 获取步骤的所有参考文件内容 */
  const getStepRefsContent = async (step: keyof typeof STEP_REFS): Promise<string> => {
    const files = STEP_REFS[step] || [];
    const contents = await Promise.all(files.map(f => getRefContent(f)));
    return contents.filter(Boolean).join('\n\n' + '='.repeat(60) + '\n\n');
  };

  const [state, setState] = useState<AppState>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('founder_ip_history') : null;
    let parsedHistory: HistoryItem[] = [];
    if (saved) {
      try {
        parsedHistory = JSON.parse(saved);
        if (!Array.isArray(parsedHistory)) parsedHistory = [];
      } catch {
        parsedHistory = [];
      }
    }
    return {
      ...initialState,
      history: parsedHistory,
    };
  });

  // 加载用户隔离的本地数据
  const loadUserLocalData = (userId: string) => {
    // 对话历史
    const history = loadResultFromStorage('founder_ip_history', userId) || [];
    // 访谈结果
    const interviewReport = loadResultFromStorage('interview_report', userId) || '';
    // 企业信息报告
    const infoReport = loadResultFromStorage('info_report', userId) || '';
    // 定位报告
    const positioningReport = loadResultFromStorage('positioning_report', userId) || '';
    // 定位方案选项（多版）
    const positioningOptions = loadResultFromStorage('positioning_options', userId) || [];
    const selectedPositioningIndex = positioningOptions.length > 0 ? 0 : null;
    // 选题池
    const topicPool = loadResultFromStorage('topic_pool', userId) || [];

    setState(prev => ({
      ...prev,
      history,
      interviewReport,
      infoReport,
      positioningReport,
      positioningOptions,
      selectedPositioningIndex,
      topicPool,
      topicGenerationStatus: topicPool.length > 0 ? 'completed' : 'idle',
    }));
  };

  // 保存对话历史（按用户隔离）
  useEffect(() => {
    const userId = state.user?.uid;
    if (!userId) return;
    const key = getUserScopedKey('founder_ip_history', userId);
    localStorage.setItem(key, JSON.stringify(state.history));
  }, [state.history, state.user?.uid]);

  // UI 状态持久化（按用户隔离）
  useEffect(() => {
    const userId = state.user?.uid;
    const key = userId ? getUserScopedKey(UI_STATE_KEY, userId) : UI_STATE_KEY;
    const raw = localStorage.getItem(key);
    const saved = raw ? JSON.parse(raw) : {};
    localStorage.setItem(key, JSON.stringify({
      ...saved,
      currentStep,
      isStarted,
      lastView: state.view === 'login' ? saved.lastView : state.view,
    }));
  }, [currentStep, isStarted, state.view, state.user?.uid]);

  // Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // 从后端 API 获取用户完整信息（替代 Firestore）
          const token = localStorage.getItem('authing_access_token');
          if (token) {
            const res = await api.verifyAuth(token);
            if (res?.user) {
              const profile: UserProfile = {
                uid: res.user.id,
                email: res.user.email || '',
                phone: res.user.phone || null,
                role: res.user.role,
                subscriptionStartAt: res.user.subscription_start_at || null,
                subscriptionDays: Number(res.user.subscription_days) || 7,
                tokenQuota: Number(res.user.token_quota) || 100000,
                tokenUsed: Number(res.user.token_used) || 0,
                createdAt: new Date(res.user.created_at),
              };
              const savedView = loadUIState().lastView;
              // 管理员：有上次记录且明确在 app 就回 app，否则默认进 admin
              // 普通用户：一律进 app
              const targetView = profile.role === 'admin'
                ? (savedView === 'app' ? 'app' : 'admin')
                : 'app';
              setState(prev => ({
                ...prev,
                user: profile,
                view: targetView,
              }));
              // 加载该用户的本地数据（替换之前的共享数据）
              loadUserLocalData(profile.uid);
            }
          }
        } catch (err) {
          console.error('Auth state sync failed:', err);
          setState(prev => ({ ...prev, user: null, view: 'login' }));
        }
      } else {
        // 调试登录模式下，Firebase 无用户是正常的，不要重置 view
        setState(prev => {
          if (prev.isDebugLogin) return prev;
          return { ...prev, user: null, view: 'login' };
        });
      }
    });
    return () => unsubscribe();
  }, [state.isAdminLogin]);

  // 订阅状态检查（首次加载时刷新）
  useEffect(() => {
    if (state.user && state.view === 'app') {
      api.getUsageMe().then(res => {
        if (res?.data?.tokens) {
          setState(prev => ({
            ...prev,
            user: prev.user ? {
              ...prev.user,
              tokenUsed: Number(res.data.tokens.used) || 0,
              tokenQuota: Number(res.data.tokens.quota) || 0,
            } : null,
          }));
        }
      }).catch(() => {});
    }
  }, [state.user?.uid, state.view]);

  // Knowledge Base State
  useEffect(() => {
    if (state.user && state.view === 'app') {
      const loadKnowledgeBase = async () => {
        try {
          const res = await api.getKnowledgeBase();
          setState(prev => ({
            ...prev,
            knowledgeBase: res.data || []
          }));
        } catch (err) {
          console.error('Failed to load knowledge base:', err);
        }
      };
      loadKnowledgeBase();
      // 每 30 秒轮询一次（替代 Firestore onSnapshot）
      const interval = setInterval(loadKnowledgeBase, 30000);
      return () => clearInterval(interval);
    }
  }, [state.user, state.view]);

  const handleLogout = async () => {
    try {
      const currentUserId = state.user?.uid;
      await signOut(auth);
      // 登出时清除认证缓存和该用户的本地数据
      localStorage.removeItem('authing_access_token');
      localStorage.removeItem('firebase_user_cache');
      // 清除该用户的 localStorage 数据
      if (currentUserId) {
        const keysToRemove = [
          getUserScopedKey('founder_ip_history', currentUserId),
          getUserScopedKey(UI_STATE_KEY, currentUserId),
          getUserScopedKey('result_interview_report', currentUserId),
          getUserScopedKey('result_info_report', currentUserId),
          getUserScopedKey('result_positioning_report', currentUserId),
          getUserScopedKey('result_topic_pool', currentUserId),
        ];
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }
      setState(initialState);
      setCurrentStep('interview');
      setIsStarted(false);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // 检查用户订阅和 Token 额度
  const checkUserLimits = (): { ok: boolean; message?: string } => {
    if (!state.user) return { ok: false, message: '未登录' };
    if (state.user.role === 'admin') return { ok: true };

    // Token 检查
    const tokenUsed = Number(state.user.tokenUsed) || 0;
    const tokenQuota = Number(state.user.tokenQuota) || 0;
    if (tokenUsed >= tokenQuota) {
      return { ok: false, message: '您的 Token 额度已用完，请联系管理员续期。' };
    }

    // 订阅到期检查
    if (state.user.subscriptionStartAt) {
      const start = new Date(state.user.subscriptionStartAt);
      const expires = new Date(start.getTime() + state.user.subscriptionDays * 24 * 60 * 60 * 1000);
      if (new Date() > expires) {
        return { ok: false, message: '您的订阅已到期，请联系管理员续期。' };
      }
    }

    return { ok: true };
  };

  // 上报 Token 使用量并更新本地状态
  const reportTokenUsage = (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => {
    if (!state.user || state.user.role === 'admin') return;
    api.trackTokenUsage(usage).catch(console.error);
    setState(prev => ({
      ...prev,
      user: prev.user ? {
        ...prev.user,
        tokenUsed: (prev.user.tokenUsed || 0) + usage.total_tokens,
      } : null,
    }));
  };

  const resetAllData = () => {
    try {
      const hasAnyData = messages.length > 1 || state.interviewReport || state.infoReport || state.positioningReport || state.copywritingOutput.content || state.copywritingMessages.length > 0;
      const confirmMsg = hasAnyData
        ? '确定要清空当前会话并保存到历史记录吗？\n\n当前对话和生成内容将保存到历史，然后重新开始。'
        : '确定要清空所有用户数据吗？\n\n这将删除所有访谈对话记录、报告、文案和上传资料。\n\n此操作不可恢复。';

      // 部分浏览器/内嵌环境会阻止 window.confirm，做兜底提示
      let confirmed = false;
      try {
        confirmed = window.confirm(confirmMsg);
      } catch (confirmErr) {
        console.error('[resetAllData] confirm dialog blocked:', confirmErr);
        alert('无法弹出确认对话框，请检查浏览器设置');
        return;
      }
      if (!confirmed) return;

      // 如果有数据，先保存到历史
      if (hasAnyData) {
        const newItem: HistoryItem = {
          id: Date.now().toString(),
          date: new Date().toLocaleString('zh-CN'),
          title: generateHistoryTitle(),
          messages: [...messages],
          interviewPhase: state.interviewPhase,
          interviewReport: state.interviewReport,
          companyInfo,
          infoReport: state.infoReport,
          positioningOptions: state.positioningOptions,
          selectedPositioningIndex: state.selectedPositioningIndex,
          positioningReport: state.positioningReport,
          copywritingMessages: state.copywritingMessages,
          isCopywritingChatMode: state.isCopywritingChatMode,
          copywritingOutput: { ...state.copywritingOutput },
          uploadedMaterials: [...state.uploadedMaterials],
        };
        setState(prev => ({
          ...prev,
          history: [newItem, ...prev.history].slice(0, 99),
        }));
      }

      setMessages([{ role: 'model', text: '您好，我是您的访谈顾问。很高兴能协助您梳理个人IP。为了更好地挖掘您的故事，我们先从全方位的个人信息开始。首先，请问您的姓名是什么？' }]);
      setInput('');
      setCompanyInfo('');
      setCurrentStep('interview');
      setState(prev => ({
        ...prev,
        interviewPhase: 'basic',
        interviewReport: '',
        infoReport: '',
        positioningOptions: [],
        selectedPositioningIndex: null,
        positioningReport: '',
        copywritingOutput: { titles: [], selectedTitleIndex: null, content: '' },
        copywritingMessages: [],
        isCopywritingChatMode: false,
        uploadedMaterials: [],
      }));
      alert(hasAnyData ? '✅ 当前会话已保存到历史记录，重新开始。' : '✅ 所有数据已清空，重新开始。');
    } catch (error: any) {
      console.error('[resetAllData] 清空记录失败:', error);
      alert('清空记录失败: ' + (error.message || '未知错误'));
    }
  };

  /** 清除当前用户的 localStorage 数据（调试用） */
  const clearUserLocalData = () => {
    const userId = state.user?.uid;
    if (!userId) {
      alert('未检测到登录用户，无法清除本地数据。');
      return;
    }
    const confirmed = window.confirm(
      `确定清除当前用户（${state.user?.phone || state.user?.email || userId}）的本地缓存吗？\n\n这将删除：\n- 对话历史\n- 访谈结果\n- 定位报告\n- 选题池\n- UI 状态\n\n后端数据库数据不受影响。`
    );
    if (!confirmed) return;

    const keysToRemove = [
      getUserScopedKey('founder_ip_history', userId),
      getUserScopedKey(UI_STATE_KEY, userId),
      getUserScopedKey('result_interview_report', userId),
      getUserScopedKey('result_info_report', userId),
      getUserScopedKey('result_positioning_report', userId),
      getUserScopedKey('result_topic_pool', userId),
    ];
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // 同时清除 auth token 缓存
    localStorage.removeItem('authing_access_token');
    localStorage.removeItem('firebase_user_cache');

    alert('✅ 本地缓存已清除，页面将重新加载。');
    window.location.reload();
  };

  const generateHistoryTitle = (): string => {
    // 优先用文案标题，其次用定位方案名，再其次用公司名/姓名
    const cwTitle = state.copywritingOutput.titles[state.copywritingOutput.selectedTitleIndex || 0];
    if (cwTitle) return cwTitle;
    const positioningReportText = typeof state.positioningReport === 'string' ? state.positioningReport : '';
    if (positioningReportText) {
      const match = positioningReportText.match(/###\s+定位方案\s*\d*[:：]\s*(.+)/);
      if (match) return match[1].trim();
    }
    if (companyInfo) {
      const nameMatch = companyInfo.match(/公司名[称]?[：:]\s*(.+)/);
      if (nameMatch) return nameMatch[1].trim();
    }
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) return firstUserMsg.text.slice(0, 20);
    return '未命名记录';
  };

  const addToHistory = async () => {
    const hasAnyData = messages.length > 1 || state.interviewReport || state.infoReport || state.positioningReport || state.copywritingOutput.content;
    if (!hasAnyData) {
      alert('当前没有可保存的数据');
      return;
    }
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      date: new Date().toLocaleString('zh-CN'),
      title: generateHistoryTitle(),
      messages: [...messages],
      interviewPhase: state.interviewPhase,
      interviewReport: state.interviewReport,
      companyInfo,
      infoReport: state.infoReport,
      positioningOptions: state.positioningOptions,
      selectedPositioningIndex: state.selectedPositioningIndex,
      positioningReport: state.positioningReport,
      copywritingMessages: state.copywritingMessages,
      isCopywritingChatMode: state.isCopywritingChatMode,
      copywritingOutput: { ...state.copywritingOutput },
      uploadedMaterials: [...state.uploadedMaterials],
    };

    try {
      setState(prev => ({
        ...prev,
        history: [newItem, ...prev.history].slice(0, 99),
      }));
      alert('✅ 已保存到历史记录');
    } catch (error) {
      console.error('Save history error:', error);
      alert('保存失败，请重试');
    }
  };

  // --- File Upload State ---
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDeleteMaterial = (index: number) => {
    if (!confirm('确定删除该资料吗？')) return;
    setState(prev => ({
      ...prev,
      uploadedMaterials: prev.uploadedMaterials.filter((_, i) => i !== index)
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // 单文件大小限制 2MB，避免前端内存压力和 AI 上下文超限
    const MAX_FILE_SIZE = 2 * 1024 * 1024;
    // 单文件内容最大字符数，超长将截断并跳过 AI 整理
    const MAX_CONTENT_LENGTH = 8000;

    Array.from(files).forEach(file => {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      const isDocx = file.name.endsWith('.docx');
      const isDoc = file.name.endsWith('.doc');
      const isText = file.type.includes('text') || file.name.endsWith('.md') || file.name.endsWith('.txt');
      const isPdf = file.name.endsWith('.pdf');
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      // 不支持的格式：明确提示
      if (isPdf || isImage || isVideo) {
        alert(`暂不支持 ${file.name} 的格式（${isPdf ? 'PDF' : isImage ? '图片' : '视频'}）。\n请先将其内容复制粘贴到文本框中，或转换为 .txt/.docx 格式后再上传。`);
        return;
      }

      if (!isText && !isExcel && !isDocx && !isDoc) {
        alert(`不支持的文件格式：${file.name}\n目前仅支持 .txt, .md, .docx, .doc, .xlsx, .xls`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        alert(`文件 ${file.name} 过大（${(file.size / 1024 / 1024).toFixed(2)}MB）。\n为保证访谈流畅，请上传不超过 2MB 的资料，或只复制其中相关片段。`);
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          let content = '';
          if (isExcel) {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            content = XLSX.utils.sheet_to_txt(worksheet);
          } else if (isDocx || isDoc) {
            const arrayBuffer = event.target?.result as ArrayBuffer;
            const result = await mammoth.extractRawText({ arrayBuffer });
            content = result.value;
            if (!content && isDoc) {
              alert(`${file.name} 解析失败。.doc（旧格式）请另存为 .docx 后再上传。`);
              return;
            }
          } else {
            content = event.target?.result as string;
          }

          if (!content || !content.trim()) {
            alert(`${file.name} 内容为空，请检查文件。`);
            return;
          }

          let finalContent = content.trim();
          let truncated = false;
          if (finalContent.length > MAX_CONTENT_LENGTH) {
            finalContent = finalContent.slice(0, MAX_CONTENT_LENGTH);
            truncated = true;
          }

          // 短内容用 AI 整理结构；超长内容直接截断保留，避免 organizeContentWithAI 超限
          let organizedContent = finalContent;
          if (!truncated) {
            organizedContent = await organizeContentWithAI(finalContent);
          } else {
            organizedContent = finalContent + '\n\n【系统提示：该文件内容较长，已截取前 8000 字符作为参考资料。如需针对后续内容展开，请分段上传或复制相关片段。】';
          }

          const newMaterial: UploadedMaterial = {
            name: file.name,
            type: file.type,
            size: (file.size / 1024 / 1024).toFixed(2) + 'MB',
            content: organizedContent
          };

          setState(prev => ({
            ...prev,
            uploadedMaterials: [...prev.uploadedMaterials, newMaterial]
          }));

          if (truncated) {
            alert(`《${file.name}》内容较长，已自动截取前 8000 字符作为参考。访谈中聊到相关点时 AI 会自然引用。`);
          }
        } catch (err: any) {
          console.error('[Upload] 处理失败:', err);
          alert(`文件 ${file.name} 处理失败：${err.message || '未知错误'}`);
        }
      };

      reader.onerror = () => {
        alert(`无法读取文件 ${file.name}，请重试。`);
      };

      if (isExcel || isDocx || isDoc) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    });

    // 清空 input 值，允许重复选择同一文件
    e.target.value = '';
  };

  // --- Interview Agent State ---
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: '您好，我是您的访谈顾问。很高兴能协助您梳理个人IP。为了更好地挖掘您的故事，我们先从全方位的个人信息开始。首先，请问您的姓名是什么？' }
  ]);

  // Load User Progress on Login
  useEffect(() => {
    const loadProgress = async () => {
      if (state.user && state.view === 'app') {
        try {
          const res = await api.getUserProfile();
          const data = res.data;
          if (data) {
            if (data.interview_data?.messages) setMessages(data.interview_data.messages);
            setState(prev => ({
              ...prev,
              interviewReport: data.interview_data?.report || prev.interviewReport,
              infoReport: typeof data.information_report === 'string' ? data.information_report : prev.infoReport,
              positioningReport: typeof data.positioning_report === 'string' ? data.positioning_report : '',
              positioningOptions: Array.isArray(data.positioning_options) ? data.positioning_options : prev.positioningOptions,
              topicPool: Array.isArray(data.topic_pool) ? data.topic_pool : prev.topicPool,
              copywritingOutput: data.copywriting_data?.output || prev.copywritingOutput,
              copywritingMessages: data.copywriting_data?.messages || prev.copywritingMessages,
            }));
          }
        } catch (error) {
          console.error("Error loading progress:", error);
        }
      }
    };
    loadProgress();
  }, [state.user?.uid, state.view]);

  // Save User Progress (Debounced)
  useEffect(() => {
    if (state.user && state.view === 'app') {
      const saveProgress = async () => {
        try {
          await api.updateUserProfile({
            interview_data: {
              messages,
              report: state.interviewReport,
            },
            information_report: state.infoReport,
            positioning_report: state.positioningReport,
            positioning_options: state.positioningOptions,
            topic_pool: state.topicPool,
            copywriting_data: {
              output: state.copywritingOutput,
              messages: state.copywritingMessages,
            },
          });
        } catch (error) {
          console.error("Error saving progress:", error);
        }
      };

      const timeoutId = setTimeout(saveProgress, 5000); // 5s debounce
      return () => clearTimeout(timeoutId);
    }
  }, [
    state.user?.uid,
    state.view,
    messages,
    state.interviewReport,
    state.infoReport,
    state.positioningReport,
    state.positioningOptions,
    state.topicPool,
    state.copywritingOutput,
    state.copywritingMessages,
    state.uploadedMaterials
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const REPORT_SECTIONS = [
    "第一章：创始人性格底色与MBTI深度画像",
    "第二章：成长环境与价值观形成深度复盘",
    "第三章：创业历程深度回顾与关键决策分析",
    "第四章：商业模式、核心竞争力与行业洞察",
    "第五章：精神内核、使命感与未来愿景深度解读"
  ];

  const getCompletedReportSectionCount = (report: string): number => {
    let count = 0;
    for (const section of REPORT_SECTIONS) {
      if (report.includes(`## ${section}`)) count++;
    }
    return count;
  };

  const isReportComplete = (report: string): boolean => {
    return report.includes('<!-- REPORT_COMPLETE -->');
  };

  const [isGeneratingDetailedReport, setIsGeneratingDetailedReport] = useState(false);

  const [reportProgress, setReportProgress] = useState('');

  const generateDetailedInterviewReport = async (resumeFromIndex?: number) => {
    setIsGeneratingDetailedReport(true);
    setReportProgress('正在准备...');
    try {
      const relevantKnowledge = state.knowledgeBase
        .filter(k => k.category === 'interview')
        .map(k => k.content)
        .join('\n\n');

      let fullReport: string;
      const startIndex = resumeFromIndex ?? 0;

      if (startIndex > 0 && state.interviewReport) {
        // 断点续传：复用已有报告内容
        fullReport = state.interviewReport.replace('<!-- REPORT_COMPLETE -->', '').trim();
      } else {
        // 从头开始
        fullReport = "# 创始人创业经历深度分析报告\n\n";
        fullReport += "## 报告目录\n\n";
        REPORT_SECTIONS.forEach((s, idx) => {
          fullReport += `${idx + 1}. ${s}\n`;
        });
        fullReport += "\n---\n\n";
        setState(prev => ({ ...prev, interviewReport: fullReport }));
      }
      
      for (let i = startIndex; i < REPORT_SECTIONS.length; i++) {
        const section = REPORT_SECTIONS[i];
        setReportProgress(`正在生成第 ${i + 1}/5 章：${section}...`);
        try {
          const text = await deepseek.generateText({
            model: deepseek.MODELS.chat,
            system: "你是一位顶级的IP挖掘专家。你的目标是撰写一份极其详尽、逻辑严密、专业且具有文学美感的深度报告。请务必保证内容的丰富度和深度。每一部分必须包含明确的章节小点（使用H3标题），并以高度结构化的方式呈现。请务必在内容中多使用列表、加粗等排版方式，确保逻辑清晰。如果提供了参考知识库，请务必将其中的行业洞察、专业术语或分析逻辑应用到报告中。",
            prompt: `基于以下访谈记录和参考知识库，请撰写报告的【${section}】部分（字数不少于5000字）：

访谈记录：
${messages.map(m => `${m.role}: ${m.text}`).join('\n')}

参考知识库：
${relevantKnowledge}`,
            onUsage: reportTokenUsage,
          });
          fullReport += `## ${section}\n\n${text}\n\n`;
        } catch (sectionErr: any) {
          console.error(`[Report] 第 ${i + 1} 章生成失败:`, sectionErr);
          fullReport += `## ${section}\n\n> ⚠️ 该章节生成失败：${sectionErr.message || 'AI 服务暂时不可用'}\n\n`;
        }
        // 每完成一章就保存进度
        setState(prev => ({ ...prev, interviewReport: fullReport }));
      }

      // 标记完成
      setState(prev => ({ ...prev, interviewReport: fullReport + '\n\n<!-- REPORT_COMPLETE -->' }));
      saveResultToStorage('interview_report', fullReport, state.user?.uid);
      setReportProgress('');
    } catch (error: any) {
      console.error("Detailed report error:", error);
      alert('报告生成失败：' + (error.message || 'AI 服务暂时不可用，请稍后重试'));
      setReportProgress('');
    } finally {
      setIsGeneratingDetailedReport(false);
    }
  };

  const restartInterview = () => {
    setMessages([{ role: 'model', text: '您好，我是您的访谈顾问。很高兴能协助您梳理个人IP。为了更好地挖掘您的故事，我们先从全方位的个人信息开始。首先，请问您的姓名是什么？' }]);
    setState(prev => ({
      ...prev,
      interviewPhase: 'basic',
      interviewReport: ''
    }));
  };

  const downloadReport = (content: string, filename: string, type: 'md' | 'doc' = 'md') => {
    if (type === 'md') {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // Basic HTML template for Word
      const html = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${filename}</title></head>
        <body>${content.replace(/\n/g, '<br>')}</body>
        </html>
      `;
      const blob = new Blob([html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.doc') ? filename : filename + '.doc';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStarted) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStarted]);

  const handleStart = () => {
    setIsStarted(true);
  };

  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus(label);
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const renderStep = () => {
    // Subscription & Token Restriction Check
    const limits = checkUserLimits();
    if (!limits.ok && state.user && state.user.role !== 'admin') {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
            <Clock className="w-10 h-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-gray-900">额度限制</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              {limits.message} 请联系管理员续期。
            </p>
          </div>
          <button 
            onClick={() => setShowContact(true)}
            className="bg-black text-white px-8 py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-xl shadow-black/10"
          >
            联系管理员
          </button>
        </div>
      );
    }

    // Global Loading States based on Image 2
    if (isGeneratingDetailedReport) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
            <Loader2 className="w-12 h-12 text-black" />
          </motion.div>
          <div className="space-y-2">
            <h3 className="text-xl md:text-2xl font-bold text-black">正在为您深度复盘访谈内容...</h3>
            <p className="text-gray-400 text-sm md:text-base italic">正在挖掘您的核心优势与独特人设标签</p>
            {reportProgress && (
              <p className="text-amber-600 text-sm font-bold mt-2">{reportProgress}</p>
            )}
          </div>
        </div>
      );
    }
    if (isGeneratingInfo) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
            <Loader2 className="w-12 h-12 text-black" />
          </motion.div>
          <div className="space-y-2">
            <h3 className="text-xl md:text-2xl font-bold text-black">正在为您深度分析企业与行业...</h3>
            <p className="text-gray-400 text-sm md:text-base italic">正在从海量信息中提取商业洞察与竞争优势</p>
          </div>
        </div>
      );
    }
    if (isGeneratingPositioning) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
            <Loader2 className="w-12 h-12 text-black" />
          </motion.div>
          <div className="space-y-2">
            <h3 className="text-xl md:text-2xl font-bold text-black">正在为您量身定制IP定位方案...</h3>
            <p className="text-gray-400 text-sm md:text-base italic">正在平衡个人魅力与商业价值的完美契合点</p>
          </div>
        </div>
      );
    }
    if (isGeneratingCopywriting) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
            <Loader2 className="w-12 h-12 text-black" />
          </motion.div>
          <div className="space-y-2">
            <h3 className="text-xl md:text-2xl font-bold text-black">正在为您精心打磨文案...</h3>
            <p className="text-gray-400 text-sm md:text-base italic">正在融合您的个人故事与专业洞察</p>
          </div>
        </div>
      );
    }

    switch (currentStep) {
      case 'interview':
        return (
          <div className="flex-1 flex flex-col h-full">
            <div className="p-4 md:p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 shadow-sm">
                  <img src={BOT_AVATAR} alt="Consultant" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <h2 className="font-semibold text-sm md:text-base">访谈顾问：挖掘个人故事</h2>
              </div>
              <button
                onClick={() => {
                  if (isStepUnlocked('positioning', state.interviewReport, state.topicPool, state.user?.role)) {
                    setCurrentStep('positioning');
                  } else {
                    alert('请先完成访谈并生成深度报告');
                  }
                }}
                className={cn(
                  "flex items-center gap-1 md:gap-2 text-xs md:text-sm font-bold transition-all",
                  isStepUnlocked('positioning', state.interviewReport, state.topicPool, state.user?.role)
                    ? "text-black hover:gap-2 md:hover:gap-3"
                    : "text-gray-300 cursor-not-allowed"
                )}
              >
                下一步 <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 max-h-[400px] md:max-h-[500px]">
              {messages.map((m, i) => {
                const isLastModel = m.role === 'model' && isTyping && i === messages.length - 1;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i}
                    className={cn(
                      "flex w-full group gap-3",
                      m.role === 'user' ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden shrink-0 shadow-sm border border-gray-100",
                      m.role === 'user' ? "bg-black" : "bg-white"
                    )}>
                      <img
                        src={m.role === 'user' ? USER_AVATAR : BOT_AVATAR}
                        alt={m.role === 'user' ? "User" : "Consultant"}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className={cn(
                      "max-w-[75%] md:max-w-[70%] p-3 md:p-4 rounded-xl md:rounded-2xl text-xs md:text-sm leading-relaxed relative",
                      m.role === 'user' ? "bg-black text-white rounded-tr-none shadow-lg" : "bg-white border border-gray-100 text-gray-800 rounded-tl-none shadow-sm"
                    )}>
                      <div className="markdown-body prose prose-sm max-w-none prose-p:leading-relaxed">
                        <ReactMarkdown>
                          {m.text}
                        </ReactMarkdown>
                        {m.role === 'model' && isLastModel && (
                          <span className="inline-flex items-center gap-[3px] ml-1 h-5">
                            <span className="inline-block w-[3px] h-[6px] bg-gray-400 rounded-sm" style={{ animation: 'typing-bounce 1s ease-in-out infinite', animationDelay: '0s' }} />
                            <span className="inline-block w-[3px] h-[10px] bg-gray-400 rounded-sm" style={{ animation: 'typing-bounce 1s ease-in-out infinite', animationDelay: '0.2s' }} />
                            <span className="inline-block w-[3px] h-[6px] bg-gray-400 rounded-sm" style={{ animation: 'typing-bounce 1s ease-in-out infinite', animationDelay: '0.4s' }} />
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 md:p-6 bg-gray-50/50 border-t border-gray-100">
              {DEBUG_MODE === 'dev' && state.user && state.user.role !== 'admin' && (
                <div className="mb-3 px-1">
                  <div className="flex justify-between text-[10px] text-gray-500 mb-1 font-mono">
                    <span>Token: {state.user.tokenUsed?.toLocaleString()} / {state.user.tokenQuota?.toLocaleString()}</span>
                    <span>{Math.round(((state.user.tokenUsed || 0) / (state.user.tokenQuota || 1)) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (state.user.tokenUsed || 0) / (state.user.tokenQuota || 1) > 0.9 ? 'bg-red-500' :
                        (state.user.tokenUsed || 0) / (state.user.tokenQuota || 1) > 0.7 ? 'bg-amber-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(100, ((state.user.tokenUsed || 0) / (state.user.tokenQuota || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {/* Uploaded materials */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-400">上传参考资料</label>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[10px] font-bold text-black hover:underline"
                  >
                    添加文件
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    multiple
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.txt,.mp4,.xlsx,.xls"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {state.uploadedMaterials.map((file, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm">
                      <FileText size={12} className="text-gray-400" />
                      <span className="text-[10px] font-medium truncate max-w-[120px] md:max-w-[180px]">{file.name}</span>
                      <button
                        onClick={() => handleDeleteMaterial(i)}
                        className="text-gray-300 hover:text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {state.uploadedMaterials.length === 0 && (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1 text-gray-300 hover:text-gray-400 cursor-pointer transition-all"
                    >
                      <Upload size={14} />
                      <span className="text-[10px] font-medium">点击上传图片、文档、视频等</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="输入您的回答..."
                    className="w-full bg-white border border-gray-200 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 pr-12 md:pr-16 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all shadow-sm text-sm"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isTyping || !input.trim()}
                    className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 p-2 bg-black text-white rounded-lg md:rounded-xl hover:bg-gray-800 disabled:bg-gray-200 transition-all shadow-md"
                  >
                    <Send className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>
                {!state.interviewReport && !isGeneratingDetailedReport && messages.length > 1 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] md:text-xs text-gray-400 font-medium">
                      💡 等待 AI 顾问完成访谈后，可生成深度报告
                    </p>
                    <button
                      onClick={() => generateDetailedInterviewReport()}
                      disabled={!canEndInterview()}
                      className="px-4 py-3 bg-amber-500 text-white rounded-xl md:rounded-2xl hover:bg-amber-600 transition-all shadow-md text-xs md:text-sm font-bold flex items-center gap-2 whitespace-nowrap disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
                    >
                      <Sparkles size={16} /> 生成深度报告
                    </button>
                  </div>
                )}
              </div>
              
              {state.interviewReport && !isGeneratingDetailedReport && !isReportComplete(state.interviewReport) && (
                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-amber-800">
                      ⚠️ 检测到上次报告生成中断
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      已完成 {getCompletedReportSectionCount(state.interviewReport)}/5 章，可继续生成剩余章节
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const completed = getCompletedReportSectionCount(state.interviewReport);
                        generateDetailedInterviewReport(completed);
                      }}
                      className="px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-all shadow-sm"
                    >
                      继续生成
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('确定要重新生成报告吗？\n\n已有的章节内容将被清除，从第1章重新开始。')) {
                          setState(prev => ({ ...prev, interviewReport: '' }));
                          generateDetailedInterviewReport();
                        }
                      }}
                      className="px-4 py-2 bg-white text-gray-600 border border-gray-200 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all"
                    >
                      重新生成
                    </button>
                  </div>
                </div>
              )}

              {state.interviewReport && (
                <div className="mt-8">
                  <CollapsibleSection title="查看访谈报告" icon={FileText}>
                    <div className="flex items-center justify-between mb-4">
                      <button
                        onClick={() => {
                          if (window.confirm('确定要删除访谈报告并重新开始访谈吗？\n\n这将清除所有访谈对话记录和已生成的报告，此操作不可恢复。')) {
                            restartInterview();
                          }
                        }}
                        className="text-xs text-red-500 hover:text-red-600 transition-colors flex items-center gap-1 font-bold"
                      >
                        <Trash2 size={14} /> 删除报告并重新访谈
                      </button>
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => downloadReport(state.interviewReport, '创业经历深度分析报告.doc', 'doc')}
                          className="text-xs text-gray-400 hover:text-black transition-colors flex items-center gap-1"
                        >
                          <Download size={14} /> 下载 Word
                        </button>
                        <button 
                          onClick={() => downloadReport(state.interviewReport, '创业经历深度分析报告.md')}
                          className="text-xs text-gray-400 hover:text-black transition-colors flex items-center gap-1"
                        >
                          <Download size={14} /> 下载 Markdown
                        </button>
                        <button 
                          onClick={() => handleCopy(state.interviewReport, 'interview')}
                          className="text-xs text-gray-400 hover:text-black transition-colors flex items-center gap-1"
                        >
                          {copyStatus === 'interview' ? <CheckCircle2 size={14} className="text-green-500" /> : <Copy size={14} />}
                          {copyStatus === 'interview' ? '已复制' : '复制'}
                        </button>
                      </div>
                    </div>
                    <div className="markdown-body prose prose-sm max-w-none">
                      <CollapsibleMarkdown content={state.interviewReport} />
                    </div>
                  </CollapsibleSection>
                </div>
              )}

              {isGeneratingDetailedReport && (
                <div className="mt-8 p-8 bg-black text-white rounded-3xl flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm font-bold animate-pulse">正在生成深度分析报告，请稍候...</p>
                  {reportProgress && (
                    <p className="text-xs text-amber-300 font-medium">{reportProgress}</p>
                  )}
                  <p className="text-[10px] opacity-50">这可能需要1-2分钟，请不要关闭页面</p>
                </div>
              )}

              <p className="text-[8px] md:text-[10px] text-gray-400 mt-2 md:mt-3 text-center uppercase tracking-widest font-medium">
                访谈顾问正在记录您的每一个精彩瞬间
              </p>
            </div>
          </div>
        );
      case 'positioning':
        return (
          <div className="flex-1 flex flex-col p-4 md:p-8">
            <div className="flex items-center justify-between mb-6 md:mb-8">
              <button onClick={() => setCurrentStep('interview')} className="text-gray-400 hover:text-black flex items-center gap-1 md:gap-2 text-xs md:text-sm transition-colors">
                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> 返回
              </button>
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border border-gray-200 shadow-sm">
                  <img src={BOT_AVATAR} alt="Consultant" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <h2 className="text-base md:text-xl font-bold">定位顾问：IP规划</h2>
              </div>
              <div className="w-10 md:w-20" />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center space-y-6 md:space-y-8">
              {!state.positioningOptions.length && (
                <div className="text-center space-y-4 md:space-y-6 max-w-md">
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-white rounded-2xl md:rounded-3xl mx-auto overflow-hidden flex items-center justify-center shadow-2xl shadow-black/10 border border-gray-100">
                    <img src={BOT_AVATAR} alt="Consultant" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold">准备好开启IP之路了吗？</h3>
                  <p className="text-gray-500 text-xs md:text-sm leading-relaxed">
                    定位顾问将为您生成三版不同的IP定位方案，您可以根据自己的喜好进行选择和微调。
                  </p>
                  <button 
                    onClick={generatePositioningReport}
                    disabled={isGeneratingPositioning}
                    className="w-full bg-black text-white py-3 md:py-4 rounded-xl md:rounded-2xl font-bold flex items-center justify-center gap-2 md:gap-3 hover:bg-gray-800 transition-all shadow-xl shadow-black/10 disabled:bg-gray-200 text-sm"
                  >
                    {isGeneratingPositioning ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Sparkles className="w-4 h-4 md:w-5 md:h-5" />}
                    生成三版定位方案
                  </button>
                  <button
                    onClick={() => setCurrentStep('topic')}
                    className="w-full text-gray-400 hover:text-black transition-colors text-xs font-bold py-2"
                  >
                    跳过此步，直接进入选题创作
                  </button>
                </div>
              )}

              {state.positioningOptions.length > 0 && (
                <div className="w-full space-y-8">
                  {/* Tab Navigation - Three Windows Switcher */}
                  <div className="flex items-center gap-3 p-2 bg-gray-100/50 rounded-[24px] w-fit mx-auto border border-gray-200/50 backdrop-blur-sm">
                    {state.positioningOptions.map((opt, idx) => {
                      // 第一个标签固定显示"总结"，其余从内容中提取标题
                      let title = idx === 0 ? '总结' : '';

                      if (idx > 0) {
                        const headerMatch = opt.match(/###\s+(定位分析|定位方案\s+(\d+)[:：]\s*(.*))/);
                        const numMap: Record<string, string> = {
                          '1': '一',
                          '2': '二',
                          '3': '三'
                        };

                        if (headerMatch) {
                          if (headerMatch[1] === "定位分析") {
                            title = "定位分析";
                          } else {
                            const optionIndex = headerMatch[2] || "";
                            title = `方案${numMap[optionIndex] || optionIndex}`;
                          }
                        } else {
                          const fieldMatch = opt.match(/方案名称[：:](.*)/);
                          title = (fieldMatch ? fieldMatch[1].trim() : `方案 ${idx}`).split('\n')[0];
                        }
                      }
                      
                      return (
                        <button
                          key={idx}
                          onClick={() => setState(prev => ({ ...prev, selectedPositioningIndex: idx, positioningReport: opt }))}
                          className={cn(
                            "px-8 py-4 rounded-[20px] text-xs font-bold transition-all flex items-center gap-3 relative overflow-hidden",
                            state.selectedPositioningIndex === idx 
                              ? "bg-white text-black shadow-xl shadow-black/5 ring-1 ring-black/5" 
                              : "text-gray-400 hover:text-gray-600 hover:bg-gray-200/50"
                          )}
                        >
                          {state.selectedPositioningIndex === idx && (
                            <motion.div 
                              layoutId="activeTab"
                              className="absolute inset-0 bg-white"
                              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                          )}
                          <span className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] relative z-10 transition-colors",
                            state.selectedPositioningIndex === idx ? "bg-black text-white" : "bg-gray-200 text-gray-500"
                          )}>
                            {idx + 1}
                          </span>
                          <span className="relative z-10">
                            {title}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {state.positioningReport && (
                    <motion.div 
                      key={state.selectedPositioningIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-1 lg:grid-cols-3 gap-8"
                    >
                      <div className="lg:col-span-2 bg-white rounded-[32px] p-8 md:p-12 border border-gray-100 shadow-xl overflow-y-auto max-h-[800px] relative group">
                        {/* Window Decoration */}
                        <div className="absolute top-6 left-8 flex gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-red-400/20" />
                          <div className="w-3 h-3 rounded-full bg-amber-400/20" />
                          <div className="w-3 h-3 rounded-full bg-green-400/20" />
                        </div>

                        <div className="flex items-center justify-between mb-10 mt-4">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mb-1">Positioning Strategy</span>
                            <h3 className="text-2xl font-bold tracking-tight">
                              {(() => {
                                const headerMatch = state.positioningReport.match(/###\s+(定位分析|定位方案\s+(\d+)[:：]\s*(.*))/);
                                const numMap: Record<string, string> = {
                                  '1': '一',
                                  '2': '二',
                                  '3': '三'
                                };
                                if (headerMatch) {
                                  if (headerMatch[1] === "定位分析") return "定位分析";
                                  const optionIndex = headerMatch[2] || "";
                                  const nameMatch = headerMatch[1].match(/[:：]\s*(.*)/);
                                  const name = nameMatch ? nameMatch[1].trim() : "";
                                  return `方案${numMap[optionIndex] || optionIndex}: ${name}`;
                                }
                                const fieldMatch = state.positioningReport.match(/方案名称[：:](.*)/);
                                return (fieldMatch ? fieldMatch[1].trim() : `定位方案 ${state.selectedPositioningIndex + 1}`).split('\n')[0];
                              })()}
                            </h3>
                          </div>
                          <button 
                            onClick={() => handleCopy(state.positioningReport, 'positioning')}
                            className="p-3 bg-gray-50 hover:bg-black hover:text-white rounded-2xl transition-all group/copy"
                          >
                            {copyStatus === 'positioning' ? <CheckCircle2 size={18} className="text-green-500" /> : <Copy size={18} />}
                          </button>
                        </div>

                        <div className="prose prose-sm max-w-none prose-headings:font-bold prose-h1:text-3xl prose-h2:text-xl prose-h2:mt-8 prose-p:text-gray-600 prose-li:text-gray-600">
                          <ReactMarkdown>{state.positioningReport}</ReactMarkdown>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-lg space-y-6">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Optimization</h4>
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          </div>
                          
                          <div className="space-y-4">
                            <p className="text-xs text-gray-500 leading-relaxed">
                              对当前方案不满意？您可以输入具体的修改建议，AI 将为您进行精准调整。
                            </p>
                            <textarea
                              value={positioningFeedback}
                              onChange={(e) => setPositioningFeedback(e.target.value)}
                              placeholder="例如：希望人设更接地气一点，或者增加更多实战案例选题..."
                              className="w-full h-32 p-4 bg-gray-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-black transition-all resize-none"
                            />
                            <button
                              onClick={modifyPositioning}
                              disabled={!positioningFeedback.trim() || isModifyingPositioning}
                              className="w-full py-4 bg-black text-white rounded-2xl text-xs font-bold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                              {isModifyingPositioning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                              优化当前方案
                            </button>
                          </div>
                        </div>

                        <div className="bg-black p-8 rounded-[32px] text-white shadow-2xl space-y-6">
                          <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-50">Next Step</h4>
                          <h3 className="text-xl font-bold leading-tight">方案已确认？<br/>立即开始选题规划</h3>
                          <button
                            onClick={() => setCurrentStep('topic')}
                            className="w-full py-4 bg-white text-black rounded-2xl text-xs font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                          >
                            进入选题顾问 <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      case 'topic': {
        // 选题阶段
        const hasTopicPool = state.topicPool.length > 0;
        const isEmpty = !hasTopicPool && state.topicGenerationStatus === 'idle';
        const isLoading = state.topicGenerationStatus === 'generating';
        const isDemoFallback = state.topicGenerationStatus === 'demo_fallback';

        // 选题池为空且未生成过：显示空状态
        if (isEmpty) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
              <div className="max-w-md w-full text-center space-y-6">
                <div className="w-20 h-20 mx-auto bg-gray-50 rounded-full flex items-center justify-center">
                  <FileText size={32} className="text-gray-300" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold text-black mb-2">尚未生成选题池</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    选题池基于您的访谈结果和定位报告生成，包含 4 个阶段的详细选题规划。
                    <br/>请先完成访谈和定位，然后点击下方按钮生成选题。
                  </p>
                </div>
                <button
                  onClick={generateTopicPool}
                  disabled={isLoading}
                  className="w-full py-4 bg-black text-white rounded-2xl font-bold text-sm hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {isLoading ? '生成中...' : '生成选题池'}
                </button>
                <p className="text-[10px] text-gray-400">
                  需要先完成访谈并生成定位报告
                </p>
              </div>
            </div>
          );
        }

        // 生成中：显示加载状态
        if (isLoading) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
              <Loader2 size={40} className="animate-spin text-black mb-4" />
              <p className="text-sm text-gray-500">AI 正在为您生成选题规划池...</p>
            </div>
          );
        }

        // 有数据：使用真实数据
        const displayStages = hasTopicPool ? state.topicPool : getDemoTopicPool();
        const currentStageData = displayStages.find((s: any) => s.stage === topicStage) || displayStages[0];

        return (
          <div className="flex-1 flex flex-col p-4 md:p-8">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setCurrentStep('positioning')} className="text-gray-400 hover:text-black flex items-center gap-1 md:gap-2 text-xs md:text-sm transition-colors">
                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> 返回
              </button>
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border border-gray-200 shadow-sm">
                  <img src={BOT_AVATAR} alt="Consultant" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <h2 className="text-base md:text-xl font-bold">选题顾问：内容规划</h2>
              </div>
              <div className="w-10 md:w-20" />
            </div>

            {/* 阶段标签页 + 阶段简介整合 - 文件夹样式 */}
            <div className="mb-6">
              {/* 阶段标签页 - 像文件夹标签 */}
              <div className="flex items-end gap-1">
                {displayStages.map((stage: any) => (
                  <button
                    key={stage.stage}
                    onClick={() => setTopicStage(stage.stage)}
                    className={cn(
                      "px-4 py-2.5 rounded-t-lg text-xs font-bold whitespace-nowrap transition-all border-b-2",
                      topicStage === stage.stage
                        ? "bg-white text-black border-black -mb-px z-10 shadow-sm"
                        : "bg-gray-100 text-gray-400 border-transparent hover:text-black hover:bg-gray-50"
                    )}
                  >
                    阶段{['一', '二', '三', '四'][stage.stage - 1]}
                  </button>
                ))}
              </div>

              {/* 阶段简介 - 像翻页内容 */}
              <div className="bg-white border border-gray-200 rounded-b-lg rounded-tr-lg p-5 space-y-3 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-gray-900 mb-2">
                      阶段{['一', '二', '三', '四'][currentStageData.stage - 1]}｜{currentStageData.name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">{currentStageData.goal}</p>
                    <div className="space-y-1.5 text-xs text-gray-600">
                      <p><span className="font-bold">核心任务：</span>{currentStageData.coreTask}</p>
                      <p><span className="font-bold">推荐平台：</span>{currentStageData.platform}</p>
                      <p><span className="font-bold">推荐风格：</span>{currentStageData.style}</p>
                      <p><span className="font-bold">方向判断：</span>{currentStageData.direction}</p>
                      <p><span className="font-bold">不建议：</span>{currentStageData.notRecommended}</p>
                      <p><span className="font-bold">下一步：</span>{currentStageData.nextAction}</p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-400 ml-4">
                    <p>{currentStageData.topics.length} 条选题</p>
                    <p>{currentStageData.topics.filter(t => t.priority === 'P0').length} 条 P0</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 选题列表 - 压缩高度 */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {currentStageData.topics.map((topic) => (
                <div
                  key={topic.id}
                  onClick={() => {
                    setSelectedTopic(topic);
                    setState(prev => ({ ...prev, selectedTopic: topic, copywritingTopic: topic.title }));
                    setCurrentStep('copywriting');
                  }}
                  className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-mono text-gray-400">{topic.id}</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[11px] font-bold",
                          topic.priority === 'P0' ? "bg-red-100 text-red-600" :
                          topic.priority === 'P1' ? "bg-amber-100 text-amber-600" :
                          "bg-gray-100 text-gray-600"
                        )}>
                          {topic.priority}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[11px] font-bold",
                          topic.status === 'approved' ? "bg-green-100 text-green-600" :
                          topic.status === 'planned' ? "bg-blue-100 text-blue-600" :
                          "bg-gray-100 text-gray-600"
                        )}>
                          {topic.status === 'approved' ? '已批准' : topic.status === 'planned' ? '计划中' : '已使用'}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-gray-900 mb-2">{topic.title}</h4>
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <span className="font-bold">爆款：</span>
                          <span>{topic.hookType}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="font-bold">钩子：</span>
                          <span className="line-clamp-1">{topic.hook3s}</span>
                        </span>
                        <span className="text-gray-400">|</span>
                        <span>{topic.platform}</span>
                      </div>
                    </div>
                    <button className="px-3 py-1.5 bg-black text-white rounded-lg text-[11px] font-bold hover:bg-gray-800 transition-all whitespace-nowrap">
                      生成文案
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* 操作按钮 */}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={generateTopicPool}
                disabled={isGeneratingTopics}
                className="flex-1 py-2.5 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={14} className="inline mr-1" />
                {isGeneratingTopics ? '生成中...' : state.topicGenerationStatus === 'demo_fallback' ? '重新生成' : '生成选题池'}
              </button>
              <button
                onClick={() => {
                  if (state.topicPool.length > 0) {
                    setCurrentStep('copywriting');
                  } else {
                    alert('请先生成选题池');
                  }
                }}
                className="px-4 py-2.5 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-all text-xs"
              >
                进入文案
              </button>
            </div>
          </div>
        );
      }
      case 'copywriting':
        return (
          <div className="flex-1 flex flex-col p-4 md:p-8">
            <div className="flex items-center justify-between mb-6 md:mb-8">
              <button onClick={() => setCurrentStep('topic')} className="text-gray-400 hover:text-black flex items-center gap-1 md:gap-2 text-xs md:text-sm transition-colors">
                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> 返回
              </button>
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border border-gray-200 shadow-sm">
                  <img src={BOT_AVATAR} alt="Consultant" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <h2 className="text-base md:text-xl font-bold">文案顾问：内容创作</h2>
              </div>
              <div className="w-10 md:w-20" />
            </div>

            {!state.copywritingOutput.content ? (
              state.isCopywritingChatMode ? (
                <div className="flex-1 flex flex-col bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden mb-4 min-h-[500px]">
                  <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">思路整理中...</span>
                    </div>
                    <button 
                      onClick={() => generateCopywriting()}
                      disabled={isGeneratingCopywriting}
                      className="px-4 py-2 bg-black text-white rounded-full text-xs font-bold hover:bg-gray-800 transition-all flex items-center gap-2"
                    >
                      {isGeneratingCopywriting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      生成最终文案
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                    {state.copywritingMessages.map((msg, idx) => {
                      const isLastModel = msg.role === 'model' && isCopywritingThinking && idx === state.copywritingMessages.length - 1;
                      return (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn("flex gap-3 md:gap-4", msg.role === 'user' ? "flex-row-reverse" : "")}
                        >
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden flex-shrink-0 border border-gray-100 shadow-sm">
                            <img src={msg.role === 'user' ? USER_AVATAR : BOT_AVATAR} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <div className={cn(
                            "max-w-[85%] md:max-w-[70%] p-3 md:p-4 rounded-2xl text-sm md:text-base shadow-sm",
                            msg.role === 'user' ? "bg-black text-white rounded-tr-none" : "bg-gray-50 text-gray-800 rounded-tl-none border border-gray-100"
                          )}>
                            <div className="markdown-body prose prose-sm max-w-none prose-inherit">
                              <ReactMarkdown>{msg.text}</ReactMarkdown>
                              {isLastModel && (
                                <span className="inline-flex items-center gap-[3px] ml-1 h-5">
                                  <span className="inline-block w-[3px] h-[6px] bg-gray-400 rounded-sm" style={{ animation: 'typing-bounce 1s ease-in-out infinite', animationDelay: '0s' }} />
                                  <span className="inline-block w-[3px] h-[10px] bg-gray-400 rounded-sm" style={{ animation: 'typing-bounce 1s ease-in-out infinite', animationDelay: '0.2s' }} />
                                  <span className="inline-block w-[3px] h-[6px] bg-gray-400 rounded-sm" style={{ animation: 'typing-bounce 1s ease-in-out infinite', animationDelay: '0.4s' }} />
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                    <div ref={copywritingEndRef} />
                  </div>

                  <div className="p-4 border-t border-gray-50 bg-white">
                    <div className="relative group max-w-4xl mx-auto w-full">
                      <input 
                        type="text"
                        value={copywritingTopic}
                        onChange={(e) => setCopywritingTopic(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCopywritingMessage(copywritingTopic)}
                        placeholder="继续完善您的想法..."
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-6 pr-16 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm shadow-sm"
                      />
                      <button 
                        onClick={() => handleCopywritingMessage(copywritingTopic)}
                        disabled={isCopywritingThinking || !copywritingTopic.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-black text-white rounded-xl hover:bg-gray-800 disabled:bg-gray-200 transition-all"
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full space-y-8 text-center"
                >
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-white rounded-full overflow-hidden flex items-center justify-center shadow-inner border border-gray-100">
                    <img src={BOT_AVATAR} alt="Consultant" className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
                  </div>
                  
                  <div className="space-y-3">
                    <h3 className="text-2xl md:text-3xl font-bold">准备好开始创作了吗？</h3>
                    <p className="text-gray-400 text-sm md:text-base px-4">
                      请从 Agent 2 规划的选题库中挑选一个主题，或者输入你今天想分享的任何想法。
                    </p>
                  </div>

                  <div className="w-full relative group max-w-lg">
                    <input 
                      type="text"
                      value={copywritingTopic}
                      onChange={(e) => setCopywritingTopic(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCopywritingMessage(copywritingTopic)}
                      placeholder="输入选题或主题..."
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-5 px-6 pr-16 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm shadow-sm"
                    />
                    <button 
                      onClick={() => handleCopywritingMessage(copywritingTopic)}
                      disabled={isCopywritingThinking || !copywritingTopic.trim()}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-black text-white rounded-xl hover:bg-gray-800 disabled:bg-gray-200 transition-all shadow-lg"
                    >
                      <Sparkles size={20} />
                    </button>
                  </div>

                  <div className="w-full space-y-4">
                    {state.positioningReport && state.positioningReport.match(/选题[：:](.*)/g) && (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">推荐选题 (来自定位方案)</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {state.positioningReport.match(/选题[：:](.*)/g)?.slice(0, 5).map((t, i) => {
                            const title = t.replace(/选题[：:]\s*/, '').trim();
                            return (
                              <button 
                                key={i}
                                onClick={() => {
                                  setCopywritingTopic(title);
                                  generateCopywriting(title);
                                }}
                                className="px-4 py-2 bg-white border border-gray-100 rounded-full text-xs text-gray-500 hover:border-black hover:text-black transition-all shadow-sm"
                              >
                                {title}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">备选标题</h4>
                    <div className="flex flex-col gap-2">
                      {state.copywritingOutput.titles.map((title, idx) => (
                        <button 
                          key={idx}
                          onClick={() => setState(prev => ({ 
                            ...prev, 
                            copywritingOutput: { ...prev.copywritingOutput, selectedTitleIndex: idx } 
                          }))}
                          className={cn(
                            "p-4 rounded-xl text-left text-sm transition-all border",
                            state.copywritingOutput.selectedTitleIndex === idx 
                              ? "bg-black text-white border-black shadow-lg shadow-black/10" 
                              : "bg-gray-50 text-gray-600 border-gray-100 hover:border-gray-200"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span>{title}</span>
                            {state.copywritingOutput.selectedTitleIndex === idx && <CheckCircle2 size={16} />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-2xl md:rounded-3xl p-4 md:p-8 border border-gray-100 overflow-y-auto max-h-[400px] md:max-h-[600px]">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">口播脚本</span>
                      <button 
                        onClick={() => handleCopy(state.copywritingOutput.content, 'copywriting')}
                        className="text-xs text-gray-400 hover:text-black transition-colors flex items-center gap-1"
                      >
                        {copyStatus === 'copywriting' ? <CheckCircle2 size={14} className="text-green-500" /> : <Copy size={14} />}
                        {copyStatus === 'copywriting' ? '已复制' : '复制'}
                      </button>
                    </div>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{state.copywritingOutput.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
                <div className="space-y-4 md:space-y-6">
                  <div className="bg-black text-white p-4 md:p-6 rounded-xl md:rounded-2xl shadow-xl">
                    <h4 className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-50 mb-3 md:mb-4">交付清单</h4>
                    <ul className="space-y-2 md:space-y-3 text-[10px] md:text-sm">
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-green-400" /> 个人IP分析报告</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-green-400" /> 企业行业分析报告</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-green-400" /> 全案定位规划方案</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-green-400" /> 3版标题与口播文案</li>
                    </ul>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => {
                        setState(prev => ({
                          ...prev,
                          copywritingOutput: { titles: [], selectedTitleIndex: null, content: '' },
                          isCopywritingChatMode: false,
                          copywritingMessages: []
                        }));
                      }}
                      className="w-full bg-gray-50 text-gray-600 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-all text-sm"
                    >
                      <ArrowLeft size={16} /> 重新选择选题
                    </button>
                    <button 
                      onClick={addToHistory}
                      className="w-full bg-black text-white py-3 md:py-4 rounded-xl md:rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-xl shadow-black/10 text-sm"
                    >
                      <CheckCircle2 size={18} /> 保存到历史记录
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case 'history':
        return (
          <div className="flex-1 flex flex-col p-4 md:p-8 h-full overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold">历史记录</h2>
                <p className="text-xs text-gray-400 mt-1">
                  共 {state.history.length} 条记录，最多保存 99 条
                </p>
              </div>
              <button
                onClick={() => setCurrentStep('interview')}
                className="text-xs text-gray-400 hover:text-black flex items-center gap-1"
              >
                <ArrowLeft size={14} /> 返回首页
              </button>
            </div>
            {state.history.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-4">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center">
                  <Database size={40} className="opacity-20" />
                </div>
                <p className="text-sm">暂无历史记录</p>
                <p className="text-xs text-gray-300">清空当前会话时会自动保存到历史</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {state.history.map((item, index) => {
                  const hasInterview = item.messages.length > 1 || item.interviewReport;
                  const hasInfo = item.infoReport;
                  const hasPositioning = item.positioningReport;
                  const hasCopywriting = item.copywritingOutput.content;
                  return (
                    <div key={item.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group flex flex-col">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{item.date}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              if (!window.confirm(`确定要删除这条历史记录吗？\n\n${item.title}\n\n此操作不可恢复。`)) return;
                              setState(prev => ({
                                ...prev,
                                history: prev.history.filter((_, i) => i !== index),
                              }));
                            }}
                            className="p-1.5 text-gray-300 hover:text-red-500 transition-all rounded-full hover:bg-red-50"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <h3 className="font-bold mb-2 truncate text-sm" title={item.title}>
                        {item.title || '未命名记录'}
                      </h3>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {hasInterview && <span className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[10px] font-bold rounded-full">访谈</span>}
                        {hasInfo && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-full">信息</span>}
                        {hasPositioning && <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-full">定位</span>}
                        {hasCopywriting && <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-bold rounded-full">文案</span>}
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-3 mb-4 flex-1">
                        {item.copywritingOutput.content || item.positioningReport || item.infoReport || item.interviewReport || '（暂无内容摘要）'}
                      </p>
                      <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                        <div className="flex items-center gap-2">
                          {item.copywritingOutput.content && (
                            <button
                              onClick={() => downloadReport(item.copywritingOutput.content, `文案_${item.id}.md`)}
                              className="p-2 bg-gray-50 rounded-lg text-gray-400 hover:text-black transition-all"
                              title="下载文案"
                            >
                              <Download size={14} />
                            </button>
                          )}
                          {item.copywritingOutput.content && (
                            <button
                              onClick={() => handleCopy(item.copywritingOutput.content, item.id)}
                              className="p-2 bg-gray-50 rounded-lg text-gray-400 hover:text-black transition-all"
                              title="复制文案"
                            >
                              {copyStatus === item.id ? <CheckCircle2 size={14} className="text-green-500" /> : <Copy size={14} />}
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            // 恢复完整会话状态（兼容旧格式数据）
                            setMessages(item.messages?.length > 0 ? item.messages : [{ role: 'model', text: '您好，我是您的访谈顾问。很高兴能协助您梳理个人IP。为了更好地挖掘您的故事，我们先从全方位的个人信息开始。首先，请问您的姓名是什么？' }]);
                            setCompanyInfo(item.companyInfo || '');
                            setState(prev => ({
                              ...prev,
                              interviewPhase: item.interviewPhase || 'basic',
                              interviewReport: item.interviewReport || '',
                              infoReport: item.infoReport || '',
                              positioningOptions: item.positioningOptions || [],
                              selectedPositioningIndex: item.selectedPositioningIndex ?? null,
                              positioningReport: item.positioningReport || '',
                              copywritingMessages: item.copywritingMessages || [],
                              isCopywritingChatMode: item.isCopywritingChatMode || false,
                              copywritingOutput: item.copywritingOutput ? { ...item.copywritingOutput } : { titles: [], selectedTitleIndex: null, content: '' },
                              uploadedMaterials: item.uploadedMaterials ? [...item.uploadedMaterials] : [],
                            }));
                            setCurrentStep('interview');
                            alert(`已恢复历史记录：${item.title || '未命名记录'}`);
                          }}
                          className="text-[10px] font-bold bg-black text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-all"
                        >
                          恢复会话
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const canEndInterview = () => {
    return messages.some(m =>
      m.role === 'model' && m.text.includes('<!-- INTERVIEW_ENDED_BY_AI -->')
    );
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping) return;

    const limits = checkUserLimits();
    if (!limits.ok) {
      setMessages(prev => [...prev, { role: 'model', text: `⚠️ ${limits.message}` }]);
      return;
    }

    const userText = input;
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setInput('');
    setIsTyping(true);

    // 先插入一条空的 model 消息，流式内容会追加到这里
    setMessages(prev => [...prev, { role: 'model', text: '' }]);

    try {
      const knowledgeContext = state.knowledgeBase
        .filter(k => k.type === 'interview')
        .map(k => `【参考语料 - ${k.title}】：\n${k.content}`)
        .join('\n\n');

      const materialsContext = buildMaterialsContext(state.uploadedMaterials, 12000);
      const interviewRefContent = await getStepRefsContent('interview');

      const systemPrompt = INTERVIEW_SYSTEM_PROMPT
        + (knowledgeContext ? `

【重要：请严格遵循以下管理员提供的专业访谈方法论进行提问】：
${knowledgeContext}` : "")
        + (interviewRefContent ? `

【参考文件 · 客户访谈参考手册】：
${interviewRefContent}` : '')
        + materialsContext;

      await deepseek.chatStream({
        model: deepseek.MODELS.fast,
        knowledge_id: ZHIPU_KNOWLEDGE_ID,
        system: systemPrompt,
        messages: [
          ...messages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.text,
          })),
          { role: 'user', content: userText },
        ],
        onChunk: (chunk) => {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'model') {
              return [...prev.slice(0, -1), { ...last, text: last.text + chunk }];
            }
            return prev;
          });
        },
        onDone: (_fullText, usage) => {
          if (usage) reportTokenUsage(usage);
          // 检测 AI 是否说了结束语，若包含则给最后一条 model 消息打标记
          if (_fullText.includes('访谈已圆满结束')) {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'model' && !last.text.includes('<!-- INTERVIEW_ENDED_BY_AI -->')) {
                return [...prev.slice(0, -1), { ...last, text: last.text + '\n\n<!-- INTERVIEW_ENDED_BY_AI -->' }];
              }
              return prev;
            });
          }
          setIsTyping(false);
        },
        onError: (err) => {
          console.error('Interview stream error:', err);
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'model') {
              return [...prev.slice(0, -1), { ...last, text: `⚠️ ${err.message}，请稍后重试。` }];
            }
            return [...prev, { role: 'model', text: `⚠️ ${err.message}，请稍后重试。` }];
          });
          setIsTyping(false);
        },
      });
    } catch (error: any) {
      // chatStream 内部已经通过 onError 处理了错误，这里是兜底
      console.error('Interview error:', error);
      const errMsg = error?.message || 'AI 服务暂时不可用';
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'model') {
          return [...prev.slice(0, -1), { ...last, text: `⚠️ ${errMsg}，请稍后重试。` }];
        }
        return [...prev, { role: 'model', text: `⚠️ ${errMsg}，请稍后重试。` }];
      });
      setIsTyping(false);
    }
  };

  // --- Information Agent State ---
  const [companyInfo, setCompanyInfo] = useState('');
  const [isGeneratingInfo, setIsGeneratingInfo] = useState(false);

  const generateInfoReport = async () => {
    if (!companyInfo.trim()) return;
    setIsGeneratingInfo(true);
    try {
      const knowledgeContext = state.knowledgeBase
        .filter(k => k.category === 'ip')
        .map(k => `【参考语料 - ${k.title}】：\n${k.content}`)
        .join('\n\n');

      const text = await deepseek.generateText({
        model: deepseek.MODELS.fast,
        system: INFO_SYSTEM_PROMPT + (knowledgeContext ? `

请参考以上专业语料提升分析深度。` : "") + "\n\n请务必学习并结合【访谈报告】和【上传资料内容】中的细节，生成符合创始人定位的分析。",
        prompt: `请根据以下信息生成分析报告：
【访谈报告】：
${state.interviewReport || "（暂无）"}

【上传资料内容】：
${buildMaterialsContext(state.uploadedMaterials, 8000) || "（暂无）"}

【公司基本信息】：
${companyInfo}

${knowledgeContext ? `
参考语料：
${knowledgeContext}` : ""}`,
        onUsage: reportTokenUsage,
      });
      setState(prev => ({ ...prev, infoReport: text || '' }));
      if (text) saveResultToStorage('info_report', text, state.user?.uid);
    } catch (error) {
      console.error("Info generation error:", error);
    } finally {
      setIsGeneratingInfo(false);
    }
  };

  // --- Positioning Agent State ---
  const [isGeneratingPositioning, setIsGeneratingPositioning] = useState(false);
  const [positioningFeedback, setPositioningFeedback] = useState('');
  const [isModifyingPositioning, setIsModifyingPositioning] = useState(false);

  const generatePositioningReport = async () => {
    setIsGeneratingPositioning(true);
    try {
      const knowledgeContext = state.knowledgeBase
        .filter(k => k.category === 'ip')
        .map(k => `【参考语料 - ${k.title}】：\n${k.content}`)
        .join('\n\n');

      // 防止 prompt 过长超出上下文限制，对报告做截断保留
      const MAX_REPORT_CHARS = 8000;
      const interviewSummary = state.interviewReport
        ? state.interviewReport.length > MAX_REPORT_CHARS
          ? state.interviewReport.slice(0, MAX_REPORT_CHARS) + '\n\n...（内容已截断，后续内容省略）'
          : state.interviewReport
        : "";
      const infoSummary = state.infoReport
        ? state.infoReport.length > MAX_REPORT_CHARS
          ? state.infoReport.slice(0, MAX_REPORT_CHARS) + '\n\n...（内容已截断，后续内容省略）'
          : state.infoReport
        : "";

      const positioningRefContent = await getStepRefsContent('positioning');

      const systemPrompt = POSITIONING_SYSTEM_PROMPT
        + (knowledgeContext ? `

请参考以上专业语料提升定位方案的专业度。` : "")
        + (positioningRefContent ? `

【参考文件 · 客户定位访谈参考手册 + 写作技巧提示词】：
${positioningRefContent}` : '')
        + "\n\n请务必学习并结合【访谈报告】、【企业与行业分析报告】和【上传资料内容】中的所有细节，确保定位方案与创始人的精神内核及业务逻辑高度契合。请务必使用 Markdown 格式，并包含详细的内容规划框架（每个阶段不少于20个选题）。";

      const text = await deepseek.generateText({
        model: deepseek.MODELS.chat,
        system: systemPrompt,
        prompt: `基于以下信息生成3个不同维度的定位方案。

【输出格式要求】：
请严格按以下格式输出，不要合并为一个方案：
### 定位方案 1：[方案名称]
[完整方案内容，包含定位分析、内容方向、平台建议等]

### 定位方案 2：[方案名称]
[完整方案内容]

### 定位方案 3：[方案名称]
[完整方案内容]

三个方案必须在人物主线角度、首批受众切入、表达风格、栏目侧重、平台侧重上形成真实差异。

【特别说明】：如果以下报告内容为空或信息不足，请根据您的专业知识提供通用的、具有启发性的 ToB 创始人 IP 定位模板，并引导用户在后续对话中补充具体信息。

【个人IP分析报告】：
${interviewSummary || "（暂无，请基于通用 ToB 创始人画像提供建议）"}

【企业与行业分析报告】：
${infoSummary || "（暂无，请基于通用 ToB 行业逻辑提供建议）"}

【上传资料内容】：
${buildMaterialsContext(state.uploadedMaterials, 8000) || "（暂无）"}

${knowledgeContext ? `
参考语料：
${knowledgeContext}` : ""}`,
        max_tokens: 16000, // 定位报告输出量大（3个方案），给更多空间
        onUsage: reportTokenUsage,
      });

      if (!text || !text.trim()) {
        alert('定位方案生成返回空内容，请稍后重试。');
        return;
      }

      const options = (text || '').split(/(?=###\s+定位方案\s*\d)/).filter(o => o.trim().length > 50);

      setState(prev => ({
        ...prev,
        positioningOptions: options.length > 0 ? options : [text],
        selectedPositioningIndex: 0,
        positioningReport: options[0] || text
      }));
      const report = options[0] || text;
      if (report) saveResultToStorage('positioning_report', report, state.user?.uid);
      // 同时保存 options 数组，防止切换页面后丢失
      const optionsToSave = options.length > 0 ? options : [text];
      saveResultToStorage('positioning_options', optionsToSave, state.user?.uid);
    } catch (error: any) {
      console.error("Positioning generation error:", error);
      alert('定位方案生成失败：' + (error?.message || 'AI 服务暂时不可用，请稍后重试'));
    } finally {
      setIsGeneratingPositioning(false);
    }
  };

  const modifyPositioning = async () => {
    if (!positioningFeedback.trim() || isModifyingPositioning) return;
    setIsModifyingPositioning(true);
    try {
      const newReport = await deepseek.generateText({
        model: deepseek.MODELS.fast,
        system: "你是一位顶级的IP定位专家，请根据用户的反馈对定位方案进行精准调整和优化。",
        prompt: `当前定位方案：
${state.positioningReport}

用户修改建议：
${positioningFeedback}

请根据建议优化该方案，保持专业度。`,
        onUsage: reportTokenUsage,
      });
      setState(prev => {
        const idx = prev.selectedPositioningIndex ?? 0;
        const updatedOptions = [...prev.positioningOptions];
        if (updatedOptions.length > 0 && idx < updatedOptions.length) {
          updatedOptions[idx] = newReport;
        }
        return {
          ...prev,
          positioningReport: newReport,
          positioningOptions: updatedOptions.length > 0 ? updatedOptions : [newReport],
        };
      });
      setPositioningFeedback('');
      // 保存修改后的报告
      saveResultToStorage('positioning_report', newReport, state.user?.uid);
    } catch (error) {
      console.error("Modify positioning error:", error);
    } finally {
      setIsModifyingPositioning(false);
    }
  };

  // --- Copywriting Agent State ---
  const [isGeneratingCopywriting, setIsGeneratingCopywriting] = useState(false);
  const [copywritingTopic, setCopywritingTopic] = useState('');
  const [isCopywritingThinking, setIsCopywritingThinking] = useState(false);
  const copywritingEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    copywritingEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.copywritingMessages]);

  const analyzeCopywritingInteraction = async (userText: string, modelText: string) => {
    try {
      const analysisText = await deepseek.generateText({
        model: deepseek.MODELS.fast,
        system: "你是一个专业的对话分析助手。请严格按照用户要求的 JSON 格式输出，不要输出任何额外的解释文字。",
        prompt: `请分析以下对话，提取有价值的信息：
用户说：${userText}
AI说：${modelText}

任务：
1. 提取用户提到的行业见解、个人观点、创业故事等，作为访谈报告的补充素材。
2. 识别用户的情绪，判断是否对产品使用有不满或建议。

输出格式：JSON
{
  "supplementaryMaterial": "提取的素材内容，如果没有则为空字符串",
  "feedback": "识别到的产品反馈，如果没有则为空字符串",
  "sentiment": "情绪描述"
}`,
      });

      const analysis = JSON.parse(analysisText || '{}');
      
      if (analysis.supplementaryMaterial) {
        setState(prev => ({
          ...prev,
          interviewReport: prev.interviewReport + "\n\n### 补充素材 (来自文案创作对话)\n" + analysis.supplementaryMaterial
        }));
      }

      if (analysis.feedback && state.user) {
        try {
          await api.submitFeedback({
            type: 'improvement',
            content: analysis.feedback,
          });
        } catch (err) {
          console.error('Submit feedback error:', err);
        }
      }
    } catch (e) {
      console.error("Analysis error:", e);
    }
  };

  const handleCopywritingMessage = async (userInput: string) => {
    const text = userInput || copywritingTopic;
    if (!text.trim() || isCopywritingThinking) return;

    const userMsg: Message = { role: 'user', text: text };
    setState(prev => ({
      ...prev,
      isCopywritingChatMode: true,
      copywritingMessages: [...prev.copywritingMessages, userMsg]
    }));
    setCopywritingTopic('');
    setIsCopywritingThinking(true);

    try {
      const knowledgeContext = state.knowledgeBase
        .filter(k => k.category === 'copywriting')
        .map(k => `【参考语料 - ${k.title}】：\n${k.content}`)
        .join('\n\n');

      const copywritingRefContent = await getStepRefsContent('copywriting');

      const chatMsgs: Array<{ role: 'user' | 'assistant'; content: string }> = [
        { role: 'user', content: `【背景上下文】：
个人背景：${state.interviewReport || "（暂无）"}
企业背景：${state.infoReport || "（暂无）"}
定位方案：${state.positioningReport || "（暂无）"}
上传资料：${buildMaterialsContext(state.uploadedMaterials, 8000) || "（暂无）"}

${copywritingRefContent ? `【参考文件 · 客户采访与选题提示词】：
${copywritingRefContent}` : ''}

【特别说明】：如果上述背景信息缺失，请通过对话引导用户提供相关的个人故事、业务亮点或创作意图。` },
        ...state.copywritingMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.text })),
        { role: 'user', content: text }
      ];

      const modelText = await deepseek.chat({
        model: deepseek.MODELS.fast,
        knowledge_id: ZHIPU_KNOWLEDGE_ID,
        system: COPYWRITING_SYSTEM_PROMPT + "\n\n当前处于【思路整理阶段】。请通过对话形式帮用户整理思路，挖掘亮点。" + (knowledgeContext ? `

请参考以下专业语料提升文案水准：
${knowledgeContext}` : "") + "\n\n请务必学习并应用【背景上下文】中的所有资料，确保文案符合定位。如果思路已经非常清晰，请告知用户可以开始生成文案了。请保持专业且富有启发性。",
        messages: chatMsgs,
        onUsage: reportTokenUsage,
      });
      setState(prev => ({
        ...prev,
        copywritingMessages: [...prev.copywritingMessages, userMsg, { role: 'model', text: modelText }]
      }));

      // 异步分析
      analyzeCopywritingInteraction(text, modelText);

    } catch (error) {
      console.error("Copywriting chat error:", error);
    } finally {
      setIsCopywritingThinking(false);
    }
  };

  const generateCopywriting = async (topic?: string) => {
    const finalTopic = topic || copywritingTopic;
    // 如果是用户输入的选题且不在对话模式，先进入对话模式
    if (!topic && finalTopic && !state.isCopywritingChatMode) {
      handleCopywritingMessage(finalTopic);
      return;
    }

    setIsGeneratingCopywriting(true);
    try {
      const chatContext = state.copywritingMessages.map(m => `${m.role === 'user' ? '用户' : '顾问'}: ${m.text}`).join('\n');
      
      const knowledgeContext = state.knowledgeBase
        .filter(k => k.category === 'copywriting')
        .map(k => `【参考语料 - ${k.title}】：\n${k.content}`)
        .join('\n\n');

      const copywritingRefContent = await getStepRefsContent('copywriting');

      const systemPrompt = COPYWRITING_GENERATE_SYSTEM_PROMPT
        + (copywritingRefContent ? `

【参考文件 · 客户采访与选题提示词 + 文案审核提示词】：
${copywritingRefContent}` : '')
        + "\n\n请结合【个人背景】、【企业背景】、【定位方案】、【上传资料内容】和【对话上下文】中的所有细节，创作符合定位且具有高水准的文案。";

      const cwText = await deepseek.generateText({
        model: deepseek.MODELS.fast,
        system: systemPrompt,
        prompt: `基于以下信息创作3个标题和1篇口播文案：

${knowledgeContext ? `【参考语料】：
${knowledgeContext}

` : ""}
【选题/主题】：
${finalTopic || '基于对话整理的思路'}

【对话上下文】：
${chatContext || "（暂无对话）"}

【定位方案】：
${state.positioningReport || "（暂无，请基于通用爆款逻辑创作）"}

【个人背景】：
${state.interviewReport || "（暂无）"}

【企业背景】：
${state.infoReport || "（暂无）"}

【上传资料内容】：
${buildMaterialsContext(state.uploadedMaterials, 8000) || "（暂无）"}`,
        onUsage: reportTokenUsage,
      });

      const data = JSON.parse(cwText || '{}');
      setState(prev => ({ 
        ...prev, 
        copywritingOutput: {
          titles: data.titles || [],
          selectedTitleIndex: 0,
          content: data.content || ''
        }
      }));
    } catch (error) {
      console.error("Copywriting generation error:", error);
    } finally {
      setIsGeneratingCopywriting(false);
    }
  };

  // ============================================================
  // 选题页面：AI 生成 + 解析
  // ============================================================

  /**
   * 从 AI 返回的文本中提取并解析选题 JSON
   * 处理多种返回格式：纯 JSON、Markdown 包裹、前后有废话等
   */
  const parseTopicPool = (aiResponse: string): { stages: any[] } | null => {
    try {
      // 策略1: 直接尝试解析（纯 JSON 情况）
      return JSON.parse(aiResponse);
    } catch {
      // 继续尝试其他策略
    }

    try {
      // 策略2: 提取 Markdown 代码块中的 JSON
      const codeBlockMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        return JSON.parse(codeBlockMatch[1]);
      }
    } catch {
      // 继续尝试
    }

    try {
      // 策略3: 正则提取第一个 { 到最后一个 } 之间的内容
      const firstBrace = aiResponse.indexOf('{');
      const lastBrace = aiResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonStr = aiResponse.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonStr);
      }
    } catch {
      // 继续尝试
    }

    // 策略4: 所有策略都失败
    console.error('选题 JSON 解析失败，AI 返回内容:', aiResponse);
    return null;
  };

  /**
   * Demo 选题数据（降级用）
   */
  const getDemoTopicPool = (): any[] => {
    return [
      {
        stage: 1,
        name: '0-30天：建立可信主线',
        goal: '让用户先记住"万智是谁、在做什么、为什么值得持续关注"。主打真实过程、人设反差、核心观点和两个项目的从0到1。',
        coreTask: '破圈认知 + 人设建立 + 项目主线解释',
        platform: '抖音/视频号为主，小红书同步图文笔记',
        style: '真实过程分享、轻反差、少卖货、多建立持续关注理由',
        direction: '本阶段所有内容都要回到"真实项目推进 + AI商业落地 + ToB信任建立"。',
        notRecommended: '不做泛AI工具测评、不做单纯鸡汤、不把兰亭茶境写成单一茶馆探店。',
        nextAction: '优先选择本阶段P0选题进入脚本生成和集中拍摄。',
        topics: [
          {
            id: 'WZ-S1-001',
            title: '我不是在做AI工具，我是在用两个真实项目验证AI商业落地',
            hookType: '反差判断型',
            hook3s: '我不是在做AI工具，我是在用两个真实项目验证AI商业落地',
            platform: '抖音 + 视频号 + 小红书',
            priority: 'P0',
            status: 'approved'
          },
          {
            id: 'WZ-S1-002',
            title: '一个00后为什么同时做AI创始人IP系统和AI茶空间？',
            hookType: '反差判断型',
            hook3s: '一个00后为什么同时做AI创始人IP系统和AI茶空间？',
            platform: '抖音 + 小红书 + 视频号',
            priority: 'P0',
            status: 'approved'
          },
          {
            id: 'WZ-S1-003',
            title: 'AI茶馆这个想法，一开始其实只是普通茶馆',
            hookType: '观点金句型',
            hook3s: 'AI茶馆这个想法，一开始其实只是普通茶馆',
            platform: '抖音 + 小红书 + 视频号',
            priority: 'P0',
            status: 'planned'
          }
        ]
      },
      {
        stage: 2,
        name: '31-60天：建立专业信任',
        goal: '从过程记录进入方法论沉淀，证明你懂业务、懂内容、懂AI落地。重点区分高传播切口与高转化切口。',
        coreTask: '方法论输出 + 客户教育 + 专业信任',
        platform: '视频号/公众号承接深度，小红书/抖音做切口传播',
        style: '判断清晰、案例带路、客户教育，不装专家',
        direction: '本阶段所有内容都要回到"真实项目推进 + AI商业落地 + ToB信任建立"。',
        notRecommended: '不做泛AI工具测评、不做单纯鸡汤、不把兰亭茶境写成单一茶馆探店。',
        nextAction: '优先选择本阶段P0选题进入脚本生成和集中拍摄。',
        topics: [
          {
            id: 'WZ-S2-001',
            title: '我做创始人IP系统后发现，老板最缺的不是文案',
            hookType: '反差判断型',
            hook3s: '我做创始人IP系统后发现，老板最缺的不是文案',
            platform: '视频号 + 公众号 + 抖音',
            priority: 'P0',
            status: 'approved'
          },
          {
            id: 'WZ-S2-002',
            title: '两个团队解散后，我才知道什么人适合一起创业',
            hookType: '踩坑复盘型',
            hook3s: '两个团队解散后，我才知道什么人适合一起创业',
            platform: '抖音 + 视频号',
            priority: 'P0',
            status: 'planned'
          }
        ]
      },
      {
        stage: 3,
        name: '61-90天：公开验证与轻转化',
        goal: '用内测反馈、用户体验、会员样本、项目进展和真实案例证明两个项目有效，开始引导咨询、会员、合作。',
        coreTask: '案例验证 + 反馈证明 + 会员转化',
        platform: '视频号/抖音发布证据型短视频，公众号沉淀复盘，小红书做体验反馈',
        style: '真实反馈、前后变化、轻转化、避免夸大承诺',
        direction: '本阶段所有内容都要回到"真实项目推进 + AI商业落地 + ToB信任建立"。',
        notRecommended: '不做泛AI工具测评、不做单纯鸡汤、不把兰亭茶境写成单一茶馆探店。',
        nextAction: '优先选择本阶段P0选题进入脚本生成和集中拍摄。',
        topics: [
          {
            id: 'WZ-S3-001',
            title: '兰亭茶境内测30天，我们收到了127条真实反馈',
            hookType: '案例结果型',
            hook3s: '兰亭茶境内测30天，我们收到了127条真实反馈',
            platform: '视频号 + 抖音',
            priority: 'P0',
            status: 'approved'
          }
        ]
      },
      {
        stage: 4,
        name: '90天后：沉淀案例与扩展B端合作',
        goal: '沉淀行业案例、对外空间方案、政府/园区合作、渠道伙伴和项目共创能力，形成更高客单的ToB合作入口。',
        coreTask: '行业案例 + B端合作 + 项目共创 + 渠道招募',
        platform: '视频号/公众号为主，配合线下活动、私域资料包、项目路演内容',
        style: '案例沉淀、合作说明、资源筛选、稳健转化',
        direction: '本阶段所有内容都要回到"真实项目推进 + AI商业落地 + ToB信任建立"。',
        notRecommended: '不做泛AI工具测评、不做单纯鸡汤、不把兰亭茶境写成单一茶馆探店。',
        nextAction: '优先选择本阶段P0选题进入脚本生成和集中拍摄。',
        topics: [
          {
            id: 'WZ-S4-001',
            title: '我们从AI茶空间项目中总结了3个ToB合作模式',
            hookType: '机制证明型',
            hook3s: '我们从AI茶空间项目中总结了3个ToB合作模式',
            platform: '视频号 + 公众号',
            priority: 'P0',
            status: 'approved'
          }
        ]
      }
    ];
  };

  /**
   * 构建选题页面的 AI 请求 prompt
   */
  const buildTopicPrompt = (interviewReport: string, positioningReport: string): string => {
    const knowledgeContext = state.knowledgeBase
      .filter(k => k.category === 'topic')
      .map(k => `【参考语料 - ${k.title}】：\n${k.content}`)
      .join('\n\n');

    return `请根据以下信息，生成一个完整的选题规划池。

【访谈报告】：
${interviewReport || "（暂无，请基于通用创始人 IP 内容逻辑生成）"}

【定位报告】：
${positioningReport || "（暂无，请基于通用内容逻辑生成）"}

${knowledgeContext ? `【参考语料】：
${knowledgeContext}` : ""}

请严格按照 JSON 格式输出，包含 4 个阶段的选题规划。`;
  };

  /**
   * 调用 AI 生成选题池
   */
  const generateTopicPool = async () => {
    setIsGeneratingTopics(true);
    try {
      const topicRefContent = await getStepRefsContent('topic');

      const systemPrompt = TOPIC_SYSTEM_PROMPT
        + (topicRefContent ? `

【参考文件 · 选题提示词 + 写作技巧提示词】：
${topicRefContent}` : '');

      const aiResponse = await deepseek.generateText({
        model: deepseek.MODELS.fast,
        system: systemPrompt,
        prompt: buildTopicPrompt(state.interviewReport, state.positioningReport),
        onUsage: reportTokenUsage,
      });

      const parsed = parseTopicPool(aiResponse || '');

      if (parsed && parsed.stages?.length > 0) {
        setState(prev => ({
          ...prev,
          topicPool: parsed.stages,
          topicGenerationStatus: 'completed',
        }));
        saveResultToStorage('topic_pool', parsed.stages, state.user?.uid);
      } else {
        console.warn('选题 JSON 解析失败，使用 Demo 数据（仅当前会话有效）');
        const demoData = getDemoTopicPool();
        setState(prev => ({
          ...prev,
          topicPool: demoData,
          topicGenerationStatus: 'demo_fallback',
        }));
        // Demo 降级数据不保存到 localStorage，刷新后显示空状态
      }
    } catch (error) {
      console.error('选题生成失败:', error);
      setState(prev => ({
        ...prev,
        topicPool: getDemoTopicPool(),
        topicGenerationStatus: 'demo_fallback',
      }));
      // Demo 降级数据不保存到 localStorage，刷新后显示空状态
    } finally {
      setIsGeneratingTopics(false);
    }
  };

  if (state.view === 'login') {
    return (
      <Login 
        isAdmin={state.isAdminLogin} 
        setIsAdmin={(val) => setState(prev => ({ ...prev, isAdminLogin: val }))}
        onLogin={(user, role) => {
          // Handled by onAuthStateChanged
        }}
        onDebugLogin={(asAdmin) => {
          const mockUser: UserProfile = {
            uid: 'debug-admin-17388978910',
            email: '17388978910',
            phone: '17388978910',
            role: 'admin',
            subscriptionStartAt: new Date().toISOString(),
            subscriptionDays: 99999,
            tokenQuota: 999999999,
            tokenUsed: 0,
            createdAt: new Date(),
          };
          // 调试模式下写入 mock token，避免 API 请求 401
          localStorage.setItem('authing_access_token', 'debug-token-mock');
          setState(prev => ({
            ...prev,
            user: mockUser,
            view: asAdmin ? 'admin' : 'app',
            isAdminLogin: false,
            isDebugLogin: true,
          }));
        }}
      />
    );
  }

  if (state.view === 'admin' && state.user) {
    return (
      <AdminPanel
        user={state.user}
        onLogout={handleLogout}
        onDebugLogin={() => {
          // 调试：重置到登录页
          setState(initialState);
        }}
        onSwitchToApp={() => setState(prev => ({ ...prev, view: 'app' }))}
      />
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F8F9FA] text-black font-sans selection:bg-black selection:text-white pb-20 md:pb-0">
      <AnimatePresence>
        {!isStarted ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="max-w-2xl space-y-8">
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="w-20 h-20 bg-black rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-black/20"
              >
                <Sparkles className="text-white w-10 h-10" />
              </motion.div>
              <div className="space-y-4">
                <motion.h1 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-4xl md:text-5xl font-bold tracking-tight"
                >
                  ToB创始人IP深度定制系统
                </motion.h1>
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-gray-400 uppercase tracking-[0.2em] text-xs font-semibold"
                >
                  Premium IP Customization for Visionary Founders
                </motion.p>
              </div>
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4 text-left"
              >
                {[
                  { label: '深度访谈', desc: '挖掘个人故事' },
                  { label: '背景整合', desc: '梳理企业优势' },
                  { label: '全案定位', desc: '规划账号人设' },
                  { label: '文案创作', desc: '打造爆款脚本' }
                ].map((item, i) => (
                  <div key={i} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <p className="text-xs font-bold mb-1">{item.label}</p>
                    <p className="text-[10px] text-gray-400">{item.desc}</p>
                  </div>
                ))}
              </motion.div>
              <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                onClick={handleStart}
                className="bg-black text-white px-12 py-5 rounded-full font-bold text-lg hover:bg-gray-800 transition-all shadow-2xl shadow-black/20 group"
              >
                开启定制之旅 <ChevronRight className="inline-block ml-2 group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-black rounded-lg md:rounded-xl flex items-center justify-center">
            <Sparkles className="text-white w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div>
            <h1 className="text-sm md:text-lg font-bold tracking-tight">ToB创始人IP定制</h1>
            <p className="text-[8px] md:text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Premium IP Customization</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
          {[
            { id: 'interview', label: '访谈', icon: User },
            { id: 'positioning', label: '定位', icon: Target },
            { id: 'topic', label: '选题', icon: FileText },
            { id: 'copywriting', label: '文案', icon: PenTool },
            { id: 'history', label: '历史', icon: Database },
          ].map((step) => {
            const unlocked = isStepUnlocked(step.id as Step, state.interviewReport, state.topicPool, state.user?.role);
            return (
              <button
                key={step.id}
                onClick={() => unlocked && setCurrentStep(step.id as Step)}
                disabled={!unlocked}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  currentStep === step.id
                    ? "bg-white text-black shadow-sm"
                    : unlocked
                      ? "text-gray-400 hover:text-black"
                      : "text-gray-300 cursor-not-allowed"
                )}
              >
                <step.icon size={14} />
                {step.label}
              </button>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-500">
          <button 
            onClick={() => setShowGuide(true)}
            className="hover:text-black cursor-pointer transition-colors outline-none"
          >
            系统指南
          </button>
          <button 
            onClick={() => setShowContact(true)}
            className="bg-black text-white px-5 py-2 rounded-full text-xs hover:bg-gray-800 transition-all shadow-lg shadow-black/10"
          >
            联系专家
          </button>
          {DEBUG_MODE !== 'off' && (
            <>
              <button
                onClick={() => setShowLogs(true)}
                className="p-2 text-gray-400 hover:text-amber-600 transition-colors"
                title="导出调试日志"
              >
                <Bug className="w-5 h-5" />
              </button>
              <button
                onClick={resetAllData}
                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                title="一键还原：清空所有用户数据"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                onClick={clearUserLocalData}
                className="p-2 text-gray-400 hover:text-orange-600 transition-colors"
                title="清除本地缓存：清空当前用户的 localStorage 数据"
              >
                <Database className="w-5 h-5" />
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            title="退出登录"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        <div className="md:hidden flex items-center gap-3">
          <button 
            onClick={() => setShowGuide(true)}
            className="p-2 bg-gray-50 rounded-lg"
          >
            <FileText className="w-5 h-5 text-gray-400" />
          </button>
          <button 
            onClick={() => setShowContact(true)}
            className="p-2 bg-black rounded-lg"
          >
            <Phone className="w-5 h-5 text-white" />
          </button>
          {DEBUG_MODE !== 'off' && (
            <>
              <button
                onClick={() => setShowLogs(true)}
                className="p-2 bg-gray-50 rounded-lg"
                title="导出调试日志"
              >
                <Bug className="w-5 h-5 text-amber-500" />
              </button>
              <button
                onClick={resetAllData}
                className="p-2 bg-gray-50 rounded-lg"
                title="一键还原：清空所有用户数据"
              >
                <Trash2 className="w-5 h-5 text-red-500" />
              </button>
              <button
                onClick={clearUserLocalData}
                className="p-2 bg-gray-50 rounded-lg"
                title="清除本地缓存：清空当前用户的 localStorage 数据"
              >
                <Database className="w-5 h-5 text-orange-500" />
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className="p-2 bg-gray-50 rounded-lg"
          >
            <LogOut className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </header>

      {/* System Guide Modal */}
      <AnimatePresence>
        {showGuide && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-4xl rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl flex flex-col md:flex-row h-[80vh] md:h-[600px]"
            >
              <div className="w-full md:w-1/2 bg-black p-8 md:p-12 flex flex-col justify-between text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl" />
                <div className="relative z-10">
                  <Sparkles className="w-10 h-10 mb-6 opacity-50" />
                  <h2 className="text-3xl md:text-4xl font-bold mb-4">系统操作指南</h2>
                  <p className="text-gray-400 text-sm md:text-base leading-relaxed">
                    三步深度定制，助力ToB创始人打造极具商业价值的个人品牌。
                  </p>
                </div>
                <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-sm font-bold">01</div>
                    <span className="text-sm font-medium">深度访谈挖掘故事</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-sm font-bold">02</div>
                    <span className="text-sm font-medium">全案定位规划方案</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-sm font-bold">03</div>
                    <span className="text-sm font-medium">爆款文案创作输出</span>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 p-8 md:p-12 overflow-y-auto relative bg-white">
                <button 
                  onClick={() => setShowGuide(false)}
                  className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                
                <div className="space-y-12">
                  {[
                    {
                      step: "Step 01",
                      title: "深度访谈：挖掘灵魂底色",
                      desc: "通过AI顾问的深度对话，挖掘您成长经历中的关键转折点、创业初衷及核心价值观。访谈过程中可自然上传企业资料、案例截图等作为补充。这是IP的灵魂所在。",
                      img: "https://picsum.photos/seed/interview/800/400"
                    },
                    {
                      step: "Step 02",
                      title: "定位规划：构建人设框架",
                      desc: "结合个人故事与商业背景，为您规划账号命名、Bio简介、核心人设及内容更新框架。",
                      img: "https://picsum.photos/seed/strategy/800/400"
                    },
                    {
                      step: "Step 03",
                      title: "文案创作：打造传播钩子",
                      desc: "根据定位方案，为您创作高质量的短视频口播文案。包含强力钩子、高密度干货及情绪价值。",
                      img: "https://picsum.photos/seed/creative/800/400"
                    }
                  ].map((item, i) => (
                    <div key={i} className="space-y-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{item.step}</span>
                      <h3 className="text-xl font-bold">{item.title}</h3>
                      <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
                      <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                        <img src={item.img} alt={item.title} className="w-full h-40 object-cover" referrerPolicy="no-referrer" />
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-12 pt-8 border-t border-gray-100 text-center">
                  <button 
                    onClick={() => setShowGuide(false)}
                    className="bg-black text-white px-8 py-3 rounded-full font-bold text-sm"
                  >
                    开始操作
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contact Expert Modal */}
      <AnimatePresence>
        {showContact && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 md:p-10 shadow-2xl text-center relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-black" />
              <button 
                onClick={() => setShowContact(false)}
                className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="w-20 h-20 bg-gray-50 rounded-3xl mx-auto flex items-center justify-center mb-6">
                <User className="w-10 h-10 text-black" />
              </div>
              
              <h2 className="text-2xl font-bold mb-2">联系 IP 专家</h2>
              <p className="text-gray-400 text-sm mb-8">为您提供一对一深度咨询与定制服务</p>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-black transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <Phone className="w-5 h-5 text-black" />
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">联系电话</p>
                      <p className="font-bold text-sm">18374763952</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleCopy('18374763952', 'phone')}
                    className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-black"
                  >
                    {copyStatus === 'phone' ? '已复制' : '复制'}
                  </button>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-black transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <MessageCircle className="w-5 h-5 text-black" />
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">微信咨询</p>
                      <p className="font-bold text-sm">wr930638246</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleCopy('wr930638246', 'wechat')}
                    className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-black"
                  >
                    {copyStatus === 'wechat' ? '已复制' : '复制'}
                  </button>
                </div>
              </div>
              
              <p className="mt-8 text-[10px] text-gray-400 uppercase tracking-[0.2em] font-medium">
                Professional IP Strategy Support
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Debug Logs Modal */}
      <AnimatePresence>
        {showLogs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-3xl rounded-[2rem] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Bug className="w-5 h-5 text-amber-600" />
                  <h2 className="text-lg font-bold">调试日志</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const logs = exportLogs();
                      const ok = await copyToClipboard(logs);
                      alert(ok ? '日志已复制到剪贴板' : '复制失败，请手动全选复制');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white rounded-lg text-xs font-bold hover:bg-gray-800 transition-colors"
                  >
                    <FileDown className="w-3.5 h-3.5" /> 复制全部
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('确定清空所有日志？')) clearLogs();
                    }}
                    className="px-3 py-1.5 text-gray-400 hover:text-red-500 text-xs font-bold transition-colors"
                  >
                    清空
                  </button>
                  <button
                    onClick={() => setShowLogs(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 bg-gray-950">
                <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all">
                  {exportLogs() || '// 暂无日志'}
                </pre>
              </div>
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400">
                提示：按 F12 打开浏览器开发者工具 → Console 标签，可以看到同样的日志输出。如果这里为空，说明日志拦截器未正确初始化。
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 隐私政策弹窗 */}
      {showPrivacy && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowPrivacy(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold">隐私政策</h2>
              <button
                onClick={() => setShowPrivacy(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 text-sm text-gray-600 leading-relaxed">
              <p className="mb-4">我们重视您的隐私，并承诺保护您的个人信息安全。</p>
              <h3 className="font-bold text-gray-900 mb-2">1. 信息收集</h3>
              <p className="mb-4">我们会收集您在使用服务时主动提供的信息，包括但不限于手机号、邮箱、对话内容等。</p>
              <h3 className="font-bold text-gray-900 mb-2">2. 信息使用</h3>
              <p className="mb-4">我们收集的信息仅用于提供服务、改进产品体验和发送重要通知。</p>
              <h3 className="font-bold text-gray-900 mb-2">3. 信息保护</h3>
              <p className="mb-4">我们采用行业标准的安全措施保护您的信息，防止未经授权的访问、泄露或丢失。</p>
              <h3 className="font-bold text-gray-900 mb-2">4. 信息共享</h3>
              <p>除法律要求或经您明确同意外，我们不会向第三方共享您的个人信息。</p>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* 服务条款弹窗 */}
      {showTerms && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowTerms(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold">服务条款</h2>
              <button
                onClick={() => setShowTerms(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 text-sm text-gray-600 leading-relaxed">
              <p className="mb-4">欢迎使用 ToB 创始人 IP 定制系统。请仔细阅读以下服务条款。</p>
              <h3 className="font-bold text-gray-900 mb-2">1. 服务说明</h3>
              <p className="mb-4">我们提供基于 AI 的创始人 IP 定制服务，包括访谈、信息分析、定位建议和文案创作。</p>
              <h3 className="font-bold text-gray-900 mb-2">2. 用户责任</h3>
              <p className="mb-4">用户应保证提供的信息真实准确，并承担因使用服务产生的所有责任。</p>
              <h3 className="font-bold text-gray-900 mb-2">3. 知识产权</h3>
              <p className="mb-4">服务中生成的内容归用户所有，但我们保留使用 anonymized 数据改进模型的权利。</p>
              <h3 className="font-bold text-gray-900 mb-2">4. 服务变更</h3>
              <p>我们保留随时修改或中断服务的权利，恕不另行通知。</p>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* 技术支持弹窗 */}
      {showSupport && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowSupport(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold">技术支持</h2>
              <button
                onClick={() => setShowSupport(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 text-sm text-gray-600 leading-relaxed">
              <p className="mb-4">如需技术支持，请通过以下方式联系我们：</p>
              <h3 className="font-bold text-gray-900 mb-2">📧 邮箱支持</h3>
              <p className="mb-4">support@example.com</p>
              <h3 className="font-bold text-gray-900 mb-2">💬 微信咨询</h3>
              <p className="mb-4">请扫描页面底部的二维码或添加微信：wr930638246</p>
              <h3 className="font-bold text-gray-900 mb-2">⏰ 服务时间</h3>
              <p>工作日 9:00-18:00（北京时间）</p>
            </div>
          </motion.div>
        </motion.div>
      )}

      <main className="max-w-6xl mx-auto py-6 md:py-12 px-4 md:px-6">
        <StepIndicator
          currentStep={currentStep}
          onStepClick={(step) => setCurrentStep(step)}
          state={state}
        />

        <div className="bg-white rounded-2xl md:rounded-3xl shadow-xl md:shadow-2xl shadow-gray-200/50 border border-gray-100 overflow-hidden min-h-[500px] md:min-h-[600px] flex flex-col">
          {renderStep()}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto py-8 md:py-12 px-4 md:px-6 border-t border-gray-100 mt-8 md:mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
          <div className="flex items-center gap-2 text-gray-400">
            <Sparkles className="w-3 h-3 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-xs font-medium uppercase tracking-widest">ToB Founder IP System © 2026</span>
          </div>
          <div className="flex items-center gap-4 md:gap-8 text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-400">
            <button onClick={() => setShowPrivacy(true)} className="hover:text-black transition-colors">隐私政策</button>
            <button onClick={() => setShowTerms(true)} className="hover:text-black transition-colors">服务条款</button>
            <button onClick={() => setShowSupport(true)} className="hover:text-black transition-colors">技术支持</button>
          </div>
        </div>
      </footer>

      {/* 管理员浮动切换按钮：切换到管理后台 */}
      {state.user?.role === 'admin' && (
        <button
          onClick={() => setState(prev => ({ ...prev, view: 'admin' }))}
          className="fixed bottom-6 right-6 z-[150] w-14 h-14 bg-black text-white rounded-full shadow-2xl shadow-black/30 flex items-center justify-center hover:bg-gray-800 transition-all hover:scale-105"
          title="切换到管理后台"
        >
          <LayoutDashboard className="w-5 h-5" />
        </button>
      )}
      </div>
    </ErrorBoundary>
  );
}
