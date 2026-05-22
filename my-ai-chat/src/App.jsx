import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useChat } from "./hooks/useChat";
import { Sidebar } from "./components/Sidebar";
import { ChatHeader } from "./components/ChatHeader";
import { MessageList } from "./components/MessageList";
import { ChatInput } from "./components/ChatInput";
import { WelcomeScreen } from "./components/WelcomeScreen";

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const {
    sessions,
    currentSessionId,
    currentSession,
    isTyping,
    createSession,
    deleteSession,
    renameSession,
    switchSession,
    sendMessage,
    clearCurrentSession,
  } = useChat();

  const handleSuggestionClick = (text) => {
    sendMessage(text);
  };

  return (
    <div className="h-screen w-screen bg-[#F8F9FA] text-black font-sans selection:bg-black selection:text-white flex overflow-hidden">
      {/* 侧边栏 */}
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSwitch={switchSession}
        onCreate={createSession}
        onDelete={deleteSession}
        onRename={renameSession}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* 主聊天区 */}
      <main className="flex-1 flex flex-col min-w-0 bg-white md:rounded-2xl md:my-3 md:mr-3 md:border md:border-gray-100 md:shadow-xl md:shadow-gray-200/50 overflow-hidden">
        <ChatHeader
          title={currentSession?.title || "新对话"}
          messageCount={currentSession?.messages?.length || 0}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onClear={clearCurrentSession}
          sidebarOpen={sidebarOpen}
        />

        {currentSession?.messages?.length === 0 && !isTyping ? (
          <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
        ) : (
          <MessageList messages={currentSession?.messages || []} isTyping={isTyping} />
        )}

        <ChatInput onSend={sendMessage} isTyping={isTyping} />
      </main>
    </div>
  );
}

export default App;
