import { HospitalDetails, NoData } from "@/components"
import React from "react"

export default async function HospitalPage({ params: { id } }: any) {
  if (!id) return <NoData />

  return (
    <div className="pb-5 lg:pb-6">
      <HospitalDetails id={id} />
    </div>
  )
}
