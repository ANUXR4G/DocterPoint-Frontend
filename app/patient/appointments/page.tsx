"use client"

import React from "react"
import {
  addDays,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfToday,
  startOfTomorrow,
} from "date-fns"

import { firey } from "@/utils"
import { TAppointment } from "@/types"
import { patientService } from "@/lib/services/patient"

import { useApi } from "@/hooks/useApi"

import {
  AppointmentSkeleton,
  BookAppointment,
  RecentAppointments,
  UpcomingAppointments,
} from "@/components"

export default function AppointmentsPage() {
  // Retrieve all the upcoming appointments
  const { data: upcomingAppointments, isLoading } = useApi(
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

  // Sort out all the appointments for today
  const appointmentsToday = upcomingAppointments
    ? upcomingAppointments.filter((info) =>
        isSameDay(today, parseISO(info.appointmentDate))
      )
    : []

  // Sort out all the appointments for tomorrow
  const appointmentsTomorrow = upcomingAppointments
    ? upcomingAppointments.filter((info) =>
        isSameDay(tomorrow, parseISO(info.appointmentDate))
      )
    : []

  // Sort out all the upcoming appointments on this week
  const currentWeekAppointments = upcomingAppointments
    ? upcomingAppointments.filter((appointment) => {
        const appointmentDate = parseISO(appointment.appointmentDate)
        return isWithinInterval(appointmentDate, {
          start: today,
          end: endOfCurrentWeek,
        })
      })
    : []

  // Appointment Loading Skeleton
  if (isLoading) return <AppointmentSkeleton />

  return (
    <div className="pb-8">
      {/* Upcoming appointments */}
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

      {/* Book appointment Modal and btn */}
      <div className="flex w-full mb-3 relative">
        <BookAppointment />
      </div>

      {/* Recent appointments */}
      <RecentAppointments />
    </div>
  )
}
