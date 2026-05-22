import { Sparkles, MessageSquare, FileText, Zap, Shield } from "lucide-react";
import { motion } from "motion/react";

const SUGGESTIONS = [
  "帮我写一个 Python 函数，实现快速排序",
  "用简单的方式解释什么是区块链",
  "帮我制定一份一周健身计划",
  "给我推荐几本适合初学者的心理学书籍",
];

export function WelcomeScreen({ onSuggestionClick }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-lg w-full space-y-8"
      >
        {/* Logo */}
        <div className="space-y-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="w-16 h-16 bg-black rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-black/20"
          >
            <Sparkles className="text-white w-8 h-8" />
          </motion.div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
              AI Chat
            </h1>
            <p className="text-gray-400 uppercase tracking-[0.2em] text-xs font-semibold mt-2">
              智能对话 · 即时解答
            </p>
          </div>
        </div>

        {/* 功能卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 gap-3"
        >
          {[
            { icon: MessageSquare, label: "多轮对话", desc: "上下文理解" },
            { icon: FileText, label: "文件解析", desc: "支持文本上传" },
            { icon: Zap, label: "即时响应", desc: "快速生成答案" },
            { icon: Shield, label: "本地存储", desc: "数据私密安全" },
          ].map((item, i) => (
            <div
              key={i}
              className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-left hover:border-gray-200 transition-colors"
            >
              <item.icon className="w-5 h-5 text-gray-400 mb-2" />
              <p className="text-xs font-bold text-gray-900">{item.label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </motion.div>

        {/* 快捷提问 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-3"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">
            试试这样问
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick?.(s)}
                className="px-4 py-2 bg-white border border-gray-100 rounded-full text-xs text-gray-500 hover:border-black hover:text-black transition-all shadow-sm"
              >
                {s}
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
