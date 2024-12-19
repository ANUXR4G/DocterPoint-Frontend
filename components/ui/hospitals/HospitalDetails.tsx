"use client"

import {
  Icon,
  Map,
  ContactInformation,
  HospitalSuggestions,
} from "@/components"
import { hospitalService } from "@/lib/services/hospital"
import { ApiResponse, THospital } from "@/types"
import { firey } from "@/utils"
import Image from "next/image"
import Link from "next/link"
import React from "react"
import { useQuery } from "react-query"

type Props = {
  id: string
}

export default function HospitalDetails({ id }: Props) {
  const { data: hospitalInfo } = useQuery(
    [`hospital:info:${id}`],
    async () => hospitalService.information(id),
    {
      select: (data) => {
        // covert keys to camelCase
        return firey.convertKeysToCamelCase(data) as ApiResponse<THospital>
      },
    }
  )

  if (!hospitalInfo) return <div />

  return (
    <React.Fragment>
      <div className="flex flex-col items-center text-center">
        <h1 className="text-5xl md:text-6xl leading-[54px] lg:leading-[60px] max-w-[778px] tracking-tighter font-extrabold fancy">
          {hospitalInfo.data.name}
        </h1>
        <div className="mt-5 size-56 min-w-56 md:size-80 md:min-w-80 relative rounded-2xl">
          <Image
            fill
            src={hospitalInfo.data.imgSrc}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            alt="doctor.png"
            style={{ objectFit: "cover", filter: "contrast(0.9)" }}
            priority
            className="rounded-2xl"
          />
        </div>
        <p className="mt-4 text-sm lg:text-base max-w-[556px] font-semibold opacity-80 line-clamp-4">
          {hospitalInfo.data.description}
        </p>
        <Link
          href={{
            pathname: "/hospitals/doctors",
            query: { location: hospitalInfo.data.city },
          }}
          className="mt-3 flex items-center -ml-1 opacity-80"
        >
          <Icon name="pin" className="size-5" />
          <h5 className="ml-1 text-sm font-semibold line-clamp-1">
            {hospitalInfo.data.city}
          </h5>
        </Link>
        <p className="mt-1 text-sm font-semibold opacity-70 line-clamp-2">
          {hospitalInfo.data.address}
        </p>

        {/* contact informations */}
        <ContactInformation
          contactNumbers={hospitalInfo.data.contactNumbers}
          emails={hospitalInfo.data.emails}
        />
      </div>

      {/* hospital map */}
      <div className="mt-6 lg:mt-8">
        <Map
          hospitals={[hospitalInfo.data]}
          coordinates={hospitalInfo.data.geometry.coordinates}
        />
      </div>

      {/* doctors from the same hospital */}
      {hospitalInfo && (
        <HospitalSuggestions
          hospitalId={hospitalInfo.data.id}
          hospitalName={hospitalInfo.data.name}
        />
      )}
    </React.Fragment>
  )
}
