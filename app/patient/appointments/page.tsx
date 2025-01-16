"use client"

import {
  BookAppointment,
  RecentAppointments,
  UpcomingAppointments,
} from "@/components"
import { useApi } from "@/hooks/useApi"
import { patientService } from "@/lib/services/patient"
import { TAppointment } from "@/types"
import { firey } from "@/utils"
import {
  addDays,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfToday,
  startOfTomorrow,
} from "date-fns"
import React from "react"

export default function AppointmentPage() {
  const { data: upcomingAppointments } = useApi(
    [`patients:appointments:upcoming`],
    (_, token) => patientService.upcoming_appointments(token),
    {
      select: (data) => {
        return firey.convertKeysToCamelCase(data) as TAppointment[] // covert keys to camelCase
      },
    }
  )

  const today = startOfToday()
  const tomorrow = startOfTomorrow()
  const endOfCurrentWeek = addDays(today, 6)

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

  // get all the upcoming appointments on this week
  const currentWeekAppointments = upcomingAppointments
    ? upcomingAppointments.filter((appointment) => {
        const appointmentDate = parseISO(appointment.appointmentDate)
        return isWithinInterval(appointmentDate, {
          start: today,
          end: endOfCurrentWeek,
        })
      })
    : []

  return (
    <div className="pb-8">
      {/* upcoming appointments */}
      {upcomingAppointments && (
        <div className="flex md:gap-4">
          <div
            className={
              upcomingAppointments.length > 0
                ? `w-full md:w-1/3 md:min-w-96`
                : `hidden`
            }
          >
            <UpcomingAppointments
              appointmentsToday={appointmentsToday}
              appointmentsTomorrow={appointmentsTomorrow}
              appointmentsCurrentWeek={currentWeekAppointments}
            />
          </div>
          <div />
        </div>
      )}

      {/* recent appointments */}
      <div className="flex w-full mb-3 relative">
        <BookAppointment />
      </div>
      <RecentAppointments />
    </div>
  )
}
