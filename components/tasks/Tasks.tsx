"use client"

import { useState } from "react"
import { format } from "date-fns"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { useKeyPress } from "@/hooks/useKeyPress"
import Icon from "../icons"

type Props = {
  data: {
    type: "consultation" | "test" | "exercise" | "meal" | "medication"
    duration?: string
    time: string
    id?: string
    name?: string
    appointmentDate?: string
    doctor?: {
      id: string
      name: string
      hospital: {
        id: string
        name: string
        address: string
      }
    }
  }[]
}

export default function Tasks({ data }: Props) {
  const [openOptions, setOpenOptions] = useState<boolean>(false)
  const [isHovering, setIsHovering] = useState<boolean>(false)

  const router = useRouter()

  const time = new Date()

  // get the time in 12 hours format
  const hour12Format = time
    .toLocaleString("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    })
    .split(" ")

  // check if the task is currently running
  function currentlyRunning(time: string) {
    const currentHour = Number(hour12Format[0].split(":")[0]) // get the current hour in number
    const currentPOD = hour12Format[1] // get the part of the day

    // get the hours in backwards 2 times
    for (let curr = currentHour; curr > currentHour - 2; curr--) {
      if (`${curr}${currentPOD}` === time) {
        return true // found the task that matches w the current time
      }
    }

    // if not found return false
    return false
  }

  // handle press keyboard key escape
  useKeyPress("Escape", () => {
    if (!openOptions) return
    setOpenOptions(false)
  })

  // handle view upcoming appointments
  function handleAppointmentView(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    id?: string
  ) {
    let appointmentLink = `/patient/appointments?popup=t&id=${id}`
    if (typeof window !== "undefined" && id) {
      e.preventDefault()
      if (e.ctrlKey) {
        window.open(appointmentLink, `_blank`)
      } else {
        router.push(appointmentLink)
      }
    }
  }

  return data.map(
    ({ id, type, appointmentDate, name, time, doctor, duration }, idx) => (
      <motion.div
        className="ml-6 relative"
        key={`activities-${idx}`}
        onHoverStart={() => setIsHovering(true)}
        onHoverEnd={() => setIsHovering(false)}
      >
        {/* currently running indicator */}
        <div
          className={`absolute -left-6 top-0.5 flex center ${
            !currentlyRunning(time) && type !== "consultation" && `hidden`
          }`}
        >
          <motion.div
            initial={{ scale: 0.6 }}
            animate={{
              scale: 1,
              transition: { repeat: Infinity, duration: 0.8 },
            }}
            className={`rounded-full size-[18px] backdrop-blur-sm ${
              type === "test" ||
              (type === "consultation" && `bg-blue-400/25`) ||
              (type === "medication" && `bg-blue-300/25`)
            } ${type === "exercise" && `bg-orange-400/25`} ${
              type === "meal" && `bg-red-400/25`
            }`}
          />
          <div
            className={`absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 size-2 rounded-full ${
              type === "test" ||
              (type === "consultation" && `bg-blue-400`) ||
              (type === "medication" && `bg-blue-300`)
            } ${type === "exercise" && `bg-orange-400`} ${
              type === "meal" && `bg-red-400`
            }`}
          />
        </div>

        {/* name of the pending task */}
        <div className="flex justify-between">
          <h3
            className={`text-sm font-bold capitalize ${!name && `opacity-70`}`}
          >
            {name
              ? name
              : `${type} at ${format(
                  appointmentDate as string,
                  "do MMMM, yyy"
                )}`}
          </h3>
          {!name && (
            <motion.button
              animate={{ opacity: isHovering ? 1 : 0 }}
              onClick={(e) => handleAppointmentView(e, id)}
            >
              <Icon
                className="size-[18px]"
                name="right-arrow"
                pathClassName="fill-neutral-500"
              />
            </motion.button>
          )}
        </div>

        {/* doctor and hospital details for appointment pendings */}
        {doctor && (
          <div className="mt-2 flex flex-col text-sm">
            <h4 className="font-bold">{doctor.name}</h4>
            <h5 className="font-semibold opacity-70 leading-4">
              {doctor.hospital.name}
            </h5>
            <h5 className="font-semibold opacity-70 leading-4">
              {doctor.hospital.address}
            </h5>
          </div>
        )}
        <h5 className="text-sm font-semibold opacity-70 text-nowrap leading-4">
          {time}
        </h5>
        {duration && (
          <h5 className="text-xs mt-1 font-semibold opacity-70 leading-4">
            {duration} (duration)
          </h5>
        )}
      </motion.div>
    )
  )
}
