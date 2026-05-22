# elitefounder-ai 技术栈详解

## 核心框架
| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^19.0.0 | UI 框架 |
| React DOM | ^19.0.0 | DOM 渲染 |
| TypeScript | ~5.8.2 | 类型系统 |
| Vite | ^6.2.0 | 构建工具 + 开发服务器 |

## 样式与 UI
| 技术 | 版本 | 用途 |
|------|------|------|
| Tailwind CSS | ^4.1.14 | 原子化 CSS 框架 |
| @tailwindcss/vite | ^4.1.14 | Tailwind Vite 插件 |
| clsx | ^2.1.1 | 条件类名组合 |
| tailwind-merge | ^3.5.0 | 合并冲突的 Tailwind 类 |
| autoprefixer | ^10.4.21 | CSS 前缀补全 |

## AI 与数据处理
| 技术 | 版本 | 用途 |
|------|------|------|
| @google/genai | ^1.29.0 | Google Gemini API SDK |
| react-markdown | ^10.1.0 | Markdown 渲染 |
| mammoth | ^1.12.0 | .docx 文件解析 |
| xlsx | ^0.18.5 | Excel 文件解析 |

## 动画
| 技术 | 版本 | 用途 |
|------|------|------|
| motion (framer-motion) | ^12.23.24 | React 动画库 |

## 图标
| 技术 | 版本 | 用途 |
|------|------|------|
| lucide-react | ^0.546.0 | SVG 图标库 |

## 后端与持久化
| 技术 | 版本 | 用途 |
|------|------|------|
| firebase | ^12.11.0 | Auth + Firestore |
| express | ^4.21.2 | 服务端（预留） |

## 导出功能
| 技术 | 版本 | 用途 |
|------|------|------|
| html2canvas | ^1.4.1 | DOM 转图片 |
| jspdf | ^4.2.1 | PDF 生成 |

## 工具函数

### cn() — 类名合并
```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Tailwind 配置要点
```css
/* index.css */
@import "tailwindcss";

@layer utilities {
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
}

.markdown-body {
  @apply text-inherit;
}
```

### Vite 配置要点
```typescript
// vite.config.ts
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
  };
});
```

## API 调用模式（Google GenAI）

### 初始化
```typescript
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
```

### 单次生成
```typescript
const response = await ai.models.generateContent({
  model: "gemini-3-flash-preview",
  contents: "prompt text",
  config: {
    systemInstruction: SYSTEM_PROMPT,
    responseMimeType: "application/json", // 可选
  }
});
const text = response.text;
```

### 多轮对话
```typescript
const chat = ai.chats.create({
  model: "gemini-3-flash-preview",
  config: { systemInstruction: SYSTEM_PROMPT },
  history: messages.map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }))
});
const response = await chat.sendMessage({ message: userInput });
```

### TTS 音频生成
```typescript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-preview-tts",
  contents: [{ parts: [{ text: `请朗读：${text}` }] }],
  config: {
    responseModalities: ["AUDIO"],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: 'Kore' },
      },
    },
  },
});
// 提取 base64 音频数据并播放
```
