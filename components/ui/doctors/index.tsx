"use client"

import {
  Button,
  AppointmentModal,
  Icon,
  DoctorFilter,
  Pagination,
} from "@/components"
import { doctorServices } from "@/lib/services/doctor"
import { ApiResponse, TDoctor, TDoctorFilteringOpts } from "@/types"
import { firey } from "@/utils"
import Image from "next/image"
import Link from "next/link"
import React, { useCallback, useEffect, useState } from "react"
import { useQuery } from "react-query"

export default function Doctors() {
  const [open, setOpen] = useState<boolean>(false)
  const [active, setActive] = useState<TDoctor>()
  const [openFilter, setOpenFilter] = useState<boolean>(false)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState<number>(1)
  const [limit] = useState<number>(10)
  const [triggerFilter, setTriggerFilter] = useState<boolean>(false)

  const [filters, setFilters] = useState<TDoctorFilteringOpts>({
    locations: [],
    hospitals: [],
  })

  // check if the nested object containing array is empty
  const checkIfEmpty = useCallback(() => firey.objIsEmpty(filters), [filters])

  const params = firey.createSearchParams({
    page,
    limit,
    ...filters,
  })

  // retrieve all the doctor informations
  const {
    refetch,
    data: response,
    isLoading,
  } = useQuery(
    [`doctors:page:${page}`],
    async () => doctorServices.retrive_all(params),
    {
      select: (data) => {
        // covert keys to camelCase
        return firey.convertKeysToCamelCase(data) as ApiResponse<TDoctor[]>
      },
      staleTime: 0, //refetch on every query mount
      keepPreviousData: true,
    }
  )

  // close the modal
  function handleModalClose() {
    setOpen(false)
  }

  // handle booking appointment
  function handleBookAppointment(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    doctor: TDoctor
  ) {
    e.preventDefault()
    setOpen(true)
    setActive(doctor)
  }

  // handle prev indicator
  function handlePreviousPage() {
    if (page === 1) return
    setPage(page - 1)
  }

  // handle next indicator
  function handleNextPage() {
    if (page === totalPages) return
    setPage(page + 1)
  }

  // handle page number indicator
  function handlePageChange(page: number) {
    setPage(page)
  }

  function handleReset() {
    setFilters({
      locations: [],
      hospitals: [],
    })
    setPage(1)
    setTriggerFilter(true)
    setOpenFilter(false)
  }

  function handleConfirm() {
    refetch()
    setPage(1)
    setTriggerFilter(true)
    setOpenFilter(false)
  }

  function handleFiteringClose() {
    setOpenFilter(false)
  }

  // trigger on filter clear
  useEffect(() => {
    if (triggerFilter) {
      refetch()
      setTriggerFilter(false)
    }
  }, [triggerFilter, refetch])

  // update the total size of page
  useEffect(() => {
    if (!response || !response.total) return
    setTotalPages(Math.ceil(response.total / limit))
  }, [response, limit])

  if (isLoading || !response) return <div />

  return (
    <div className="flex flex-col">
      {/* <div className="flex items-center justify-between"> */}
      <h2 className="text-4xl font-bold leading-9 tracking-tighter">
        Find the best doctors around the city.
      </h2>

      {/* </div> */}
      <div className="flex justify-end -mr-2">
        <button
          className="size-10 rounded-full center hover:bg-zinc-200 dark:hover:bg-neutral-700"
          onClick={() => setOpenFilter(true)}
        >
          <Icon name="filter" className="size-6 opacity-80" />
        </button>
      </div>
      <div
        className={
          response.data.length > 0
            ? `grid grid-cols-1 xxs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 3xl:grid-cols-5 gap-2 md:gap-3 md:gap-y-4 mt-0 md:mt-1`
            : `w-full`
        }
      >
        {response.data.length > 0 ? (
          response.data.map((props, idx) => (
            <Link
              key={`doctor_l_${idx}`}
              href={`/hospitals/doctors/profile?id=${props.id}&type=view`}
            >
              <div className="p-2 xl:p-2.5 bg-white dark:bg-zinc-800 shadow rounded-lg hover:shadow-md hover:cursor-pointer">
                {/* doctor image */}
                <div className="relative w-full h-72 xxs:h-44 xs:h-64 lg:h-72 xl:h-80">
                  <Image
                    fill
                    src={props.imgSrc}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    alt="doctor.png"
                    style={{ objectFit: "cover", filter: "contrast(0.9)" }}
                    priority
                    className="rounded-lg"
                  />
                </div>
                {/* doctor description */}
                <div className="flex flex-col mt-2 ml-1">
                  <h4 className="text-sm font-bold">{props.name}</h4>
                  <p className="text-xs font-bold opacity-80 leading-4 line-clamp-3 min-h-12">
                    {props.description}
                  </p>
                  <div className="flex items-center opacity-80 mt-2 -ml-1">
                    <div>
                      <Icon name="pin" className="size-4 -mt-0.5 xs:mr-0.5" />
                    </div>
                    <h4 className="text-xs font-bold line-clamp-1">
                      {props.hospital.name}
                    </h4>
                  </div>
                </div>
                {/* appointment option */}
                <div className="mt-3 md:mt-4">
                  <Button
                    className="w-full h-10 center"
                    onClick={(e) => handleBookAppointment(e, props)}
                  >
                    <span className="block text-xs font-bold opacity-80">
                      book appointment
                    </span>
                  </Button>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="min-h-96 center">
            <h1 className="text-2xl font-bold">No Doctors Found 😔</h1>
          </div>
        )}

        {/* filter modal */}
        <DoctorFilter
          active={openFilter}
          closeHandler={handleFiteringClose}
          resetHandler={handleReset}
          confirmHandler={handleConfirm}
          filters={filters}
          setFilters={setFilters}
        />

        {/* appointment modal */}
        {active && (
          <AppointmentModal
            active={open}
            closeHandler={handleModalClose}
            doctor={active}
            type="profile"
          />
        )}
      </div>

      {/* pagination */}
      {response.data.length > 0 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          handlePreviousPage={handlePreviousPage}
          handleNextPage={handleNextPage}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  )
}
