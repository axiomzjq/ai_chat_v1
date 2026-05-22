import { PanelLeft, Trash2, MessageSquare } from "lucide-react";
import { cn } from "../lib/utils";

export function ChatHeader({
  title,
  messageCount,
  onToggleSidebar,
  onClear,
  sidebarOpen,
}) {
  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className={cn(
            "p-2 rounded-xl transition-colors",
            sidebarOpen
              ? "bg-gray-100 text-black"
              : "text-gray-400 hover:text-black hover:bg-gray-50"
          )}
          title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
        >
          <PanelLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <MessageSquare className="text-white w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight truncate max-w-[180px] md:max-w-md">
              {title}
            </h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              {messageCount > 0 ? `${messageCount} 条消息` : "准备就绪"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {messageCount > 0 && (
          <button
            onClick={() => {
              if (confirm("确定清空当前会话的所有消息吗？")) {
                onClear();
              }
            }}
            className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="清空会话"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
