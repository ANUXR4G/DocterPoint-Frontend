"use client"

import Link from "next/link"
import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useMutation } from "react-query"
import { useRouter, useSearchParams } from "next/navigation"
import { firey } from "@/utils"
import { cookies } from "@/utils/cookies"
import { userService } from "@/lib/services/user"
import {
  PORTAL_COOKIE,
  type ProviderPortal,
} from "@/lib/providerPortal"
import { validations } from "@/utils/validations"
import { AuthValues, AuthValueType } from "@/types"
import { useForm } from "@/hooks/useForm"
import { IconInput, Button, Icon } from "@/components"
import { GoogleButton } from "@/components/buttons/GoogleButton"
import ClinicRegisterForm from "@/components/forms/ClinicRegisterForm"
import DoctorRegisterForm from "@/components/forms/DoctorRegisterForm"
import PatientRegisterForm from "@/components/forms/PatientRegisterForm"
import PatientPhoneOtpLogin from "@/components/forms/PatientPhoneOtpLogin"

export type AuthAudience = "patient" | "doctor" | "clinic" | "admin"
export type AuthMode = "login" | "register"

type RoleAuthFormProps = {
  audience: AuthAudience
  initialMode?: AuthMode
  onModeChange?: (mode: AuthMode) => void
  compact?: boolean
}

const COPY: Record<
  AuthAudience,
  {
    title: string
    subtitle: string
    registerHint: string
    registerTab: string
    registerCta: string
    nameLabel: string
    otherLabel: string
    otherHref: string
    altLabel?: string
    altHref?: string
    role: "user" | "doctor" | "admin"
  }
> = {
  patient: {
    title: "Patient",
    subtitle: "Sign in with your mobile number — WhatsApp OTP from GlucoGuide.",
    registerHint: "New here? Create a patient account to book appointments.",
    registerTab: "Register",
    registerCta: "Create patient account",
    nameLabel: "Full name",
    otherLabel: "Doctor login",
    otherHref: "/login/doctor",
    altLabel: "Clinic login",
    altHref: "/login/clinic",
    role: "user",
  },
  doctor: {
    title: "Doctor",
    subtitle: "Sign in to your queue, calendar, and patient bookings.",
    registerHint:
      "Dr Name, license, booking type, schedule, and slot settings.",
    registerTab: "Register",
    registerCta: "Create doctor account",
    nameLabel: "Full name (Dr.)",
    otherLabel: "Clinic login",
    otherHref: "/login/clinic",
    altLabel: "Patient login",
    altHref: "/login/patient",
    role: "doctor",
  },
  clinic: {
    title: "Clinic",
    subtitle: "Register and run your practice — schedules, directory, and queue.",
    registerHint:
      "Creates the clinic owner account. Next you’ll add practice profile and location.",
    registerTab: "Register",
    registerCta: "Create clinic account",
    nameLabel: "Owner / admin name",
    otherLabel: "Doctor login",
    otherHref: "/login/doctor",
    altLabel: "Patient login",
    altHref: "/login/patient",
    role: "doctor",
  },
  admin: {
    title: "Admin",
    subtitle: "Full platform control — patients, clinics, doctors, payments, and approvals.",
    registerHint: "",
    registerTab: "Register",
    registerCta: "Create account",
    nameLabel: "Name",
    otherLabel: "Patient login",
    otherHref: "/login/patient",
    altLabel: "Clinic login",
    altHref: "/login/clinic",
    role: "admin",
  },
}

const initialValues: AuthValues = {
  email: "",
  password: "",
}

