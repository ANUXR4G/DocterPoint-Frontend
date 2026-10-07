import { api } from "./api";

export type CareChatMessage = {
  id: string;
  content: string;
  senderId: string;
  receiverId?: string | null;
  createdAt: string;
  type?: string | null;
};

export type CareChatThread = {
  peerId: string;
  name: string;
  role: string | null;
  lastMessage: string;
  lastAt: string;
  unread: number;
};

function normalizeMsg(raw: Record<string, unknown>): CareChatMessage {
  return {
    id: String(raw.idUuid || raw.id || ""),
    content: String(raw.content || ""),
    senderId: String(raw.senderId || raw.sender_id || ""),
    receiverId: (raw.receiverId ?? raw.receiver_id ?? null) as string | null,
    createdAt: String(
      raw.createdAt || raw.created_at || new Date().toISOString(),
    ),
    type: (raw.type as string | null) ?? "direct",
  };
}

export async function listCareThreads() {
  const res = await api<CareChatThread[]>("/chats/threads");
  if (res.status !== "successful") {
    return { error: res.message || "Failed to load threads", threads: [] as CareChatThread[] };
  }
  const data = Array.isArray(res.data) ? res.data : [];
  return {
    error: "",
    threads: data.map((t) => ({
      peerId: String(t.peerId),
      name: String(t.name || "Doctor"),
      role: t.role ?? null,
      lastMessage: String(t.lastMessage || ""),
      lastAt: String(t.lastAt || ""),
      unread: Number(t.unread || 0),
    })),
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
  const payload = res.data;
  const list = Array.isArray(payload?.messages) ? payload.messages : [];
  return {
    error: "",
    messages: list.map(normalizeMsg).reverse(),
  };
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
    };
  }
  return { error: "", message: normalizeMsg(res.data) };
}

/** Patient attaches a file to their visit and posts it in care chat. */
export async function attachPatientVisitDocument(
  bookingId: string,
  doc: { name: string; url: string; caption?: string },
) {
  const res = await api<{
    message?: Record<string, unknown>;
    document?: { name: string; url: string; uploadedAt?: string };
  }>(`/procto/bookings/${bookingId}/patient-document`, {
    method: "POST",
    body: JSON.stringify(doc),
  });
  if (res.status !== "successful" || !res.data) {
    return {
      error: res.message || "Could not attach document",
      message: null as CareChatMessage | null,
      document: null as { name: string; url: string; uploadedAt?: string } | null,
    };
  }
  const raw = res.data.message;
  return {
    error: "",
    message: raw ? normalizeMsg(raw) : null,
    document: res.data.document ?? null,
  };
}

export { normalizeMsg };
