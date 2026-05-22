# elitefounder-ai 组件模式库

## 1. 页面容器模式

### 主页面背景
```tsx
<div className="min-h-screen bg-[#F8F9FA] text-black font-sans selection:bg-black selection:text-white pb-20 md:pb-0">
```

### 内容主卡片
```tsx
<div className="bg-white rounded-2xl md:rounded-3xl shadow-xl md:shadow-2xl shadow-gray-200/50 border border-gray-100 overflow-hidden min-h-[500px] md:min-h-[600px] flex flex-col">
```

## 2. Modal 弹窗模式

### 标准 Modal
```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl"
      >
        {/* content */}
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
```

### 左右分栏 Modal（系统指南）
- 左侧 1/2: 黑色背景 + 步骤说明
- 右侧 1/2: 白色背景 + 详细内容

## 3. 聊天界面模式

### 消息列表容器
```tsx
<div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 max-h-[400px] md:max-h-[500px]">
```

### 消息项结构
```tsx
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  className={cn(
    "flex w-full group gap-3",
    m.role === 'user' ? "flex-row-reverse" : "flex-row"
  )}
>
  {/* 头像 */}
  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden shrink-0 shadow-sm border border-gray-100">
    <img src={avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
  </div>
  {/* 气泡 */}
  <div className={cn(
    "max-w-[75%] md:max-w-[70%] p-3 md:p-4 rounded-xl md:rounded-2xl text-xs md:text-sm leading-relaxed relative",
    m.role === 'user'
      ? "bg-black text-white rounded-tr-none shadow-lg"
      : "bg-white border border-gray-100 text-gray-800 rounded-tl-none shadow-sm"
  )}>
    {/* TTS 按钮（仅 AI 消息） */}
    <button className="absolute -right-8 top-0 p-1.5 rounded-full bg-gray-100 text-gray-400 hover:text-black opacity-0 group-hover:opacity-100 transition-all">
      <Volume2 className="w-3 h-3" />
    </button>
    {/* Markdown 内容 */}
    <div className="markdown-body prose prose-sm max-w-none">
      <ReactMarkdown>{m.text}</ReactMarkdown>
    </div>
  </div>
</motion.div>
```

### 输入框区域
```tsx
<div className="p-4 md:p-6 bg-gray-50/50 border-t border-gray-100">
  <div className="relative flex items-center gap-2">
    <div className="relative flex-1">
      <input
        type="text"
        className="w-full bg-white border border-gray-200 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 pr-16 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all shadow-sm text-sm"
      />
      {/* 语音按钮 */}
      <button className="absolute right-12 top-1/2 -translate-y-1/2 p-2 rounded-lg text-gray-400 hover:text-black">
        <Mic className="w-4 h-4" />
      </button>
      {/* 发送按钮 */}
      <button className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 p-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-200 transition-all shadow-md">
        <Send className="w-4 h-4" />
      </button>
    </div>
  </div>
</div>
```

## 4. 加载状态模式

### 全局加载
```tsx
<div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
  <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
    <Loader2 className="w-12 h-12 text-black" />
  </motion.div>
  <div className="space-y-2">
    <h3 className="text-xl md:text-2xl font-bold text-black">正在处理...</h3>
    <p className="text-gray-400 text-sm md:text-base italic">副标题说明</p>
  </div>
</div>
```

### 打字指示器
```tsx
<div className="flex justify-start gap-3">
  <div className="w-8 h-8 rounded-full overflow-hidden bg-white border border-gray-100">
    <img src={BOT_AVATAR} />
  </div>
  <div className="bg-white border border-gray-100 p-3 md:p-4 rounded-xl rounded-tl-none shadow-sm">
    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
  </div>
</div>
```

## 5. 按钮模式

### 主按钮（CTA）
```tsx
<button className="bg-black text-white px-8 py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-xl shadow-black/10 disabled:opacity-50">
```

### 次要按钮
```tsx
<button className="w-full text-gray-400 hover:text-black transition-colors text-xs font-bold py-2">
```

### 图标按钮
```tsx
<button className="p-2 bg-gray-50 rounded-lg text-gray-400 hover:text-black transition-all">
```

## 6. 表单元素模式

### 标准输入框
```tsx
<input
  className="w-full bg-white border border-gray-200 rounded-2xl px-6 py-4
    focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all shadow-sm text-sm"
/>
```

### 文本域
```tsx
<textarea
  className="w-full h-[150px] md:h-[200px] bg-gray-50 border border-gray-100 rounded-xl md:rounded-2xl p-4 md:p-6
    focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all resize-none text-xs md:text-sm leading-relaxed"
/>
```

### 下拉选择
```tsx
<select className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm appearance-none">
```

## 7. 文件上传模式

### 上传区域
```tsx
<div className="border-2 border-dashed border-gray-100 rounded-xl p-4 flex flex-col items-center justify-center text-gray-300 hover:border-gray-200 hover:text-gray-400 transition-all cursor-pointer">
  <Download size={20} className="mb-1" />
  <span className="text-[10px] font-medium">点击上传文件</span>
</div>
```

### 已上传文件项
```tsx
<div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
  <div className="w-8 h-8 bg-white rounded flex items-center justify-center text-gray-400">
    <FileText size={14} />
  </div>
  <div className="flex-1 min-w-0">
    <p className="text-[10px] font-medium truncate">{file.name}</p>
    <p className="text-[8px] text-gray-400">{file.size}</p>
  </div>
  <button className="text-gray-300 hover:text-red-500"><X size={12} /></button>
</div>
```

## 8. 错误边界模式

```tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error(error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-red-50">
          <X className="text-red-500 w-8 h-8" />
          <h2 className="text-2xl font-black text-red-900 mb-2">出错了</h2>
          <p className="text-red-600 mb-6">应用遇到了意外错误。</p>
          <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-8 py-3 rounded-xl font-bold">
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```
