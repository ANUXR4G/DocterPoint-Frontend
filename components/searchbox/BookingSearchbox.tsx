"use client"

import { Icon, SimpleSpinner } from "@/components"
import { useClicksOutside } from "@/hooks/useClicksOutside"
import { useObserver } from "@/hooks/useObserver"
import { doctorServices } from "@/lib/services/doctor"
import { hospitalService } from "@/lib/services/hospital"
import { TDoctor } from "@/types"
import { firey } from "@/utils"
import Image from "next/image"
import React, { useDeferredValue, useMemo, useRef, useState } from "react"
import { useQueries, useQuery } from "react-query"

type Props = {
  name: "locations" | "hospitals" | "doctors"
  containerClassName?: string
  selection: (details: TDoctor | string) => void
  searchResult?: TDoctor[]
  value: string
  isSearchLoading?: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  clear: () => void
}

export default function DoctorSearchbox({
  name,
  containerClassName,
  selection: selectionCb,
  value,
  onChange,
  searchResult,
  isSearchLoading,
  clear,
}: Props) {
  const [isTouched, setIsTouched] = useState<boolean>(false)
  const itemRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [doctors, setDoctors] = useState<TDoctor[]>([])

  const deferredSearchKey = useDeferredValue(value)

  const openModal = () => setIsTouched(true)
  const closeModal = () => setIsTouched(false)

  const [page, setPage] = useState<number>(1)
  const [limit] = useState<number>(10)

  const params = firey.createSearchParams({
    page,
    limit,
  })

  const [url1Query, url2Query] = useQueries([
    {
      queryKey: ["hospitals:names"],
      queryFn: hospitalService.getHospitalNames,
    },
    {
      queryKey: ["hospitals:locations"],
      queryFn: hospitalService.getHospitalLocations,
    },
  ])

  const { data, isLoading } = useQuery(
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
      staleTime: 0,
      onSuccess: (data) => setDoctors((prev) => [...prev, ...data.doctors]),
    }
  )

  // close modal on click outside of the searchbox
  useClicksOutside([containerRef, itemRef], () => {
    closeModal()
  })

  const hospitalNames = url1Query.data
  const hospitalCities = url2Query.data

  const filterBySearchKey = (searchKey: string, items?: string[]) => {
    if (!items) return []
    return items.filter((item) =>
      item.toLowerCase().includes(searchKey.toLowerCase())
    )
  }

  const result = useMemo(() => {
    if (name === "doctors") return searchResult ?? doctors

    if (name === "hospitals")
      return filterBySearchKey(deferredSearchKey, hospitalNames)

    if (name === "locations")
      return filterBySearchKey(deferredSearchKey, hospitalCities)

    return []
  }, [
    deferredSearchKey,
    name,
    hospitalCities,
    hospitalNames,
    doctors,
    searchResult,
  ])

  function handleSelection(details: TDoctor | string) {
    selectionCb(details)
    setIsTouched(false)
  }

  const observerRef = useObserver({
    root: null,
    threshold: 1,
    onIntersect: () => {
      if (!data) return
      const totalPages = Math.ceil(data.total / 10)
      setPage((prev) => Math.min(prev + 1, totalPages))
    },
  })

  return (
    <div>
      {/* type input */}
      <div className="relative">
        <div className="absolute inset-y-0 start-0 flex items-center pointer-events-none z-20 ps-2.5">
          <Icon name="search" pathClassName="dark:stroke-neutral-500" />
        </div>
        <input
          className="border border-gray-200 dark:border-neutral-500 rounded-lg text-sm w-full py-2.5 pe-4 ps-9 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-neutral-50 dark:bg-neutral-700"
          type="text"
          name={name}
          value={value}
          onChange={(e) => onChange(e)}
          placeholder={
            name === "locations" ? "type a city name" : "type a name"
          }
          autoComplete="off"
          onFocus={openModal}
          ref={itemRef}
        />

        {/* options */}
        {isTouched && (
          <div
            ref={containerRef}
            className={`absolute w-full max-h-96 py-3 lg:pt-4 bg-white dark:bg-neutral-700 border dark:border-none dark:shadow-[inset_0_0_0_1px_rgba(248,248,248,0.2)] shadow-sm top-full mt-2 rounded-lg left-0 overflow-x-hidden overflow-y-auto flex flex-col custom-scroll-track ${containerClassName}`}
          >
            <h3
              className={`text-xs font-bold opacity-70 mb-1 ${
                result.length === 0 ? `mx-auto` : `ml-3 uppercase`
              }`}
            >
              {result.length === 0 ? `not found` : name}
            </h3>
            {result.map((item, idx) => (
              <div
                key={`booking-doctor-${idx}`}
                className="flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-neutral-600 hover:cursor-pointer px-3 py-2.5"
                onClick={() => {
                  handleSelection(item)
                }}
              >
                {/* display search results */}
                {typeof item !== "string" && (
                  <div className="relative size-9 rounded-full">
                    {/* image */}
                    <Image
                      fill
                      src={item.imgSrc}
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      alt="doctor.png"
                      style={{ objectFit: "cover", filter: "contrast(0.9)" }}
                      priority
                      className="rounded-full"
                    />
                    {/* image overlay */}
                    <div className="min-h-full min-w-full bg-black/35 absolute top-0 right-0 bottom-0 left-0 rounded-full" />
                  </div>
                )}
                <div className="flex flex-col -mt-0.5">
                  {typeof item === "string" && (
                    <h5 className="text-sm font-medium opacity-90 dark:text-neutral-300">
                      {item}
                    </h5>
                  )}
                  {typeof item !== "string" && (
                    <div>
                      <h3 className="text-sm font-medium">{item.name}</h3>
                      <p className="text-xs font-semibold opacity-70">
                        {item.availableTimes.split(":")[0]}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {name === "doctors" && (
              <React.Fragment>
                <div ref={observerRef} />
                {(isLoading || !!isSearchLoading) && (
                  <div className="-mt-8 relative">
                    <SimpleSpinner className="size-10" />
                  </div>
                )}
              </React.Fragment>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
