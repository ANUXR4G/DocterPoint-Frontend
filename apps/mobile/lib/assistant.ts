import { api } from "@/lib/api";

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string | null;
};

export type AssistantConversationDetail = {
  id: string;
  title: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>;
};

export async function assistantStatus() {
  return api<{ available: boolean; mode: string; speechServer?: boolean }>(
    "/assistant/status",
  );
}

export async function assistantChat(
  message: string,
  history: AssistantChatMessage[],
  conversationId?: string | null,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    return await api<{
      reply: string;
      provider?: string;
      mode?: string;
      conversationId?: string | null;
      title?: string | null;
    }>("/assistant/chat", {
      method: "POST",
      body: JSON.stringify({ message, history, conversationId: conversationId ?? null }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function listAssistantConversations() {
  return api<AssistantConversationSummary[]>("/assistant/conversations");
}

export async function getAssistantConversation(id: string) {
  return api<AssistantConversationDetail>(`/assistant/conversations/${id}`);
}

export async function createAssistantConversation(title?: string) {
  return api<{ id: string; title: string }>("/assistant/conversations", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function deleteAssistantConversation(id: string) {
  return api<{ ok: boolean }>(`/assistant/conversations/${id}`, {
    method: "DELETE",
  });
}
