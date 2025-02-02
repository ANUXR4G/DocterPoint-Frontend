async function getUserHelpChats(
  token: string,
  user_id: string,
  params: string
) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/chats/user/${user_id}?${params}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error("Failed to retrieve user chats.")
  }

  return response.json()
}

export const chatService = {
  getUserHelpChats,
}
