# 选题页面 UI 规范

> 选题页面（Topic Page）位于定位与文案之间，展示阶段级选题规划池。
> 最后更新：2026-06-28

---

## 1. 页面结构

```
┌─────────────────────────────────────────────┐
│  阶段一 │ 阶段二 │ 阶段三 │ 阶段四           │ ← 文件夹样式标签页
├─────────────────────────────────────────────┤
│  阶段一｜0-30天：建立可信主线                  │ ← 阶段简介面板
│  阶段目标：...                               │
│  核心任务：...                               │
│  推荐平台：...                               │
│  推荐风格：...                               │
│  方向判断：...                               │
│  不建议：...                                 │
│  下一步：...                                 │
├─────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │ ← 选题卡片列表
│  │ WZ-S1-001│ │ WZ-S1-002│ │ WZ-S1-003│    │
│  │ [P0][已审核]│ │ [P1][待审核]│ │ [P0][已审核]│ │
│  │ 选题标题  │ │ 选题标题  │ │ 选题标题  │    │
│  │ 爆款：... │ │ 爆款：... │ │ 爆款：... │    │
│  │ 钩子：... │ │ 钩子：... │ │ 钩子：... │    │
│  │ 平台：... │ │ 平台：... │ │ 平台：... │    │
│  │        [生成文案]│        [生成文案]│  [生成文案]│
│  └──────────┘ └──────────┘ └──────────┘    │
├─────────────────────────────────────────────┤
│  [生成选题池（Demo）]      [进入文案]         │ ← 底部操作按钮
└─────────────────────────────────────────────┘
```

---

## 2. 文件夹样式标签页

### 样式规则
- 标签页使用 `rounded-t-lg`（顶部圆角）
- 非选中标签：`bg-gray-100 text-gray-400 border-transparent`
- 选中标签：`bg-white text-black border-black -mb-px z-10 shadow-sm`
- 底部边框：选中标签使用 `border-b-2 border-black`
- 简介面板：`bg-white border border-gray-200 rounded-b-lg rounded-tr-lg`

### 交互
- 点击标签切换阶段内容
- 选中标签向下偏移 1px（`-mb-px`），覆盖简介面板顶部边框
- 选中标签带轻微阴影（`shadow-sm`），增强层次感

---

## 3. 阶段简介面板

### 字段
| 字段 | 说明 | 字体大小 |
|------|------|---------|
| `stage_name` | 阶段名称（如"0-30天：建立可信主线"） | `text-base` (16px) |
| `stage_goal` | 阶段目标 | `text-sm` (14px) |
| `core_task` | 核心任务 | `text-xs` (12px) |
| `platform` | 推荐平台 | `text-xs` (12px) |
| `style` | 推荐风格 | `text-xs` (12px) |
| `direction` | 方向判断 | `text-xs` (12px) |
| `not_recommended` | 不建议方向 | `text-xs` (12px) |
| `next_action` | 下一步行动 | `text-xs` (12px) |

### 样式
- 背景：白色 `bg-white`
- 边框：`border border-gray-200`
- 圆角：`rounded-b-lg rounded-tr-lg`（底部圆角，右上角不圆角）
- 内边距：`p-5`
- 字段间距：`space-y-3`

---

## 4. 选题卡片（压缩版）

### 显示字段
| 字段 | 说明 | 样式 |
|------|------|------|
| `id` | 选题编号（如 WZ-S1-001） | `text-xs font-mono text-gray-400` |
| `priority` | 优先级（P0/P1/P2） | `px-2 py-0.5 rounded-full text-[11px] font-bold` |
| `status` | 状态（已审核/待审核/已使用） | `px-2 py-0.5 rounded-full text-[11px] font-bold` |
| `title` | 选题标题 | `text-sm font-bold text-gray-900` |
| `hook_type` | 爆款类型 | `text-xs text-gray-600` |
| `hook_3s` | 3秒钩子 | `text-xs text-gray-600 line-clamp-1` |
| `platform` | 适合平台 | `text-xs text-gray-600` |
| 按钮 | "生成文案" | `px-3 py-1.5 bg-black text-white rounded-lg text-[11px] font-bold` |

### 样式
- 背景：白色 `bg-white`
- 圆角：`rounded-xl`
- 内边距：`p-4`
- 边框：`border border-gray-100`
- 阴影：`shadow-sm hover:shadow-md`
- 布局：水平排列（flex-row），左侧内容，右侧按钮
- 按钮悬停：`hover:bg-gray-800`

