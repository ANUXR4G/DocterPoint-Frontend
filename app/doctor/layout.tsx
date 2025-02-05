import { Background, DoctorNavigation } from "@/components"

export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <DoctorNavigation />
      <Background name="gradient-2" />
      <div className="ml-auto md:w-[calc(100%-72px)] xl:w-[calc(100%-240px)] p-4 xs:px-4">
        {children}
      </div>
    </>
  )
}
