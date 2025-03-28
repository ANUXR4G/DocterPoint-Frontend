"use client"

import { Button, PatientInfo, Table } from "@/components"
import { usePatients } from "@/hooks/usePatients"
import { TPatient } from "@/types"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

export default function Patients() {
  const [isHydrated, setIsHydrated] = useState<boolean>(false)
  const [activePatient, setActivePatient] = useState<TPatient | null>(null)

  const router = useRouter()
  const pathname = usePathname()

  const searchParams = useSearchParams()
  const patientId = searchParams.get("id")

  // Retrieve the consulted patients of the doctor
  const { data, isLoading } = usePatients<{
    total: number
    patients: TPatient[]
  }>("doctor", new URLSearchParams({ page: "1" }))

  // Refactor the retrieve data for table
  const values = data
    ? data.patients.map((item) => ({
        id: item.id,
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

  // Custom fields for the table
  const disableIds = [8]
  const customFields = [
    (values: any) => (
      <Button
        type="outline"
        className="h-8 text-xs"
        onClick={() => {
          router.push(`?id=${values.id}`)
          setActivePatient(
            data?.patients.find((item) => item.id === values.id) || null
          )
        }}
      >
        View
      </Button>
    ),
  ]

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Display loading skeleton UI
  if (!isLoading && !isHydrated)
    return (
      <div
        role="status"
        className="animate-pulse w-full mt-6 lg:order-5 col-span-4"
      >
        <div className="ml-1 mb-3 w-72 h-9 lg:h-14 rounded-sm lg:rounded-md bg-gray-300/80 dark:bg-neutral-700/75" />
        <div className="rounded-lg h-48 bg-gray-300/80 dark:bg-neutral-700/75" />
        <span className="sr-only">loading...</span>
      </div>
    )

  return (
    <div className={`mt-8 w-full lg:order-5 col-span-4`}>
      <div className="flex items-center justify-between">
        <h1 className="text-start ml-2 text-xl lg:text-3xl text-neutral-500 font-semibold">
          Patient History
        </h1>
        <Link
          className="bg-white dark:bg-neutral-300 text-neutral-600 shadow-sm hover:bg-gray-50 hover:text-neutral-700 dark:hover:bg-neutral-200 focus:outline outline-offset-2 focus:outline-blue-400 py-2 px-3 inline-flex items-center font-semibold gap-x-2 text-xs rounded-lg border border-gray-200"
          href="/doctor/appointments/patients"
        >
          view patients
        </Link>
      </div>
      {values.length > 0 ? (
        <div className="mt-3 border dark:border-neutral-500 border-neutral-300 bg-transparent dark:bg-neutral-800 rounded-2xl ">
          <Table
            name={`patient-history`}
            values={values}
            disableIds={disableIds}
            customFields={customFields}
            headerClassName="[&:nth-child(1)]:hidden"
            bodyClassName="text-xs [&:nth-child(1)]:hidden [&:nth-child(2)]:text-sm [&:nth-child(2)]:min-w-40"
          />
        </div>
      ) : (
        <div className="text-sm font-semibold opacity-90 text-neutral-500 flex mt-2.5 ml-2.5">
          No patient record exists
        </div>
      )}

      {!!(activePatient && patientId) && (
        <PatientInfo active={activePatient} setActive={setActivePatient} />
      )}
    </div>
  )
}
