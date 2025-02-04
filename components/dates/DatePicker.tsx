"use client"

import {
  add,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  startOfToday,
  startOfWeek,
} from "date-fns"
import React, {
  InputHTMLAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { Icon } from "@/components"
import { firey } from "@/utils"
import { AnimatePresence, motion } from "framer-motion"
import { useClicksOutside } from "@/hooks/useClicksOutside"
import { months } from "@/lib/dummy/calender"
import { days } from "@/lib/dummy/appointments"

type Props = {
  name: string
  onChange: (day: Date) => void
  modalClassName?: string
  containerClassName?: string
  direction?: "left" | "right"
  containerProps?: InputHTMLAttributes<HTMLDivElement>
  selectedDay?: Date | null
}

const SUBARRAYSIZE = 24

export default function DatePicker({
  name,
  onChange,
  selectedDay,
  modalClassName,
  containerProps,
  containerClassName,
  direction = "right",
}: Props) {
  let today = startOfToday()
  const currentYear = new Date().getFullYear()

  // get years from 1920 - running year
  const years = Array.from(
    { length: currentYear - 1920 + 1 },
    (_, i) => currentYear - i
  )

  const yearsChunks = firey.chunkArray(years, SUBARRAYSIZE, true)
  // const activeYearsKey =
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const yearsChunkKeys = Object.keys(yearsChunks)

  const [showYears, setShowYears] = useState<boolean>(false)
  const [showMonths, setShowMonths] = useState<boolean>(false)
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false)

  const [previewDays, setPreviewDays] = useState<Date[]>([])
  const [activeYears, setActiveYears] = useState<number[]>(
    yearsChunks[yearsChunkKeys[0]]
  )

  const [currentMonth, setCurrentMonth] = useState<string>(
    format(today, "MMM-yyyy")
  )
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)

  // get the first day of the current month
  let firstDayOfCurrentMonth = parse(currentMonth, "MMM-yyyy", new Date())

  // get the previous month dates
  function handlePrevMonth(): void {
    const firstDayPrevMonth = add(firstDayOfCurrentMonth, { months: -1 })
    const time = format(firstDayPrevMonth, "MMM-yyyy")
    const year = Number(time.split("-")[1])
    setCurrentMonth(time)
    setSelectedYear(year)
  }

  // get the next month dates
  function handleNextMonth(): void {
    const firstDayNextMonth = add(firstDayOfCurrentMonth, { months: 1 })
    const time = format(firstDayNextMonth, "MMM-yyyy")
    const year = Number(time.split("-")[1])
    setCurrentMonth(time)
    setSelectedYear(year)
  }

  // get the next chunk of year subarrays
  function handleNextYearSubArray(): void {
    setActiveYears((prev) => {
      const activeKey = `${prev[prev.length - 1]}-${prev[0]}`
      const currentIdx = yearsChunkKeys.indexOf(activeKey)
      const nextIdx = Math.max(currentIdx - 1, 0)

      return yearsChunks[yearsChunkKeys[nextIdx]]
    })
  }

  // get the previous chunk of year subarrays
  function handlePrevYearSubArray(): void {
    setActiveYears((prev) => {
      const activeKey = `${prev[prev.length - 1]}-${prev[0]}`
      const currentIdx = yearsChunkKeys.indexOf(activeKey)
      const prevIdx = Math.min(currentIdx + 1, yearsChunkKeys.length - 1)

      return yearsChunks[yearsChunkKeys[prevIdx]]
    })
  }

  // handle day selection
  function handleDaySelection(day: Date) {
    const isCurrentMonth = isSameMonth(day, currentMonth)
    if (isCurrentMonth) {
      onChange(day)
      setIsCalendarOpen(false)
    }
  }

  // handle year selection
  function handleYearSelection(year: number) {
    const [month, _] = currentMonth.split("-")
    const firstDayOfMonth = new Date(`${month} 1, ${year}`)
    setCurrentMonth(format(firstDayOfMonth, "MMM-yyyy"))
    setSelectedYear(year)
    setShowYears(false)
  }

  // handle month selection
  function handleMonthSelection(month: string) {
    const firstDayOfMonth = new Date(`${month} 1, ${selectedYear}`)
    setCurrentMonth(format(firstDayOfMonth, "MMM-yyyy"))
    setShowMonths(false)
  }

  // loop through the current month and get a preview of the dates
  const updatePreviewDays = useCallback(
    function () {
      const [month, _] = currentMonth.split("-")
      const firstDayOfCurrentMonth = new Date(`${month} 1, ${selectedYear}`)
      const days = eachDayOfInterval({
        start: startOfWeek(firstDayOfCurrentMonth, { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(firstDayOfCurrentMonth), { weekStartsOn: 1 }),
      })
      setPreviewDays(days)
    },
    [currentMonth, selectedYear]
  )

  // handle date picker modal close
  function handleClose() {
    setIsCalendarOpen(false)
    setShowMonths(false)
    setShowYears(false)
  }

  // close the modal on activity outside the modal
  useClicksOutside([pickerRef, containerRef], handleClose)

  // upadate the dates of the date picker
  useEffect(() => {
    updatePreviewDays()
  }, [updatePreviewDays])

  return (
    <div className={containerClassName}>
      <h4 className="text-sm font-semibold opacity-90 mb-0.5">
        {firey.camelToCapitalize(name)}
      </h4>
      <div
        ref={pickerRef}
        {...containerProps}
        className="relative flex items-center justify-between px-3 py-1.5 border border-neutral-300 dark:border-neutral-600 text-sm rounded-sm cursor-pointer focus:outline focus:outline-blue-400"
        onClick={() => setIsCalendarOpen(true)}
      >
        <span className="inline-block text-sm font-medium text-neutral-600 dark:text-neutral-400">
          {selectedDay ? format(selectedDay, "dd/MM/yyyy") : "Select a date"}
        </span>
        <Icon name="down-chevron" className="size-3.5" />
      </div>

      {/* calendar popover container */}
      {isCalendarOpen && (
        <motion.div
          ref={containerRef}
          className={`max-w-72 min-h-[21rem] h-auto absolute z-10 w-full mt-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg shadow-lg py-4 overflow-hidden lg:max-w-80 lg:py-6 ${
            direction === "right" ? `right-0` : `left-0`
          } ${modalClassName && modalClassName}`}
        >
          {/* years preview options */}
          <AnimatePresence>
            {showYears && (
              <div className="size-full z-30 absolute top-0 left-0 rounded-lg bg-white dark:bg-neutral-800">
                {/* header controls */}
                <div className="flex items-center justify-between mt-2 px-4 py-2.5">
                  <button
                    onClick={handlePrevYearSubArray}
                    className="focus:outline-none lg:text-lg"
                  >
                    &lt;
                  </button>
                  <span className="text-sm transition px-2 py-1 rounded-sm font-bold">
                    {`${activeYears[activeYears.length - 1]}-${activeYears[0]}`}
                  </span>
                  <button
                    onClick={handleNextYearSubArray}
                    className="focus:outline-none lg:text-lg"
                  >
                    &gt;
                  </button>
                </div>

                {/* options */}
                <div className="grid grid-cols-4 px-3 gap-x-2 gap-y-2 place-content-center">
                  {activeYears.map((year, idx) => (
                    <motion.button
                      key={`date-picker-years-${idx}`}
                      className={`text-xs px-2 py-2.5 font-semibold bg-neutral-200/50 hover:bg-neutral-200 dark:bg-neutral-700/50 dark:hover:bg-neutral-700 rounded-sm lg:py-3`}
                      initial={{ opacity: 0 }}
                      animate={{
                        opacity: 1,
                        transition: { delay: idx * 0.05 },
                      }}
                      onClick={() => handleYearSelection(year)}
                    >
                      {year}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </AnimatePresence>

          {/* months preview options */}
          <AnimatePresence>
            {showMonths && (
              <div className="size-full z-20 absolute top-0 left-0 rounded-lg bg-white dark:bg-neutral-800">
                {/* header controllers */}
                <div className="mt-6 px-4 flex items-center justify-between">
                  <button
                    className="text-xs font-bold outline-offset-4 lg:text-sm"
                    onClick={() => setShowMonths(false)}
                  >
                    Go Back
                  </button>
                  <button
                    onClick={() => setShowYears(true)}
                    className="text-sm font-bold outline-offset-4 lg:text-base"
                  >
                    {selectedYear}
                  </button>
                </div>

                {/* options */}
                <div className="grid grid-cols-3 p-3 gap-x-2 gap-y-2 place-content-center">
                  {months.map((name, idx) => (
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{
                        opacity: 1,
                        transition: { delay: idx * 0.05 },
                      }}
                      className="min-h-14 lg:min-h-16 text-xs font-semibold bg-neutral-200/50 hover:bg-neutral-200 dark:bg-neutral-700/50 dark:hover:bg-neutral-700 rounded-md"
                      key={`date-picker-month-${idx}`}
                      onClick={() => handleMonthSelection(name.substring(0, 3))}
                    >
                      {name.substring(0, 3)}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </AnimatePresence>

          {/* control headers for days */}
          <div className="flex items-center justify-between px-4 py-2.5">
            <button
              onClick={handlePrevMonth}
              className="focus:outline-none lg:text-lg"
            >
              &lt;
            </button>

            <button
              className="text-sm transition hover:bg-neutral-700/50 px-2 py-1 rounded-sm font-bold lg:text-base lg:px-3"
              onClick={() => setShowMonths(true)}
            >
              {format(currentMonth, "MMMM yyy")}
            </button>

            <button
              onClick={handleNextMonth}
              className="focus:outline-none lg:text-lg"
            >
              &gt;
            </button>
          </div>

          <motion.div
            key={`month-${currentMonth.toLowerCase()}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-7 gap-x-1 gap-y-2.5 p-3 text-sm"
          >
            {/* days of the week */}
            {days.map((day, idx) => (
              <div
                key={`week-${idx}`}
                className="text-center font-semibold text-neutral-500 select-none"
              >
                {day.substring(0, 2)}
              </div>
            ))}

            {/* calendar days */}
            {previewDays.map((day, idx) => (
              <div
                className={`transition rounded-full mx-auto size-8 center lg:size-9 ${
                  selectedDay && isSameDay(selectedDay, day)
                    ? `bg-blue-500 select-none [&_time]:text-neutral-200`
                    : isSameDay(day, today)
                    ? `[&_time]:text-blue-500 hover:cursor-pointer`
                    : isSameMonth(day, currentMonth)
                    ? `hover:cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700`
                    : `opacity-50 select-none`
                }`}
                key={`${currentMonth.toLowerCase()}-${idx}`}
                onClick={() => handleDaySelection(day)}
              >
                <time
                  className="text-sm font-medium text-neutral-800 dark:text-neutral-400"
                  dateTime={format(day, "dd-MM-yyyy")}
                >
                  {format(day, "dd")}
                </time>
              </div>
            ))}
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
