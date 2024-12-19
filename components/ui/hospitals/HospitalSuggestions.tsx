"use client"

import { SuggestedDoctors } from "@/components"

type Props = {
  hospitalId: string
  hospitalName: string
}

export default function HospitalSuggestions({
  hospitalId,
  hospitalName,
}: Props) {
  return (
    <div className="space-y-8">
      <div>
        <SuggestedDoctors hospitalId={hospitalId}>
          <h1 className="flex flex-col text-2xl text-center lg:text-4xl max-w-[778px] leading-tight font-bold opacity-90 ml-2 mt-5 mb-2 lg:mx-auto lg:font-extrabold lg:mb-6 lg:mt-10">
            Doctors from{" "}
            <span className="bg-gradient-to-r from-blue-800 to-indigo-900 bg-clip-text text-transparent dark:from-indigo-500 dark:to-blue-500">
              {hospitalName}
            </span>
          </h1>
        </SuggestedDoctors>
      </div>
      <div>
        <SuggestedDoctors experience={8} detachedHospitalId={hospitalId}>
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
