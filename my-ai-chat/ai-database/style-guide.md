# elitefounder-ai 样式系统规范

## 设计哲学
- **极简主义**: 以黑白灰为基调，强调内容层次
- **圆润现代**: 大量使用大圆角（2xl/3xl/full）
- **轻量阴影**: 细微的 border + shadow 营造层次感
- **精致排版**: 小号大写字母标签（text-[10px] uppercase tracking-widest）

## 色彩体系

| Token | 值 | 用途 |
|-------|-----|------|
| 主背景 | `#F8F9FA` / `bg-gray-50` | 页面底色 |
| 卡片背景 | `bg-white` | 内容卡片、弹窗 |
| 主文字 | `text-gray-900` / `text-black` | 标题、正文 |
| 次要文字 | `text-gray-500` | 描述、提示 |
| 辅助文字 | `text-gray-400` | 标签、时间、占位 |
| 主按钮 | `bg-black text-white` | CTA 按钮 |
| 成功 | `bg-green-500` / `text-green-500` | 完成状态 |
| 警告/强调 | `bg-amber-500` | 生成报告按钮 |
| 错误 | `text-red-500` / `bg-red-50` | 错误提示 |
| 边框 | `border-gray-100` / `border-gray-200` | 卡片边框、分割线 |

## 圆角规范

| 元素 | 圆角类 | 备注 |
|------|--------|------|
| 小按钮/标签 | `rounded-xl` (12px) | 导航按钮、操作按钮 |
| 卡片/面板 | `rounded-2xl` (16px) | 内容区块 |
| 大卡片/弹窗 | `rounded-3xl` (24px) | 主内容区、modal |
| 圆形图标 | `rounded-full` | 步骤指示器、头像 |
| 输入框 | `rounded-2xl` | 表单元素 |

## 阴影规范

| 场景 | 类名 | 效果 |
|------|------|------|
| 轻微浮起 | `shadow-sm` | 基础卡片 |
| 标准卡片 | `shadow-xl shadow-gray-200/50` | 主内容区容器 |
| 强调按钮 | `shadow-xl shadow-black/10` | 黑色主按钮 |
| 悬浮按钮 | `shadow-lg shadow-black/20` | 圆形图标按钮 |
| 弹窗 | `shadow-2xl` | Modal 层 |

## 排版规范

### 标签文字（Label Style）
```
className="text-[10px] font-bold uppercase tracking-widest text-gray-400"
```
- 字号: 10px
- 大写转换
- 加宽字间距（widest）
- 灰色辅助色

### 标题层级
- 页面大标题: `text-4xl md:text-5xl font-bold tracking-tight`
- 区块标题: `text-2xl font-bold tracking-tight`
- 卡片标题: `text-xl font-bold`
- 小标题: `text-sm font-bold`

### 正文
- 常规: `text-sm leading-relaxed text-gray-600`
- 聊天消息: `text-xs md:text-sm leading-relaxed`

## 布局模式

### 聊天消息气泡
```
用户消息:
  max-w-[75%] p-3 md:p-4 rounded-xl md:rounded-2xl
  bg-black text-white rounded-tr-none shadow-lg

AI 消息:
  max-w-[75%] p-3 md:p-4 rounded-xl md:rounded-2xl
  bg-white border border-gray-100 text-gray-800 rounded-tl-none shadow-sm
```

### 头像
```
w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border border-gray-200 shadow-sm
```

### 表单输入
```
w-full bg-white border border-gray-200 rounded-2xl px-6 py-4
focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black
```

### 导航栏
```
sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100
px-6 py-4 flex items-center justify-between
```

### 步骤指示器
- 圆形: `w-10 h-10 md:w-12 md:h-12 rounded-full border-2`
- 激活: `bg-black text-white border-black scale-110 shadow-lg`
- 完成: `bg-green-500 text-white border-green-500`
- 待办: `bg-white text-gray-400 border-gray-200`
- 连线: `flex-1 h-0.5 min-w-[20px]`

## 动画规范

使用 `motion/react` (Framer Motion)：

```tsx
// 入场动画
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.2 }}
/>

// 列表切换
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
    />
  )}
</AnimatePresence>

// 选项卡切换
<motion.div layoutId="activeTab" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
```

## 响应式断点
- 移动端优先（默认样式为移动端）
- `md:` (768px+) — 桌面端增强
- 关键差异：padding、字号、布局方向（flex-col → grid/flex-row）
