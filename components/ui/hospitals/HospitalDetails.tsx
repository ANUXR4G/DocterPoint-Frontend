"use client"

import React from "react"
import Link from "next/link"
import Image from "next/image"
import { useQuery } from "react-query"

import { THospital } from "@/types"
import { firey } from "@/utils"
import {
  Icon,
  Map,
  ContactInformation,
  HospitalSuggestions,
  HospitalInfoSkeleton,
} from "@/components"
import { hospitalService } from "@/lib/services/hospital"

type Props = {
  id: string
}

export default function HospitalDetails({ id }: Props) {
  const { data } = useQuery(
    [`hospitals:info:${id}`],
    async () => hospitalService.getHospitalInfo(id),
    {
      select: (data) => {
        // Covert keys to camelCase
        return firey.convertKeysToCamelCase(data) as THospital
      },
    }
  )

  if (!data) return <div />

  return (
    <React.Fragment>
      <div className="flex flex-col items-center text-center">
        <h1 className="text-5xl md:text-6xl leading-[54px] lg:leading-[60px] max-w-[778px] tracking-tighter font-extrabold fancy">
          {data.name}
        </h1>
        <div className="mt-5 size-56 min-w-56 md:size-80 md:min-w-80 relative rounded-2xl">
          <Image
            fill
            src={data.imgSrc}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            alt="doctor.png"
            style={{ objectFit: "cover", filter: "contrast(0.9)" }}
            priority
            className="rounded-2xl"
          />
        </div>
        <p className="mt-4 text-sm lg:text-base max-w-[556px] font-semibold opacity-80 line-clamp-4">
          {data.description}
        </p>
        <Link
          href={{
            pathname: "/hospitals/doctors",
            query: { location: data.city },
          }}
          className="mt-3 flex items-center -ml-1 opacity-80"
        >
          <Icon name="pin" className="size-5" />
          <h5 className="ml-1 text-sm font-semibold line-clamp-1">
            {data.city}
          </h5>
        </Link>
        <p className="mt-1 text-sm font-semibold opacity-70 line-clamp-2">
          {data.address}
        </p>

        {/* Contact informations */}
        <ContactInformation
          contactNumbers={data.contactNumbers}
          emails={data.emails}
        />
      </div>

      {/* Hospital map */}
      <div className="mt-6 lg:mt-8">
        <Map hospitals={[data]} coordinates={data.geometry.coordinates} />
      </div>

      {/* Doctors from the same hospital */}
      {data && (
        <HospitalSuggestions hospitalId={data.id} hospitalName={data.name} />
      )}
    </React.Fragment>
  )
}
