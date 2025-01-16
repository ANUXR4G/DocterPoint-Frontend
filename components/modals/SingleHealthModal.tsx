"use client"

import Image from "next/image"
import { firey } from "@/utils"
import { queryClient } from "@/app/providers"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useClicksOutside } from "@/hooks/useClicksOutside"
import { useApiMutation } from "@/hooks/useApiMutation"
import { patientService } from "@/lib/services/patient"
import { Button, Icon, Background } from "@/components"
import { TMonitoring, TPatientHealth } from "@/types"

type Props = {
  idx: number
  open: boolean
  openHandler: (idx: number) => void
  closeHandler: () => void
  direction: "left" | "right"
  healthRecords?: TPatientHealth | []
  patientId?: string
  data: TMonitoring
}

const suggestedValues = [0, 0, 37, 99, 154, 22.3] // default health record values for input

export default function SingleHealthModal({
  open,
  idx,
  closeHandler,
  openHandler,
  direction,
  data,
  healthRecords,
  patientId,
}: Props) {
  const [allowNext, setAllowNext] = useState<boolean>(false)
  const [doneEditing, setDoneEditing] = useState<boolean>(false)
  const [recordValue, setRecordValue] = useState<number>(suggestedValues[idx])

  const container = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)

  // handle click outside of the modal
  useClicksOutside([container, indicatorRef], closeHandler)

  // handle health record mutations
  const { mutate } = useApiMutation<{
    payload: Record<string, number>
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
        queryClient.invalidateQueries(`patients:monitorings:${patientId}`)
        setAllowNext(false) // go back to initial view of the modal
      },
    }
  )

  // handle input change
  function handleValueChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRecordValue(e.target.valueAsNumber)
  }

  useEffect(() => {
    if (doneEditing) {
      closeHandler()
      setDoneEditing(false)
    }
  }, [doneEditing, closeHandler])

  const isTemperature = idx === 2
  const isOxygen = idx === 3
  const isWeight = idx === 4

  // item value ranges for each items
  const tempRange: [number, number] = [35.15, 37.9]
  const oxygenRange: [number, number] = [90, 100]
  const weightRange: [number, number] = [125, 168]

  // get the min value for each items
  function getMinVal() {
    if (isTemperature) return tempRange[0]
    if (isOxygen) return oxygenRange[0]
    if (isWeight) return weightRange[0]
    return 0
  }

  // get the max value for each items
  function getMaxVal() {
    if (isTemperature) return tempRange[1]
    if (isOxygen) return oxygenRange[1]
    if (isWeight) return weightRange[1]
    return 0
  }

  // get the min, max value for each items
  const minVal = getMinVal()
  const maxVal = getMaxVal()

  // generate a random value
  function generateValue() {
    if (isTemperature) {
      return firey.generateRandomNum(tempRange, true, 2)
    }

    if (isOxygen) {
      return firey.generateRandomNum(oxygenRange)
    }

    if (isWeight) {
      return firey.generateRandomNum(weightRange)
    }

    return 0
  }

  // generate a random value and store it
  function handleGenerateValue() {
    const value = generateValue()
    setRecordValue(Number(value))
  }

  function handleRecordValue() {
    mutate({ payload: { [data.key]: recordValue } })
  }

  return (
    <div
      onClick={() => openHandler(idx)}
      ref={indicatorRef}
      className={`absolute ${open && `z-30`} ${
        idx === 2 && `top-24 left-32 xs:top-28 xs:left-36 sm:top-44 sm:left-52`
      } ${
        idx === 3 &&
        `top-32 right-32 xs:top-36 xs:right-36 sm:top-52 sm:right-60`
      } ${
        idx === 4 &&
        `top-52 right-36 xs:top-56 xs:right-40 sm:top-80 sm:right-64`
      } ${
        idx === 5 && `hidden`
      } size-6 sm:size-6 center bg-neutral-950/25 dark:bg-neutral-400/25 backdrop-blur-sm sm:backdrop-blur-md rounded-full`}
    >
      <div className="size-1.5 sm:size-2 rounded-full bg-gray-200 dark:bg-neutral-950 hover:cursor-pointer" />
      <AnimatePresence>
        {open && (
          <motion.div
            className={`absolute z-10 w-44 sm:w-52 h-56 rounded-lg bg-[--primary-white] dark:bg-neutral-800 top-4 origin-top center shadow-[inset_0_0_0_1px_rgba(17,17,17,0.25)] dark:shadow-[inset_0_0_0_1px_rgba(248,248,248,0.3)] overflow-hidden ${
              direction === "left" ? `left-2` : `right-2`
            }`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 224 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.14 }}
            ref={container}
          >
            {/* pattern background */}
            <Background name="half-box-pattern" className="hidden dark:block" />
            <Background name="dotted-patern" className="dark:hidden" />
            {/* close btn */}
            <div
              className="absolute z-10 right-2 top-2 size-6 rounded-full bg-neutral-300 hover:bg-neutral-400 transition dark:hover:bg-neutral-600 dark:bg-neutral-700 center hover:cursor-pointer"
              onClick={() => setDoneEditing(true)}
            >
              <Icon name="cross" className="size-4" />
            </div>
            <motion.div
              className="size-full flex"
              animate={{
                x: allowNext ? "-100%" : 0,
              }}
            >
              {/* first container */}
              <div className="min-w-full size-full flex flex-col p-3">
                <h3 className="text-sm max-w-24 font-semibold opacity-80">
                  {data.name}
                </h3>
                {data.value ? (
                  <h1 className="mt-auto text-4xl sm:text-5xl text-right">
                    {`${data.value}${data.unit}`}
                  </h1>
                ) : (
                  // empty record ui
                  <div className="flex flex-col items-center">
                    <Image
                      width={idx === 2 ? 48 : 68}
                      height={idx === 2 ? 48 : 68}
                      src={data.imgSrc}
                      alt={`${idx}_popper_empty.png`}
                      className="object-cover contrast-75 mix-blend-luminosity opacity-60"
                    />
                    <div>
                      <h1 className="bg-gradient-to-r font-semibold from-blue-500 to-cyan-500 dark:from-emerald-400 dark:to-cyan-400 bg-clip-text text-transparent">
                        No Record
                      </h1>
                    </div>
                    <p className="leading-3 sm:leading-4 text-neutral-600/80 dark:text-neutral-400/80 text-xs text-center">
                      connected with WebSocket, can be easily intregrated to an
                      actual monitoring tracker.
                    </p>
                  </div>
                )}
                <Button
                  className="mt-2 w-full center mx-auto text-xs"
                  onClick={() => setAllowNext(true)}
                >
                  start monitoring
                </Button>
              </div>

              {/* second container (input container) */}
              <div className="min-w-full size-full flex flex-col px-3 pb-3 gap-2">
                <input
                  type="number"
                  value={recordValue}
                  onChange={handleValueChange}
                  autoComplete="off"
                  className="mt-8 text-4xl text-center indent-1 sm:indent-4 bg-neutral-300 dark:bg-neutral-700 rounded-md"
                />
                <p className="text-xs text-center font-medium opacity-70">
                  please select a number b/w{" "}
                  {`${minVal}${data.unit && data.unit}`} and{" "}
                  {`${maxVal}${data.unit && data.unit}`}
                </p>
                <div className="flex flex-col">
                  <Button
                    className="center w-3/4 mx-auto text-xs"
                    onClick={handleRecordValue}
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
