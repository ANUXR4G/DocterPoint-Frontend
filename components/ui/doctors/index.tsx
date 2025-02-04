"use client"

import Image from "next/image"
import Link from "next/link"
import { useQuery } from "react-query"
import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { firey } from "@/utils"
import { TDoctor, TDoctorFilteringOpts } from "@/types"
import { doctorServices } from "@/lib/services/doctor"

import {
  Button,
  Icon,
  DoctorFilter,
  Pagination,
  NoData,
  Loader,
} from "@/components"

export default function Doctors() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const filter_location = searchParams.get("location")
  const page = Number(searchParams.get("page")) || 1
  const [limit] = useState<number>(10)
  const [totalPages, setTotalPages] = useState(1)

  const [openFilter, setOpenFilter] = useState<boolean>(false)
  const [triggerFilter, setTriggerFilter] = useState<boolean>(false)
  const [filters, setFilters] = useState<TDoctorFilteringOpts>({
    locations: filter_location ? [filter_location] : [],
    hospitals: [],
  })

  const params = firey.createSearchParams({
    page,
    limit,
    ...filters,
  })

  // retrieve all the doctor informations
  const { refetch, data, isLoading } = useQuery(
    [`doctors:page:${page}`],
    async () => doctorServices.getDoctors(params.toString()),
    {
      select: (data) => {
        // covert keys to camelCase
        return firey.convertKeysToCamelCase(data) as {
          total: number
          doctors: TDoctor[]
        }
      },
      staleTime: 0, //refetch on every query mount
      keepPreviousData: true,
    }
  )

  // handle booking appointment
  function handleBookAppointment(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    doctor: TDoctor
  ) {
    e.preventDefault()
    router.push(`/hospitals/doctors/info?id=${doctor.id}&popup=t`)
  }

  // handle prev indicator
  function handlePreviousPage() {
    // setPage((prev) => Math.max(prev - 1, 1))
    router.push(`?page=${Math.max(page - 1, 1)}`)
  }

  // handle next indicator
  function handleNextPage() {
    // setPage((prev) => Math.min(prev + 1, totalPages))
    router.push(`?page=${Math.min(page + 1, totalPages)}`)
  }

  // handle page number indicator
  function handlePageChange(page: number) {
    // setPage(page)
    router.push(`?page=${page}`)
  }

  function handleReset() {
    setFilters({
      locations: [],
      hospitals: [],
    })
    setTriggerFilter(true)
    setOpenFilter(false)
  }

  function handleConfirm() {
    refetch()
    setTriggerFilter(true)
    setOpenFilter(false)
  }

  function handleFiteringClose() {
    setOpenFilter(false)
  }

  // trigger on filter clear
  useEffect(() => {
    if (triggerFilter) {
      // update the param if filter location exists
      refetch()
      setTriggerFilter(false)
      // on confirmation set router to pathname if it was previously being filtered by location
      if (filter_location) router.push(pathname)
    }
  }, [triggerFilter, refetch, filter_location, router, pathname])

  // update filtering for location query
  useEffect(() => {
    if (filter_location) {
      refetch()
    }
  }, [filter_location, refetch])

  // update the total size of page
  useEffect(() => {
    if (!data) return
    setTotalPages(Math.ceil(data.total / limit))
  }, [data, limit])

  // if (isLoading || infoLoading) return <Loader />
  if (isLoading) return <Loader />

  // handle inaccurate information
  if (!data) return <NoData content="oops, something went wrong." />

  return (
    <div className="flex flex-col">
      <h2 className="text-4xl font-bold leading-9 tracking-tighter">
        Find the best doctors around the city.
      </h2>

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
          data.doctors.length > 0
            ? `grid grid-cols-1 xxs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 3xl:grid-cols-5 gap-2 md:gap-3 md:gap-y-4 mt-0 md:mt-1`
            : `w-full`
        }
      >
        {data.doctors.length > 0 ? (
          data.doctors.map((props, idx) => (
            <Link
              key={`doctor_l_${idx}`}
              href={{
                pathname: "/hospitals/doctors/info",
                query: { id: props.id },
              }}
            >
              <div className="p-2 xl:p-2.5 bg-white dark:bg-zinc-800 shadow rounded-lg hover:shadow-md hover:cursor-pointer">
                {/* Doctor Image */}
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

                {/* Doctor Description */}
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

                {/* Booking Confirmation Button */}
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

        {/* Filter doctors based on different criteria */}
        <DoctorFilter
          active={openFilter}
          closeHandler={handleFiteringClose}
          resetHandler={handleReset}
          confirmHandler={handleConfirm}
          filters={filters}
          setFilters={setFilters}
        />
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
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
