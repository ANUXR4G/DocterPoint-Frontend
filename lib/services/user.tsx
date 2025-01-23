import { AuthValueType } from "@/types"

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

async function profile(token: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/profile`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`failed to fetch patient profile.`)
  }

  return response.json()
}

async function update(token: string, payload: Record<string, unknown>) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/profile`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  )

  if (!response.ok) {
    throw new Error(`failed to update patient information.`)
  }

  return response.json()
}

async function logout() {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API}/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    throw new Error("failed to log out rn, try again later.")
  }
}

export const userService = {
  login,
  signup,
  profile,
  update,
  logout,
}
