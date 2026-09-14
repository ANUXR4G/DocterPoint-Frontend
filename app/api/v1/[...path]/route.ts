import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3001"

function jsonError(status: number, message: string) {
  return NextResponse.json(
    { status: "unsuccessful", message },
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  )
}

async function proxyToBackend(
  request: NextRequest,
  pathSegments: string[],
) {
  const path = pathSegments.join("/")
  const target = `${BACKEND_URL}/api/v1/${path}${request.nextUrl.search}`

  const headers = new Headers()
  const authorization = request.headers.get("authorization")
  if (authorization) headers.set("Authorization", authorization)

  const contentType = request.headers.get("content-type")
  if (contentType) headers.set("Content-Type", contentType)

  const cookie = request.headers.get("cookie")
  if (cookie) headers.set("Cookie", cookie)

  let body: string | undefined
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text()
  }

  let backendResponse: Response
  try {
    backendResponse = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    })
  } catch (error) {
    console.error("[api proxy] backend unreachable:", target, error)
    return jsonError(502, "Backend unavailable. Is the API running? Try: cd backend && yarn dev (default PORT=3002 in backend/.env when 3001 is in use).")
  }

  const responseHeaders = new Headers()
  const responseType = backendResponse.headers.get("content-type")
  if (responseType) responseHeaders.set("Content-Type", responseType)

  const responseBody = await backendResponse.text()
  const response = new NextResponse(responseBody, {
    status: backendResponse.status,
    headers: responseHeaders,
  })

  const setCookies = backendResponse.headers.getSetCookie?.() ?? []
  for (const setCookie of setCookies) {
    response.headers.append("Set-Cookie", setCookie)
  }

  return response
}

type RouteContext = { params: Promise<{ path: string[] }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  return proxyToBackend(request, path)
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  return proxyToBackend(request, path)
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  return proxyToBackend(request, path)
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  return proxyToBackend(request, path)
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  return proxyToBackend(request, path)
}
