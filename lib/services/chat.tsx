import { cookies } from "@/utils/cookies"
import { firey } from "@/utils"

const base =
  process.env.NEXT_PUBLIC_API ?? "http://localhost:3000/api/v1"

async function authHeaders(token?: string): Promise<HeadersInit> {
  const access =
    token ||
    cookies.getCookie("access_token") ||
    cookies.getCookie("refresh_token") ||
    ""
  return {
    "Content-Type": "application/json",
    ...(access ? { Authorization: `Bearer ${access}` } : {}),
  }
}

async function getUserHelpChats(token: string, userId: string, params: string) {
  const response = await fetch(`${base}/chats/user/${userId}?${params}`, {
    method: "GET",
    credentials: "include",
    headers: await authHeaders(token),
  })

  if (!response.ok) {
    throw new Error("Failed to retrieve user help messages.")
  }

  return response.json()
}

async function getUserDirectChats(
  token: string,
  userId: string,
  receiverId: string,
  params: string,
) {
  const response = await fetch(
    `${base}/chats/${userId}/${receiverId}?${params}`,
    {
      method: "GET",
      credentials: "include",
      headers: await authHeaders(token),
    },
  )

  if (!response.ok) {
    throw new Error("Failed to retrieve user direct messages.")
  }

  return response.json()
}

async function sendHelpMessage(token: string, userId: string, content: string) {
  const response = await fetch(`${base}/chats/user/${userId}/help`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(token),
    body: JSON.stringify({ content }),
  })

  if (!response.ok) {
    throw new Error("Failed to send help message.")
  }

  return response.json()
}

async function sendDirectMessage(receiverId: string, content: string) {
  const response = await fetch(`${base}/chats/direct`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
    body: JSON.stringify({ receiverId, content }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(json?.message || "Failed to send message.")
  }
  return firey.convertKeysToCamelCase(json?.data ?? json)
}

async function listThreads() {
  const response = await fetch(`${base}/chats/threads`, {
    method: "GET",
    credentials: "include",
    headers: await authHeaders(),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(json?.message || "Failed to load chat threads.")
  }
  return firey.convertKeysToCamelCase(json)
}

export const chatService = {
  getUserHelpChats,
  getUserDirectChats,
  sendHelpMessage,
  sendDirectMessage,
  listThreads,
}
