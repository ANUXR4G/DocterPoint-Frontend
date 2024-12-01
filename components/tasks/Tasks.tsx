"use client"

import { motion } from "framer-motion"
import Icon from "../icons"
import { format } from "date-fns"
import { useState } from "react"
import SimpleModal from "../modals/SimpleModal"
import { useKeyPress } from "@/hooks/useKeyPress"
import { useRouter } from "next/navigation"

type Props = {
  data: {
    type: "consultation" | "test" | "exercise" | "meal" | "medication"
    time: string
    date?: string
    duration?: string
    name?: string
    id?: string
    doctor?: {
      name: string
      hospital: {
        name: string
        address: string
      }
    }
  }[]
}

export default function Tasks({ data }: Props) {
  const [openOptions, setOpenOptions] = useState<boolean>(false)

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
    // get the current hour in number
    const currentHour = Number(hour12Format[0].split(":")[0])
    // get the part of the day
    const currentPOD = hour12Format[1]

    // get the hours in backwards 2 times
    for (let curr = currentHour; curr > currentHour - 2; curr--) {
      if (`${curr}${currentPOD}` === time) {
        // found the task that matches w the current time
        return true
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
    id: string
  ) {
    if (typeof window !== "undefined" && id) {
      e.preventDefault()
      if (e.ctrlKey) {
        window.open(
          `/patient/appointments?id=${id}&type=view&popup=t`,
          `_blank`
        )
      } else {
        router.push(`/patient/appointments?id=${id}&type=view&popup=t`)
      }
    }
  }

  return data.map(({ type, id, date, name, time, doctor, duration }, idx) => (
    <div className="ml-6 relative" key={`activities-${idx}`}>
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
          className={`absolute size-1.5 rounded-full ${
            type === "test" ||
            (type === "consultation" && `bg-blue-400`) ||
            (type === "medication" && `bg-blue-300`)
          } ${type === "exercise" && `bg-orange-400`} ${
            type === "meal" && `bg-red-400`
          }`}
        />
      </div>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold">
          {name ? name : `Apppointment for ${type.toUpperCase()}`}
        </h3>
        {type === "consultation" ||
          (type === "test" && (
            <div className="ml-auto">
              <SimpleModal
                open={openOptions}
                closeModal={() => setOpenOptions(false)}
                className="border dark:border-none dark:shadow-[inset_0_0_0_1px_rgba(248,248,248,0.2)] shadow-md rounded-lg right-0 top-10 flex flex-col w-40 bg-[--primary-white] dark:bg-neutral-800"
                content={
                  <button
                    className={`top-0 relative size-8 center ${
                      openOptions && `bg-zinc-200/80 dark:bg-neutral-700`
                    } hover:bg-zinc-200/80 dark:hover:bg-neutral-700 rounded-full`}
                    onClick={() => setOpenOptions(true)}
                  >
                    <Icon name="ellipsis" className="size-6" />
                  </button>
                }
              >
                <button
                  className="py-1 size-full hover:bg-zinc-200/70 dark:hover:bg-neutral-700 rounded-md"
                  onClick={(e) => id && handleAppointmentView(e, id)}
                >
                  <span className="text-sm font-bold">View</span>
                </button>
                <button className="py-1 hover:bg-zinc-200/70 dark:hover:bg-neutral-700 rounded-md size-full">
                  <span className="text-sm font-bold">Cancel</span>
                </button>
              </SimpleModal>
            </div>
          ))}
        <div className={(type === "consultation" || "test") && `hidden`}>
          <Icon
            name={
              type === "meal"
                ? "soup-bowl"
                : type === "exercise"
                ? "human-yoga"
                : type === "medication"
                ? "capsule-pill"
                : "written-page"
            }
          />
        </div>
      </div>
      <div className="mt-1 text-sm flex flex-col font-semibold">
        {date && (
          <h5 className="opacity-70 leading-4">
            {format(date as string, "do MMMM, yyy")}
          </h5>
        )}
        <h5 className="opacity-70 text-nowrap leading-4">{time}</h5>
        {doctor && (
          <h5 className="opacity-70 leading-4">{doctor.hospital.address}</h5>
        )}
      </div>
      {duration && (
        <h5 className="text-xs mt-1 font-semibold opacity-70 leading-4">
          {duration} (duration)
        </h5>
      )}
      {doctor && (
        <div className="mt-2 flex items-center -ml-1 gap-2.5">
          <div className="min-w-9 size-9 rounded-full bg-slate-600" />
          <div className="text-sm">
            <h4 className="font-bold">{doctor.name}</h4>
            <h5 className="font-semibold opacity-70 leading-4">
              {doctor.hospital.name}
            </h5>
          </div>
        </div>
      )}
    </div>
  ))
}
