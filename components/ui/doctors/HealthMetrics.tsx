import {
  BloodPressureDetail,
  MonitoringDetail,
  THealth,
  TPatientHealth,
} from "@/types"
import { firey } from "@/utils"

type Props = THealth

export default function HealthMetrics(props: Props) {
  const extractedGlucoses =
    props.bloodGlucoseRecords?.flatMap((item) => item.value) || []
  const extractedPressures =
    props.bloodPressureRecords?.flatMap((item) =>
      item.data.map((item) => item.value)
    ) || []
  const systolicValues = extractedPressures.filter((item) => item > 90)
  const diastolicValues = extractedPressures.filter((item) => item < 90)

  const glucoseAverage =
    extractedGlucoses.length > 0
      ? `${(
          extractedGlucoses.reduce((acc, curr) => acc + curr, 0) /
          extractedGlucoses.length
        ).toFixed(2)}`
      : null

  const pressureAverage =
    systolicValues.length > 0 && diastolicValues.length > 0
      ? `${(
          systolicValues.reduce((acc, curr) => acc + curr, 0) /
          systolicValues.length
        ).toFixed()}/${(
          diastolicValues.reduce((acc, curr) => acc + curr, 0) /
          diastolicValues.length
        ).toFixed()}`
      : null

  const metrices = [
    {
      name: "FBS",
      value: glucoseAverage ? `${glucoseAverage}mg/dL` : `NA`,
    },
    {
      name: "BP",
      value: pressureAverage ? `${pressureAverage}mmHg` : `NA`,
    },
    {
      name: "Temperature",
      value: props.bodyTemperature || `NA`,
    },
    {
      name: "Saturation",
      value: props.bloodOxygen ? `${props.bloodOxygen}%` : `NA`,
    },
    {
      name: "Height",
      value: props.height ? `${props.height}ft` : `NA`,
    },
    {
      name: "Weight",
      value: props.weight ? `${props.weight}lb` : `NA`,
    },
    {
      name: "BMI",
      value: props.bmi || `NA`,
    },
    {
      name: "Smoking",
      value: props.smokingStatus || `NA`,
    },
    {
      name: "Activity",
      value: props.physicalActivity || `NA`,
    },
    {
      name: "Diabetes Records",
      value: props.previousDiabetesRecords
        ? props.previousDiabetesRecords.length > 1
          ? firey.makeString(props.previousDiabetesRecords)
          : props.previousDiabetesRecords[0]
        : `NA`,
    },
  ]

  return (
    <div>
      <h2 className="text-sm font-semibold mt-2">Medical History</h2>

      {/* Informations */}
      <div className="mt-2 -ml-1 grid grid-cols-2 xxs:grid-cols-3 sm:grid-cols-4 gap-2">
        {metrices.map((item, idx) => (
          <div
            key={`iappointment-hm-p-${idx}`}
            className="border py-3 px-2 rounded-md border-neutral-300 shadow-sm dark:border-neutral-700"
          >
            <h3 className="text-xs font-medium leading-4 text-neutral-500 dark:text-neutral-500">
              {item.name}
            </h3>
            <p className="text-sm font-bold dark:text-neutral-400">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