### 隐藏字段（压缩时隐藏）
- `description` - 一句话说明
- `hook_point` - 爆款点
- `core_conflict` - 核心冲突
- `opening` - 开头设计
- `closing` - 收尾设计
- `cta` - 互动引导
- `source` - 来源

---

## 5. 底部操作按钮

### 生成选题池按钮
```tsx
className="flex-1 py-2.5 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-all text-xs"
```
- 宽度：flex-1（自适应）
- 内边距：`py-2.5`
- 圆角：`rounded-xl`

### 进入文案按钮
```tsx
className="px-4 py-2.5 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-all text-xs"
```
- 内边距：`px-4 py-2.5`
- 圆角：`rounded-xl`

---

## 6. 数据格式（JSON）

```json
{
  "stages": [
    {
      "stage": 1,
      "stage_name": "0-30天：建立可信主线",
      "stage_goal": "...",
      "topics": [
        {
          "id": "WZ-S1-001",
          "title": "选题标题",
          "hook_type": "爆款类型",
          "hook_3s": "3秒钩子",
          "platform": "适合平台/形式",
          "priority": "P0",
          "status": "approved"
        }
      ]
    }
  ]
}
```

---

## 7. 交互逻辑

1. **阶段切换**：点击标签页切换阶段，显示对应阶段的简介和选题列表
2. **选题卡片点击**：可扩展显示完整选题信息（待实现）
3. **生成文案按钮**：点击后进入文案页面，携带选题 ID（待实现）
4. **生成选题池**：调用 AI 生成选题（`TOPIC_SYSTEM_PROMPT`），解析失败时降级到 Demo 数据
5. **进入文案**：直接跳转到文案页面

---

## 8. AI 生成与解析

### Prompt 架构

| Prompt | 用途 | 位置 |
|--------|------|------|
| `TOPIC_SYSTEM_PROMPT` | 选题生成（系统提示词） | `src/lib/prompts.ts` |

### Prompt 输入格式

User Message 包含：
```
【访谈报告】：
${interviewReport || "（暂无）"}

【定位报告】：
${positioningReport || "（暂无）"}

【参考语料】：
${knowledgeContext}
```

### AI 输出格式（强制纯 JSON）

```json
{
  "stages": [
    {
      "stage": 1,
      "name": "阶段名称",
      "goal": "阶段目标",
      "coreTask": "核心任务",
      "platform": "推荐平台",
      "style": "推荐风格",
      "direction": "方向判断",
      "notRecommended": "不建议方向",
      "nextAction": "下一步行动",
      "topics": [
        {
          "id": "WZ-S1-001",
          "title": "选题标题",
          "hookType": "爆款类型",
          "hook3s": "3秒钩子",
          "platform": "适合平台",
          "priority": "P0",
          "status": "approved"
        }
      ]
    }
  ]
}
```

### 字段名规范（驼峰命名）

| 前端字段 | Prompt 字段 | 说明 |
|---------|------------|------|
| `name` | `name` | 阶段名称 |
| `goal` | `goal` | 阶段目标 |
| `hook3s` | `hook3s` | 3秒钩子 |
| `hookType` | `hookType` | 爆款类型 |
| `notRecommended` | `notRecommended` | 不建议方向 |

### 解析策略（4 层 fallback）

1. **直接解析**：`JSON.parse(aiResponse)`
2. **提取 Markdown 代码块**：正则匹配 \`\`\`json ... \`\`\`
3. **正则提取**：提取第一个 `{` 到最后一个 `}` 之间的内容
4. **降级**：解析失败时使用 Demo 数据

### 状态管理

| 状态 | 说明 |
|------|------|
| `idle` | 初始状态，未生成 |
| `generating` | AI 生成中 |
| `completed` | AI 生成成功 |
| `demo_fallback` | AI 生成失败，使用 Demo 数据 |

---

## 9. 技术实现

- **组件位置**：`src/App.tsx` case 'topic'
- **状态管理**：`topicPool`（选题池数据）、`topicStage`（当前选中的阶段）、`topicGenerationStatus`（生成状态）
- **数据来源**：AI 生成（`generateTopicPool`）或 Demo 数据（`getDemoTopicPool`）
- **导航解锁**：完成访谈后解锁（`!!interviewReport`）
- **Prompt 文件**：`src/lib/prompts.ts` - `TOPIC_SYSTEM_PROMPT`

---

*最后更新：2026-07-09*
