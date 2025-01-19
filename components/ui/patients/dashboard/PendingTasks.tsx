"use client"

import React from "react"

import {
  format,
  isSameDay,
  parseISO,
  startOfToday,
  startOfTomorrow,
} from "date-fns"

import { firey } from "@/utils"
import { TAppointment } from "@/types"
import { useApi } from "@/hooks/useApi"
import { patientService } from "@/lib/services/patient"
import { Activities, PendingAppointmentSkeleton, Tasks } from "@/components"

type Props = {
  isLoading: boolean
}

export default function PendingTasks({ isLoading: recordLoading }: Props) {
  const today = startOfToday()
  const tomorrow = startOfTomorrow()

  const dayDate = format(today, "d")
  const day = format(today, "iiii")
  const month = format(today, "MMMM")

  const { data: upcomingAppointments, isLoading: appointmentLoading } = useApi(
    [`patients:appointments:upcoming`],
    (_, token) => patientService.upcoming_appointments(token),
    {
      select: (data) => {
        return firey.convertKeysToCamelCase(data) as TAppointment[] // covert keys to camelCase
      },
    }
  )

  // get all the appointments for today
  const appointmentsToday = upcomingAppointments
    ? upcomingAppointments.filter((info) =>
        isSameDay(today, parseISO(info.appointmentDate))
      )
    : []

  // get all the appointments for tomorrow
  const appointmentsTomorrow = upcomingAppointments
    ? upcomingAppointments.filter((info) =>
        isSameDay(tomorrow, parseISO(info.appointmentDate))
      )
    : []

  const isLoading = appointmentLoading || recordLoading

  return (
    <div className="hidden py-6 max-h-[742px] overflow-hidden overflow-y-auto custom-scroll lg:block bg-[#F0F0F0] dark:bg-neutral-800 rounded-xl col-span-2 lg:order-3 lg:col-span-1 lg:row-span-3">
      <div className="flex flex-col">
        <div className="flex flex-col px-3 pt-4">
          {/* date header for selected day */}
          <div className="flex items-center">
            <h3 className="text-5xl 2xl:text-6xl font-bold">{dayDate}</h3>
            <div className="flex flex-col ml-2 2xl:mb-1 2xl:mt-1">
              <span className="text-2xl 2xl:text-4xl 2xl:leading-9 font-bold">
                {day}
              </span>
              <span className="ml-1 text-sm font-semibold opacity-65 -mt-0.5 2xl:mt-0 leading-4">
                {month}
              </span>
            </div>
          </div>

          {/* upcoming appointments */}
          {isLoading ? (
            <PendingAppointmentSkeleton />
          ) : (
            <React.Fragment>
              <div className="mt-5">
                {appointmentsToday.map((item, idx) => (
                  <Tasks
                    key={`task-appointment-today-${idx}`}
                    data={[
                      {
                        type: item.type as any,
                        time: item.appointmentTime,
                        appointmentDate: item.appointmentDate,
                        id: item.id,
                        doctor: {
                          ...item.doctor,
                          hospital: {
                            ...item.hospital,
                          },
                        },
                      },
                    ]}
                  />
                ))}
              </div>
              {appointmentsTomorrow.length !== 0 && (
                <div>
                  <div className="mt-3">
                    {appointmentsTomorrow.map((item, idx) => (
                      <Tasks
                        key={`task-appointment-tom-${idx}`}
                        data={[
                          {
                            type: item.type as any,
                            time: item.appointmentTime,
                            appointmentDate: item.appointmentDate,
                            id: item.id,
                            doctor: {
                              ...item.doctor,
                              hospital: {
                                ...item.hospital,
                              },
                            },
                          },
                        ]}
                      />
                    ))}
                  </div>
                </div>
              )}
            </React.Fragment>
          )}

          {/* tasks for today */}
          <div className="relative mt-5">
            <Activities />
          </div>
        </div>
      </div>
    </div>
  )
}
