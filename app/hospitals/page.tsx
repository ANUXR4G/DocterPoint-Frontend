import { SuggestedDoctors, NearbyHospitals } from "@/components"

export default function HospitalsPage() {
  return (
    <div className="pb-4 lg:pb-6">
      {/* Nearby hospitals */}
      <NearbyHospitals />

      {/* Doctor suggestions */}
      <div className="mt-8">
        <SuggestedDoctors experience={6}>
          <h1 className="flex gap-2 text-2xl lg:text-3xl leading-tight font-bold opacity-90 ml-2 mb-1">
            Top rated x{" "}
            <span className="bg-gradient-to-r from-red-400 to-pink-500 bg-clip-text text-transparent">
              GlucoGuide{" "}
            </span>
          </h1>
        </SuggestedDoctors>
      </div>
    </div>
  )
}
