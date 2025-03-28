import AlignContent from "@/components/contents/AlignContent"
import ListContent from "@/components/contents/ListContent"
import { onGoingStatuses } from "@/lib/dummy/status"
import { TDoctorAppointment } from "@/types"
import { firey } from "@/utils"
import { format } from "date-fns"
import React from "react"

type Props = {
  info: TDoctorAppointment
}

export default function AppointmentBasic({ info }: Props) {
  return (
    <React.Fragment>
      {/* {onGoingStatuses.includes(info.status) && ( */}
      <div className="-ml-0.5 flex gap-2 items-center">
        <div
          className={`text-xs font-semibold px-2 py-1 text-zinc-950/70 dark:text-neutral-300 md:py-1 rounded-sm dark:bg-neutral-600 ${
            info.status !== "upcoming"
              ? `bg-zinc-300 dark:bg-neutral-400`
              : info.type === "consultation"
              ? `bg-orange-300/80`
              : `bg-blue-300/80`
          }
            `}
        >
          #{info.status}
        </div>
      </div>
      {/* )} */}

      <h4 className="-ml-1 text-sm font-bold text-[--secondary-black] px-1.5 py-1 bg-zinc-300 size-fit rounded-md">
        Serial No. #{info.serialNumber}
      </h4>

      {/* Test name if there is any */}
      {info.testName && (
        <AlignContent
          keys={["Test Name"]}
          values={[info.testName]}
          className="text-neutral-600 dark:text-neutral-400"
        />
      )}

      {/* Basic doctor information */}
      {info.referredBy && (
        <AlignContent
          keys={["Referred By"]}
          values={[info.referredBy.name]}
          className="text-neutral-600 dark:text-neutral-400"
        />
      )}

      <AlignContent
        keys={["Appointment Date", "Appointment Time"]}
        values={[
          format(info.appointmentDate, "dd/MM/yyyy"),
          info.appointmentTime,
        ]}
        className="text-neutral-600 dark:text-neutral-400"
      />

      {info.patientNote && (
        <AlignContent
          keys={["Special Note"]}
          values={[info.patientNote]}
          className="text-neutral-600 dark:text-neutral-400"
        />
      )}

      {info.doctorNote && (
        <AlignContent
          keys={["Doctor Note"]}
          values={[info.doctorNote]}
          className="text-neutral-600 dark:text-neutral-400"
        />
      )}

      <AlignContent
        keys={["Visit Reason"]}
        values={[firey.makeString(info.purposeOfVisit)]}
        className="text-neutral-600 dark:text-neutral-400 [&_h5]:line-clamp-2"
      />

      {/* Prescription */}
      {info.medication && !Array.isArray(info.medication) && (
        <div className="flex flex-col gap-3 text-neutral-600 dark:text-neutral-400">
          {/* medication recommendations */}
          {info.medication.medications && (
            <ListContent
              title={
                onGoingStatuses.includes(info.status)
                  ? "Running Medications 💊"
                  : "Prescribed Medicines 💊"
              }
              keys={info.medication.medications.map((item) => `${item.name}: `)}
              values={info.medication.medications.map(
                (item) =>
                  `${item.amount} unit at ${firey.makeString(item.times)}.`
              )}
            />
          )}

          {/* dietary recommendations */}
          {info.medication.dietary && (
            <ListContent
              title="Dietary Recommendations 🍇"
              keys={[
                ...info.medication.dietary.map((item) => `${item.time}: `),
                `goal: `,
              ]}
              values={[
                ...info.medication.dietary.map(
                  (item) => `Have your food under ${item.energy}kCal.`
                ),
                `${info.medication.energyGoal}kCal(approx)`,
              ]}
            />
          )}

          {/* nutrition recommedations */}
          {info.medication.nutritions && (
            <ListContent
              title="Nutrition Recommendations 🥜"
              keys={info.medication.nutritions.map((item) => `${item.name}:`)}
              values={info.medication.nutritions.map(
                (item) => `${item.amount}g`
              )}
            />
          )}

          {/* recommeded ingredients */}
          {info.medication.recommendedIngredients && (
            <ListContent
              title="Recommended Ingredients 🥛"
              keys={info.medication.recommendedIngredients.map((_) => ``)}
              values={info.medication.recommendedIngredients.map(
                (item) => item
              )}
            />
          )}

          {/* rescrictied ingredients */}
          {info.medication.allergies && (
            <ListContent
              title="Must Avoid ❌"
              keys={info.medication.allergies.map((_) => ``)}
              values={info.medication.allergies.map((item) => item)}
            />
          )}

          {/* lifestyle recommendations */}
          {info.medication.sleep && info.medication.hydration && (
            <ListContent
              title="Lifestyle Recommendations 🌻"
              keys={[`sleep: `, `hydration`]}
              values={[
                `atleast ${info.medication.sleep}hrs daily.`,
                `atleast ${info.medication.hydration} glass of waters daily.`,
              ]}
            />
          )}

          {/* recommended exercises */}
          {info.medication.exercises && (
            <ListContent
              title="Exercise Recommendations 🏃🏼‍♂️"
              keys={info.medication.exercises.map((_) => ``)}
              values={info.medication.exercises.map(
                (item) =>
                  `${item.name} for ${item.duration} at ${firey.makeString(
                    item.times
                  )}.`
              )}
            />
          )}
        </div>
      )}
    </React.Fragment>
  )
}
