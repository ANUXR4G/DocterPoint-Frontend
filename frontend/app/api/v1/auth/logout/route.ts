import { NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3001"

export async function POST() {
  try {
    await fetch(`${BACKEND_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
  } catch {
    // Backend may be stopped; still clear cookies on the frontend origin.
  }

  const response = NextResponse.json({
    status: "successful",
    message: "logged out",
  })

  response.cookies.set("access_token", "", {
    maxAge: 0,
    path: "/",
    sameSite: "lax",
  })
  response.cookies.set("refresh_token", "", {
    maxAge: 0,
    path: "/",
    sameSite: "lax",
  })

  return response
}
