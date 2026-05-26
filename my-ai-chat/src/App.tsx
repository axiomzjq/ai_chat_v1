/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { 
  UserCircle, 
  Building2, 
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
  Volume2,
  Mic,
  MicOff,
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
  ShieldCheck,
  LogOut,
  Upload,
  Clock,
  FileSearch,
  Trash2,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { AUTHING_APP_ID, AUTHING_HOST } from './lib/authing';
import { 
  db, 
  auth,
  onAuthStateChanged,
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  serverTimestamp, 
  handleFirestoreError,
  OperationType,
  FirebaseUser
} from './firebase';

// --- Types ---

type Step = 'interview' | 'information' | 'positioning' | 'copywriting' | 'history';
type View = 'login' | 'app' | 'admin';

interface UserProfile {
  uid: string;
  email: string;
  role: 'user' | 'admin';
  usageDuration: number;
  createdAt: any;
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface HistoryItem {
  id: string;
  date: string;
  interviewReport: string;
  infoReport: string;
  positioningReport: string;
  copywritingOutput: {
    titles: string[];
    selectedTitleIndex: number | null;
    content: string;
  };
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
  knowledgeBase: any[];
  uploadedMaterials: UploadedMaterial[];
}

// --- AI Service ---

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Helper to play TTS audio
const playTTS = async (text: string, onStart?: () => void, onEnd?: () => void) => {
  try {
    onStart?.();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `请用专业且富有同理心的语气朗读：${text}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      const audioData = atob(base64Audio);
      const buffer = new Int16Array(audioData.length / 2);
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = (audioData.charCodeAt(i * 2) & 0xFF) | (audioData.charCodeAt(i * 2 + 1) << 8);
      }

      const audioBuffer = audioContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        onEnd?.();
        audioContext.close();
      };
      source.start();
    } else {
      onEnd?.();
    }
  } catch (error) {
    console.error("TTS Error:", error);
    onEnd?.();
  }
};

const organizeContentWithAI = async (rawText: string) => {
  if (!rawText.trim()) return "";
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `请将以下原始文本整理为AI能精确理解的、有序排版的语言。
【核心要求】：
1. 不得删减、遗漏或减少原始文本中的任何信息。
2. 仅进行结构化排版（如使用 Markdown 标题、列表、表格等），使内容更易于被 AI 检索和理解。
3. 保持原始数据的完整性和准确性。
4. 如果是表格数据，请整理为清晰的 Markdown 表格。

原始文本：
${rawText}`,
      config: {
        systemInstruction: "你是一个专业的内容整理专家。你的任务是优化文本的结构和排版，但严禁删除、概括或精简任何具体信息。你必须确保整理后的内容包含原始文本中的所有细节。",
      }
    });
    return response.text || rawText;
  } catch (error) {
    console.error("AI Organize Error:", error);
    return rawText;
  }
};

const INTERVIEW_SYSTEM_PROMPT = `你是一位顶级的【访谈顾问】兼【心理专家】，专门为创始人进行深度IP挖掘。
你的任务是通过对话的方式，全面、深入地收集创始人的信息，为后续的IP定位和内容创作提供素材。

### 访谈分为两个阶段：

#### 第一阶段：全方位基本信息收集（快速建立画像）
- **目标**：收集姓名、行业、年龄、地域、性格、爱好等基本信息。
- **要求**：语气亲和，像朋友聊天，快速建立信任。**不要在MBTI测试上浪费过多时间，仅需通过1-2个关键问题了解性格倾向即可。**

#### 第二阶段：深度访谈与心理分析（由心理专家主导，核心阶段）
- **目标**：**在收集完基本信息后，即刻切换为心理专家身份。** 
- **核心指令**：你必须**严格、深度地学习并应用**后台提供的【专业访谈语料】中的访谈方法论。不要使用通用的、肤浅的提问方式。
- **提问逻辑**：基于第一阶段的信息，结合语料中的专业技巧（如：追问技巧、情感挖掘、价值观拆解等），进行针对性的深度提问。
- **核心内容**：深入了解用户的价值观、成长经历、创业经历、人生故事、精神内核等。
- **要求**：作为心理专家，要敏锐捕捉用户回答中的情感点和逻辑点，进行深度追问。**严禁一直围绕MBTI进行提问，必须通过具体的经历和故事挖掘人性的深度。**

### 核心规则（必须永久遵守）：
1. **严格遵循语料**：如果后台提供了访谈方法论，你必须将其作为提问的最高准则。
2. **一次只问一个问题**：严禁在一次回复中包含两个或多个问题。必须等待用户回答后再提下一个问题。
3. **深度挖掘**：不要只是机械地走流程。要根据用户的回答进行追问，挖掘细节、情感和背后的逻辑。
4. **针对性提问**：提问必须结合第一阶段的用户画像以及后台提供的专业访谈方法。
5. **语气**：专业、睿智、富有同理心，像老友交谈，也像资深记者和心理医生。

### 结束语：
当所有信息收集完毕后，请告知用户：“访谈已圆满结束，感谢您的深度配合。我将为您生成一份极其详尽的【创始人创业经历深度分析报告】。”`;

const INFO_SYSTEM_PROMPT = `你是一位资深的【信息顾问】，负责收集整合用户公司资料、业务信息以及行业咨询。
请根据用户提供的文字信息以及上传的文件内容（如果有），生成一份完整的【企业与行业分析报告】。
报告应包含：
1. 公司核心竞争力分析（产品、技术、团队）
2. 业务逻辑与盈利模式（如何赚钱，如何获客）
3. 行业现状与未来趋势（市场规模、竞争格局、政策影响）
4. 目标客户画像与痛点分析（谁是买单的人，他们怕什么）
5. 竞争对手差异化分析（为什么选你不选他）`;

const POSITIONING_SYSTEM_PROMPT = `你是一位拥有超强运营水平的【IP定位顾问】。
你将根据【个人IP分析报告】和【企业与行业分析报告】，为创始人整体规划账号定位。

你的输出必须包含以下两个核心部分：

### 第一部分：【定位分析】
请基于创始人的背景、行业趋势和竞争环境，进行深度分析。包含：
1. 核心优势挖掘（创始人的独特卖点）
2. 目标受众画像（深度分析受众痛点与需求）
3. 行业竞争格局分析
4. 差异化突围路径

### 第二部分：【定位方案】
请输出3个不同维度的【IP定位规划方案】，每个方案必须包含完整的以下内容：
1. **方案名称**（如：行业布道者、创业实战派、温情CEO）
2. **账号命名建议**（3个）
3. **账号简介**（Bio）
4. **核心人设定位**（一句话描述）
5. **视觉风格建议**（色彩、场景、着装）
6. **更新内容框架**（3个核心栏目）
7. **账号成长阶段规划**
8. **内容规划框架**：
   - 请将账号成长分为至少3个阶段（如：起号期、爆发期、变现期）。
   - **每个阶段**必须提供**不少于20个**具体的选题建议。
   - 选题要结合创始人的故事、专业能力和行业趋势。

输出格式要求：
- 请使用 Markdown 格式输出。
- 第一部分必须以 "### 定位分析" 开头。
- 第二部分的每个方案必须以 "### 定位方案 X: [方案名称]" 开头（X 为 1, 2, 3）。
- 确保每个方案的内容都是完整的，不要省略任何部分。`;

const COPYWRITING_SYSTEM_PROMPT = `你是一位顶尖的【短视频文案顾问】。
你的任务是根据【IP定位规划方案】中的内容定位和选题规划，结合【创始人创业经历深度分析报告】和【企业与行业分析报告】，创作具有极高传播价值的短视频口播文稿。

### 核心任务：
1. **选题生成**：将定位顾问的具体选题，转化为基于创始人个人经历、特色，且兼顾行业洞察与公司业务的深度内容。
2. **多标题选择**：为每一版文案生成3个具有极强点击欲望的标题（Hook标题、利益标题、反直觉标题）。
3. **高水准口播稿**：文案必须符合互联网传播逻辑，节奏感强，金句频出，保持专业且高级的文风。

### 文稿要求：
1. **语言风格**：
   - 极度口语化，短句为主，每句不超过15字。
   - 禁用：“赋能”、“抓手”、“闭环”、“底层逻辑”等大厂黑话。
   - 禁用：“首先、其次、最后”等陈旧的结构词。
   - 禁用：“月入十万”、“躺赚”等低级承诺。
2. **内容结构**：
   - **黄金3秒开头**：必须有强力钩子（Hook），通过情绪共鸣、反直觉观点或扎心痛点瞬间抓住用户。
   - **身份背书**：在叙述中自然融入创始人的专业背景和实战经历，建立信任感。
   - **视觉化描述**：用文字勾勒出具有“高级感”和“实力感”的场景。
   - **核心金句**：每篇文案至少包含2-3个能让人产生转发欲望的深刻观点。
   - **结尾升华**：价值升华 + 极其自然的行动指令（CTA）。
3. **篇幅**：1-3分钟（约200-500字）。

### 交互逻辑：
- 如果用户输入的是自己的选题、想法或观念，你必须先通过对话形式帮用户整理思路，挖掘其中的亮点和与个人IP的结合点。
- 在思路整理清晰后，再结合背景资料生成最终文案。

### 输出格式：
请使用 JSON 格式输出，包含：
- titles: 包含3个建议标题的数组。
- content: 完整的口播脚本字符串。
- summary: 一句话总结该文案的核心传播逻辑。`;

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
    { id: 'information', label: '信息', icon: Database },
    { id: 'positioning', label: '定位', icon: Target },
    { id: 'copywriting', label: '文案', icon: PenTool },
    { id: 'history', label: '历史', icon: CheckCircle2 },
  ];

  const isStepUnlocked = (stepId: Step) => {
    if (stepId === 'interview') return true;
    if (stepId === 'information') return !!state.interviewReport;
    if (stepId === 'positioning') return !!state.infoReport;
    if (stepId === 'copywriting') return !!state.positioningReport;
    if (stepId === 'history') return true;
    return false;
  };

  return (
    <div className="flex items-center justify-between w-full max-w-4xl mx-auto mb-8 md:mb-12 px-2 md:px-4 overflow-x-auto no-scrollbar py-2">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = currentStep === step.id;
        const isPast = steps.findIndex(s => s.id === currentStep) > index;
        const unlocked = isStepUnlocked(step.id);

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

const initialState: AppState = {
  interviewPhase: 'basic',
  interviewReport: '',
  infoReport: '',
  positioningOptions: [],
  selectedPositioningIndex: null,
  positioningReport: '',
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

function Login({ onLogin, isAdmin, setIsAdmin }: { 
  onLogin: (user: FirebaseUser, role: 'user' | 'admin') => void,
  isAdmin: boolean,
  setIsAdmin: (val: boolean) => void
}) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      let role: 'user' | 'admin' = 'user';
      
      if (userDoc.exists()) {
        role = userDoc.data().role;
      } else {
        // First time login - set role
        // Default admin if email matches
        if (user.email === 'janeeric879@gmail.com') {
          role = 'admin';
        }
        
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          role: role,
          usageDuration: 0,
          createdAt: serverTimestamp()
        });
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
    if (!email || !password) return;
    
    setLoading(true);
    try {
      let user: FirebaseUser;
      if (isRegister) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        user = result.user;
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        user = result.user;
      }
      
      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      let role: 'user' | 'admin' = 'user';
      
      if (userDoc.exists()) {
        role = userDoc.data().role;
      } else {
        // First time login - set role
        // Default admin if email matches
        if (user.email === 'janeeric879@gmail.com') {
          role = 'admin';
        }
        
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          role: role,
          usageDuration: 0,
          createdAt: serverTimestamp()
        });
      }

      if (isAdmin && role !== 'admin') {
        alert('您没有管理员权限，请使用普通用户登录。');
        await signOut(auth);
        return;
      }

      onLogin(user, role);
    } catch (error: any) {
      console.error('Auth error:', error);
      let msg = '操作失败，请重试。';
      if (error.code === 'auth/email-already-in-use') msg = '该邮箱已被注册。';
      if (error.code === 'auth/invalid-email') msg = '无效的邮箱地址。';
      if (error.code === 'auth/weak-password') msg = '密码太弱，请至少使用6位字符。';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') msg = '邮箱或密码错误。';
      alert(msg);
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
            {isAdmin ? '管理员控制台' : (isRegister ? '注册新账号' : '开启您的个人品牌进化之旅')}
          </p>
        </div>

        <div className="bg-gray-50 p-8 rounded-[40px] border border-gray-100 space-y-6">
          {isAdmin ? (
            <button 
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-black text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-gray-800 transition-all shadow-xl shadow-black/10 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck size={20} />}
              使用 Google 账号登录
            </button>
          ) : (
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-2">邮箱地址</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-white border border-gray-200 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all shadow-sm text-sm"
                  placeholder="your@email.com"
                />
              </div>
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-2">登录密码</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-white border border-gray-200 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all shadow-sm text-sm"
                  placeholder="••••••••"
                />
              </div>
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-gray-800 transition-all shadow-xl shadow-black/10 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck size={20} />}
                {isRegister ? '立即注册' : '立即登录'}
              </button>
            </form>
          )}
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200"></span></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-gray-50 px-2 text-gray-400">或者</span></div>
          </div>

          <div className="flex flex-col gap-4">
            {!isAdmin && (
              <button 
                onClick={() => setIsRegister(!isRegister)}
                className="w-full text-sm font-bold text-gray-500 hover:text-black transition-colors"
              >
                {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
              </button>
            )}
            <button 
              onClick={() => setIsAdmin(!isAdmin)}
              className="w-full text-sm font-bold text-gray-500 hover:text-black transition-colors"
            >
              切换到{isAdmin ? '用户登录' : '管理登录'}
            </button>
          </div>
        </div>

        <p className="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-bold">
          Powered by Gemini 3.1 Pro & Firebase
        </p>
      </motion.div>
    </div>
  );
}

function AdminPanel({ user, onLogout }: { user: UserProfile, onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<'users' | 'feedback' | 'knowledge'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: '', content: '', type: 'interview' as any });

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
    });
    const unsubFeedback = onSnapshot(query(collection(db, 'feedback'), orderBy('createdAt', 'desc')), (snapshot) => {
      setFeedbacks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubKnowledge = onSnapshot(query(collection(db, 'knowledgeBase'), orderBy('createdAt', 'desc')), (snapshot) => {
      setKnowledge(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    setLoading(false);
    return () => {
      unsubUsers();
      unsubFeedback();
      unsubKnowledge();
    };
  }, []);

  const handleAddKnowledge = async () => {
    if (!newDoc.title || !newDoc.content) return;
    setUploading(true);
    try {
      await addDoc(collection(db, 'knowledgeBase'), {
        ...newDoc,
        createdAt: serverTimestamp()
      });
      setNewDoc({ title: '', content: '', type: 'interview' });
      alert('上传成功！');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'knowledgeBase');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    if (!confirm('确定删除该文档吗？')) return;
    try {
      await deleteDoc(doc(db, 'knowledgeBase', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `knowledgeBase/${id}`);
    }
  };

  const handleUpdateRole = async (uid: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!confirm(`确定将该用户设为 ${newRole === 'admin' ? '管理员' : '普通用户'} 吗？`)) return;
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleUpdateDuration = async (uid: string, duration: number) => {
    try {
      await updateDoc(doc(db, 'users', uid), { usageDuration: duration });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
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
          <div className="bg-white rounded-[32px] border border-gray-100 overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">用户邮箱</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">角色</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">使用时长 (分)</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">注册时间</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-sm">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        u.role === 'admin' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                      )}>
                        {u.role === 'admin' ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          defaultValue={u.usageDuration || 0}
                          onBlur={(e) => handleUpdateDuration(u.uid, parseInt(e.target.value) || 0)}
                          className="w-20 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-black"
                        />
                        <span className="text-[10px] text-gray-400 font-bold">分钟</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleString() : '未知'}
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => handleUpdateRole(u.uid, u.role)}
                        className="text-xs font-bold text-black hover:underline"
                      >
                        切换角色
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                      k.type === 'interview' ? "bg-purple-100 text-purple-700" : 
                      k.type === 'ip' ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                    )}>
                      {k.type === 'interview' ? '访谈' : k.type === 'ip' ? 'IP' : '文案'}
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
      </div>
    </div>
  );
}

export default function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>('interview');
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

  useEffect(() => {
    localStorage.setItem('founder_ip_history', JSON.stringify(state.history));
  }, [state.history]);

  // Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data() as UserProfile;
          setState(prev => ({ ...prev, user: profile, view: profile.role === 'admin' && state.isAdminLogin ? 'admin' : 'app' }));
        }
      } else {
        setState(prev => ({ ...prev, user: null, view: 'login' }));
      }
    });
    return () => unsubscribe();
  }, [state.isAdminLogin]);

  // Usage Tracking
  useEffect(() => {
    if (state.user && state.user.role !== 'admin' && state.view === 'app') {
      const interval = setInterval(async () => {
        try {
          const userRef = doc(db, 'users', state.user!.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const currentDuration = userDoc.data().usageDuration || 0;
            if (currentDuration > 0) {
              await updateDoc(userRef, { usageDuration: currentDuration - 1 });
              setState(prev => ({
                ...prev,
                user: { ...prev.user!, usageDuration: currentDuration - 1 }
              }));
            }
          }
        } catch (error) {
          console.error("Error updating usage duration:", error);
        }
      }, 60000); // Every minute
      return () => clearInterval(interval);
    }
  }, [state.user?.uid, state.user?.role, state.view]);

  // Knowledge Base State
  useEffect(() => {
    if (state.user && state.view === 'app') {
      const unsub = onSnapshot(collection(db, 'knowledgeBase'), (snapshot) => {
        setState(prev => ({
          ...prev,
          knowledgeBase: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        }));
      });
      return () => unsub();
    }
  }, [state.user, state.view]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setState(initialState);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const addToHistory = async () => {
    if (!state.copywritingOutput.content || !state.user) return;
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      interviewReport: state.interviewReport,
      infoReport: state.infoReport,
      positioningReport: state.positioningReport,
      copywritingOutput: { ...state.copywritingOutput }
    };
    
    try {
      await addDoc(collection(db, 'history'), {
        uid: state.user.uid,
        type: 'copywriting',
        content: JSON.stringify(newItem),
        createdAt: serverTimestamp()
      });
      
      setState(prev => ({
        ...prev,
        history: [newItem, ...prev.history]
      }));
      alert('已保存到云端历史记录');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'history');
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
    if (files) {
      Array.from(files).forEach(file => {
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
        const isDocx = file.name.endsWith('.docx');
        const isText = file.type.includes('text') || file.name.endsWith('.md') || file.name.endsWith('.txt');
        
        if (isText || isExcel || isDocx) {
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
          };

          if (isExcel || isDocx) {
            reader.readAsArrayBuffer(file);
          } else {
            reader.readAsText(file);
          }
        }
      });
    }
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
          const snapshot = await getDoc(doc(db, 'userProgress', state.user.uid));
          if (snapshot.exists()) {
            const data = snapshot.data();
            if (data.interviewMessages) setMessages(JSON.parse(data.interviewMessages));
            setState(prev => ({
              ...prev,
              interviewReport: data.interviewReport || prev.interviewReport,
              infoReport: data.infoReport || prev.infoReport,
              positioningReport: data.positioningReport || prev.positioningReport,
              uploadedMaterials: data.uploadedMaterials ? (typeof data.uploadedMaterials === 'string' ? JSON.parse(data.uploadedMaterials) : data.uploadedMaterials) : prev.uploadedMaterials,
              copywritingOutput: data.copywritingOutput ? JSON.parse(data.copywritingOutput) : prev.copywritingOutput,
              copywritingMessages: data.copywritingMessages ? JSON.parse(data.copywritingMessages) : prev.copywritingMessages,
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
          await setDoc(doc(db, 'userProgress', state.user!.uid), {
            uid: state.user!.uid,
            interviewMessages: JSON.stringify(messages),
            interviewReport: state.interviewReport,
            infoReport: state.infoReport,
            positioningReport: state.positioningReport,
            uploadedMaterials: JSON.stringify(state.uploadedMaterials),
            copywritingOutput: JSON.stringify(state.copywritingOutput),
            copywritingMessages: JSON.stringify(state.copywritingMessages),
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          console.error("Error saving progress:", error);
        }
      };

      const timeoutId = setTimeout(saveProgress, 5000); // 5s debounce to avoid too many writes
      return () => clearTimeout(timeoutId);
    }
  }, [
    state.user?.uid,
    state.view,
    messages,
    state.interviewReport,
    state.infoReport,
    state.positioningReport,
    state.copywritingOutput,
    state.copywritingMessages,
    state.uploadedMaterials
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingDetailedReport, setIsGeneratingDetailedReport] = useState(false);

  const generateDetailedInterviewReport = async () => {
    setIsGeneratingDetailedReport(true);
    try {
      const relevantKnowledge = state.knowledgeBase
        .filter(k => k.type === 'interview')
        .map(k => k.content)
        .join('\n\n');

      const sections = [
        "第一章：创始人性格底色与MBTI深度画像（字数不少于5000字）",
        "第二章：成长环境与价值观形成深度复盘（字数不少于7000字）",
        "第三章：创业历程深度回顾与关键决策分析（字数不少于8000字）",
        "第四章：商业模式、核心竞争力与行业洞察（字数不少于5000字）",
        "第五章：精神内核、使命感与未来愿景深度解读（字数不少于5000字）"
      ];

      let fullReport = "# 创始人创业经历深度分析报告\n\n";
      fullReport += "## 报告目录\n\n";
      sections.forEach((s, idx) => {
        fullReport += `${idx + 1}. ${s.split('（')[0]}\n`;
      });
      fullReport += "\n---\n\n";
      
      for (const section of sections) {
        const response = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: `基于以下访谈记录和参考知识库，请撰写报告的【${section}】部分：\n\n访谈记录：\n${messages.map(m => `${m.role}: ${m.text}`).join('\n')}\n\n参考知识库：\n${relevantKnowledge}`,
          config: {
            systemInstruction: "你是一位顶级的IP挖掘专家。你的目标是撰写一份极其详尽、逻辑严密、专业且具有文学美感的深度报告。请务必保证内容的丰富度和深度。每一部分必须包含明确的章节小点（使用H3标题），并以高度结构化的方式呈现。请务必在内容中多使用列表、加粗等排版方式，确保逻辑清晰。如果提供了参考知识库，请务必将其中的行业洞察、专业术语或分析逻辑应用到报告中。",
          }
        });
        fullReport += `## ${section.split('（')[0]}\n\n${response.text}\n\n`;
      }

      setState(prev => ({ ...prev, interviewReport: fullReport }));
    } catch (error) {
      console.error("Detailed report error:", error);
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
  const [isListening, setIsListening] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'zh-CN';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (currentStep === 'interview') {
          setInput(prev => prev + transcript);
        } else if (currentStep === 'information') {
          setCompanyInfo(prev => prev + transcript);
        } else if (currentStep === 'positioning') {
          setPositioningFeedback(prev => prev + transcript);
        }
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [currentStep]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (error) {
        console.error('Failed to start recognition:', error);
      }
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
    // Usage Restriction Check
    if (state.user && state.user.role !== 'admin' && (state.user.usageDuration || 0) <= 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
            <Clock className="w-10 h-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-gray-900">使用时长已耗尽</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              您的账号使用时长已到期。请联系管理员进行续费或增加时长，以继续享受深度 IP 顾问服务。
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
                onClick={() => setCurrentStep('information')}
                className="flex items-center gap-1 md:gap-2 text-xs md:text-sm font-bold text-black hover:gap-2 md:hover:gap-3 transition-all"
              >
                下一步 <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 max-h-[400px] md:max-h-[500px]">
              {messages.map((m, i) => (
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
                    {m.role === 'model' && (
                      <button 
                        onClick={() => handlePlayVoice(m.text, i)}
                        className={cn(
                          "absolute -right-8 top-0 p-1.5 rounded-full transition-all",
                          playingIndex === i ? "bg-black text-white animate-pulse" : "bg-gray-100 text-gray-400 hover:text-black opacity-0 group-hover:opacity-100"
                        )}
                      >
                        {playingIndex === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                      </button>
                    )}
                    <div className="markdown-body prose prose-sm max-w-none prose-p:leading-relaxed">
                      <ReactMarkdown>
                        {m.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex justify-start gap-3">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden shrink-0 shadow-sm border border-gray-100 bg-white">
                    <img src={BOT_AVATAR} alt="Consultant" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div className="bg-white border border-gray-100 p-3 md:p-4 rounded-xl md:rounded-2xl rounded-tl-none shadow-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 md:p-6 bg-gray-50/50 border-t border-gray-100">
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
                    onClick={toggleListening}
                    className={cn(
                      "absolute right-12 md:right-14 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all",
                      isListening ? "text-red-500 bg-red-50 animate-pulse" : "text-gray-400 hover:text-black"
                    )}
                    title={isListening ? "正在倾听..." : "语音输入"}
                  >
                    {isListening ? <MicOff className="w-4 h-4 md:w-5 md:h-5" /> : <Mic className="w-4 h-4 md:w-5 md:h-5" />}
                  </button>
                  <button 
                    onClick={handleSendMessage}
                    disabled={isTyping || !input.trim()}
                    className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 p-2 bg-black text-white rounded-lg md:rounded-xl hover:bg-gray-800 disabled:bg-gray-200 transition-all shadow-md"
                  >
                    <Send className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>
                {messages.length > 10 && !state.interviewReport && !isGeneratingDetailedReport && (
                  <button 
                    onClick={generateDetailedInterviewReport}
                    className="px-4 py-3 bg-amber-500 text-white rounded-xl md:rounded-2xl hover:bg-amber-600 transition-all shadow-md text-xs md:text-sm font-bold flex items-center gap-2 whitespace-nowrap"
                  >
                    <Sparkles size={16} /> 生成深度报告
                  </button>
                )}
              </div>
              
              {state.interviewReport && (
                <div className="mt-8">
                  <CollapsibleSection title="查看访谈报告" icon={FileText}>
                    <div className="flex items-center justify-between mb-4">
                      <button 
                        onClick={restartInterview}
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
                  <p className="text-sm font-bold animate-pulse">正在生成3万字深度分析报告，请稍候...</p>
                  <p className="text-[10px] opacity-50">这可能需要1-2分钟，请不要关闭页面</p>
                </div>
              )}

              <p className="text-[8px] md:text-[10px] text-gray-400 mt-2 md:mt-3 text-center uppercase tracking-widest font-medium">
                访谈顾问正在记录您的每一个精彩瞬间
              </p>
            </div>
          </div>
        );
      case 'information':
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
                <h2 className="text-base md:text-xl font-bold">信息顾问：背景整合</h2>
              </div>
              <div className="w-10 md:w-20" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-12 flex-1">
              <div className="space-y-6 md:space-y-8">
                <div className="space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-400">输入企业与业务信息</label>
                    <button 
                      onClick={toggleListening}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all",
                        isListening ? "bg-red-50 text-red-500 animate-pulse" : "bg-gray-100 text-gray-400 hover:text-black"
                      )}
                    >
                      {isListening ? <MicOff size={12} /> : <Mic size={12} />}
                      {isListening ? "正在录音..." : "语音输入"}
                    </button>
                  </div>
                  <textarea 
                    value={companyInfo}
                    onChange={(e) => setCompanyInfo(e.target.value)}
                    placeholder="请描述您的公司名称、主营业务、核心产品..."
                    className="w-full h-[150px] md:h-[200px] bg-gray-50 border border-gray-100 rounded-xl md:rounded-2xl p-4 md:p-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all resize-none text-xs md:text-sm leading-relaxed"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
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
                  <div className="grid grid-cols-2 gap-2">
                    {state.uploadedMaterials.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="w-8 h-8 bg-white rounded flex items-center justify-center text-gray-400">
                          <FileText size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium truncate">{file.name}</p>
                          <p className="text-[8px] text-gray-400">{file.size}</p>
                        </div>
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
                        className="col-span-2 border-2 border-dashed border-gray-100 rounded-xl p-4 flex flex-col items-center justify-center text-gray-300 hover:border-gray-200 hover:text-gray-400 transition-all cursor-pointer"
                      >
                        <Download size={20} className="mb-1" />
                        <span className="text-[10px] font-medium">点击上传图片、文档、视频等</span>
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  onClick={generateInfoReport}
                  disabled={isGeneratingInfo || !companyInfo.trim()}
                  className="w-full bg-black text-white py-3 md:py-4 rounded-xl md:rounded-2xl font-bold flex items-center justify-center gap-2 md:gap-3 hover:bg-gray-800 transition-all shadow-xl shadow-black/10 disabled:bg-gray-200 text-sm"
                >
                  {isGeneratingInfo ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Sparkles className="w-4 h-4 md:w-5 md:h-5" />}
                  生成分析报告
                </button>
              </div>

              <div className="bg-gray-50 rounded-2xl md:rounded-3xl p-4 md:p-8 border border-gray-100 overflow-y-auto max-h-[400px] md:max-h-[600px]">
                {state.infoReport ? (
                  <div className="space-y-4">
                    <CollapsibleSection title="查看企业与行业分析报告" icon={Database}>
                      <div className="flex items-center justify-end gap-4 mb-4">
                        <button 
                          onClick={() => downloadReport(state.infoReport, '企业与行业分析报告.md')}
                          className="text-xs text-gray-400 hover:text-black transition-colors flex items-center gap-1"
                        >
                          <Download size={14} /> 下载
                        </button>
                        <button 
                          onClick={() => handleCopy(state.infoReport, 'info')}
                          className="text-xs text-gray-400 hover:text-black transition-colors flex items-center gap-1"
                        >
                          {copyStatus === 'info' ? <CheckCircle2 size={14} className="text-green-500" /> : <Copy size={14} />}
                          {copyStatus === 'info' ? '已复制' : '复制'}
                        </button>
                      </div>
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{state.infoReport}</ReactMarkdown>
                      </div>
                    </CollapsibleSection>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-3 md:space-y-4">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-white rounded-xl md:rounded-2xl overflow-hidden flex items-center justify-center shadow-sm border border-gray-100">
                      <img src={BOT_AVATAR} alt="Consultant" className="w-full h-full object-cover opacity-50" referrerPolicy="no-referrer" />
                    </div>
                    <p className="text-gray-400 text-[10px] md:text-sm max-w-[200px]">报告生成后将在此处显示</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 md:mt-8 pt-6 md:pt-8 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => setCurrentStep('positioning')}
                className="bg-black text-white px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold flex items-center gap-2 hover:gap-3 md:hover:gap-4 transition-all text-sm"
              >
                下一步：定位规划 <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          </div>
        );
      case 'positioning':
        return (
          <div className="flex-1 flex flex-col p-4 md:p-8">
            <div className="flex items-center justify-between mb-6 md:mb-8">
              <button onClick={() => setCurrentStep('information')} className="text-gray-400 hover:text-black flex items-center gap-1 md:gap-2 text-xs md:text-sm transition-colors">
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
                    onClick={() => setCurrentStep('copywriting')}
                    className="w-full text-gray-400 hover:text-black transition-colors text-xs font-bold py-2"
                  >
                    跳过此步，直接进入文案创作
                  </button>
                </div>
              )}

              {state.positioningOptions.length > 0 && (
                <div className="w-full space-y-8">
                  {/* Tab Navigation - Three Windows Switcher */}
                  <div className="flex items-center gap-3 p-2 bg-gray-100/50 rounded-[24px] w-fit mx-auto border border-gray-200/50 backdrop-blur-sm">
                    {state.positioningOptions.map((opt, idx) => {
                      // Try to find the title for this option from the header or the "方案名称" field
                      const headerMatch = opt.match(/###\s+(定位分析|定位方案\s+(\d+)[:：]\s*(.*))/);
                      let title = "";
                      
                      const numMap: Record<string, string> = {
                        '1': '一',
                        '2': '二',
                        '3': '三'
                      };

                      if (headerMatch) {
                        if (headerMatch[1] === "定位分析") {
                          title = "定位分析";
                        } else {
                          // It's a "定位方案 X: [方案名称]"
                          const optionIndex = headerMatch[2] || "";
                          title = `方案${numMap[optionIndex] || optionIndex}`;
                        }
                      } else {
                        const fieldMatch = opt.match(/方案名称[：:](.*)/);
                        title = (fieldMatch ? fieldMatch[1].trim() : `方案 ${idx}`).split('\n')[0];
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
                          <h3 className="text-xl font-bold leading-tight">方案已确认？<br/>立即开始文案创作</h3>
                          <button
                            onClick={() => setCurrentStep('copywriting')}
                            className="w-full py-4 bg-white text-black rounded-2xl text-xs font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                          >
                            进入文案顾问 <ArrowRight size={14} />
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
      case 'copywriting':
        return (
          <div className="flex-1 flex flex-col p-4 md:p-8">
            <div className="flex items-center justify-between mb-6 md:mb-8">
              <button onClick={() => setCurrentStep('positioning')} className="text-gray-400 hover:text-black flex items-center gap-1 md:gap-2 text-xs md:text-sm transition-colors">
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
                    {state.copywritingMessages.map((msg, idx) => (
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
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {isCopywritingThinking && (
                      <div className="flex gap-4">
                        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border border-gray-100 shadow-sm">
                          <img src={BOT_AVATAR} alt="Bot" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="bg-gray-50 p-4 rounded-2xl rounded-tl-none border border-gray-100">
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        </div>
                      </div>
                    )}
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
              <h2 className="text-2xl font-bold">历史记录</h2>
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
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {state.history.map((item) => (
                  <div key={item.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{item.date}</span>
                      <button 
                        onClick={() => {
                          setState(prev => ({
                            ...prev,
                            interviewReport: item.interviewReport,
                            infoReport: item.infoReport,
                            positioningReport: item.positioningReport,
                            copywritingOutput: item.copywritingOutput
                          }));
                          setCurrentStep('copywriting');
                        }}
                        className="text-[10px] text-black font-bold opacity-0 group-hover:opacity-100 transition-all bg-gray-100 px-2 py-1 rounded"
                      >
                        恢复记录
                      </button>
                    </div>
                    <h3 className="font-bold mb-2 truncate text-sm">
                      {item.copywritingOutput.titles[item.copywritingOutput.selectedTitleIndex || 0] || '未命名记录'}
                    </h3>
                    <p className="text-xs text-gray-400 line-clamp-3 mb-6 flex-1">
                      {item.copywritingOutput.content}
                    </p>
                    <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => downloadReport(item.copywritingOutput.content, `文案_${item.id}.md`)}
                          className="p-2 bg-gray-50 rounded-lg text-gray-400 hover:text-black transition-all"
                          title="下载文案"
                        >
                          <Download size={14} />
                        </button>
                        <button 
                          onClick={() => handleCopy(item.copywritingOutput.content, item.id)}
                          className="p-2 bg-gray-50 rounded-lg text-gray-400 hover:text-black transition-all"
                          title="复制文案"
                        >
                          {copyStatus === item.id ? <CheckCircle2 size={14} className="text-green-500" /> : <Copy size={14} />}
                        </button>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-gray-300">
                        <FileText size={10} />
                        <span>已存档</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg: Message = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const knowledgeContext = state.knowledgeBase
        .filter(k => k.type === 'interview')
        .map(k => `【参考语料 - ${k.title}】：\n${k.content}`)
        .join('\n\n');

      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: INTERVIEW_SYSTEM_PROMPT + (knowledgeContext ? `\n\n【重要：请严格遵循以下管理员提供的专业访谈方法论进行提问】：\n${knowledgeContext}` : ""),
        },
        history: messages.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }))
      });

      const response = await chat.sendMessage({ message: input });
      const modelText = response.text || '';
      
      setMessages(prev => [...prev, { role: 'model', text: modelText }]);

      // Phase detection logic
      if (state.interviewPhase === 'basic' && (messages.length > 5 || modelText.includes('第二阶段') || modelText.includes('深度访谈') || modelText.includes('心理专家'))) {
        setState(prev => ({ ...prev, interviewPhase: 'deep' }));
      }

      // Check if the model generated the report
      if (modelText.includes('访谈已圆满结束') || modelText.includes('创业经历深度分析报告') || messages.length > 150) {
        if (!state.interviewReport) {
          // Auto-trigger detailed report generation if not already generated
          generateDetailedInterviewReport();
        }
      }
    } catch (error) {
      console.error("Interview error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const handlePlayVoice = (text: string, index: number) => {
    if (playingIndex === index) return;
    playTTS(text, () => setPlayingIndex(index), () => setPlayingIndex(null));
  };

  // --- Information Agent State ---
  const [companyInfo, setCompanyInfo] = useState('');
  const [isGeneratingInfo, setIsGeneratingInfo] = useState(false);

  const generateInfoReport = async () => {
    if (!companyInfo.trim()) return;
    setIsGeneratingInfo(true);
    try {
      const knowledgeContext = state.knowledgeBase
        .filter(k => k.type === 'ip')
        .map(k => `【参考语料 - ${k.title}】：\n${k.content}`)
        .join('\n\n');

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `请根据以下信息生成分析报告：
【访谈报告】：
${state.interviewReport || "（暂无）"}

【上传资料内容】：
${state.uploadedMaterials.map(m => m.content).join('\n\n') || "（暂无）"}

【公司基本信息】：
${companyInfo}

${knowledgeContext ? `\n参考语料：\n${knowledgeContext}` : ""}`,
        config: {
          systemInstruction: INFO_SYSTEM_PROMPT + (knowledgeContext ? `\n\n请参考以上专业语料提升分析深度。` : "") + "\n\n请务必学习并结合【访谈报告】和【上传资料内容】中的细节，生成符合创始人定位的分析。",
        }
      });
      setState(prev => ({ ...prev, infoReport: response.text || '' }));
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
        .filter(k => k.type === 'ip')
        .map(k => `【参考语料 - ${k.title}】：\n${k.content}`)
        .join('\n\n');

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `基于以下信息生成3个不同维度的定位方案。

【特别说明】：如果以下报告内容为空或信息不足，请根据您的专业知识提供通用的、具有启发性的 ToB 创始人 IP 定位模板，并引导用户在后续对话中补充具体信息。

【个人IP分析报告】：
${state.interviewReport || "（暂无，请基于通用 ToB 创始人画像提供建议）"}

【企业与行业分析报告】：
${state.infoReport || "（暂无，请基于通用 ToB 行业逻辑提供建议）"}

【上传资料内容】：
${state.uploadedMaterials.map(m => m.content).join('\n\n') || "（暂无）"}

${knowledgeContext ? `\n参考语料：\n${knowledgeContext}` : ""}`,
        config: {
          systemInstruction: POSITIONING_SYSTEM_PROMPT + (knowledgeContext ? `\n\n请参考以上专业语料提升定位方案的专业度。` : "") + "\n\n请务必学习并结合【访谈报告】、【企业与行业分析报告】和【上传资料内容】中的所有细节，确保定位方案与创始人的精神内核及业务逻辑高度契合。请务必使用 Markdown 格式，并包含详细的内容规划框架（每个阶段不少于20个选题）。",
        }
      });
      
      const text = response.text || '';
      // Split by "### 定位分析" or "### 定位方案" but keep the delimiter
      const options = text.split(/(?=###\s+定位分析|###\s+定位方案)/).filter(o => o.trim().length > 50);

      setState(prev => ({ 
        ...prev, 
        positioningOptions: options.length > 0 ? options : [text],
        selectedPositioningIndex: 0,
        positioningReport: options[0] || text
      }));
    } catch (error) {
      console.error("Positioning generation error:", error);
    } finally {
      setIsGeneratingPositioning(false);
    }
  };

  const modifyPositioning = async () => {
    if (!positioningFeedback.trim() || isModifyingPositioning) return;
    setIsModifyingPositioning(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `当前定位方案：\n${state.positioningReport}\n\n用户修改建议：\n${positioningFeedback}\n\n请根据建议优化该方案，保持专业度。`,
        config: {
          systemInstruction: "你是一位顶级的IP定位专家，请根据用户的反馈对定位方案进行精准调整和优化。",
        }
      });
      
      const newReport = response.text || '';
      setState(prev => ({ ...prev, positioningReport: newReport }));
      setPositioningFeedback('');
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
      const analysisResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `请分析以下对话，提取有价值的信息：
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
        config: {
          responseMimeType: "application/json",
        }
      });

      const analysis = JSON.parse(analysisResponse.text || '{}');
      
      if (analysis.supplementaryMaterial) {
        setState(prev => ({
          ...prev,
          interviewReport: prev.interviewReport + "\n\n### 补充素材 (来自文案创作对话)\n" + analysis.supplementaryMaterial
        }));
      }

      if (analysis.feedback && state.user) {
        await addDoc(collection(db, 'feedback'), {
          uid: state.user.uid,
          email: state.user.email,
          message: analysis.feedback,
          sentiment: analysis.sentiment,
          createdAt: serverTimestamp()
        });
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
        .filter(k => k.type === 'copywriting')
        .map(k => `【参考语料 - ${k.title}】：\n${k.content}`)
        .join('\n\n');

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: `【背景上下文】：
个人背景：${state.interviewReport || "（暂无）"}
企业背景：${state.infoReport || "（暂无）"}
定位方案：${state.positioningReport || "（暂无）"}
上传资料：${state.uploadedMaterials.map(m => m.content).join('\n\n') || "（暂无）"}

【特别说明】：如果上述背景信息缺失，请通过对话引导用户提供相关的个人故事、业务亮点或创作意图。` }] },
          ...state.copywritingMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
          { role: 'user', parts: [{ text: text }] }
        ],
        config: {
          systemInstruction: COPYWRITING_SYSTEM_PROMPT + "\n\n当前处于【思路整理阶段】。请通过对话形式帮用户整理思路，挖掘亮点。" + (knowledgeContext ? `\n\n请参考以下专业语料提升文案水准：\n${knowledgeContext}` : "") + "\n\n请务必学习并应用【背景上下文】中的所有资料，确保文案符合定位。如果思路已经非常清晰，请告知用户可以开始生成文案了。请保持专业且富有启发性。",
        }
      });

      const modelText = response.text || '';
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
        .filter(k => k.type === 'copywriting')
        .map(k => `【参考语料 - ${k.title}】：\n${k.content}`)
        .join('\n\n');

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `基于以下信息创作3个标题和1篇口播文案，请务必返回 JSON 格式：

${knowledgeContext ? `【参考语料】：\n${knowledgeContext}\n\n` : ""}
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
${state.uploadedMaterials.map(m => m.content).join('\n\n') || "（暂无）"}`,
        config: {
          systemInstruction: COPYWRITING_SYSTEM_PROMPT + "\n\n如果背景信息缺失，请基于通用行业最佳实践创作高质量文案。请务必学习并应用【参考语料】中的文案技巧，并结合【个人背景】、【企业背景】、【定位方案】和【上传资料内容】中的所有细节，创作出符合定位且具有高水准的文案。",
          responseMimeType: "application/json",
        }
      });
      
      const data = JSON.parse(response.text || '{}');
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

  if (state.view === 'login') {
    return (
      <Login 
        isAdmin={state.isAdminLogin} 
        setIsAdmin={(val) => setState(prev => ({ ...prev, isAdminLogin: val }))}
        onLogin={(user, role) => {
          // Handled by onAuthStateChanged
        }}
      />
    );
  }

  if (state.view === 'admin' && state.user) {
    return <AdminPanel user={state.user} onLogout={handleLogout} />;
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
            { id: 'interview', label: '访谈', icon: UserCircle },
            { id: 'information', label: '背景', icon: Building2 },
            { id: 'positioning', label: '定位', icon: Target },
            { id: 'copywriting', label: '文案', icon: PenTool },
            { id: 'history', label: '历史', icon: Database },
          ].map((step) => (
            <button
              key={step.id}
              onClick={() => setCurrentStep(step.id as Step)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                currentStep === step.id 
                  ? "bg-white text-black shadow-sm" 
                  : "text-gray-400 hover:text-black"
              )}
            >
              <step.icon size={14} />
              {step.label}
            </button>
          ))}
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
                    四步深度定制，助力ToB创始人打造极具商业价值的个人品牌。
                  </p>
                </div>
                <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-sm font-bold">01</div>
                    <span className="text-sm font-medium">深度访谈挖掘故事</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-sm font-bold">02</div>
                    <span className="text-sm font-medium">企业背景信息整合</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-sm font-bold">03</div>
                    <span className="text-sm font-medium">全案定位规划方案</span>
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
                      desc: "通过AI顾问的深度对话，挖掘您成长经历中的关键转折点、创业初衷及核心价值观。这是IP的灵魂所在。",
                      img: "https://picsum.photos/seed/interview/800/400"
                    },
                    {
                      step: "Step 02",
                      title: "背景整合：梳理商业逻辑",
                      desc: "输入您的企业信息、核心业务及行业背景。我们将为您分析核心竞争力，确立IP的商业支撑点。",
                      img: "https://picsum.photos/seed/business/800/400"
                    },
                    {
                      step: "Step 03",
                      title: "定位规划：构建人设框架",
                      desc: "结合个人故事与商业背景，为您规划账号命名、Bio简介、核心人设及内容更新框架。",
                      img: "https://picsum.photos/seed/strategy/800/400"
                    },
                    {
                      step: "Step 04",
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
                <UserCircle className="w-10 h-10 text-black" />
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
            <a href="#" className="hover:text-black transition-colors">隐私政策</a>
            <a href="#" className="hover:text-black transition-colors">服务条款</a>
            <a href="#" className="hover:text-black transition-colors">技术支持</a>
          </div>
        </div>
      </footer>
      </div>
    </ErrorBoundary>
  );
}
