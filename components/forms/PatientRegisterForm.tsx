"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { firey } from "@/utils"
import { cookies } from "@/utils/cookies"
import { Button, DatePicker, Icon, IconInput } from "@/components"
import AadharCardSection, {
  type IdentityDocumentsPayload,
} from "@/components/forms/AadharCardSection"
import VoiceTextInput from "@/components/inputs/VoiceTextInput"
import { userService } from "@/lib/services/user"
import { TInfoOptions } from "@/types"

type PatientRegisterFormProps = {
  onSwitchLogin: () => void
  compact?: boolean
}

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "others", label: "Other" },
] as const

const emptyProfile = (): TInfoOptions => ({
  name: "",
  gender: "male",
  imgSrc: "",
  address: "",
  profession: "",
  dateOfBirth: null,
  contactNumber: "",
  emergencyNumber: "",
  weight: "",
  height: "",
  bloodGroup: "A+",
  smokingStatus: "never",
  physicalActivity: "moderate",
  previousDiabetesRecords: [],
})

function validateAadhar(value: string): string | null {
  if (!value.trim()) return null
  const digits = value.replace(/\D/g, "")
  if (digits.length !== 12) return "Aadhaar number must be 12 digits."
  return null
}

function validatePan(value: string): string | null {
  if (!value.trim()) return null
  const pan = value.trim().toUpperCase()
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    return "PAN must be 10 characters (e.g. ABCDE1234F)."
  }
  return null
}

/**
 * Patient registration: optional Aadhaar upload + ID numbers →
 * basic fields → account → create.
 */
