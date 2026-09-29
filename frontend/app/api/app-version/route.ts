import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/** Build id of the deployment serving this request (open tabs compare it to their own). */
export function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "" },
    { headers: { "Cache-Control": "no-store" } },
  )
}
