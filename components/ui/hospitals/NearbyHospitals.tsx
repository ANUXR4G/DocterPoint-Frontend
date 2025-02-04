"use client"

import { useQueries } from "react-query"
import { firey } from "@/utils"
import { THospital } from "@/types"
import { hospitalService } from "@/lib/services/hospital"
import { Hospitals, HospitalSkeleton, Map } from "@/components"

type Props = {
  page?: number
  limit?: number
}

export default function NearbyHospitals({ page = 1, limit = 50 }: Props) {
  const params = firey.createSearchParams({
    page,
    limit,
  })

  // Retrieve Locations and Hospial Informations
  const [url1Query, url2Query] = useQueries([
    {
      queryKey: ["hospitals:locations"],
      queryFn: hospitalService.getHospitalLocations,
    },
    {
      queryKey: [`hospitals:page:${page}`],
      queryFn: async () => hospitalService.getHospitals(params.toString()),
      select: (data: any) => {
        // Covert keys to camelCase
        return firey.convertKeysToCamelCase(data) as {
          total: number
          hospitals: THospital[]
        }
      },
    },
  ])

  // Check if retrieval the data is loading
  const isLoading =
    !url1Query.data ||
    !url2Query.data ||
    url1Query.isLoading ||
    url2Query.isLoading

  // Show loading UI
  if (isLoading) return <HospitalSkeleton />

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-center text-5xl md:text-6xl leading-12 lg:leading-[60px] max-w-[778px] tracking-tighter font-extrabold fancy mx-auto mb-6">
          We are now located at {url1Query.data.length} cities in Dhaka.
        </h1>
        {/* Hospital Maps */}
        <Map hospitals={url2Query.data.hospitals} />
      </div>

      {/* Nearby Hospital Swiper */}
      <div>
        <h3 className="ml-2 font-extrabold text-2xl lg:text-3xl">
          Nearby Hospitals
        </h3>
        <Hospitals hospitals={url2Query.data.hospitals} />
      </div>
    </div>
  )
}
