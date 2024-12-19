import { Background, Navigation } from "@/components"

export default function HospitalsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Navigation />
      <Background name="gradient-2" className="dark:hidden" />
      <Background
        name="half-box-pattern"
        className="hidden !fixed dark:block"
      />
      <div className="ml-auto md:w-[calc(100%-72px)] xl:w-[calc(100%-240px)] p-4 xs:px-4">
        {children}
      </div>
    </>
  )
}
