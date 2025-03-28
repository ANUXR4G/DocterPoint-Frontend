"use client"

import AlignContent from "@/components/contents/AlignContent"
import Icon from "@/components/icons"
import { useDoctor } from "@/hooks/useDoctor"
import { useUser } from "@/hooks/useUser"
import { TAppointment, TDoctor } from "@/types"
import { firey } from "@/utils"
import { format } from "date-fns"
import { useSearchParams } from "next/navigation"

type Props = {
  id: string
}

type TConsult = TAppointment & {
  patientId: string
}

export default function ConsultHistory({ id }: Props) {
  const searchParams = useSearchParams()

  const { data: doctorInfo } = useUser<TDoctor>("doctor")

  const { data: patientAppointments } = useDoctor<TConsult[]>(
    "patient",
    searchParams
  )

  const appointments = patientAppointments
    ? patientAppointments.filter((item) => item.id !== id)
    : []

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold mt-2">Consult History</h2>
      {appointments.length === 0 && (
        <h3 className="text-sm font-semibold opacity-90">
          No consult history is available of the patient.
        </h3>
      )}

      <div className="-ml-0.5 mt-2 flex flex-col gap-3">
        {appointments.map((info, idx) => (
          <div
            key={`c-h-${info.patientId}-${idx}`}
            className="relative py-4 px-3 sm:px-4 rounded-lg border border-neutral-300 shadow-sm dark:border-neutral-700"
          >
            {doctorInfo && doctorInfo.id === info.doctor.id && (
              <button
                className="absolute z-10 right-3 top-3 center size-7 rounded-full bg-neutral-300 group hover:bg-neutral-400/80 dark:bg-neutral-700/80 dark:hover:bg-neutral-700 hover:cursor-pointer transition"
                // onClick={(e) =>
                //   handleNavigation(e, "/doctor/appointments/patients")
                // }
              >
                <Icon
                  name="rotated-arrow"
                  className="size-8"
                  pathClassName="fill-neutral-600 dark:fill-neutral-400 group-hover:fill-neutral-700 group-hover:dark:fill-neutral-300"
                />
              </button>
            )}
            <p className="mt-1 leading-4 font-semibold text-sm opacity-75">
              Serial No. #{info.serialNumber}
            </p>
            <span className="text-xs font-semibold opacity-75">
              {format(info.appointmentDate, "dd/MM/yyyy")}
            </span>
            <div className="mt-1">
              <AlignContent
                keys={[`Assigned Doctor`, `Hospital`]}
                values={[info.doctor.name, info.hospital.name]}
              />
              <AlignContent
                keys={[`Visit Reason`]}
                values={[firey.makeString(info.purposeOfVisit)]}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
