import { AuthValueType, User } from "@/types"

async function login(values: AuthValueType) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    })

    return response.json()
  } catch (error) {
    console.log(error)
  }
}

async function signup(values: AuthValueType) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API}/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    })

    return response.json()
  } catch (error) {
    console.log(error)
  }
}

async function profile(token: string | null): Promise<User | null> {
  if (!token) return null
  const respose = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/patient/profile`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!respose.ok) {
    throw new Error(`Failed to fetch user data`)
  }

  return respose.json()
}

export const userService = {
  login,
  signup,
  profile,
}
