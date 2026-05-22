# 前端 RAG 模块

## 目录说明

| 目录 | 用途 |
|------|------|
| `components/` | RAG 相关 UI 组件，如文件上传器、知识库列表、引用标注 |
| `hooks/` | React Hooks，封装 RAG 交互逻辑 |
| `services/` | 与后端 RAG API 通信的函数 |
| `utils/` | 纯函数工具，如文本高亮、引用格式化 |
| `constants/` | 常量定义 |
| `types/` | JSDoc 类型定义或 TypeScript 接口 |

## 快速接入

在 `App.jsx` 中引入 RAG 聊天组件：

```jsx
import { RAGChat } from './rag/components/RAGChat';

function App() {
  return (
    <div>
      <RAGChat />
    </div>
  );
}
```

## 命名规范

- 组件：`PascalCase.jsx`（如 `FileUploader.jsx`）
- Hooks：`useCamelCase.js`（如 `useKnowledgeBase.js`）
- 工具函数：`camelCase.js`（如 `highlightText.js`）
- 常量：`SCREAMING_SNAKE_CASE`
