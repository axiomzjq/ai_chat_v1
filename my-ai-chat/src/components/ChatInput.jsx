import { useState, useRef, useCallback } from "react";
import { Send, Mic, MicOff, Paperclip, X, FileText } from "lucide-react";
import { cn } from "../lib/utils";

export function ChatInput({ onSend, isTyping }) {
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  // 初始化语音识别
  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "zh-CN";

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => prev + transcript);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      const rec = recognitionRef.current || initSpeechRecognition();
      if (!rec) {
        alert("您的浏览器不支持语音识别功能");
        return;
      }
      recognitionRef.current = rec;
      try {
        rec.start();
        setIsListening(true);
      } catch {
        alert("无法启动语音识别");
      }
    }
  };

  const handleSend = () => {
    if (isTyping) return;
    const text = input.trim();
    const fileContent = attachedFile?.content || "";

    if (!text && !fileContent) return;

    onSend(text, fileContent);
    setInput("");
    setAttachedFile(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isText = file.type.includes("text") || file.name.endsWith(".md") || file.name.endsWith(".txt");
    const maxSize = 2 * 1024 * 1024; // 2MB

    if (!isText) {
      alert("目前仅支持 .txt 和 .md 文件");
      return;
    }
    if (file.size > maxSize) {
      alert("文件大小不能超过 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setAttachedFile({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + "KB",
        content: event.target.result,
      });
    };
    reader.readAsText(file);

    // 清空 input 以便可以重复选择同一文件
    e.target.value = "";
  };

  return (
    <div className="p-4 md:p-6 bg-white border-t border-gray-100">
      {/* 附件预览 */}
      {attachedFile && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100 w-fit">
          <FileText className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-600">{attachedFile.name}</span>
          <span className="text-[10px] text-gray-400">({attachedFile.size})</span>
          <button
            onClick={() => setAttachedFile(null)}
            className="p-0.5 rounded text-gray-400 hover:text-red-500 ml-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 输入区域 */}
      <div className="relative flex items-end gap-2 max-w-4xl mx-auto">
        {/* 附件按钮 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "p-3 rounded-xl transition-colors shrink-0 mb-1",
            attachedFile
              ? "bg-black text-white"
              : "bg-gray-50 text-gray-400 hover:text-black hover:bg-gray-100"
          )}
          title="上传文件"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".txt,.md"
          className="hidden"
        />

        {/* 文本输入 */}
        <div className="relative flex-1">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，按 Enter 发送..."
            rows={1}
            className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 pr-24 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all resize-none text-sm leading-relaxed min-h-[48px] max-h-[160px]"
            style={{ height: "auto" }}
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
          />

          {/* 语音按钮 */}
          <button
            onClick={toggleListening}
            className={cn(
              "absolute right-12 bottom-2 p-2 rounded-lg transition-all",
              isListening
                ? "text-red-500 bg-red-50 animate-pulse"
                : "text-gray-400 hover:text-black"
            )}
            title={isListening ? "正在倾听..." : "语音输入"}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* 发送按钮 */}
          <button
            onClick={handleSend}
            disabled={isTyping || (!input.trim() && !attachedFile)}
            className="absolute right-2 bottom-2 p-2 bg-black text-white rounded-xl hover:bg-gray-800 disabled:bg-gray-200 transition-all shadow-md"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      <p className="text-[10px] text-gray-300 mt-2 text-center uppercase tracking-widest font-medium">
        AI 生成的内容仅供参考
      </p>
    </div>
  );
}
