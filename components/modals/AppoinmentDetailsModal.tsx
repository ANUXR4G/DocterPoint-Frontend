"use client"

import {
  AlignContent,
  Button,
  ListContent,
  Map,
  Modal,
  SimpleSpinner,
} from "@/components"
import { format } from "date-fns"
import { firey } from "@/utils"

import React, { useEffect } from "react"

import { useQuery } from "react-query"
import { queryClient } from "@/app/providers"
import { useRouter, useSearchParams } from "next/navigation"

import { useApi } from "@/hooks/useApi"
import { useApiMutation } from "@/hooks/useApiMutation"

import { patientService } from "@/lib/services/patient"
import { hospitalService } from "@/lib/services/hospital"
import { TAppointment, THospital, TMedications } from "@/types"

type Props = {
  isOpen: boolean
  closeModal: () => void
  selected: TAppointment | null
  setSelected: React.Dispatch<React.SetStateAction<TAppointment | null>>
}

export default function AppointmentDetailsModal({
  isOpen,
  closeModal,
  selected,
  setSelected,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const appointmentId = searchParams.get("id")

  // retrieve specific appointment details
  const { data: _, refetch } = useApi(
    [`patients:appointments:info:${appointmentId}`],
    async (_, token) => {
      if (isOpen && appointmentId && !selected) {
        return patientService.getAppointmentInfo(token, appointmentId)
      }
    },
    {
      enabled: false,
      select: (data) => firey.convertKeysToCamelCase(data) as TAppointment,
      onSuccess: (appointment) => {
        setSelected(appointment)
      },
    }
  )

  // retrieve the hospital information
  const { data: hospitalInfo } = useQuery(
    [`hospitals:info:${selected?.hospital.id}`],
    async () => {
      if (selected) {
        return hospitalService.getHospitalInfo(selected.hospital.id)
      }
    },
    {
      select: (data) => firey.convertKeysToCamelCase(data) as THospital,
    }
  )

  // retrieve medication details
  const { data: prescription } = useApi(
    [`patients:appointments:info:${appointmentId}:medications`],
    async (_, token) => {
      if (appointmentId)
        return patientService.getAppointmentMedications(token, appointmentId)
    },
    {
      select: (data) => firey.convertKeysToCamelCase(data) as TMedications | [],
    }
  )

  useEffect(() => {
    const shouldFetch = !selected && isOpen && appointmentId
    if (shouldFetch) refetch()
  }, [selected, isOpen, appointmentId, refetch])

  function handleConsultationAgain(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) {
    if (typeof window !== "undefined" && selected) {
      e.preventDefault()
      if (e.ctrlKey) {
        window.open(
          `/hospitals/doctors/info?id=${selected.doctor.id}&popup=t`,
          `_blank`
        )
      } else {
        router.push(`/hospitals/doctors/info?id=${selected.doctor.id}&popup=t`)
      }
    }
  }

  // Cancel Appointments
  const { mutate } = useApiMutation<{
    payload: Record<string, unknown>
  }>(
    ({ payload }, token) => {
      if (!selected)
        throw new Error(`unable to cancel this appointment at this moment.`)
      return patientService.updateAppointmentInfo(token, selected.id, payload)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(`patients:appointments:upcoming`)
        queryClient.invalidateQueries(`patients:appointments:page:1`)
      },
    }
  )

  // Handle cancel appointment
  function handleAppointmentCancel() {
    mutate({ payload: { status: "cancelled" } })
    closeModal()
  }

  return (
    <Modal
      className="h-full sm:h-3/4 w-full max-w-[720px]"
      open={isOpen}
      handler={closeModal}
      primaryBtn={
        selected &&
        (selected.status === "upcoming" ||
          selected.status === "rescheduled") && (
          <Button type="outline" onClick={handleAppointmentCancel}>
            Cancel Booking
          </Button>
        )
      }
      secondaryBtn={
        selected ? (
          ["requested", "upcoming", "resheduled"].includes(selected.status) ? (
            <></>
          ) : (
            <Button onClick={handleConsultationAgain}>Consult again</Button>
          )
        ) : (
          <></>
        )
      }
    >
      {!selected || !hospitalInfo ? (
        <SimpleSpinner className="size-10 -mt:10" />
      ) : (
        <div className="p-4 flex flex-col gap-3 sm:gap-2 overflow-x-hidden overflow-y-auto custom-scroll">
          <h4 className="-ml-1 text-sm font-bold text-[--secondary-black] px-1.5 py-1 bg-zinc-300 size-fit rounded-md">
            Serial No. #{selected.serialNumber}
          </h4>

          {/* Test name if there is any */}
          {selected.testName && (
            <AlignContent keys={["Test Name"]} values={[selected.testName]} />
          )}

          {/* Basic doctor information */}
          <AlignContent
            keys={
              selected.referredBy
                ? ["Assigned Doctor", "Referred By"]
                : ["Assigned Doctor"]
            }
            values={
              selected.referredBy
                ? [selected.doctor.name, selected.referredBy.name]
                : [selected.doctor.name]
            }
            hrefs={
              selected.referredBy
                ? [
                    `/hospitals/doctors/info?id=${selected.doctor.id}`,
                    `/hospitals/doctors/info?id=${selected.referredBy.id}`,
                  ]
                : [`/hospitals/doctors/info?id=${selected.doctor.id}`]
            }
          />

          <AlignContent
            keys={["Appointment Date", "Appointment Time"]}
            values={[
              format(selected.appointmentDate, "dd/MM/yyyy"),
              selected.appointmentTime,
            ]}
          />

          {selected.patientNote && (
            <AlignContent
              keys={["Special Note"]}
              values={[selected.patientNote]}
            />
          )}

          <AlignContent
            keys={["Visit Reason"]}
            values={[`${selected.purposeOfVisit.join(", ")}.`]}
          />

          {/* hospital details */}
          <AlignContent
            keys={["Hospital Name", "Hospital Adress"]}
            values={[selected.hospital.name, selected.hospital.address]}
            hrefs={[`/hospitals/${selected.hospital.id}/info`]}
          />

          {/* hospital map */}
          {hospitalInfo && (
            <div>
              <h4 className="mb-1 font-semibold text-sm opacity-90">
                {hospitalInfo.address}
              </h4>
              <Map
                hospitals={[hospitalInfo]}
                coordinates={hospitalInfo.geometry.coordinates}
                className="sm:h-80"
              />
            </div>
          )}

          {/* recommendations / prescribed */}
          {/* {selected.status === "completed" && */}
          {prescription && !Array.isArray(prescription) && (
            <div className="flex flex-col gap-3">
              {/* medication recommendations */}
              {prescription.medications && (
                <ListContent
                  title="Medications 💊"
                  keys={prescription.medications.map(
                    (item) => `${item.name}: `
                  )}
                  values={prescription.medications.map(
                    (item) =>
                      `${item.amount} unit at ${firey.makeString(item.times)}.`
                  )}
                />
              )}

              {/* dietary recommendations */}
              {prescription.dietary && (
                <ListContent
                  title="Dietary Recommendations 🍇"
                  keys={[
                    ...prescription.dietary.map((item) => `${item.time}: `),
                    `goal: `,
                  ]}
                  values={[
                    ...prescription.dietary.map(
                      (item) => `Have your food under ${item.energy}kCal.`
                    ),
                    `${prescription.energyGoal}kCal(approx)`,
                  ]}
                />
              )}

              {/* nutrition recommedations */}
              {prescription.nutritions && (
                <ListContent
                  title="Nutrition Recommendations 🥜"
                  keys={prescription.nutritions.map((item) => `${item.name}:`)}
                  values={prescription.nutritions.map(
                    (item) => `${item.amount}g`
                  )}
                />
              )}

              {/* recommeded ingredients */}
              {prescription.recommendedIngredients && (
                <ListContent
                  title="Recommended Ingredients 🥛"
                  keys={prescription.recommendedIngredients.map((_) => ``)}
                  values={prescription.recommendedIngredients.map(
                    (item) => item
                  )}
                />
              )}

              {/* rescrictied ingredients */}
              {prescription.allergies && (
                <ListContent
                  title="Must Avoid ❌"
                  keys={prescription.allergies.map((_) => ``)}
                  values={prescription.allergies.map((item) => item)}
                />
              )}

              {/* lifestyle recommendations */}
              <ListContent
                title="Lifestyle Recommendations 🌻"
                keys={[`sleep: `, `hydration`]}
                values={[
                  `atleast ${prescription.sleep}hrs daily.`,
                  `atleast ${prescription.hydration} glass of waters daily.`,
                ]}
              />

              {/* recommended exercises */}
              {prescription.exercises && (
                <ListContent
                  title="Exercise Recommendations 🏃🏼‍♂️"
                  keys={prescription.exercises.map((_) => ``)}
                  values={prescription.exercises.map(
                    (item) =>
                      `${item.name} for ${item.duration} at ${firey.makeString(
                        item.times
                      )}.`
                  )}
                />
              )}
            </div>
          )}

          {/* doctor note */}
          {selected.doctorNote && (
            <AlignContent
              keys={["Note ✅"]}
              values={[`${selected.doctorNote}`]}
              className="mt-4"
            />
          )}

          {/* important info */}
          {selected.status === "upcoming" && (
            <div className="mt-2 flex flex-col text-sm">
              <h4 className="md:text-base font-bold opacity-70">
                Important info ✅
              </h4>
              <span className="font-medium sm:font-medium sm:opacity-80">
                *Please arrive 10-15 minutes early for your appointment.
              </span>
              <span className="font-medium sm:font-medium sm:opacity-80">
                *If you need to reschedule or cancel, kindly notify us at least
                24 hours in advance.
              </span>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
