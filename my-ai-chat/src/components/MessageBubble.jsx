import { useState } from "react";
import { Copy, CheckCircle2, Volume2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

const BOT_AVATAR =
  "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&q=80&w=200&h=200";
const USER_AVATAR =
  "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=200&h=200";

export function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 简单文本转语音（使用浏览器 SpeechSynthesis）
  const handleSpeak = () => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(message.text);
      utterance.lang = "zh-CN";
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("flex w-full group gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      {/* 头像 */}
      <div
        className={cn(
          "w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden shrink-0 shadow-sm border",
          isUser ? "bg-black border-gray-800" : "bg-white border-gray-200"
        )}
      >
        <img
          src={isUser ? USER_AVATAR : BOT_AVATAR}
          alt={isUser ? "User" : "AI"}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* 气泡 */}
      <div
        className={cn(
          "max-w-[85%] md:max-w-[75%] p-3 md:p-4 rounded-xl md:rounded-2xl text-xs md:text-sm leading-relaxed relative",
          isUser
            ? "bg-black text-white rounded-tr-none shadow-lg"
            : message.isError
            ? "bg-red-50 border border-red-100 text-red-700 rounded-tl-none"
            : "bg-white border border-gray-100 text-gray-800 rounded-tl-none shadow-sm"
        )}
      >
        {/* 操作按钮（仅 AI 消息） */}
        {!isUser && !message.isError && (
          <div className="absolute -right-10 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-full bg-gray-100 text-gray-400 hover:text-black transition-colors"
              title="复制"
            >
              {copied ? (
                <CheckCircle2 className="w-3 h-3 text-green-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
            <button
              onClick={handleSpeak}
              className="p-1.5 rounded-full bg-gray-100 text-gray-400 hover:text-black transition-colors"
              title="朗读"
            >
              <Volume2 className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* 消息内容 */}
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.text}</div>
        ) : (
          <div className="markdown-body prose prose-sm max-w-none">
            <ReactMarkdown>{message.text}</ReactMarkdown>
          </div>
        )}
      </div>
    </motion.div>
  );
}
