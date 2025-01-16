"use client"

import { useEffect, useRef, useState } from "react"
import {
  Button,
  Checkbox,
  BookingSearchbox,
  DoctorDates,
  Map,
  Modal,
  RadioInput,
} from "@/components"
import { firey } from "@/utils"
import {
  TBookingAppointment,
  TBookingPrompt,
  TDoctor,
  THospital,
} from "@/types"
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
  startOfToday,
} from "date-fns"
import { appointmentModes, appointmentPurposes } from "@/lib/dummy/appointments"
import { useQuery } from "react-query"
import { hospitalService } from "@/lib/services/hospital"
import { doctorServices } from "@/lib/services/doctor"
import { useApiMutation } from "@/hooks/useApiMutation"
import { patientService } from "@/lib/services/patient"
import { queryClient } from "@/app/providers"

type Props = {
  isOpen: boolean
  closeHandler: () => void
}

export default function BookAppointmentModal({ isOpen, closeHandler }: Props) {
  const today = startOfToday()
  const firstDayCurrentMonth = startOfMonth(today)

  // loop through the current month and get a preview of the dates
  const previewDays = eachDayOfInterval({
    start: startOfMonth(firstDayCurrentMonth),
    end: endOfMonth(firstDayCurrentMonth),
  })

  const hospitalParams = firey.createSearchParams({ limit: 50 })
  const [hospitalId, setHospitalId] = useState<string | null>(null)
  const [mapDetails, setMapDetails] = useState<THospital | null>(null)

  const [isSearching, setIsSearching] = useState<boolean>(false)

  const searchingTimeout = useRef<NodeJS.Timeout | null>(null)

  const [selected, setSelected] = useState<TBookingPrompt>({
    doctor: "",
    location: "",
    hospital: "",
  })

  const [details, setDetails] = useState<TBookingAppointment>({
    doctor: selected.doctor,
    hospital: selected.hospital,
    doctorId: "",
    address: "",
    appointmentMode: "In-Person Consultation",
    purposeOfVisit: ["General Checkup"],
    selectedDate: today,
    selectedMonth: format(today, "MMMM"),
    selectedMonthDays: previewDays,
    notes: "",
    availableDays: [],
    time: "",
  })

  const { data: nearbyHospitals } = useQuery(
    [`hospitals:nearby`],
    async () => hospitalService.getHospitals(hospitalParams.toString()),
    {
      select: (data) =>
        firey.convertKeysToCamelCase(data) as {
          total: number
          hospitals: THospital[]
        },
    }
  )

  const { data: searchResult, isLoading: isSearchLoading } = useQuery(
    [`doctors:search`, selected.doctor],
    async () => doctorServices.search(selected.doctor),
    {
      enabled: !!selected.doctor && isSearching,
      select: (data) => {
        return firey.convertKeysToCamelCase(data) as {
          total: number
          doctors: TDoctor[]
        }
      },
    }
  )

  // get hospital information
  const { refetch } = useQuery(
    [`hospitals:info:${hospitalId}`],
    async () => {
      if (hospitalId) return hospitalService.getHospitalInfo(hospitalId)
    },
    {
      onSuccess: (data) => setMapDetails(data),
      select: (data) => {
        return firey.convertKeysToCamelCase(data) as THospital // covert keys to camelCase
      },
    }
  )

  // create a new appointment
  const { mutate } = useApiMutation<{
    payload: Record<string, unknown>
  }>(({ payload }, token) => patientService.createAppointment(token, payload), {
    onSuccess: () => {
      queryClient.invalidateQueries(`patients:appointments:upcoming`)
      queryClient.invalidateQueries(`patients:appointments:page:1`)
      closeHandler()
      clearAll()
    },
  })

  // handle doctor on change handler
  function handleDoctorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setSelected((prev) => ({ ...prev, doctor: value })) // update selected state

    // if there was any left over from previous timer make sure to clean that
    if (searchingTimeout.current) {
      clearTimeout(searchingTimeout.current)
    }

    // set state for typing status based on the length of the prompt
    if (value.length >= 2) {
      searchingTimeout.current = setTimeout(() => setIsSearching(true), 300)
    } else {
      setIsSearching(false)
    }
  }

  // handle doctor selection
  function handleDoctorSelection(info: TDoctor | string) {
    if (typeof info !== "string") {
      setHospitalId(info.hospital.id)
      refetch()
      setSelected({
        doctor: info.name,
        hospital: info.hospital.name,
        location: info.hospital.city,
      })
      setDetails((prev) => ({
        ...prev,
        doctor: info.name,
        doctorId: info.id,
        hospital: info.hospital.name,
        location: info.hospital.city,
        address: info.address,
        availableDays: info.availableTimes.split(":")[0].split(", "),
        time: info.availableTimes.split(": ")[1],
      }))
    }
  }

  // handle hospital on change handler
  function handleHospitalChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelected((prev) => ({ ...prev, hospital: e.target.value }))
  }

  // handle hospital selection
  function handleHospitalSelection(hopsitalName: TDoctor | string) {
    // this handles only 50 hospitals (for advanced usages the implementation needs to be refactored from the backend)
    if (typeof hopsitalName === "string" && nearbyHospitals) {
      const filteredHospital = nearbyHospitals.hospitals.filter(
        (details) => details.name === hopsitalName
      )
      const _hospital = filteredHospital[0]
      setMapDetails(_hospital)
      setSelected({
        doctor: "",
        hospital: _hospital.name,
        location: _hospital.city,
      })
    }
  }

  // handle hospital location on change handler
  function handleLocationChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelected((prev) => ({ ...prev, location: e.target.value }))
  }

  // handle hospital selection
  function handleLocationSelection(hopsitalLocation: TDoctor | string) {
    if (typeof hopsitalLocation === "string") {
      setMapDetails(null)
      setSelected({
        doctor: "",
        hospital: "",
        location: hopsitalLocation,
      })
    }
  }

  // reset doctor and hospital selection
  const clearAll = () => {
    setMapDetails(null)
    setSelected({ doctor: "", hospital: "", location: "" })
  }

  // reset location selection
  const clearLocation = () => {
    setMapDetails(null)
    setSelected((prev) => ({ ...prev, location: "" }))
  }

  // handle month selection
  function handleMonthSelection(month: string) {
    const newDate = new Date(`${month} 1 ${format(today, "y")}`)
    const newPreviewDays = eachDayOfInterval({
      start: startOfMonth(newDate),
      end: endOfMonth(newDate),
    })

    setDetails((prev) => ({
      ...prev,
      selectedMonth: month,
      selectedMonthDays: newPreviewDays,
    }))
  }

  // handle date selection
  function handleDateSelection(date: Date, month?: string) {
    const newPreviewDays = eachDayOfInterval({
      start: startOfMonth(date),
      end: endOfMonth(date),
    })
    setDetails((prev) => ({
      ...prev,
      selectedDate: date,
      selectedMonth: month ? month : prev.selectedMonth,
      selectedMonthDays: month ? newPreviewDays : prev.selectedMonthDays,
    }))
  }

  // handle appointment mode
  function handleAppointmentMode(e: React.ChangeEvent<HTMLInputElement>) {
    setDetails((prev) => ({
      ...prev,
      appointmentMode: e.target.value,
    }))
  }

  // handle purpose selection
  function handlePurposeOfVisit(e: React.ChangeEvent<HTMLInputElement>) {
    setDetails((prev) => {
      const value = e.target.value
      const exist = prev.purposeOfVisit.includes(value)
      const purposesOfVisit = exist
        ? prev.purposeOfVisit.filter((item) => item !== value)
        : prev.purposeOfVisit.concat(value)
      return { ...prev, purposeOfVisit: purposesOfVisit }
    })
  }

  // handle special notes
  function handleSpecialNotes(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDetails((prev) => ({ ...prev, notes: e.target.value }))
  }

  function handleConfirmation() {
    const payload = {
      doctor_id: details.doctorId,
      mode: details.appointmentMode.startsWith("Telemedicine")
        ? "online"
        : "in-person",
      purpose_of_visit: details.purposeOfVisit,
      appointment_date: format(details.selectedDate, "yyyy-MM-dd"),
      appointment_time: details.time,
      ...(details.notes.length > 0 && { patient_note: details.notes }), // add notes conditionally
    }
    mutate({ payload })
  }

  // clear doctor searching timeout
  useEffect(() => {
    return () => {
      if (searchingTimeout.current) {
        clearTimeout(searchingTimeout.current)
      }
    }
  }, [])

  return (
    <Modal
      open={isOpen}
      handler={closeHandler}
      className="h-full sm:h-3/4 w-full max-w-[720px]"
      secondaryBtn={
        <Button
          disabled={selected.doctor.length === 0}
          onClick={handleConfirmation}
        >
          Confirm
        </Button>
      }
    >
      <div className="flex flex-col gap-3 p-4 overflow-x-hidden overflow-y-auto custom-scroll">
        {/* doctor searching options */}
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Book an Appointment</h2>
          <p className="text-sm font-medium opacity-85">
            Choose a doctor and schedule your appointment with just a few taps.
            Select a time that works best for you!
          </p>
        </div>
        <div>
          <h4 className="text-xs font-bold opacity-85 uppercase mb-1">
            Doctor
          </h4>
          <BookingSearchbox
            name="doctors"
            containerClassName="z-30"
            selection={handleDoctorSelection}
            onChange={handleDoctorChange}
            searchResult={searchResult?.doctors}
            isSearchLoading={isSearchLoading}
            value={selected.doctor}
            clear={clearAll}
          />
        </div>

        {/* hospital searching options */}
        <div>
          <h4 className="text-xs font-bold opacity-85 uppercase mb-1">
            Hospital
          </h4>
          <BookingSearchbox
            name="hospitals"
            containerClassName="z-30"
            selection={handleHospitalSelection}
            onChange={handleHospitalChange}
            value={selected.hospital}
            clear={clearAll}
          />
        </div>

        {/* location searching options */}
        <div>
          <h4 className="text-xs font-bold opacity-85 uppercase mb-1">
            Location
          </h4>
          <BookingSearchbox
            name="locations"
            containerClassName="z-10"
            selection={handleLocationSelection}
            onChange={handleLocationChange}
            value={selected.location}
            clear={clearLocation}
          />
        </div>

        {/* hospital map */}
        {nearbyHospitals?.hospitals && (
          <div className="mt-2.5">
            <h4 className="text-xs font-bold opacity-75 uppercase mb-1 max-w-80">
              {mapDetails ? mapDetails.address : `GlucoGuide X Hospitals`}
            </h4>
            <Map
              hospitals={mapDetails ? [mapDetails] : nearbyHospitals.hospitals}
              coordinates={
                mapDetails ? mapDetails.geometry.coordinates : [90.4, 23.79]
              }
              className="sm:h-72"
              zoom={10}
              disableResetBtn
            />
          </div>
        )}

        {/* about doctor's availablity */}
        {details.availableDays.length !== 0 && (
          <>
            <div>
              <h4 className="text-xs font-bold opacity-75 uppercase mb-1 max-w-80">
                Consultation Hour
              </h4>
              <p className="text-sm font-semibold opacity-75">
                {details.time} on every{" "}
                {firey.makeString(details.availableDays)}.
              </p>
            </div>
            {/* booking dates */}
            <div className="mt-3">
              <DoctorDates
                values={details}
                dateSelection={handleDateSelection}
                monthSelection={handleMonthSelection}
              />
            </div>
          </>
        )}

        {/* appointment selection options */}
        <div className="w-full flex flex-col mt-3">
          {/* appointment mode */}
          <fieldset>
            <legend className="text-sm  font-semibold md:font-bold opacity-70">
              Appointment mode
            </legend>
            <div className="flex flex-col mt-1 text-sm">
              {appointmentModes.map((item, idx) => (
                <RadioInput
                  key={`mealPerDayOpts-${idx}`}
                  name={`appointment_mode_${idx}`}
                  value={item}
                  active={details.appointmentMode === item}
                  onChange={handleAppointmentMode}
                />
              ))}
            </div>
          </fieldset>

          {/* purpose of visit */}
          <fieldset className="mt-3">
            <legend className="text-sm  font-semibold md:font-bold opacity-70">
              Purpose of visit
            </legend>

            {/* purpose of visit options */}
            <div className="flex flex-wrap mt-2 -ml-1 gap-2">
              {appointmentPurposes.map((item, idx) => (
                <Checkbox
                  key={`alergyOpt-${idx}`}
                  name={`purpose_of_visit_${idx}_option`}
                  value={item}
                  active={details.purposeOfVisit.includes(item)}
                  onChange={handlePurposeOfVisit}
                  direction="left"
                />
              ))}
            </div>
          </fieldset>

          {/* special notes */}
          <div className="mt-3">
            <label
              htmlFor="notes"
              className="text-sm  font-semibold md:font-bold opacity-70"
            >
              Special notes
            </label>
            <textarea
              rows={4}
              className="mt-2 p-2 w-full text-sm text-gray-900 dark:text-neutral-400 bg-gray-50 dark:bg-neutral-700 rounded-lg border border-gray-300 dark:border-neutral-400 focus:ring-blue-500 focus:border-blue-500 resize-none"
              placeholder="Write special notes here..."
              value={details.notes}
              onChange={handleSpecialNotes}
            ></textarea>
          </div>

          {/* appointment details */}
          {selected.doctor.length !== 0 && (
            <div className="mt-3 flex flex-col">
              <h4 className="text-sm md:text-base font-bold opacity-70">
                Appointment details
              </h4>
              <div className="text-sm font-medium">
                <span className="font-bold">Name: </span>
                <span>{selected.doctor}</span>
              </div>
              <div className="text-sm font-medium">
                <span className="font-bold">Date: </span>
                <span>
                  {format(details.selectedDate, "do MMMM, yyy")} (
                  {format(details.selectedDate, "eeee")})
                </span>
              </div>
              <div className="text-sm font-medium">
                <span className="font-bold">Time: </span>
                <span>{details.time}</span>
              </div>
              <div className="text-sm font-medium">
                <span className="font-bold">Purpose of visit: </span>
                <span>{details.purposeOfVisit.join(", ")}.</span>
              </div>
              <div className="text-sm font-medium">
                <span className="font-bold">Hospital: </span>
                <span>{selected.hospital}.</span>
              </div>
              {mapDetails && (
                <div className="text-sm font-medium">
                  <span className="font-bold">Location: </span>
                  <span>{mapDetails.address}.</span>
                </div>
              )}
              {details.notes.length !== 0 && (
                <div className="text-sm font-medium">
                  <span className="font-bold">Special note: </span>
                  <span>{details.notes}</span>
                </div>
              )}
            </div>
          )}

          {/* important info */}
          <div className="mt-4 flex flex-col text-sm">
            <h4 className=" font-bold opacity-70">Important info</h4>
            <span className="font-medium sm:font-medium sm:opacity-80">
              *Please arrive 10-15 minutes early for your appointment.
            </span>
            <span className="font-medium sm:font-medium sm:opacity-80">
              *If you need to reschedule or cancel, kindly notify us at least 24
              hours in advance.
            </span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
