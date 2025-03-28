"use client"

import Pagination from "@/components/pagination"
import { useDoctor } from "@/hooks/useDoctor"
import { TDoctorAppointment } from "@/types"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { firey } from "@/utils"
import Button from "@/components/buttons/Button"
import Table from "@/components/table/Table"
import AppointmentInfo from "../AppointmentInfo"

export default function Appointments() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [isHydrated, setHydrated] = useState<boolean>(false)

  const page = Number(searchParams.get("page")) || 1
  const showInfo = !!searchParams.get("info")

  const [limit] = useState<number>(15)
  const [totalPages, setTotalPages] = useState<number>(1)

  const { data, isLoading } = useDoctor<{
    total: number
    appointments: TDoctorAppointment[]
  }>(
    "appointments",
    new URLSearchParams({
      page: String(page),
      date: "latest",
      limit: String(limit),
    })
  )

  // Handle previous page of the pagination
  function handlePreviousPage() {
    // setQuery("")
    router.push(`?page=${Math.max(page - 1, 1)}`)
  }

  // Handle next page of the pagination
  function handleNextPage() {
    // setQuery("")
    router.push(`?page=${Math.min(page + 1, totalPages)}`)
  }

  // Handle on page change when clicked on a specific index of the pagination
  function handleOnPageChange(page: number) {
    // setQuery("")
    router.push(`?page=${page}`)
  }

  // Update the total size of page
  useEffect(() => {
    if (!data) return
    setTotalPages(Math.ceil(data.total / limit))
  }, [data, limit])

  // Refactor the retrieve data for table
  const values =
    data?.appointments.map((info) => ({
      id: info.id,
      patientId: info.patient.id,
      serial: `#${info.serialNumber}`,
      patient_name: info.patient.name,
      date: format(info.appointmentDate, "dd/MM/yyyy"),
      status: info.status,
      visit_reason: firey.makeString(info.purposeOfVisit),
      type: info.mode,
      patient_note: info.patientNote || `NA`,
      personal_note: info.doctorNote || `NA`,
      details: ``,
    })) || []

  // Custom fields for the table
  const disableIds = [5, 7, 10]
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
          router.push(`?info=${values.id}&id=${values.patientId}`)
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
    <div>
      {values.length > 0 ? (
        <div className="mt-3 border dark:border-neutral-500 border-neutral-300 bg-transparent dark:bg-neutral-800 rounded-2xl">
          <Table
            name={`appointment-tracking`}
            values={values}
            disableIds={disableIds}
            customFields={customFields}
            headerClassName="[&:nth-child(1)]:hidden [&:nth-child(2)]:hidden"
            bodyClassName="[&:nth-child(1)]:hidden [&:nth-child(2)]:hidden [&:nth-child(3)]:min-w-16 [&:nth-child(4)]:min-w-32 [&:nth-child(6)]:text-xs [&:nth-child(7)]:min-w-40 [&:nth-child(7)]:max-w-56 [&:nth-child(7)]:font-semibold [&:nth-child(7)]:opacity-80 [&:nth-child(7)]:text-xs [&:nth-child(8)]:text-xs [&:nth-child(9)]:min-w-32 [&:nth-child(9)]:max-w-40 [&:nth-child(10)]:min-w-32 [&:nth-child(10)]:max-w-40"
          />
        </div>
      ) : (
        <div className="text-sm font-semibold opacity-90 text-neutral-500 flex mt-2.5 ml-2.5">
          No appointment record exists
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          handlePreviousPage={handlePreviousPage}
          handleNextPage={handleNextPage}
          onPageChange={handleOnPageChange}
        />
      )}

      {showInfo && <AppointmentInfo />}
    </div>
  )
}
