"use client"

import Image from "next/image"
import { firey } from "@/utils"
import { queryClient } from "@/app/providers"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { patientService } from "@/lib/services/patient"
import { useApiMutation } from "@/hooks/useApiMutation"
import { useClicksOutside } from "@/hooks/useClicksOutside"
import { Button, Icon, BasicSelect, Background } from "@/components"
import {
  BloodPressureDetail,
  TMonitoring,
  MonitoringDetail,
  TPatientHealth,
} from "@/types"

function isBloodGlucoseType(item: any): item is MonitoringDetail {
  return (item as MonitoringDetail).value !== undefined
}

function isBloodPressureType(item: any): item is BloodPressureDetail {
  return (item as BloodPressureDetail).data !== undefined
}

type Props = {
  idx: number
  open: boolean
  data: TMonitoring
  healthRecords?: TPatientHealth | []
  patientId?: string
  openHandler: (idx: number) => void
  closeHandler: () => void
  direction: "left" | "right"
}

export default function MultiHealthModal({
  open,
  idx,
  closeHandler,
  data,
  healthRecords,
  patientId,
  direction,
  openHandler,
}: Props) {
  const [allowNext, setAllowNext] = useState<boolean>(false)
  const [doneEditing, setDoneEditing] = useState<boolean>(false)
  const [pressure, setPressure] = useState<"systolic" | "diastolic">("systolic")

  const container = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)

  // get the current date
  const currentDate = new Date()

  // get the current time
  const currentTime = currentDate
    .toLocaleDateString("en-AU", {
      hour: "numeric",
      hour12: true,
    })
    .replaceAll(" ", "")
    .split(",")
    .join(", ")
    .toUpperCase()

  const [inputVal, setInputVal] = useState({
    type: "systolic",
    value: idx === 0 ? 140 : 120,
  })

  // handle click outside of the modal
  useClicksOutside([container, indicatorRef], closeHandler)

  const isGlucose = idx === 0
  const isPressure = idx === 1

  // item value ranges for each items
  const glucoseRange: [number, number] = [77, 138]
  const systolicPressureRange: [number, number] = [110, 135]
  const diastolicPressureRange: [number, number] = [64, 90]

  // generate a random value
  function generateValue() {
    if (isGlucose) {
      return firey.generateRandomNum(glucoseRange)
    }

    if (isPressure && inputVal.type === "systolic") {
      return firey.generateRandomNum(systolicPressureRange)
    }

    if (isPressure && inputVal.type === "diastolic") {
      return firey.generateRandomNum(diastolicPressureRange)
    }

    return 0
  }

  // generate a random value and store it
  function handleGenerateValue() {
    const value = generateValue()
    setInputVal((prev) => ({ ...prev, value: Number(value) }))
  }

  // handle pressure switch toggling
  const togglePressure = () => {
    setPressure((prev) => {
      return prev === "systolic" ? "diastolic" : "systolic"
    })
  }

  // handle health record mutations
  const { mutate } = useApiMutation<{
    payload: Record<string, MonitoringDetail[] | BloodPressureDetail[]>
  }>(
    ({ payload }, token) => {
      if (!healthRecords) throw new Error("required informations are missing.")
      // handle new record mutations
      if (Array.isArray(healthRecords)) {
        return patientService.createPatientHealthRecord(token, payload)
      } else {
        // handle update mutations
        return patientService.updatePatientHealthRecord(
          token,
          payload,
          healthRecords.id
        )
      }
    },
    {
      onSuccess: () => {
        // invalidate and go bact to first portion of the modal
        queryClient.invalidateQueries(`patients:monitorings:${patientId}`)
        setAllowNext(false)
      },
    }
  )

  // handle confirmation
  function handleConfirmation() {
    if (!healthRecords) return

    const newValues = { value: inputVal.value, time: currentTime }

    // handle glucose records
    if (isGlucose) {
      const oldData = Array.isArray(healthRecords)
        ? []
        : healthRecords.blood_glucose_records
        ? healthRecords.blood_glucose_records
        : []
      const payload = oldData.concat(newValues)
      mutate({ payload: { [data.key]: payload } })
    }

    // handle bloood pressure records
    if (isPressure) {
      const oldData = Array.isArray(healthRecords)
        ? []
        : healthRecords.blood_pressure_records
        ? healthRecords.blood_pressure_records
        : []

      // Get the specific data type e.g., systolic/diastolic
      const specificPressure = oldData.filter(
        (item) => item.type === inputVal.type
      )

      // Prepare the payload based on condition
      const payload =
        specificPressure.length > 0
          ? oldData.map((item) =>
              item.type === inputVal.type
                ? { ...item, data: item.data.concat(newValues) }
                : item
            )
          : oldData.concat({ type: inputVal.type, data: [newValues] })

      mutate({ payload: { [data.key]: payload } })
    }
  }

  useEffect(() => {
    if (doneEditing) {
      closeHandler()
      setDoneEditing(false)
    }
  }, [doneEditing, closeHandler])

  return (
    <div
      onClick={() => openHandler(idx)}
      ref={indicatorRef}
      className={`absolute ${open && `z-30`} ${
        idx === 0 &&
        `top-56 right-11 xs:top-60 xs:right-14 sm:top-[356px] sm:right-[86px]`
      } ${
        idx === 1 && `top-44 left-20 xs:top-48 xs:left-24 sm:top-72 sm:left-36`
      } size-6 sm:size-6 center bg-neutral-400/25 backdrop-blur-sm sm:backdrop-blur-md rounded-full`}
    >
      <div className="size-1.5 sm:size-2 rounded-full bg-gray-200 dark:bg-neutral-950 hover:cursor-pointer" />
      <AnimatePresence>
        {open && (
          <motion.div
            className={`absolute z-10 w-44 sm:w-52 h-56 rounded-lg bg-[--primary-white] dark:bg-neutral-800 top-4 origin-top center shadow-[inset_0_0_0_1px_rgba(17,17,17,0.25)] dark:shadow-[inset_0_0_0_1px_rgba(248,248,248,0.3)] overflow-hidden ${
              direction === "left" ? `left-2` : `right-2`
            }`}
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0 }}
            transition={{ duration: 0.14 }}
            ref={container}
          >
            {/* pattern background */}
            <Background name="half-box-pattern" className="hidden dark:block" />
            <Background name="dotted-patern" className="dark:hidden" />

            {/* close btn */}
            {!allowNext && (
              <div
                className="absolute z-10 right-2 top-2 size-6 rounded-full bg-neutral-300 hover:bg-neutral-400 transition dark:hover:bg-neutral-600 dark:bg-neutral-700 center hover:cursor-pointer"
                onClick={() => setDoneEditing(true)}
              >
                <Icon name="cross" className="size-4" />
              </div>
            )}

            <motion.div
              className="size-full flex"
              animate={{
                x: allowNext ? "-100%" : 0,
              }}
            >
              {/* first container */}
              <div className="min-w-full size-full flex flex-col p-3">
                <div>
                  <h3
                    className={`text-sm max-w-28 leading-4 font-semibold opacity-80 ${
                      data.details && data.details.length === 1 && "mb-2"
                    }`}
                  >
                    {data.name}
                  </h3>
                  {/* pressure switch control */}
                  {isPressure && data.details && data.details.length > 1 && (
                    <div className="flex mt-3 justify-end">
                      <button
                        className="text-xs font-medium text-neutral-500 dark:text-neutral-400 py-0.5 rounded-sm px-1.5 bg-neutral-400/30"
                        onClick={togglePressure}
                      >
                        {pressure === "diastolic" ? "systolic" : "diastolic"}
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    {isPressure && data.value && (
                      <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1 mb-0 sm:mb-2 font-medium uppercase">
                        {pressure} DATA
                      </p>
                    )}
                    {data.value && (
                      <p className="text-sm mb-1 medium opacity-70">
                        {`${data.value} ${data.unit}`}
                      </p>
                    )}
                  </div>
                </div>

                {/* contents */}
                <div
                  className={`${
                    isGlucose &&
                    data.details &&
                    data.details.length > 3 &&
                    `overflow-y-auto custom-scroll`
                  } ${isPressure && `overflow-y-auto custom-scroll`}`}
                >
                  {data.details && data.details.length > 0 ? (
                    data.details.map(
                      (item, idx) =>
                        isBloodGlucoseType(item) && (
                          <div
                            key={`monitoring-blood-glucose-content-${idx}`}
                            className="mt-1 flex gap-2 items-start"
                          >
                            <div className="min-w-2.5 size-2.5 rounded-full bg-blue-400" />
                            <p className="text-neutral-500 dark:text-neutral-400 text-xs -mt-0.5">{`${item.value}${data.unit} has been monitored at ${item.time}`}</p>
                          </div>
                        )
                    )
                  ) : (
                    // empty record ui
                    <div className="flex flex-col items-center mt-1">
                      <Image
                        width={idx === 1 ? 48 : 64}
                        height={64}
                        src={data.imgSrc}
                        alt={`${idx}_popper_empty.png`}
                        className="object-cover contrast-75 mix-blend-luminosity opacity-60"
                      />
                      <div>
                        <h1 className="bg-gradient-to-r font-semibold from-blue-500 to-cyan-500 dark:from-emerald-400 dark:to-cyan-400 bg-clip-text text-transparent">
                          No Record
                        </h1>
                      </div>
                      <p className="leading-3 sm:leading-4 text-neutral-600/80 dark:text-neutral-400/80 opacity-90 text-xs text-center">
                        connected with WebSocket, can be easily intregrated to
                        an actual monitoring tracker.
                      </p>
                    </div>
                  )}

                  {/* for blood pressure */}
                  {data.details &&
                    data.details.map(
                      (item) =>
                        isBloodPressureType(item) &&
                        item["type"] === pressure &&
                        item.data.map((item, _idx) => (
                          <div
                            className="mb-1 flex gap-2 items-start"
                            key={`monitoring-blood-pressure-${pressure}-${_idx}`}
                          >
                            <div className="min-w-2.5 size-2.5 rounded-full bg-blue-400" />
                            <p className="text-neutral-500 dark:text-neutral-400 text-xs -mt-0.5">{`${item.value}${data.unit} has been monitored at ${item.time}`}</p>
                          </div>
                        ))
                    )}
                </div>
                <Button
                  className={`w-full center mx-auto text-xs ${
                    data.details && data.details.length > 3 ? `mt-2` : `mt-auto`
                  }`}
                  onClick={() => setAllowNext(true)}
                >
                  start monitoring
                </Button>
              </div>

              {/* second container (input container) */}
              <div className="min-w-full size-full flex flex-col p-3 gap-2">
                <div
                  className={`w-full [&_select]:text-xs flex flex-col ${
                    idx === 0 && `my-auto`
                  }`}
                >
                  <input
                    type="number"
                    value={inputVal.value}
                    onChange={(e) =>
                      setInputVal((prev) => ({
                        ...prev,
                        value: e.target.valueAsNumber,
                      }))
                    }
                    autoComplete="off"
                    className={`w-full text-sm ps-2 bg-neutral-300 dark:bg-neutral-700 rounded-sm h-8 border border-neutral-300 dark:border-neutral-600 ${
                      idx === 0 && `-mb-4`
                    }`}
                  />
                  {idx === 1 && (
                    <BasicSelect
                      name=""
                      values={["systolic", "diastolic"]}
                      onChange={(e) => {
                        setInputVal((prev) => ({
                          ...prev,
                          type: e.target.value,
                        }))
                        setPressure(e.target.value as any)
                      }}
                    />
                  )}
                </div>
                <p
                  className={`text-xs text-center font-medium opacity-70 ${
                    isPressure && `leading-3`
                  }`}
                >
                  {isGlucose
                    ? `please select a number b/w ${glucoseRange[0]}${data.unit} and ${glucoseRange[1]}${data.unit}`
                    : `
                  ${
                    inputVal.type === "systolic"
                      ? `please select a number b/w ${systolicPressureRange[0]} and ${systolicPressureRange[1]}`
                      : `please select a number b/w ${diastolicPressureRange[0]} and ${diastolicPressureRange[1]}`
                  }
                  `}
                </p>
                <div className="flex flex-col">
                  <Button
                    className="center w-3/4 mx-auto text-xs"
                    onClick={handleConfirmation}
                  >
                    confirm
                  </Button>
                  <Button
                    className="center w-3/4 mx-auto text-xs mt-2"
                    onClick={handleGenerateValue}
                  >
                    random value
                  </Button>
                </div>
                <button
                  className="ml-auto mt-auto text-xs font-semibold opacity-70 leading-3"
                  onClick={() => setAllowNext(false)}
                >
                  back
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
