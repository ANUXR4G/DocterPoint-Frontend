import React from "react"
import { Activities, Tasks } from "@/components"
import { APPOINTMENTS } from "@/lib/dummy/appointments"
import { format, isSameDay, startOfToday, startOfTomorrow } from "date-fns"

export default function PendingTasks() {
  const today = startOfToday()
  const tomorrow = startOfTomorrow()

  const dayDate = format(today, "d")
  const day = format(today, "iiii")
  const month = format(today, "MMMM")

  // get all the appointments for today
  const appointmentsToday = APPOINTMENTS.filter((item) =>
    isSameDay(today, item.date)
  )

  // get all the appointments for tomorrow
  const appointmentsTomorrow = APPOINTMENTS.filter((item) =>
    isSameDay(tomorrow, item.date)
  )

  return (
    <div className="bg-[#F0F0F0] dark:bg-neutral-800 rounded-xl col-span-2 lg:order-3 lg:col-span-1 lg:row-span-3 pt-6 pb-4">
      {/* upcoming appointments */}
      <div className="flex flex-col">
        <div className="flex flex-col px-3">
          {/* date header for selected day */}
          <div className="flex items-center">
            <h3 className="text-6xl font-bold">{dayDate}</h3>
            <div className="flex flex-col ml-2 mb-1 mt-1">
              <span className="text-4xl leading-9 font-bold">{day}</span>
              <span className="ml-1 font-semibold opacity-65 leading-4">
                {month}
              </span>
            </div>
          </div>

          {/* upcoming appointments */}
          <div className="mt-3">
            {appointmentsToday.map((item, idx) => (
              <Tasks
                key={`task-appointment-today-${idx}`}
                data={[
                  {
                    type: item.type,
                    time: item.time,
                    date: item.date,
                    id: item.id,
                    doctor: {
                      name: item.doctor.name,
                      hospital: {
                        name: item.hospital.name,
                        address: item.hospital.address,
                      },
                    },
                  },
                ]}
              />
            ))}
          </div>
          {appointmentsTomorrow.length !== 0 && (
            <div>
              <div className="mt-3">
                {appointmentsTomorrow.map((item, idx) => (
                  <Tasks
                    key={`task-appointment-tom-${idx}`}
                    data={[
                      {
                        type: item.type,
                        time: item.time,
                        date: item.date,
                        id: item.id,
                        doctor: {
                          name: item.doctor.name,
                          hospital: {
                            name: item.hospital.name,
                            address: item.hospital.address,
                          },
                        },
                      },
                    ]}
                  />
                ))}
              </div>
            </div>
          )}

          {/* tasks for today */}
          <div className="mt-5">
            <h3 className="font-bold text-sm leading-4 text-center">
              Tasks for today
            </h3>
            <Activities />
          </div>
        </div>
      </div>
    </div>
  )
}
