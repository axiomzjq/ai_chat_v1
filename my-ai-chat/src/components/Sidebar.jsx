import { useState } from "react";
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn, formatTime } from "../lib/utils";

export function Sidebar({
  sessions,
  currentSessionId,
  onSwitch,
  onCreate,
  onDelete,
  onRename,
  isOpen,
  onToggle,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");

  const handleStartEdit = (session) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const handleConfirmEdit = () => {
    if (editingId && editTitle.trim()) {
      onRename(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleConfirmEdit();
    if (e.key === "Escape") setEditingId(null);
  };

  return (
    <>
      {/* 移动端遮罩 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        className={cn(
          "fixed md:relative z-50 h-full bg-white border-r border-gray-100 flex flex-col transition-all duration-300",
          isOpen ? "w-[280px] translate-x-0" : "w-0 -translate-x-full md:w-0 md:translate-x-0 overflow-hidden"
        )}
      >
        {/* 头部 */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-xl flex items-center justify-center">
              <MessageSquare className="text-white w-4 h-4" />
            </div>
            <span className="font-bold text-sm tracking-tight">AI Chat</span>
          </div>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition-colors md:hidden"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* 新建按钮 */}
        <div className="p-3">
          <button
            onClick={onCreate}
            className="w-full flex items-center justify-center gap-2 bg-black text-white py-3 rounded-xl font-bold text-xs hover:bg-gray-800 transition-all shadow-lg shadow-black/10"
          >
            <Plus className="w-4 h-4" />
            新建对话
          </button>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2 mb-2">
            历史会话
          </p>
          {sessions.map((session) => {
            const isActive = session.id === currentSessionId;
            const isEditing = editingId === session.id;

            return (
              <div
                key={session.id}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all cursor-pointer",
                  isActive
                    ? "bg-gray-100 text-black"
                    : "text-gray-600 hover:bg-gray-50"
                )}
                onClick={() => onSwitch(session.id)}
              >
                <MessageSquare className="w-4 h-4 shrink-0 text-gray-400" />

                {isEditing ? (
                  <div className="flex-1 flex items-center gap-1 min-w-0">
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={handleConfirmEdit}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-black min-w-0"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfirmEdit();
                      }}
                      className="p-1 rounded text-gray-400 hover:text-black"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                      className="p-1 rounded text-gray-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-xs font-medium truncate min-w-0">
                      {session.title}
                    </span>
                    <span className="text-[10px] text-gray-300 shrink-0 hidden group-hover:block">
                      {formatTime(session.updatedAt)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(session);
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 text-gray-300 hover:text-black transition-opacity"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("确定删除该会话吗？")) {
                          onDelete(session.id);
                        }
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
