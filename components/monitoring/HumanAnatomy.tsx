"use client"

import Image from "next/image"
import { TMonitoring, TPatientHealth } from "@/types"
import { MultiHealthModal, SingleHealthModal } from "@/components"

type Props = {
  activeIndex: number
  openHandler: (idx: number) => void
  closeHandler(): void
  uiData: TMonitoring[]
  patientId?: string
  healthRecords?: TPatientHealth | []
}

export default function HumanAnatomy({
  activeIndex,
  openHandler,
  closeHandler,
  uiData,
  patientId,
  healthRecords,
}: Props) {
  return (
    <div
      className={`relative min-h-[calc(100vh-164px)] md:min-h-[calc(100vh-124px)] flex`}
    >
      <div className="my-auto relative size-full min-w-[356px] max-w-[356px] xs:max-w-96 sm:max-w-xl">
        <Image
          width="0"
          height="0"
          sizes="100vw"
          className="w-full h-auto"
          src="https://res.cloudinary.com/dwhlynqj3/image/upload/v1723475365/glucoguide/human-body-anatomy.png"
          alt={`human-body-anatomy-pinterest.png`}
          style={{ objectFit: "cover" }}
          priority
        />

        {uiData.map((item, idx) =>
          idx === 0 || idx === 1 ? (
            // modals that has nested values (like blood glucose and blood pressure records)
            <MultiHealthModal
              key={`monitoring-indicator-${idx}`}
              open={activeIndex >= 0 && activeIndex === idx}
              idx={idx}
              openHandler={openHandler}
              closeHandler={closeHandler}
              patientId={patientId}
              healthRecords={healthRecords && healthRecords}
              direction={idx === 0 ? "right" : "left"}
              data={item}
            />
          ) : (
            // modals that has a single value record (the rest of the types)
            <SingleHealthModal
              key={`monitoring-indicator-${idx}`}
              open={activeIndex >= 0 && activeIndex === idx}
              idx={idx}
              openHandler={openHandler}
              closeHandler={closeHandler}
              patientId={patientId}
              healthRecords={healthRecords && healthRecords}
              direction={idx === 2 ? "left" : "right"}
              data={item}
            />
          )
        )}
      </div>
    </div>
  )
}
