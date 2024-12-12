export type FormErrors<T> = Partial<Record<keyof T, string>>
export type AuthValues = { email: string; password: string }

export type ProfileValues = {
  name: string
  dateOfBirth: string
  gender: string
  address: string
  imgSrc: string
  profession: string
  contactNumber: string
  emergencyContact: string
  emailAddress: string
  bloodGroup: string
  weight: number
  height: number
  diabetesStatus: string[]
  familyHistoryStatus: string[]
  smokingStatus: string
  physicalActivity: string
}

export type IconNames =
  | "search"
  | "key"
  | "energy"
  | "monitoring"
  | "bell"
  | "phone"
  | "filter"
  | "home"
  | "google"
  | "envelope"
  | "spinning-loader"
  | "human-circle"
  | "chart-pie"
  | "three-people"
  | "calendar"
  | "chart-graph"
  | "sun"
  | "moon"
  | "written-page"
  | "heart"
  | "settings"
  | "two-people"
  | "logout"
  | "gluco-guide"
  | "rotated-arrow"
  | "fire"
  | "heart-organ"
  | "human"
  | "weight-machine"
  | "up-arrow"
  | "up-chevron"
  | "ellipsis"
  | "mail"
  | "right-arrow"
  | "human-jogging"
  | "human-cycling"
  | "soup-bowl"
  | "capsule-pill"
  | "tablet-pill"
  | "human-yoga"
  | "heart-w-pulse"
  | "beat-graphics"
  | "doctor"
  | "edit-icon"
  | "watch"
  | "cross"
  | "information"
  | "pin"
  | "chevron-right"
  | "simple-left-arrow"
  | "simple-right-arrow"
  | "blank-clipboard"
  | "copied-clipboard"

export type AppointmentCreationProps = {
  doctor: string
  hospital: string
  address: string
  appointmentMode: string
  purposeOfVisit: string[]
  selectedDate: Date
  selectedMonth: string
  selectedMonthDays: Date[]
  notes: string
  availableDays: string[]
  time: string
}

export type LocationType = {
  id: string
  cityName: string
}

export type BookingModalProps = {
  doctor: string
  location: string
  hospital: string
}

export type AuthValueType = {
  email: string
  password: string
}

export interface User {
  id: string
  email: string
  name: string | null
  profession: string | null
  gender: string | null
  img_src: string | null
  date_of_birth: string | null
  address: string | null
  contact_number: string | null
  emergency_number: string | null
}

export type MonitoringDetail = {
  time: string
  value: number
}

export type BloodPressureDetail = {
  type: string
  data: MonitoringDetail[]
}

export type Monitoring = {
  name: string
  key: string
  imgSrc: string
  value: string | number | null
  unit?: string
  details?: MonitoringDetail[] | BloodPressureDetail[]
  time?: string
}

export type TPatientHealth = {
  id: string
  weight: number | null
  height: number | null
  blood_group: string | null
  smoking_status: string | null
  physical_activity: string | null
  previous_diabetes_records: string[] | null
  body_temperature: number | null
  blood_oxygen: number | null
  bmi: number | null
  blood_pressure_records: BloodPressureDetail[] | null
  blood_glucose_records: MonitoringDetail[] | null
}

export type ApiResponse<T> = {
  status: "successful" | "unsuccessful"
  message: string
  data: T
  total?: number
}

export type TDoctorFilteringOpts = {
  locations: string[]
  hospitals: string[]
}

export type TDoctor = {
  id: string
  name: string
  imgSrc: string
  createdBy: string
  description: string
  availableTimes: string
  emails: string[]
  role: string
  email: string
  gender: string
  address: string
  hospitalId: string
  experience: number
  contactNumbers: string[]
  hospital: { city: string; name: string; address: string; id: string }
}