export default function RoleAuthForm({
  audience,
  initialMode = "login",
  onModeChange,
  compact = false,
}: RoleAuthFormProps) {
  const copy = COPY[audience]
  const searchParams = useSearchParams()
  const router = useRouter()
  const callbackURL = searchParams.get("callback")
  const googleStatus = searchParams.get("status")
  const modeParam = searchParams.get("mode")
  const resolvedInitialMode: AuthMode =
    modeParam === "register" || modeParam === "login" ? modeParam : initialMode

  const [mode, setMode] = useState<AuthMode>(resolvedInitialMode)
  const [authSuccess, setAuthSuccess] = useState(false)
  const [name, setName] = useState("")
  const [submitAttempted, setSubmitAttempted] = useState(false)

  function switchMode(next: AuthMode) {
    setMode(next)
    setAuthSuccess(false)
    setSubmitAttempted(false)
    onModeChange?.(next)
  }

  useEffect(() => {
    if (modeParam === "register" || modeParam === "login") {
      setMode(modeParam)
      setAuthSuccess(false)
      onModeChange?.(modeParam)
    }
  }, [modeParam, onModeChange])

  useEffect(() => {
    onModeChange?.(mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notify parent of initial mode once
  }, [])

  const {
    values,
    errors,
    touched,
    isSubmitting,
    isDisabled,
    handleChange,
    handleBlur,
    handleSubmit,
  } = useForm({
    initialValues,
    onSubmit: (result) => handleAuthentication(result),
    validator: validations.auth,
  })

  const {
    data: loginData,
    isLoading: loginIsLoading,
    mutate: loginMutate,
  } = useMutation({
    mutationFn: (credentials: AuthValueType) => userService.login(credentials),
    onSuccess: (data) => {
      setAuthSuccess(Boolean(data?.role) && data?.status !== "unsuccessful")
    },
  })

  const {
    data: signupData,
    isLoading: signupIsLoading,
    mutate: signupMutate,
  } = useMutation({
    mutationFn: (credentials: AuthValueType) => userService.signup(credentials),
    onSuccess: (data) => {
      setAuthSuccess(Boolean(data?.role) && data?.status !== "unsuccessful")
    },
  })

  useEffect(() => {
    if (!authSuccess) return

    const role = loginData?.role || signupData?.role
    const profileName = loginData?.name || signupData?.name
    const dateOfBirth = loginData?.date_of_birth || signupData?.date_of_birth

    if (callbackURL) {
      const base = (process.env.NEXT_PUBLIC_URL || "").replace(/\/$/, "")
      const path = callbackURL.startsWith("/")
        ? callbackURL
        : `/${callbackURL}`
      router.push(`${base}${path}`)
      return
    }

    if (role === "admin" || loginData?.role === "admin" || signupData?.role === "admin") {
      router.push("/admin/dashboard")
      return
    }

    if (role === "user") {
      if (!profileName && !dateOfBirth) {
        router.push("/patient/profile")
      } else {
        router.push("/patient/dashboard")
      }
      return
    }

    if (role === "doctor") {
      const portal: ProviderPortal = audience === "clinic" ? "clinic" : "doctor"
      cookies.setCookie(PORTAL_COOKIE, portal, 60 * 60 * 24 * 30)

      if (audience === "clinic" && mode === "register") {
        router.push("/clinic/dashboard?onboarded=1")
      } else if (audience === "clinic") {
        router.push("/clinic/dashboard")
      } else {
        router.push("/doctor/dashboard")
      }
      return
    }

    if (role) router.push(`/${role}/dashboard`)
  }, [
    loginData,
    signupData,
    router,
    callbackURL,
    authSuccess,
    mode,
    audience,
  ])

  async function handleAuthentication(formValues: AuthValueType) {
    try {
      const encryptedPass = await firey.generateEncryption(formValues.password!)
      const payload: AuthValueType = {
        email: formValues.email!,
        password: encryptedPass,
        role: copy.role,
      }

      if (mode === "login") {
        loginMutate(payload)
        return
      }

      if (name.trim()) payload.name = name.trim()
      signupMutate(payload)
    } catch (error) {
      console.error("auth encryption failed:", error)
      const payload: AuthValueType = {
        email: formValues.email!,
        password: formValues.password!,
        role: copy.role,
      }
      if (mode === "login") {
        loginMutate(payload)
        return
      }
      if (name.trim()) payload.name = name.trim()
      signupMutate(payload)
    }
  }

  const errorMessage =
    (loginData && loginData.status === "unsuccessful" && loginData.message) ||
    (signupData && signupData.status === "unsuccessful" && signupData.message) ||
    (googleStatus === "nuser" && "No account associated with this email.") ||
    (googleStatus === "unknown" && "Something went wrong, try again.")

  return (
    <div
      className={`mx-auto w-full ${
        compact && mode === "register"
          ? "max-w-none text-left text-neutral-900 dark:text-white"
          : "max-w-sm text-center text-neutral-900 dark:text-white"
      } ${mode === "register" && !compact ? "max-w-none" : ""}`}
    >
      <div
        className={`mb-4 flex rounded-full bg-sky-50 p-1 text-slate-500 dark:bg-white/10 dark:text-slate-400 ${
          audience === "admin"
            ? "hidden"
            : compact && mode === "register"
              ? "w-full max-w-[240px]"
              : "mx-auto max-w-sm"
        }`}
      >
        {(["login", "register"] as AuthMode[]).map((ctx) => (
          <button
            key={ctx}
            type="button"
            onClick={() => switchMode(ctx)}
            className={`relative m-0 w-full rounded-full px-4 py-2 capitalize transition-colors ${
              mode === ctx
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                : "bg-transparent text-slate-500 hover:bg-white/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            }`}
          >
            <span className="relative z-10 font-medium">
              {ctx === "register" ? copy.registerTab : "Login"}
            </span>
          </button>
        ))}
      </div>

      {audience === "clinic" && mode === "register" ? (
        <ClinicRegisterForm onSwitchLogin={() => switchMode("login")} />
      ) : audience === "doctor" && mode === "register" ? (
        <DoctorRegisterForm onSwitchLogin={() => switchMode("login")} />
      ) : audience === "patient" && mode === "register" ? (
        <PatientRegisterForm
          compact={compact}
          onSwitchLogin={() => switchMode("login")}
        />
      ) : audience === "patient" && mode === "login" ? (
        <PatientPhoneOtpLogin />
      ) : (
        <>
          {mode === "register" && (
            <p className="gg-muted mt-3 text-xs">{copy.registerHint}</p>
          )}

          <form
            className="mt-5 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              setSubmitAttempted(true)
              handleSubmit()
            }}
          >
            {mode === "register" && (
              <IconInput
                icon="two-people"
                name="name"
                label={copy.nameLabel}
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setName(e.target.value)
                }
              />
            )}
            <IconInput
              icon="envelope"
              name="email"
              label="Email Address"
              value={values.email}
              onChange={handleChange}
              onBlur={handleBlur}
              error={submitAttempted ? errors.email : undefined}
            />
            <IconInput
              icon="key"
              name="password"
              type="password"
              label="Password"
              value={values.password}
              onChange={handleChange}
              onBlur={handleBlur}
              error={submitAttempted ? errors.password : undefined}
            />

            {errorMessage && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-2xl bg-red-500/15 py-2.5"
              >
                <p className="text-sm text-red-600 dark:text-red-300">
                  {errorMessage}
                </p>
              </motion.div>
            )}

            <Button
              className="gg-btn center !w-full !border-transparent !py-3.5 !text-base "
              typeBtn="submit"
              disabled={
                isSubmitting || isDisabled || loginIsLoading || signupIsLoading
              }
            >
              {isSubmitting || loginIsLoading || signupIsLoading ? (
                <div className="size-5">
                  <Icon
                    name="spinning-loader"
                    className="fill-white dark:fill-black"
                  />
                </div>
              ) : mode === "login" ? (
                "Sign in"
              ) : (
                copy.registerCta
              )}
            </Button>
          </form>

          {audience === "patient" && mode === "register" && (
            <>
              <div className="relative mt-6 text-center">
                <div className="before:absolute before:left-0 before:top-1/2 before:h-px before:w-full before:-translate-y-1/2 before:bg-slate-200 before:content-[''] dark:before:bg-white/15">
                  <span className="relative z-10 bg-white px-2.5 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    or continue with
                  </span>
                </div>
              </div>
              <GoogleButton type="signup" />
            </>
          )}

          <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            {copy.otherLabel}?{" "}
            <Link href={copy.otherHref} className="font-semibold text-blue-600 hover:underline dark:text-sky-400">
              Go there
            </Link>
            {copy.altLabel && copy.altHref ? (
              <>
                {" · "}
                <Link href={copy.altHref} className="font-semibold text-blue-600 hover:underline dark:text-sky-400">
                  {copy.altLabel}
                </Link>
              </>
            ) : null}
          </p>
        </>
      )}
    </div>
  )
}
