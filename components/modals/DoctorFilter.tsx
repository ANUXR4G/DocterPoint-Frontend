"use client"

import React, { Dispatch } from "react"
import { Button, Checkbox, Modal } from "@/components"
import { TDoctorFilteringOpts } from "@/types"
import { useQueries } from "react-query"
import { hospitalService } from "@/lib/services/hospital"
import { firey } from "@/utils"

type Props = {
  active: boolean
  closeHandler: () => void
  confirmHandler: () => void
  resetHandler: () => void
  filters: TDoctorFilteringOpts
  setFilters: Dispatch<React.SetStateAction<TDoctorFilteringOpts>>
}

export default function DoctorFilter({
  active,
  closeHandler,
  confirmHandler,
  resetHandler,
  filters,
  setFilters,
}: Props) {
  const [url1Query, url2Query] = useQueries([
    {
      queryKey: ["hospitals:names"],
      queryFn: hospitalService.getHospitalNames,
    },
    {
      queryKey: ["hospitals:locations"],
      queryFn: hospitalService.getHospitalLocations,
    },
  ])

  const hospitals = url1Query.data
  const locations = url2Query.data

  // handle location selection
  function handleLocations(e: React.ChangeEvent<HTMLInputElement>) {
    setFilters((prev) => {
      const value = e.target.value
      const exist = prev.locations.includes(value)
      const newLocations = exist
        ? prev.locations.filter((item) => item !== value)
        : prev.locations.concat(value)
      return { ...prev, locations: newLocations }
    })
  }

  // handle hospital selection
  function handleHospitals(e: React.ChangeEvent<HTMLInputElement>) {
    setFilters((prev) => {
      const value = e.target.value
      const exist = prev.hospitals.includes(value)
      const newHospitals = exist
        ? prev.hospitals.filter((item) => item !== value)
        : prev.hospitals.concat(value)
      return { ...prev, hospitals: newHospitals }
    })
  }

  // close the modal n keep the previous prefered options
  function closeModal() {
    closeHandler()
  }

  // confirm filter options
  function confirmFilter() {
    confirmHandler()
  }

  function resetFilter() {
    resetHandler()
  }

  if (url1Query.isLoading || url2Query.isLoading) return <div />

  return (
    <React.Fragment>
      <Modal
        open={active}
        handler={closeModal}
        className="h-full sm:h-3/4 w-full max-w-[720px]"
        direction="center"
        primaryBtn={
          <Button
            type="outline"
            disabled={firey.objIsEmpty(filters)}
            onClick={resetFilter}
          >
            Reset
          </Button>
        }
        secondaryBtn={<Button onClick={confirmFilter}>Confirm</Button>}
      >
        <div className="overflow-x-hidden overflow-y-auto p-4 custom-scroll">
          <div className="mb-4">
            <h2 className="text-4xl 2xl:text-5xl text-center sm:text-left font-bold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
              Filter Doctors by Hospital Locations/Hospital Names
            </h2>
            <p className="mt-3 text-sm font-medium opacity-85">
              Select a city or hospital name to find doctors that match your
              preferences. This will help you narrow down your search and
              quickly connect with the right professionals.
            </p>
          </div>
          <fieldset>
            <legend className="text-base ml-1 md:text-xl font-bold bg-gradient-to-r from-red-400 to-pink-500 bg-clip-text text-transparent">
              Nearby locations
            </legend>

            {/* food allergy options */}
            <div className="flex flex-col mt-2 gap-2">
              {locations &&
                locations.map((name, idx) => (
                  <Checkbox
                    key={`alergyOpt-${idx}`}
                    name={name.toLowerCase().trim()}
                    value={name}
                    active={filters.locations.includes(name)}
                    onChange={handleLocations}
                    direction="left"
                    className="rounded-lg py-4 !border-[1px]"
                  />
                ))}
            </div>
          </fieldset>
          <fieldset className="mt-10">
            <legend className="text-base md:text-xl font-bold bg-gradient-to-r from-red-400 to-pink-500 bg-clip-text text-transparent">
              Glucoguide x Hospitals
            </legend>

            {/* food allergy options */}
            <div className="flex flex-col mt-2 gap-2">
              {hospitals &&
                hospitals.map((name, idx) => (
                  <Checkbox
                    key={`alergyOpt-${idx}`}
                    name={name.toLowerCase().trim()}
                    value={name}
                    active={filters.hospitals.includes(name)}
                    onChange={handleHospitals}
                    direction="left"
                    className="rounded-lg py-4 !border-[1px]"
                  />
                ))}
            </div>
          </fieldset>
        </div>
      </Modal>
    </React.Fragment>
  )
}
