"use client"

import { Hospitals, Map } from "@/components"
import { hospitalService } from "@/lib/services/hospital"
import { ApiResponse, THospital } from "@/types"
import { firey } from "@/utils"
import React from "react"
import { useQueries } from "react-query"

type Props = {
  page?: 1
  limit?: number
}

export default function NearbyHospitals({ page = 1, limit = 50 }: Props) {
  const params = firey.createSearchParams({
    page,
    limit,
  })

  const [url1Query, url2Query] = useQueries([
    {
      queryKey: ["hospital:locations"],
      queryFn: hospitalService.retrive_locations,
    },
    {
      queryKey: [`hospital:page:${page}`],
      queryFn: async () => hospitalService.retrive_all(params),
      select: (data: any) => {
        // covert keys to camelCase
        return firey.convertKeysToCamelCase(data) as ApiResponse<THospital[]>
      },
    },
  ])

  if (!url1Query.data || !url2Query.data) return <div />

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-center text-5xl md:text-6xl leading-12 lg:leading-[60px] max-w-[778px] tracking-tighter font-extrabold fancy mx-auto mb-6">
          We are now located at {url1Query.data.data.length} cities in Dhaka.
        </h1>
        <Map hospitals={url2Query.data.data} />
      </div>
      <div>
        <h3 className="ml-2 font-extrabold text-2xl lg:text-3xl">
          Nearby Hospitals
        </h3>
        <Hospitals hospitals={url2Query.data.data} />
      </div>
    </div>
  )
}
