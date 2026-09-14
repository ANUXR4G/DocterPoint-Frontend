import { api } from "@/lib/api";
import { assistantStatus } from "@/lib/assistant";

let serverSttCache: boolean | null = null;

export function clearServerSpeechCache() {
  serverSttCache = null;
}

export async function isServerSpeechAvailable(force = false): Promise<boolean> {
  if (!force && serverSttCache !== null) return serverSttCache;
  try {
    const res = await assistantStatus();
    serverSttCache = Boolean(res.data?.speechServer);
  } catch {
    serverSttCache = false;
  }
  return serverSttCache;
}

export async function transcribeAudioBase64(
  base64: string,
  mimeType: string,
): Promise<{ text: string } | { error: string }> {
  const res = await api<{ text?: string }>("/assistant/transcribe", {
    method: "POST",
    body: JSON.stringify({ audioBase64: base64, mimeType }),
  });

  if (res.status !== "successful") {
    return { error: res.message || "Transcription failed." };
  }

  const text = res.data?.text?.trim();
  if (!text) return { error: "No speech detected. Try again." };
  return { text };
}
