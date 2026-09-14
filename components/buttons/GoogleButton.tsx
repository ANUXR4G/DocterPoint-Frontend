"use client"

import { Icon } from "@/components"
import { motion } from "framer-motion"

export function GoogleButton({
  type = "login",
}: {
  type?: "signup" | "login"
}) {
  const encodedState = encodeURIComponent(
    JSON.stringify({
      source: type === "login" ? "gg_login" : "gg_signup",
    })
  )

  async function handleGoogleSignup() {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API}/auth/google?state=${encodedState}`
      )
      const url = (await response.text()).trim()
      if (url.startsWith("http")) {
        window.location.href = url
      }
    } catch (error) {
      console.log(error)
    }
  }

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      className="size-12 flex mt-2 mx-auto p-2 border border-neutral-400/70 dark:border-neutral-500 rounded-full"
      onClick={handleGoogleSignup}
    >
      <Icon name="google" className="size-full" />
    </motion.button>
  )
}
