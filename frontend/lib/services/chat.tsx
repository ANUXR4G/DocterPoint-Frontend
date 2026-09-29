import { cookies } from "@/utils/cookies"
import { firey } from "@/utils"
import { ensureAccessToken } from "@/lib/accessToken"

const base =
  typeof window !== "undefined"
    ? "/api/v1"
    : (process.env.NEXT_PUBLIC_API ?? "http://localhost:3000/api/v1")

const CHAT_FETCH_TIMEOUT_MS = 12_000

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHAT_FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch {
    throw new Error(
      controller.signal.aborted
        ? "The server took too long to respond."
        : "You appear to be offline. Check your connection.",
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Authenticated JSON request: fresh access token first, one forced refresh +
 * retry on 401 (same contract as `proctoFetch`). Throws with the server message.
 */
async function chatFetch(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  token?: string,
) {
  const send = (access: string) =>
    fetchWithTimeout(`${base}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
    })

  let res = await send((await ensureAccessToken()) || token || "")
  if (res.status === 401 && cookies.getCookie("refresh_token")) {
    cookies.deleteCookie("access_token")
    const retryToken = await ensureAccessToken()
    if (retryToken) res = await send(retryToken)
  }

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Your session expired. Sign in again to use chat.")
    }
    throw new Error(json?.message || fallbackMessage)
  }
  return json
}

async function getUserHelpChats(token: string, userId: string, params: string) {
  return chatFetch(
    `/chats/user/${userId}?${params}`,
    { method: "GET" },
    "Failed to retrieve user help messages.",
    token,
  )
}

async function getUserDirectChats(
  token: string,
  userId: string,
  receiverId: string,
  params: string,
) {
  return chatFetch(
    `/chats/${userId}/${receiverId}?${params}`,
    { method: "GET" },
    "Failed to retrieve user direct messages.",
    token,
  )
}

async function sendHelpMessage(token: string, userId: string, content: string) {
  return chatFetch(
    `/chats/user/${userId}/help`,
    { method: "POST", body: JSON.stringify({ content }) },
    "Failed to send help message.",
    token,
  )
}

async function sendDirectMessage(receiverId: string, content: string) {
  const json = await chatFetch(
    "/chats/direct",
    { method: "POST", body: JSON.stringify({ receiverId, content }) },
    "Failed to send message.",
  )
  return firey.convertKeysToCamelCase(json?.data ?? json)
}

async function listThreads() {
  const json = await chatFetch(
    "/chats/threads",
    { method: "GET" },
    "Failed to load chat threads.",
  )
  return firey.convertKeysToCamelCase(json)
}

export const chatService = {
  getUserHelpChats,
  getUserDirectChats,
  sendHelpMessage,
  sendDirectMessage,
  listThreads,
}
