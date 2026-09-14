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
  return api<{ reply: string; provider?: string; mode?: string }>(
    "/assistant/chat",
    {
      method: "POST",
      body: JSON.stringify({ message, history }),
    },
  );
}
