"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type EmbeddedSignupSession = {
  wabaId?: string
  phoneNumberId?: string
  finished: boolean
  error?: string
}

type LaunchOptions = {
  appId: string
  configId: string
  apiVersion: string
  coexistenceFlow?: boolean
}

declare global {
  interface Window {
    FB?: {
      init: (opts: {
        appId: string
        cookie: boolean
        xfbml: boolean
        version: string
      }) => void
      login: (
        cb: (response: { authResponse?: { code?: string } }) => void,
        opts: Record<string, unknown>,
      ) => void
    }
    fbAsyncInit?: () => void
  }
}

function loadFacebookSdk(appId: string, apiVersion: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"))
  if (window.FB) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const version = apiVersion.startsWith("v") ? apiVersion : `v${apiVersion}`

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        cookie: true,
        xfbml: true,
        version,
      })
      resolve()
    }

    if (document.getElementById("facebook-jssdk")) {
      const wait = setInterval(() => {
        if (window.FB) {
          clearInterval(wait)
          resolve()
        }
      }, 100)
      setTimeout(() => {
        clearInterval(wait)
        if (!window.FB) reject(new Error("Facebook SDK failed to load"))
      }, 10000)
      return
    }

    const script = document.createElement("script")
    script.id = "facebook-jssdk"
    script.async = true
    script.defer = true
    script.src = "https://connect.facebook.net/en_US/sdk.js"
    script.onerror = () => reject(new Error("Could not load Facebook SDK"))
    document.body.appendChild(script)
  })
}

function waitForEmbeddedSignupFinish(
  getSession: () => EmbeddedSignupSession,
  timeoutMs = 15000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = setInterval(() => {
      const s = getSession()
      if (s.finished) {
        clearInterval(tick)
        if (s.error) reject(new Error(s.error))
        else resolve()
        return
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(tick)
        if (s.wabaId || s.phoneNumberId) resolve()
        else reject(new Error("Meta Embedded Signup timed out — try again."))
      }
    }, 200)
  })
}

export function useMetaEmbeddedSignup() {
  const sessionRef = useRef<EmbeddedSignupSession>({ finished: false })
  const [listening, setListening] = useState(false)

  useEffect(() => {
    if (listening) return

    const handler = (event: MessageEvent) => {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      ) {
        return
      }
      try {
        const raw =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data
        if (!raw || raw.type !== "WA_EMBEDDED_SIGNUP") return

        const eventName = String(raw.event ?? "").toUpperCase()
        if (raw.data?.waba_id) {
          sessionRef.current.wabaId = String(raw.data.waba_id)
        }
        if (raw.data?.phone_number_id) {
          sessionRef.current.phoneNumberId = String(raw.data.phone_number_id)
        }

        if (eventName === "FINISH" || eventName === "FINISH_ONLY_WABA") {
          sessionRef.current.finished = true
        }
        if (eventName === "CANCEL") {
          sessionRef.current.finished = true
          sessionRef.current.error =
            raw.data?.error_message ?? "Meta signup was cancelled."
        }
        if (eventName === "ERROR") {
          sessionRef.current.finished = true
          sessionRef.current.error =
            raw.data?.error_message ?? "Meta Embedded Signup failed."
        }
      } catch {
        // ignore non-JSON postMessages
      }
    }

    window.addEventListener("message", handler)
    setListening(true)
    return () => window.removeEventListener("message", handler)
  }, [listening])

  const launchEmbeddedSignup = useCallback(
    async (opts: LaunchOptions): Promise<{
      oauthCode?: string
      wabaId?: string
      phoneNumberId?: string
    }> => {
      sessionRef.current = { finished: false }
      await loadFacebookSdk(opts.appId, opts.apiVersion)

      const oauthCode = await new Promise<string | undefined>((resolve, reject) => {
        window.FB?.login(
          (response) => {
            if (response.authResponse?.code) {
              resolve(response.authResponse.code)
              return
            }
            reject(new Error("Meta login was cancelled or did not return a code."))
          },
          {
            config_id: opts.configId,
            response_type: "code",
            override_default_response_type: true,
            extras: opts.coexistenceFlow
              ? {
                  setup: {},
                  featureType: "whatsapp_business_app_onboarding",
                  sessionInfoVersion: "3",
                }
              : {
                  setup: {},
                  sessionInfoVersion: "3",
                },
          },
        )
      })

      await waitForEmbeddedSignupFinish(() => sessionRef.current)

      return {
        oauthCode,
        wabaId: sessionRef.current.wabaId,
        phoneNumberId: sessionRef.current.phoneNumberId,
      }
    },
    [],
  )

  return { launchEmbeddedSignup }
}
