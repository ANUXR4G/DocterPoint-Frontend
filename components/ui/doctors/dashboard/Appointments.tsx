"use client"

import Button from "@/components/buttons/Button"
import Table from "@/components/table/Table"
import useAppointments from "@/hooks/useAppointments"
import { TRequestAppointment } from "@/types"
import { format } from "date-fns"

export default function Appointments() {
  const { data } = useAppointments<{
    total: number
    appointments: TRequestAppointment[]
  }>("doctor", new URLSearchParams({ page: "1", date: "latest" }))

  const values =
    data?.appointments.map((info) => ({
      serial: `#${info.serialNumber}`,
      patient_name: info.patient.name,
      date: format(info.appointmentDate, "dd/MM/yyyy"),
      status: info.status,
      visit_reason: info.purposeOfVisit.join(", "),
      type: info.mode,
      patient_note: info.patientNote || `None`,
      doctor_note: info.doctorNote || `None`,
      details: ``,
    })) || []

  const disableIds = [3, 5, 8]

  const customFields = [
    (value: string) => (
      <div className="center px-2 py-1.5 text-center whitespace-nowrap rounded-lg flex items-center gap-2">
        <div
          className={`size-3 rounded-full ${
            value === "upcoming"
              ? `bg-green-200 dark:bg-green-300`
              : `bg-blue-200 dark:bg-blue-300`
          }`}
        />
        <span className="text-xs font-bold opacity-80">{value}</span>
      </div>
    ),
    (value: string) => (
      <div className="center px-2 py-1.5 text-center whitespace-nowrap rounded-lg flex gap-2 items-center">
        <div className="size-3 rounded-full bg-zinc-300" />
        <span>{value}</span>
      </div>
    ),
    () => (
      <Button type="outline" className="h-8 text-xs">
        View
      </Button>
    ),
  ]

  return (
    <div className={`mt-8 min-h-40 w-full lg:order-4 col-span-4`}>
      <div className="flex items-center justify-between">
        <h1 className="text-start ml-2 text-xl lg:text-3xl text-neutral-500 font-semibold">
          Appointment History
        </h1>
        <Button type="outline" className="text-xs text-nowrap mr-1">
          view appointments
        </Button>
      </div>
      <div className="mt-3 border dark:border-neutral-500 border-neutral-300 bg-transparent dark:bg-neutral-800 rounded-2xl ">
        <Table
          name={`appointment-tracking`}
          values={values}
          disableIds={disableIds}
          customFields={customFields}
          bodyClassName="[&:nth-child(2)]:w-48 [&:nth-child(4)]:text-xs [&:nth-child(5)]:min-w-36 [&:nth-child(5)]:text-xs [&:nth-child(5)]:font-semibold [&:nth-child(5)]:opacity-80 [&:nth-child(6)]:min-w-24"
        />
      </div>
    </div>
  )
}
