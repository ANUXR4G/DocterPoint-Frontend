"use client"

import { ConsultHistory, Modal } from "@/components"
import { TAppointment, TPatient } from "@/types"
import { firey } from "@/utils"
import Image from "next/image"
import { usePathname, useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import { Dispatch, SetStateAction } from "react"

type TConsult = TAppointment & {
  patientId: string
}

type Props = {
  active: TPatient
  setActive: Dispatch<SetStateAction<TPatient | null>>
}

export default function PatientInfo({ active, setActive }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const searchParams = useSearchParams()
  const patientId = searchParams.get("id")

  // Handle close modal
  function onCloseModal() {
    setActive(null)
    router.push(pathname)
  }

  return (
    <Modal
      className="text-start h-full sm:h-3/4 w-full max-w-[720px]"
      open={!!patientId}
      handler={onCloseModal}
    >
      <div className="p-4 flex flex-col gap-3 sm:gap-2 overflow-x-hidden overflow-y-auto custom-scroll text-neutral-300">
        {/* Patient Info */}
        <div className="mt-4 text-neutral-600 dark:text-neutral-400">
          <div className="relative w-24 h-24 border-2 dark:border-neutral-200 border-neutral-800 rounded-full bg-slate-600">
            <Image
              fill
              src={
                active.imgSrc ||
                `${`https://res.cloudinary.com/firey/image/upload/v1708816390/iub/${
                  active.gender
                    ? active.gender === `male`
                      ? `male`
                      : `female`
                    : `male`
                }_12.jpg`}`
              }
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              alt={`${active?.id}.jpg`}
              style={{ objectFit: "cover" }}
              priority
              className="rounded-full"
            />
            {/* overlay */}
            <div className="min-h-full min-w-full bg-black/25 absolute top-0 right-0 bottom-0 left-0 rounded-full" />
          </div>

          <div className="mt-2">
            <h3 className="text-xl font-semibold tracking-wide">
              {active.dateOfBirth
                ? `${active.name}, ${firey.calculateAge(
                    active.dateOfBirth
                  )} y.o.`
                : `${active.name}`}
            </h3>
            <p className="text-sm font-medium opacity-70">{active.address}</p>
          </div>
          <ConsultHistory id={active.id} />
        </div>
      </div>
    </Modal>
  )
}
