import { readJson } from "@/lib/readJson"

export type AssistantChatMessage = {
  role: "user" | "assistant"
  content: string
}

export type AssistantConversationSummary = {
  id: string
  title: string
  updatedAt: string
  preview: string | null
}

export type AssistantConversationDetail = {
  id: string
  title: string
  updatedAt: string
  messages: Array<{
    id: string
    role: "user" | "assistant"
    content: string
    createdAt: string
  }>
}

async function status() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API}/assistant/status`, {
    credentials: "include",
  })
  return readJson<{
    status: string
    data?: { available: boolean; mode: string }
  }>(res, { status: "unsuccessful", data: { available: false, mode: "qa" } })
}

async function chat(
  message: string,
  history: AssistantChatMessage[],
  conversationId?: string | null,
) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API}/assistant/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history,
      conversationId: conversationId ?? null,
    }),
  })
  return readJson<{
    status: string
    message?: string
    data?: {
      reply: string
      provider: string
      mode: string
      conversationId?: string | null
      title?: string | null
    }
  }>(res, {
    status: "unsuccessful",
    message: "Assistant unavailable. Is the API running?",
  })
}

async function listConversations() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API}/assistant/conversations`,
    { credentials: "include" },
  )
  return readJson<{
    status: string
    message?: string
    data?: AssistantConversationSummary[]
  }>(res, { status: "unsuccessful", data: [] })
}

async function getConversation(id: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API}/assistant/conversations/${id}`,
    { credentials: "include" },
  )
  return readJson<{
    status: string
    message?: string
    data?: AssistantConversationDetail
  }>(res, { status: "unsuccessful" })
}

async function createConversation(title?: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API}/assistant/conversations`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
  )
  return readJson<{
    status: string
    message?: string
    data?: { id: string; title: string }
  }>(res, { status: "unsuccessful" })
}

async function deleteConversation(id: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API}/assistant/conversations/${id}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  )
  return readJson<{ status: string; message?: string; data?: { ok: boolean } }>(
    res,
    { status: "unsuccessful" },
  )
}

export const assistantService = {
  status,
  chat,
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
}
