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

async function profile(token: string) {
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

async function logout() {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API}/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    throw new Error("unable to log out rn, try again later!")
  }

  return response.json()
}

export const userService = {
  login,
  signup,
  profile,
  logout,
}
