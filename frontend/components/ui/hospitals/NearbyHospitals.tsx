"use client"

import { useMemo, useState } from "react"
import { useQueries } from "react-query"
import { firey } from "@/utils"
import { THospital } from "@/types"
import { hospitalService } from "@/lib/services/hospital"
import { Hospitals, Map } from "@/components"

type Props = {
  page?: number
  limit?: number
}

export default function NearbyHospitals({ page = 1, limit = 50 }: Props) {
  const [city, setCity] = useState("")
  const [mapCenter, setMapCenter] = useState<[number, number] | undefined>()

  const params = firey.createSearchParams({
    page,
    limit,
    ...(city ? { locations: city } : {}),
  })

  const [url1Query, url2Query] = useQueries([
    {
      queryKey: ["hospitals:locations"],
      queryFn: hospitalService.getHospitalLocations,
    },
    {
      queryKey: [`hospitals:page:${page}`, city],
      queryFn: async () => hospitalService.getHospitals(params.toString()),
      select: (data: unknown) => {
        return firey.convertKeysToCamelCase(data) as {
          total: number
          hospitals: THospital[]
        }
      },
    },
  ])

  const hospitals = useMemo(() => {
    const list = url2Query.data?.hospitals ?? []
    if (!city.trim()) return list
    const q = city.trim().toLowerCase()
    return list.filter((h) => (h.city || "").toLowerCase().includes(q))
  }, [url2Query.data, city])

  function onCityChange(next: string) {
    setCity(next)
    if (!next.trim()) {
      setMapCenter(undefined)
      return
    }
    const match = hospitals.find((h) =>
      (h.city || "").toLowerCase().includes(next.trim().toLowerCase()),
    )
    const geo = match?.geometry as { coordinates?: [number, number] } | undefined
    if (geo?.coordinates?.length === 2) {
      setMapCenter(geo.coordinates)
    }
  }

  const headline = city.trim()
    ? `Clinics in ${city.trim()}`
    : "Find care across India"

  const subcopy = city.trim()
    ? `Showing clinics matching “${city.trim()}”.`
    : "Search by city to narrow the list, or browse all clinics below."

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-center text-3xl sm:text-5xl md:text-6xl leading-12 lg:leading-[60px] max-w-[778px] tracking-tighter font-extrabold fancy mx-auto mb-2 break-words">
          {headline}
        </h1>
        <p className="mx-auto mb-6 max-w-xl text-center text-sm text-neutral-600 dark:text-neutral-400">
          {subcopy}
        </p>

        <div className="mx-auto mb-4 flex max-w-xl justify-center px-2">
          <input
            type="search"
            placeholder="City (e.g. Mumbai, Delhi, Bangalore)"
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            className="form-input w-full px-5 py-3 text-sm outline-none ring-[#0099ff] focus:ring-2"
            data-testid="hospitals-city"
          />
        </div>

        {(url1Query.data || url1Query.isFetched) && url2Query.data ? (
          <Map
            hospitals={hospitals}
            coordinates={mapCenter}
            key={mapCenter ? mapCenter.join(",") : "default"}
          />
        ) : (
          <div className="mt-1 flex h-80 items-center justify-center rounded-2xl border border-dashed border-neutral-300 text-sm text-neutral-500 sm:h-[516px] dark:border-neutral-700">
            Loading map…
          </div>
        )}
      </div>

      {(url1Query.data || url1Query.isFetched) && url2Query.data ? (
        <div>
          <h3 className="ml-2 font-extrabold text-2xl lg:text-3xl">
            {city.trim() ? `Nearby in ${city.trim()}` : "Nearby Hospitals"}
          </h3>
          <Hospitals hospitals={hospitals} />
        </div>
      ) : null}
    </div>
  )
}
