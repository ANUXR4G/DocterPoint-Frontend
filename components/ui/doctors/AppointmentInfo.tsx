"use client"

import { queryClient } from "@/app/providers"
import {
  AppointmentBasic,
  AppointmentPrescription,
  Button,
  ConsultHistory,
  HealthMetrics,
  Modal,
  SimpleSpinner,
} from "@/components"
import { useApiMutation } from "@/hooks/useApiMutation"
import { useDoctor } from "@/hooks/useDoctor"
import { useUser } from "@/hooks/useUser"
import { onGoingStatuses } from "@/lib/dummy/status"
import { doctorServices } from "@/lib/services/doctor"
import { TDoctorAppointment, TPresciptionOpts } from "@/types"
import Image from "next/image"
import { usePathname, useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import React, { useEffect, useRef, useState } from "react"

type TStatusComponent = {
  title: string
  message: string
}

const DisplayStatus = ({ title, message }: TStatusComponent) => (
  <div>
    <h2 className="text-sm font-semibold mt-4">{title}</h2>
    <h3 className="text-sm font-semibold opacity-90">{message}</h3>
  </div>
)

export default function AppointmentInfo() {
  const router = useRouter()
  const pathname = usePathname()

  const searchParams = useSearchParams()
  const appointmentId = searchParams.get("info")

  const [info, setInfo] = useState<TDoctorAppointment | null>(null)
  const timeoutId = useRef<NodeJS.Timeout | null>(null)

  const [values, setValues] = useState<TPresciptionOpts>({
    type: "Exercise 🏃🏼‍♂️",
    name: "",
    times: ["morning"],
    amount: "1",
    duration: "10-15mins",
    note: "",
  })

  const [activities, setActivities] = useState<{
    exercises: Pick<TPresciptionOpts, "name" | "duration" | "times">[]
    medications: Pick<TPresciptionOpts, "name" | "amount" | "times">[]
  }>({
    exercises: [],
    medications: [],
  })

  const { data: userInfo } = useUser("doctor")

  // Handle the modal closing
  function onCloseModal() {
    router.push(pathname)
    timeoutId.current = setTimeout(() => setInfo(null), 300) // Enable dealy of 300ms
  }

  // Retrieve the specific appointment information based on id
  const { data, isLoading } = useDoctor<TDoctorAppointment>(
    "specific",
    searchParams
  )

  // Update the info state
  useEffect(() => {
    if (!isLoading && data) {
      setInfo(data)
    }
  }, [data, isLoading])

  // Cleanup for timer
  useEffect(() => {
    return () => {
      if (timeoutId.current) clearTimeout(timeoutId.current)
    }
  })

  // Update medication information
  const { mutate } = useApiMutation<{ payload: Record<string, unknown> }>(
    ({ payload }, token) => {
      if (!info) throw new Error(`Failed to update patient medication`)
      return doctorServices.updateAppointmentInfo(token, info.id, payload)
    },
    {
      onSuccess: () => {
        if (userInfo?.id && data?.id) {
          // Invalidate doctor requested appointments
          queryClient.invalidateQueries(
            `users:doctor:${userInfo.id}:appointments:requested`
          )

          // Invalidate the working appointment info
          queryClient.invalidateQueries(
            `users:doctor:${userInfo?.id}:appointments:info:${data?.id}`
          )

          // Invalidate doctor appointments list (all pages)
          queryClient.invalidateQueries({
            predicate: (query) =>
              Array.isArray(query.queryKey) &&
              (query.queryKey[0] as string).includes(
                `users:doctor:${userInfo?.id}:appointments:page`
              ),
          })
        }
      },
    }
  )

  // Check if activity is not empty
  const isActivityNotEmpty =
    activities.exercises.length !== 0 || activities.medications.length !== 0

  // Handle appointment update confirmation
  function handleConfirmation() {
    if (isActivityNotEmpty && info) {
      const payload = {
        ...(activities.medications.length >= 1 && {
          medications: activities.medications,
        }),
        ...(activities.exercises.length >= 1 && {
          exercises: activities.exercises,
        }),
        ...(values.note.length >= 2 && {
          doctor_note: values.note,
        }),
        status: "completed",
      }

      // Update the info
      mutate({ payload })
      // Close the modal
      onCloseModal()
    }
  }

  // Handle appointment cancellation
  function handleCancelBooking() {
    mutate({
      payload: {
        status: "cancelled",
      },
    })

    onCloseModal() // Close the modal
  }

  return (
    <Modal
      className="text-start h-full sm:h-3/4 w-full max-w-[720px]"
      open={!!appointmentId}
      handler={onCloseModal}
      primaryBtn={
        info && ["cancelled", "declined"].includes(info.status) ? (
          <Button type="outline" onClick={onCloseModal}>
            Close
          </Button>
        ) : (
          <Button type="outline" onClick={handleCancelBooking}>
            Cancel Booking
          </Button>
        )
      }
      secondaryBtn={
        info &&
        onGoingStatuses.includes(info.status) && (
          <Button
            disabled={!isActivityNotEmpty && values.note.length === 0}
            onClick={handleConfirmation}
          >
            Mark as Complete
          </Button>
        )
      }
    >
      {!info || isLoading ? (
        <SimpleSpinner className="size-10 -mt:10" />
      ) : (
        <div className="p-4 flex flex-col gap-3 sm:gap-2 overflow-x-hidden overflow-y-auto custom-scroll text-neutral-300">
          {/* Appointment Info */}
          <AppointmentBasic info={info} />

          {/* Patient Info */}
          <div className="mt-4 text-neutral-600 dark:text-neutral-400">
            <div className="relative w-24 h-24 border-2 dark:border-neutral-200 border-neutral-800 rounded-full bg-slate-600">
              <Image
                fill
                src={
                  info.patient.imgSrc ||
                  `${`https://res.cloudinary.com/firey/image/upload/v1708816390/iub/${
                    info.patient.gender
                      ? info.patient.gender === `male`
                        ? `male`
                        : `female`
                      : `male`
                  }_12.jpg`}`
                }
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                alt={`${data?.id}.jpg`}
                style={{ objectFit: "cover" }}
                priority
                className="rounded-full"
              />
              {/* overlay */}
              <div className="min-h-full min-w-full bg-black/25 absolute top-0 right-0 bottom-0 left-0 rounded-full" />
            </div>

            <div className="mt-2">
              <h3 className="text-xl font-semibold tracking-wide">
                {info.patient.name},{info.patient.age} y.o.
              </h3>
              <p className="text-sm font-medium opacity-70">
                {info.patient.address}
              </p>
            </div>

            {/* Health Metrics */}
            {onGoingStatuses.includes(info.status) ? (
              !Array.isArray(info.health) ? (
                <HealthMetrics {...info.health} />
              ) : (
                // Display empty status for health metrics
                <DisplayStatus
                  title="Medical History"
                  message="No health information is available of the patient."
                />
              )
            ) : (
              // Display only available for ongoing consultations.
              <DisplayStatus
                title="Medical History"
                message="Health information is only available for ongoing consultations."
              />
            )}

            {/* Update Prescription */}
            {onGoingStatuses.includes(info.status) && (
              <AppointmentPrescription
                info={info}
                values={values}
                activities={activities}
                setValues={setValues}
                setActivities={setActivities}
              />
            )}

            {/* Consult History of the patient */}
            {onGoingStatuses.includes(info.status) && (
              <ConsultHistory id={info.id} />
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
