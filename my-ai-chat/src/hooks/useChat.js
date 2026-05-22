import { useState, useEffect, useCallback } from "react";
import { generateId, formatTime } from "../lib/utils";
import { sendMessageToAI } from "../services/aiService";

const STORAGE_KEY = "my-ai-chat-sessions";

function createDefaultSession() {
  return {
    id: generateId(),
    title: "新对话",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return [createDefaultSession()];
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

/**
 * 聊天状态管理 Hook
 * 管理会话列表、当前会话、消息发送、本地持久化
 */
export function useChat() {
  const [sessions, setSessions] = useState(() => loadSessions());
  const [currentSessionId, setCurrentSessionId] = useState(sessions[0]?.id);
  const [isTyping, setIsTyping] = useState(false);

  const currentSession = sessions.find((s) => s.id === currentSessionId) || sessions[0];

  // 持久化
  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  const createSession = useCallback(() => {
    const newSession = createDefaultSession();
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    return newSession.id;
  }, []);

  const deleteSession = useCallback(
    (id) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (next.length === 0) {
          const empty = createDefaultSession();
          next.push(empty);
          setCurrentSessionId(empty.id);
        } else if (currentSessionId === id) {
          setCurrentSessionId(next[0].id);
        }
        return next;
      });
    },
    [currentSessionId]
  );

  const renameSession = useCallback((id, title) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title, updatedAt: Date.now() } : s))
    );
  }, []);

  const switchSession = useCallback((id) => {
    setCurrentSessionId(id);
  }, []);

  const sendMessage = useCallback(
    async (text, fileContent = "") => {
      if (!text.trim() && !fileContent) return;

      const fullText = fileContent ? `${text}\n\n[上传文件内容]\n${fileContent}` : text;

      const userMessage = {
        id: generateId(),
        role: "user",
        text: fullText,
        timestamp: Date.now(),
      };

      // 添加用户消息
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                messages: [...s.messages, userMessage],
                updatedAt: Date.now(),
                title: s.messages.length === 0 ? text.slice(0, 20) || "新对话" : s.title,
              }
            : s
        )
      );

      setIsTyping(true);

      try {
        const history = currentSession.messages.map((m) => ({
          role: m.role,
          text: m.text,
        }));

        const replyText = await sendMessageToAI(history, fullText);

        const assistantMessage = {
          id: generateId(),
          role: "model",
          text: replyText,
          timestamp: Date.now(),
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? {
                  ...s,
                  messages: [...s.messages, userMessage, assistantMessage],
                  updatedAt: Date.now(),
                }
              : s
          )
        );
      } catch (error) {
        console.error("AI 回复失败:", error);
        const errorMessage = {
          id: generateId(),
          role: "model",
          text: "抱歉，我遇到了一些问题，请稍后再试。",
          timestamp: Date.now(),
          isError: true,
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? { ...s, messages: [...s.messages, userMessage, errorMessage] }
              : s
          )
        );
      } finally {
        setIsTyping(false);
      }
    },
    [currentSessionId, currentSession]
  );

  const clearCurrentSession = useCallback(() => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? { ...s, messages: [], title: "新对话", updatedAt: Date.now() }
          : s
      )
    );
  }, [currentSessionId]);

  return {
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
    formatTime,
  };
}
