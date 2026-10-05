import { api } from "@/lib/api";

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function assistantStatus() {
  return api<{ available: boolean; mode: string; speechServer?: boolean }>(
    "/assistant/status",
  );
}

export async function assistantChat(
  message: string,
  history: AssistantChatMessage[],
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    return await api<{ reply: string; provider?: string; mode?: string }>(
      "/assistant/chat",
      {
        method: "POST",
        body: JSON.stringify({ message, history }),
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timer);
  }
}
