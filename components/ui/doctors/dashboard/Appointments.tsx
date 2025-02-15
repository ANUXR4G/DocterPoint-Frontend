"use client"

import { Table, Button } from "@/components"
import { useAppointments } from "@/hooks/useAppointments"
import { TDoctorAppointment } from "@/types"
import { format } from "date-fns"
import Link from "next/link"
import React, { useEffect, useState } from "react"

export default function Appointments() {
  const [isHydrated, setHydrated] = useState(false)

  // Retrieve appointments info of the doctor
  const { data, isLoading } = useAppointments<{
    total: number
    appointments: TDoctorAppointment[]
  }>("doctor", new URLSearchParams({ page: "1", date: "latest" }))

  // Refactor the retrieve data for table
  const values =
    data?.appointments.map((info) => ({
      id: info.id,
      serial: `#${info.serialNumber}`,
      patient_name: info.patient.name,
      date: format(info.appointmentDate, "dd/MM/yyyy"),
      status: info.status,
      visit_reason: info.purposeOfVisit.join(", "),
      type: info.mode,
      patient_note: info.patientNote || `None`,
      personal_note: info.doctorNote || `None`,
      details: ``,
    })) || []

  // Custom fields for the table
  const disableIds = [4, 6, 9]
  const customFields = [
    (values: any) => (
      <div className="center px-2 py-1.5 text-center whitespace-nowrap rounded-lg flex items-center gap-2">
        <div
          className={`size-3 rounded-full ${
            values.status === "upcoming"
              ? `bg-green-200 dark:bg-green-300`
              : `bg-blue-200 dark:bg-blue-300`
          }`}
        />
        <span className="text-xs font-bold opacity-80">{values.status}</span>
      </div>
    ),
    (values: any) => (
      <div className="center px-2 py-1.5 text-center whitespace-nowrap rounded-lg flex gap-2 items-center">
        <div className="size-3 rounded-full bg-zinc-300" />
        <span>{values.type}</span>
      </div>
    ),
    (values: any) => (
      <Button
        type="outline"
        className="h-8 text-xs"
        onClick={() => {
          console.log(values.id)
        }}
      >
        View
      </Button>
    ),
  ]

  useEffect(() => {
    setHydrated(true)
  }, [])

  // Display loading skeleton UI
  if (!isLoading && !isHydrated)
    return (
      <div
        role="status"
        className="animate-pulse w-full mt-5 lg:order-4 col-span-4"
      >
        <div className="ml-1 mb-3 w-72 h-9 lg:h-14 rounded-sm lg:rounded-md bg-gray-300/80 dark:bg-neutral-700/75" />
        <div className="rounded-lg h-72 bg-gray-300/80 dark:bg-neutral-700/75" />
        <span className="sr-only">loading...</span>
      </div>
    )

  return (
    <React.Fragment>
      <div className={`mt-8 min-h-40 w-full lg:order-4 col-span-4`}>
        <div className="flex items-center justify-between">
          <h1 className="text-start ml-2 text-xl lg:text-3xl text-neutral-500 font-semibold">
            Appointment History
          </h1>
          <Link
            className="bg-white dark:bg-neutral-300 text-neutral-600 shadow-sm hover:bg-gray-50 hover:text-neutral-700 dark:hover:bg-neutral-200 focus:outline outline-offset-2 focus:outline-blue-400 py-2 px-3 inline-flex items-center font-semibold gap-x-2 text-xs rounded-lg border border-gray-200"
            href="/doctor/appointments"
          >
            view appointments
          </Link>
        </div>
        <div className="mt-3 border min-h-72 dark:border-neutral-500 border-neutral-300 bg-transparent dark:bg-neutral-800 rounded-2xl ">
          <Table
            name={`appointment-tracking`}
            values={values}
            disableIds={disableIds}
            customFields={customFields}
            headerClassName="[&:nth-child(1)]:hidden"
            bodyClassName="[&:nth-child(1)]:hidden [&:nth-child(3)]:min-w-48 [&:nth-child(5)]:text-xs [&:nth-child(6)]:min-w-36 [&:nth-child(6)]:text-xs [&:nth-child(7)]:text-xs [&:nth-child(6)]:font-semibold [&:nth-child(6)]:opacity-80 [&:nth-child(6)]:min-w-24"
          />
        </div>
      </div>
    </React.Fragment>
  )
}
