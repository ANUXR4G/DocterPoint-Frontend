import { TMonitoring, TPatientHealth } from "@/types"

export const bloodGlucoseData = [
  {
    name: "12AM",
    value: 98,
  },
  {
    name: "9AM",
    value: 124,
  },
  {
    name: "3PM",
    value: 104,
  },
  {
    name: "6PM",
    value: 136,
  },
]

export const systolicPressureData = [
  { value: 120, time: "Sunday" },
  { value: 129, time: "Monday" },
  { value: 132, time: "Tuesday" },
  { value: 136, time: "Wednesday" },
  { value: 140, time: "Thursday" },
  { value: 131, time: "Friday" },
  { value: 128, time: "Saturday" },
]

export const diastolicPressureData = [
  { diastolic: 80, day: "Sunday" },
  { diastolic: 82, day: "Monday" },
  { diastolic: 86, day: "Tuesday" },
  { diastolic: 85, day: "Wednesday" },
  { diastolic: 80, day: "Thursday" },
  { diastolic: 83, day: "Friday" },
  { diastolic: 82, day: "Saturday" },
]

export function modifyData(values?: TPatientHealth) {
  const extractedGlucoseValues =
    values && values.blood_glucose_records
      ? values.blood_glucose_records.flatMap((item) => item.value)
      : []
  const extractedPressureValues =
    values && values.blood_pressure_records
      ? values.blood_pressure_records.flatMap((item) =>
          item.data.map((item) => item.value)
        )
      : []
  const systolicValues = extractedPressureValues.filter((item) => item > 90)
  const diastolicValues = extractedPressureValues.filter((item) => item < 90)

  const glucoseAverage =
    extractedGlucoseValues.length > 0
      ? `${(
          extractedGlucoseValues.reduce((acc, curr) => acc + curr, 0) /
          extractedGlucoseValues.length
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

  const modifiedValues: TMonitoring[] = [
    {
      name: "Blood Glucose",
      key: "blood_glucose_records",
      imgSrc:
        "https://res.cloudinary.com/dwhlynqj3/image/upload/v1726370195/glucoguide/eshvpjc2piantofgo7un.png",
      value: glucoseAverage,
      unit: "mg/dL",
      details: !values
        ? []
        : values.blood_glucose_records
        ? values.blood_glucose_records
        : [],
      time: "12/9/2024",
    },
    {
      name: "Blood Pressure",
      key: "blood_pressure_records",
      imgSrc:
        "https://res.cloudinary.com/dwhlynqj3/image/upload/v1726370195/glucoguide/jscxzd0bo8vv6d764qpx.png",
      value: pressureAverage,
      unit: "mmHg",
      details: !values
        ? []
        : values.blood_pressure_records
        ? values.blood_pressure_records
        : [],
    },
    {
      name: "Body Temperature",
      key: "body_temperature",
      imgSrc:
        "https://res.cloudinary.com/dwhlynqj3/image/upload/v1726370196/glucoguide/ifpjprzgo13nqq9kvzjp.png",
      value: values ? values.body_temperature : null,
      unit: "°C",
    },
    {
      name: "Blood Oxygen",
      key: "blood_oxygen",
      imgSrc:
        "https://res.cloudinary.com/dwhlynqj3/image/upload/v1726370195/glucoguide/nk5rlea21apu50ub5n3o.png",
      value: values ? values.blood_oxygen : null,
      unit: "%",
    },
    {
      name: "Weight",
      key: "weight",
      imgSrc:
        "https://res.cloudinary.com/dwhlynqj3/image/upload/v1726370196/glucoguide/aezltcsbzbxeruqxq2bb.png",
      value: values ? values.weight : null,
      unit: "lb",
    },
    {
      name: "BMI",
      key: "bmi",
      imgSrc:
        "https://res.cloudinary.com/dwhlynqj3/image/upload/v1726370196/glucoguide/s4abov7lx5ukj7lmygik.png",
      value: values ? values.bmi : null,
    },
  ]

  return modifiedValues
}

export const hours = [
  "8AM",
  "10AM",
  "12PM",
  "2PM",
  "4PM",
  "6PM",
  "8PM",
  "10PM",
  "12AM",
]
