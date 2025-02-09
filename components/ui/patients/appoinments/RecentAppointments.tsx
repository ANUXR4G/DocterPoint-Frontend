"use client"

import Link from "next/link"
import { format } from "date-fns"
import React, { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { firey } from "@/utils"
import { TAppointment } from "@/types"
import { useApi } from "@/hooks/useApi"
import { patientService } from "@/lib/services/patient"

import {
  AppointmentDetailsModal,
  Appointment,
  Modal,
  EmptyAppointment,
  Pagination,
} from "@/components"

type Props = {
  upcomingIds: string[]
}

const tableFields = [
  "serial",
  "time",
  "status",
  "doctor",
  "hospital",
  "visit reason",
  "type",
  "tests",
  "details",
]

export default function RecentAppointments({ upcomingIds }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const popup = !!searchParams.get("popup")
  const page = Number(searchParams.get("page")) || 1
  const [limit] = useState<number>(10)
  const [totalPages, setTotalPages] = useState<number>(1)

  const [selected, setSelected] = useState<TAppointment | null>(null)
  const [openDetailsModal, setOpenDetailsModal] = useState<boolean>(popup)
  const [openTestsModal, setOpenTestsModal] = useState<boolean>(false)

  const [query, setQuery] = useState<string>("")

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setQuery(e.target.value)

  const { data, isLoading } = useApi(
    [`patients:appointments:page:${page}`],
    (_, token) =>
      patientService.getAllAppointments(token, searchParams.toString()),
    {
      select: (data) => {
        const _data = firey.convertKeysToCamelCase(data) as {
          total: number
          appointments: TAppointment[]
        } // covert keys to camelCase
        const filtered_appointments = _data.appointments.filter(
          (item) => !upcomingIds.includes(item.id)
        )
        return {
          total: _data.total,
          appointments:
            filtered_appointments.length > 0
              ? filtered_appointments
              : _data.appointments,
        }
      },
      staleTime: 0,
    }
  )

  console.log(upcomingIds)

  // Handle appointment details modal opening
  function handleOpenDetailsModal(info: TAppointment, idx: number) {
    if (!searchParams.get("popup") && !searchParams.get("id")) {
      router.push(`?popup=t&id=${info.id}&${searchParams}`)
    }
    setSelected(info)
    setOpenDetailsModal(true)
  }

  // Handle appointment details modal closing
  function closeDetailsModal() {
    router.push(`?page=${page}`)
    setOpenDetailsModal(false)
    setSelected(null)
  }

  // Handle page number indicator
  function handlePageChange(page: number) {
    setQuery("")
    router.push(`?page=${page}`)
  }

  // Handle previous page
  function handlePreviousPage() {
    setQuery("")
    router.push(`?page=${Math.max(page - 1, 1)}`)
  }

  // Handle next page
  function handleNextPage() {
    setQuery("")
    router.push(`?page=${Math.min(page + 1, totalPages)}`)
  }

  // Update queries
  useEffect(() => {
    const encodedQuery = encodeURIComponent(query).replace(/%20/g, "+")
    if (query.length > 0) {
      router.push(`?q=${encodedQuery}&page=${page}`)
    }
  }, [searchParams, router, page, limit, query])

  // Update the total size of page
  useEffect(() => {
    if (!data) return
    setTotalPages(Math.ceil(data.total / limit))
  }, [data, limit])

  if (!data || isLoading) return <div />
  if (data.appointments.length === 0 && upcomingIds.length === 0)
    return <EmptyAppointment />

  return (
    <React.Fragment>
      <h1 className={`mt-6 ml-2 mb-3 text-2xl font-bold`}>
        Recent Appointments
      </h1>
      <div className="border rounded-lg overflow-x-auto hidden md:block">
        <table className="table-auto min-w-full divide-y divide-gray-200">
          <thead className="bg-zinc-200/50 dark:bg-neutral-500/50">
            <tr>
              {tableFields.map((field, idx) => (
                <th
                  key={`recent-key${idx}`}
                  scope="col"
                  className="px-2 py-2 text-xs font-medium text-gray-500 dark:text-neutral-300 uppercase text-center [&:nth-child(2)]:text-start [&:nth-child(4)]:text-start [&:nth-child(5)]:text-start [&:nth-child(6)]:text-start"
                >
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.appointments.length > 0 &&
              data.appointments.map((item, idx) => (
                <tr key={`recent-table-body-${idx}`}>
                  {/* serial */}
                  <td className="p-2 text-sm text-center font-semibold text-gray-800 dark:text-neutral-300 opacity-80">
                    #{item.serialNumber}
                  </td>

                  {/* time */}
                  <td className="p-2 text-sm font-medium text-gray-800 dark:text-neutral-300 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span>{item.appointmentTime}</span>
                      <span className="text-xs font-semibold opacity-75">
                        {format(item.appointmentDate, "dd/MM/yyyy")}
                      </span>
                    </div>
                  </td>

                  {/* status */}
                  <td className="w-28 p-2 text-xs font-bold text-gray-800/70 dark:text-neutral-300/70">
                    <div className="px-2 py-1.5 text-center whitespace-nowrap rounded-lg flex items-center gap-2">
                      <div
                        className={`size-3 rounded-full ${
                          item.status === "upcoming"
                            ? `bg-green-200 dark:bg-green-300`
                            : `bg-blue-200 dark:bg-blue-300`
                        }`}
                      />
                      <span>{item.status}</span>
                    </div>
                  </td>

                  {/* doctor */}
                  <td className="p-2 text-sm font-medium text-gray-800 dark:text-neutral-300 min-w-32 max-w-36">
                    <div>
                      <Link
                        href={`/hospitals/doctors/info?id=${item.doctor.id}`}
                      >
                        {item.doctor.name}
                      </Link>
                    </div>
                  </td>

                  {/* hospital details */}
                  <td className="p-2 text-sm font-medium text-gray-800 dark:text-neutral-300 min-w-36">
                    <div>
                      <Link href={`/hospitals/${item.hospital.id}/info`}>
                        {item.hospital.name}
                      </Link>
                      <p className="text-xs font-semibold opacity-80">
                        {item.hospital.address}
                      </p>
                    </div>
                  </td>

                  {/* visit reason */}
                  <td className="min-w-40 p-2 text-xs font-semibold text-gray-800 dark:text-neutral-300 opacity-80">
                    {item.purposeOfVisit.join(", ")}.
                  </td>

                  {/* type */}
                  <td
                    className={`p-2 w-28 text-xs font-bold text-gray-800/70 dark:text-neutral-300`}
                  >
                    <div className="px-2 py-1.5 text-center whitespace-nowrap rounded-lg flex gap-2 items-center">
                      <div className="size-3 rounded-full bg-zinc-300" />
                      <span>{item.mode}</span>
                    </div>
                  </td>

                  <td className="p-2 text-center text-sm font-medium text-gray-800">
                    <button
                      type="button"
                      className="inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-blue-600 hover:text-blue-800 focus:outline-none focus:text-blue-800 disabled:opacity-50 disabled:pointer-events-none"
                      onClick={() => setOpenTestsModal(true)}
                    >
                      view
                    </button>
                  </td>
                  <td className="text-center px-2 py-4  text-sm font-medium text-gray-800">
                    <button
                      type="button"
                      className="inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-blue-600 hover:text-blue-800 focus:outline-none focus:text-blue-800 disabled:opacity-50 disabled:pointer-events-none"
                      onClick={() => handleOpenDetailsModal(item, idx)}
                    >
                      view
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* for smaller viewport */}
      <div className="bg-slate-200/50 dark:bg-neutral-700 p-4 pb-5 rounded-lg flex flex-col gap-4 md:hidden">
        {data.appointments.map((item, idx) => (
          <Appointment
            key={`appointment-today-${idx}`}
            appointment={item}
            openModal={() => handleOpenDetailsModal(item, idx)}
          />
        ))}
      </div>

      {/* appointment modal details */}
      <AppointmentDetailsModal
        isOpen={openDetailsModal}
        closeModal={closeDetailsModal}
        selected={selected}
        setSelected={setSelected}
      />

      {/* tests */}
      <Modal open={openTestsModal} handler={() => setOpenTestsModal(false)}>
        <div className="text-center mt-auto">
          <span className="text-lg font-fold opacity-80">
            No tests available 🍇
          </span>
        </div>
      </Modal>

      {/* pagination */}
      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          handlePreviousPage={handlePreviousPage}
          handleNextPage={handleNextPage}
          onPageChange={handlePageChange}
        />
      )}
    </React.Fragment>
  )
}
