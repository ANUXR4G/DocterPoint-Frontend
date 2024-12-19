import { DoctorDetails, NoData } from "@/components"

export default async function DoctorProfilePage({ searchParams: { id } }: any) {
  if (!id) return <NoData />

  return (
    <div className="pb-5 lg:pb-6">
      <DoctorDetails id={id} />
    </div>
  )
}
