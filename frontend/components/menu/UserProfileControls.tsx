"use client"

import { useState } from "react"
import ProfileMenu from "@/components/menu/ProfileMenu"
import { useRole } from "@/hooks/useRole"
import { useUser } from "@/hooks/useUser"

/** Avatar + profile dropdown — same control as dashboard Header. */
export default function UserProfileControls() {
  const role = useRole()
  const { data } = useUser(role || "default")
  const [open, setOpen] = useState(false)

  return (
    <ProfileMenu
      data={data}
      open={open}
      toggleModal={() => setOpen((prev) => !prev)}
      closeModal={() => setOpen(false)}
    />
  )
}
