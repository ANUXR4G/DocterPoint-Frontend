async function getUserHelpChats(token: string, userId: string, params: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/chats/user/${userId}?${params}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error("Failed to retrieve user help messages.")
  }

  return response.json()
}

async function getUserDirectChats(
  token: string,
  userId: string,
  receiverId: string,
  params: string
) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/chats/${userId}/${receiverId}?${params}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error("Failed to retrieve user direct messages.")
  }

  return response.json()
}

export const chatService = {
  getUserHelpChats,
  getUserDirectChats,
}
