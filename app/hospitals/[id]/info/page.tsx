import { HospitalDetails, NoData } from "@/components"
import React from "react"

export default async function HospitalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!id) return <NoData />

  return (
    <div className="pb-5 lg:pb-6">
      <HospitalDetails id={id} />
    </div>
  )
}