export default function PatientRegisterForm({
  onSwitchLogin,
  compact = false,
}: PatientRegisterFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [profile, setProfile] = useState<TInfoOptions>(emptyProfile)
  const [aadharNumber, setAadharNumber] = useState("")
  const [panNumber, setPanNumber] = useState("")
  const [identityDocs, setIdentityDocs] = useState<IdentityDocumentsPayload>({
    idImages: [],
    profilePhoto: null,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  function validateBasics(): string | null {
    if (!email.trim() || !password) {
      return "Email and password are required."
    }
    if (password.length < 6) {
      return "Password must be at least 6 characters."
    }
    if (password !== confirmPassword) {
      return "Passwords do not match."
    }
    if (!profile.name.trim()) {
      return "Full name is required."
    }
    if (!profile.dateOfBirth) {
      return "Date of birth is required."
    }
    if (!profile.gender) {
      return "Please select a gender."
    }
    if (!profile.contactNumber.trim()) {
      return "Contact number is required."
    }
    if (!profile.emergencyNumber.trim()) {
      return "Emergency contact is required."
    }
    if (!profile.address.trim()) {
      return "Address is required."
    }
    return (
      validateAadhar(aadharNumber) ||
      validatePan(panNumber)
    )
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    const validationError = validateBasics()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    try {
      let encryptedPass = password
      try {
        encryptedPass = await firey.generateEncryption(password)
      } catch {
        /* send plain if encryption env missing */
      }

      const res = await userService.signup({
        email: email.trim(),
        password: encryptedPass,
        role: "user",
        name: profile.name.trim(),
        phone: profile.contactNumber.trim() || undefined,
        gender: profile.gender as "male" | "female" | "others",
      })

      if (res?.status === "unsuccessful" || !res?.role) {
        setError(res?.message || "Could not create account.")
        return
      }

      const token =
        res.access_token || cookies.getCookie("access_token") || ""
      if (token) {
        cookies.setCookie("access_token", token, 60 * 60 * 24)
      }
      if (res.refresh_token) {
        cookies.setCookie(
          "refresh_token",
          res.refresh_token,
          60 * 60 * 24 * 30,
        )
      }

      const sessionToken =
        token ||
        cookies.getCookie("access_token") ||
        cookies.getCookie("refresh_token")
      if (!sessionToken) {
        setError(
          "Account created but session missing. Try signing in, then open Profile.",
        )
        return
      }

      await userService.update(sessionToken, {
        name: profile.name.trim(),
        gender: profile.gender,
        address: profile.address.trim(),
        profession: profile.profession.trim(),
        contact_number: profile.contactNumber.trim(),
        emergency_number: profile.emergencyNumber.trim(),
        date_of_birth: format(profile.dateOfBirth!, "MM/dd/yyyy"),
        ...(aadharNumber.trim()
          ? { aadhar_number: aadharNumber.replace(/\D/g, "") }
          : {}),
        ...(panNumber.trim()
          ? { pan_number: panNumber.trim().toUpperCase() }
          : {}),
      })

      if (identityDocs.profilePhoto) {
        await userService.uploadProfilePhoto(sessionToken, {
          imageBase64: identityDocs.profilePhoto.base64,
          mimeType: identityDocs.profilePhoto.mimeType,
        })
      }

      const aadharImage =
        identityDocs.idImages.find((img) => img.documentType === "AADHAAR") ??
        identityDocs.idImages[0]
      if (aadharImage) {
        await userService.uploadAadharCard(sessionToken, {
          imageBase64: aadharImage.base64,
          mimeType: aadharImage.mimeType,
        })
      }

      router.push("/patient/dashboard")
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create account.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      className={
        compact
          ? "mt-3 grid w-full min-w-0 grid-cols-1 gap-6 text-left xl:grid-cols-3 xl:gap-0"
          : "mt-4 flex w-full min-w-0 flex-col gap-4 text-left sm:mt-5 sm:gap-5"
      }
      onSubmit={createAccount}
    >
      <section
        className={
          compact
            ? "min-w-0 space-y-3 xl:border-r xl:border-neutral-200 xl:pr-6 dark:xl:border-neutral-800"
            : "min-w-0 space-y-2.5 sm:space-y-3"
        }
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          1. Identity (optional)
        </h2>
        <AadharCardSection
          setValues={setProfile}
          aadharNumber={aadharNumber}
          panNumber={panNumber}
          onAadharNumberChange={setAadharNumber}
          onPanNumberChange={setPanNumber}
          onDocumentsChange={setIdentityDocs}
          guestMode
          compact={compact}
        />
      </section>

      <section
        className={
          compact
            ? "min-w-0 space-y-3 xl:border-r xl:border-neutral-200 xl:px-6 dark:xl:border-neutral-800"
            : "min-w-0 space-y-2.5 sm:space-y-3"
        }
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          2. Basic details
        </h2>
        {!compact ? (
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Review and complete any missing fields after the scan.
          </p>
        ) : null}
        <div
          className={
            compact
              ? "grid grid-cols-1 gap-3"
              : "grid grid-cols-1 gap-3 min-[480px]:grid-cols-2"
          }
        >
          <div className={`min-w-0 ${compact ? "" : "min-[480px]:col-span-2"}`}>
            <IconInput
              icon="human"
              name="name"
              label="Full legal name *"
              value={profile.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setProfile((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </div>

          <div className="relative min-w-0">
            <DatePicker
              name="dateOfBirth"
              selectedDay={profile.dateOfBirth}
              onChange={(day: Date) =>
                setProfile((prev) => ({ ...prev, dateOfBirth: day }))
              }
              direction="left"
              containerClassName="[&_h4]:mb-1.5 [&_h4]:text-sm [&_h4]:font-semibold [&_>div.relative]:min-h-14 [&_>div.relative]:rounded-xl [&_>div.relative]:px-4 [&_>div.relative]:py-3"
            />
          </div>

          <div className="min-w-0">
            <p className="mb-1.5 text-sm font-semibold opacity-90">Gender *</p>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {GENDERS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() =>
                    setProfile((prev) => ({ ...prev, gender: g.value }))
                  }
                  className={`min-h-11 rounded-xl border px-1.5 text-xs font-semibold transition sm:min-h-12 sm:px-2 sm:text-sm ${
                    profile.gender === g.value
                      ? "border-[#0099ff] bg-[#0099ff]/10 text-neutral-900 dark:text-white"
                      : "border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <IconInput
              icon="written-page"
              name="profession"
              label="Profession"
              value={profile.profession}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setProfile((prev) => ({ ...prev, profession: e.target.value }))
              }
            />
          </div>

          <div className="min-w-0">
            <IconInput
              icon="phone"
              name="contactNumber"
              type="tel"
              label="Contact number *"
              value={profile.contactNumber}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setProfile((prev) => ({
                  ...prev,
                  contactNumber: e.target.value,
                }))
              }
            />
          </div>

          <div className={`min-w-0 ${compact ? "" : "min-[480px]:col-span-2"}`}>
            <IconInput
              icon="phone"
              name="emergencyNumber"
              type="tel"
              label="Emergency contact *"
              value={profile.emergencyNumber}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setProfile((prev) => ({
                  ...prev,
                  emergencyNumber: e.target.value,
                }))
              }
            />
          </div>

          <div className={`min-w-0 ${compact ? "" : "min-[480px]:col-span-2"}`}>
            <VoiceTextInput
              id="address"
              label="Address *"
              value={profile.address}
              onChange={(value) =>
                setProfile((prev) => ({ ...prev, address: value }))
              }
              placeholder="Home / current address"
              required
              multiline
              rows={compact ? 2 : 3}
              micAriaLabel="Record address by voice"
              listeningHint="Listening… speak your full address"
              voiceHint={compact ? "" : "Tap the mic to dictate your address — review before continuing."}
              inputClassName="w-full min-w-0 resize-y rounded-xl border border-neutral-300 bg-transparent p-3 text-sm outline-none focus:border-[var(--theme-primary)] dark:border-white/20 sm:p-3.5"
              className="text-neutral-800 dark:text-neutral-100 [&_label]:text-sm [&_label]:font-semibold [&_label]:opacity-90"
            />
          </div>
        </div>
      </section>

      <section
        className={
          compact
            ? "min-w-0 space-y-3 xl:pl-6"
            : "min-w-0 space-y-2.5 sm:space-y-3"
        }
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          3. Account
        </h2>
        <div className="grid grid-cols-1 gap-3">
          <IconInput
            icon="envelope"
            name="email"
            label="Email Address *"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEmail(e.target.value)
            }
          />
          <IconInput
            icon="key"
            name="password"
            type="password"
            label="Password *"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setPassword(e.target.value)
            }
          />
          <IconInput
            icon="key"
            name="confirmPassword"
            type="password"
            label="Confirm password *"
            value={confirmPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setConfirmPassword(e.target.value)
            }
          />
        </div>
      </section>

      <div
        className={
          compact
            ? "space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800 xl:col-span-3"
            : "space-y-4"
        }
      >
      {error ? (
        <p className="break-words rounded-2xl bg-red-500/15 px-3 py-2 text-center text-sm text-red-600 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <Button
        className="gg-btn center !w-full !border-transparent !py-3 !text-base sm:!py-3.5"
        typeBtn="submit"
        disabled={submitting}
      >
        {submitting ? (
          <Icon
            name="spinning-loader"
            className="size-5 fill-white dark:fill-black"
          />
        ) : (
          "Create patient account"
        )}
      </Button>

      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        Already registered?{" "}
        <button type="button" onClick={onSwitchLogin} className="font-semibold text-blue-600 hover:underline dark:text-sky-400">
          Sign in
        </button>
      </p>
      </div>
    </form>
  )
}
