import { api } from "@/lib/api";

export type CareChatMessage = {
  id: string;
  content: string;
  senderId: string;
  receiverId?: string | null;
  createdAt: string;
  type?: string | null;
};

/** Prefer real UUIDs over legacy base64 chat ids. */
function pickUuid(...candidates: unknown[]): string {
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    ) {
      return s;
    }
  }
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
  return "";
}

export function normalizeMsg(raw: Record<string, unknown>): CareChatMessage {
  return {
    id: pickUuid(raw.idUuid, raw.id),
    content: String(raw.content || ""),
    senderId: pickUuid(raw.senderId, raw.sender_id),
    receiverId:
      pickUuid(raw.receiverId, raw.receiver_id) || null,
    createdAt: String(
      raw.createdAt || raw.created_at || new Date().toISOString(),
    ),
    type: (raw.type as string | null) ?? "direct",
  };
}

export async function getCareMessages(
  selfUserId: string,
  peerUserId: string,
  opts?: { bookingId?: string | null },
) {
  const params = new URLSearchParams({ page: "1", limit: "50" });
  if (opts?.bookingId) params.set("bookingId", opts.bookingId);
  const res = await api<{ messages?: Record<string, unknown>[]; total?: number }>(
    `/chats/${selfUserId}/${peerUserId}?${params.toString()}`,
  );
  if (res.status !== "successful") {
    return {
      error: res.message || "Failed to load messages",
      messages: [] as CareChatMessage[],
    };
  }
  // GET /chats/:a/:b returns { total, messages } — api() may wrap as data.
  const payload = (res.data ?? {}) as {
    messages?: Record<string, unknown>[];
  };
  const topLevel = res as unknown as { messages?: Record<string, unknown>[] };
  const list = Array.isArray(payload.messages)
    ? payload.messages
    : Array.isArray(topLevel.messages)
      ? topLevel.messages
      : [];
  return { error: "", messages: list.map(normalizeMsg).reverse() };
}

export async function sendCareMessage(peerUserId: string, content: string) {
  const res = await api<Record<string, unknown>>("/chats/direct", {
    method: "POST",
    body: JSON.stringify({ receiverId: peerUserId, content }),
  });
  if (res.status !== "successful" || !res.data) {
    return {
      error: res.message || "Failed to send",
      message: null as CareChatMessage | null,
      whatsapp: null as { status?: string; error?: string } | null,
    };
  }
  const whatsapp =
    res.data.whatsapp && typeof res.data.whatsapp === "object"
      ? (res.data.whatsapp as { status?: string; error?: string })
      : null;
  return { error: "", message: normalizeMsg(res.data), whatsapp };
}
