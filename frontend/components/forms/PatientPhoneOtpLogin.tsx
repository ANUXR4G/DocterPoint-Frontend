"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { cookies } from "@/utils/cookies"
import { userService, type AuthResult } from "@/lib/services/user"
import { Button, IconInput } from "@/components"

export default function PatientPhoneOtpLogin() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackURL = searchParams.get("callback")

  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"phone" | "otp">("phone")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [hint, setHint] = useState("")
  const [debugOtp, setDebugOtp] = useState("")

  function finish(data: AuthResult) {
    if (data.status === "unsuccessful" || !data.role) {
      setError(data.message || "Login failed")
      return
    }
    if (data.access_token || data.token) {
      cookies.setCookie(
        "access_token",
        String(data.access_token || data.token),
        60 * 60 * 24,
      )
    }
    if (data.refresh_token) {
      cookies.setCookie("refresh_token", data.refresh_token, 60 * 60 * 24 * 7)
    }

    if (callbackURL) {
      const base = (process.env.NEXT_PUBLIC_URL || "").replace(/\/$/, "")
      const path = callbackURL.startsWith("/")
        ? callbackURL
        : `/${callbackURL}`
      router.push(`${base}${path}`)
      return
    }

    if (!data.name && !data.date_of_birth) {
      router.push("/patient/profile")
    } else {
      router.push("/patient/dashboard")
    }
  }

  async function requestOtp() {
    setBusy(true)
    setError("")
    setDebugOtp("")
    try {
      const res = await userService.requestPhoneOtp(phone.trim())
      if (res.status !== "successful") {
        setError(res.message || "Could not send OTP")
        return
      }
      setHint(`Code sent on WhatsApp from +91 ${res.from || "9990052082"}`)
      if (res.debugOtp) setDebugOtp(res.debugOtp)
      setStep("otp")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send OTP")
    } finally {
      setBusy(false)
    }
  }

  async function verifyOtp() {
    setBusy(true)
    setError("")
    try {
      const res = await userService.verifyPhoneOtp(phone.trim(), code.trim())
      finish(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-4 text-left">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Patient login uses your mobile number. GlucoGuide sends a one-time code
        on WhatsApp from{" "}
        <span className="font-semibold">+91 99900 52082</span>.
      </p>

      {step === "phone" ? (
        <>
          <IconInput
            icon="phone"
            name="phone"
            label="Mobile number"
            value={phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setPhone(e.target.value)
            }
            placeholder="10-digit mobile"
          />
          {error ? (
            <p className="text-sm font-medium text-rose-600">{error}</p>
          ) : null}
          <Button
            typeBtn="button"
            disabled={busy || phone.replace(/\D/g, "").length < 10}
            onClick={() => void requestOtp()}
          >
            {busy ? "Sending…" : "Send WhatsApp OTP"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500">{hint}</p>
          {debugOtp ? (
            <p className="text-xs font-semibold text-sky-700">
              Dev code: {debugOtp}
            </p>
          ) : null}
          <IconInput
            icon="key"
            name="otp"
            label="OTP"
            value={code}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCode(e.target.value)
            }
            placeholder="6-digit code"
          />
          {error ? (
            <p className="text-sm font-medium text-rose-600">{error}</p>
          ) : null}
          <Button
            typeBtn="button"
            disabled={busy || code.replace(/\D/g, "").length < 6}
            onClick={() => void verifyOtp()}
          >
            {busy ? "Verifying…" : "Verify & continue"}
          </Button>
          <button
            type="button"
            className="text-sm font-medium text-sky-700"
            onClick={() => {
              setStep("phone")
              setCode("")
              setError("")
            }}
          >
            Change number
          </button>
          <button
            type="button"
            className="text-sm font-medium text-sky-700"
            onClick={() => void requestOtp()}
          >
            Resend code
          </button>
        </>
      )}

      <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
        Doctor login?{" "}
        <Link
          href="/login/doctor"
          className="font-semibold text-blue-600 hover:underline dark:text-sky-400"
        >
          Go there
        </Link>
      </p>
    </div>
  )
}
