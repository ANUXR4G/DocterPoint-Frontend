"use client"

import { queryClient } from "@/app/providers"
import { format, startOfToday } from "date-fns"
import React, { useEffect, useState } from "react"

import { useUser } from "@/hooks/useUser"
import { useSocket } from "@/hooks/useSocket"
import { useApiMutation } from "@/hooks/useApiMutation"
import { useDoctor } from "@/hooks/useDoctor"

import { Button, CoolKid, Swiper } from "@/components"
import { patientService } from "@/lib/services/patient"
import { TAppointment, TDoctorAppointment } from "@/types"
import { doctorServices } from "@/lib/services/doctor"

export default function Requests() {
  const [today, setToday] = useState<Date | null>(null)

  // Retrieve the information of the doctor
  const { data: userInfo, isLoading: infoIsLoading } = useUser("doctor")

  // Get the data from the WebSocket room
  const socketURL = userInfo
    ? `ws://${process.env.NEXT_PUBLIC_WS_ORIGIN}/api/v1/ws/appointment/requests/${userInfo.id}`
    : null

  const { values } = useSocket(socketURL)

  // Retrieve the request appointment list
  const { data, isLoading } = useDoctor<TDoctorAppointment[]>("requested")

  useEffect(() => {
    if (!isLoading) setToday(startOfToday())
  }, [isLoading])

  // Invalidate the request query to add the real-time incoming appointment appointments
  useEffect(() => {
    if (!data || !values) return
    queryClient.invalidateQueries(
      `users:doctor:${userInfo?.id}:appointments:requested`
    )
  }, [values, data, userInfo?.id])

  // Display loading skeleton UI
  if (isLoading || infoIsLoading || !today)
    return (
      <div
        role="status"
        className="animate-pulse hidden lg:block rounded-[26px] col-span-4 lg:order-2 lg:col-span-1 lg:row-span-2 bg-gray-300/75 dark:bg-neutral-700/75"
      >
        <span className="sr-only">Loading...</span>
      </div>
    )

  return (
    <div className={`w-full col-span-4 lg:order-2 lg:col-span-1 lg:row-span-2`}>
      {data && data.length > 0 ? (
        <React.Fragment>
          <div className="hidden lg:flex flex-col max-h-[516px] overflow-y-auto pr-1 custom-scroll gap-3">
            {data.map((item) => (
              <Appointment {...item} key={`r-${item.id}`} />
            ))}
          </div>

          <Swiper className="relative gap-3 flex z-20 lg:hidden">
            {data.map((item) => (
              <Appointment {...item} key={`r-${item.id}`} />
            ))}
          </Swiper>
        </React.Fragment>
      ) : (
        <div className="size-full center hidden lg:flex bg-neutral-800 rounded-[26px]">
          {today && (
            <div className="flex flex-col mt-4">
              <h3 className="text-5xl 2xl:text-6xl 2xl:leading-10 font-bold">
                {format(today, "d")}
              </h3>
              <div className="flex flex-col ml-2 2xl:mb-1 2xl:mt-1">
                <span className="text-2xl 2xl:text-4xl 2xl:leading-9 font-bold">
                  {format(today, "MMMM")}
                </span>
                <span className="ml-1 text-sm font-semibold opacity-65 mt-1 leading-4">
                  {format(today, "iiii")}
                </span>
                <span className="ml-1 text-sm font-semibold opacity-65 mt-1 leading-4">
                  no pending requests
                </span>
                <div className="size-48">
                  <CoolKid />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Appointment(item: TDoctorAppointment) {
  const { data: userInfo } = useUser("doctor")

  // 'decline' or 'accept' requested appointments
  const { mutate } = useApiMutation<{ payload: Record<string, unknown> }>(
    ({ payload }, token) => {
      const appointmentId = payload.id as string
      return doctorServices.updateAppointmentInfo(token, appointmentId, {
        status: payload.status,
      })
    },
    {
      onSuccess: () => {
        // Invalidate doctor requested appointments
        queryClient.invalidateQueries(
          `users:doctor:${userInfo?.id}:appointments:requested`
        )

        // Invalidate doctor appointments list (all pages)
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            (query.queryKey[0] as string).includes(
              `users:doctor:${userInfo?.id}:appointments:page`
            ),
        })

        // Invalidate doctor analytics
        queryClient.invalidateQueries(`users:doctor:${userInfo?.id}:analytics`)
      },
    }
  )

  function acceptRequest(info: TAppointment) {
    mutate({
      payload: {
        id: info.id,
        status: "upcoming",
      },
    })
  }

  function declineRequest(info: TAppointment) {
    mutate({
      payload: {
        id: info.id,
        status: "declined",
      },
    })
  }

  return (
    <div className="flex flex-col text-start bg-neutral-700 dark:bg-neutral-800 p-4 2xl:p-5 min-h-40 min-w-72 lg:min-w-full relative rounded-[26px] dark:gradient-border-black">
      <div className="-ml-0.5 px-2 pb-0.5 lg:mt-1.5 2xl:mt-0.5 bg-neutral-300 rounded-md w-fit">
        <span className="text-xs font-bold text-neutral-700">
          Serial No. #{item.serialNumber}
        </span>
      </div>

      {/* info */}
      <div className="mt-1.5 flex items-center gap-3">
        <div className="w-1/2">
          <span className="text-xs line-clamp-1 font-semibold text-neutral-300 dark:text-neutral-600">
            Patient Name
          </span>
          <h3 className="leading-4 line-clamp-1 text-sm font-medium text-neutral-300">
            {item.patient.name}
          </h3>
        </div>
        <div className="w-1/2">
          <span className="text-xs line-clamp-1 font-semibold text-neutral-300 dark:text-neutral-600">
            Date of Appointment
          </span>
          <h3 className="leading-4 line-clamp-1 text-sm font-medium text-neutral-300">
            {item.appointmentDate}
          </h3>
        </div>
      </div>
      {/* control buttons */}
      <div className="flex gap-3 mt-auto lg:mt-4">
        <Button
          type="outline"
          className="relative w-1/2 center rounded-md"
          onClick={() => declineRequest(item)}
        >
          Decline
        </Button>
        <Button
          className="relative w-1/2 rounded-md center"
          onClick={() => acceptRequest(item)}
        >
          Accept
        </Button>
      </div>
    </div>
  )
}
