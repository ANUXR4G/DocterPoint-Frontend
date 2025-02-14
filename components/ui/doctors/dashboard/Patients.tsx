"use client"

import { Button, Table } from "@/components"
import usePatients from "@/hooks/usePatients"
import { TPatient } from "@/types"

export default function Patients() {
  const { data } = usePatients<{ total: number; patients: TPatient[] }>(
    "doctor",
    new URLSearchParams({ page: "1" })
  )
  const values = data
    ? data.patients.map((item) => ({
        patient_name: item.name,
        email: item.email,
        profession: item.profession,
        gender: item.gender,
        date_of_birth: item.dateOfBirth,
        contact_number: item.contactNumber,
        emergency_number: item.emergencyNumber,
        details: ``,
      }))
    : []

  const disableIds = [7]
  const customFields = [
    () => (
      <Button type="outline" className="h-8 text-xs">
        View
      </Button>
    ),
  ]

  return (
    <div className={`mt-8 min-h-40 w-full lg:order-5 col-span-4`}>
      <div className="flex items-center justify-between">
        <h1 className="text-start ml-2 text-xl lg:text-3xl text-neutral-500 font-semibold">
          Patients History
        </h1>
        <Button type="outline" className="text-xs mr-1">
          view appointments
        </Button>
      </div>
      <div className="mt-3 border dark:border-neutral-500 border-neutral-300 bg-transparent dark:bg-neutral-800 rounded-2xl ">
        <Table
          name={`patient-history`}
          values={values}
          disableIds={disableIds}
          customFields={customFields}
          bodyClassName="text-xs [&:nth-child(1)]:text-sm [&:nth-child(1)]:min-w-40"
        />
      </div>
    </div>
  )
}
