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
  | "navigation"
  | "arrow-up-down"
  | "image-upload"
  | "mail-upload"
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
  | "inbox"
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
  | "down-chevron"
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

export type TMonitoring = {
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
  experience: number
  contactNumbers: string[]
  hospital: { city: string; name: string; address: string; id: string }
}

export type TPatient = {
  id: string
  email: string
  role: string
  name: string | null
  gender: string | null
  imgSrc: string | null
  address: string | null
  profession: string | null
  dateOfBirth: string | null
  contactNumber: string | null
  emergencyNumber: string | null
}

export type THospital = {
  id: string
  name: string
  address: string
  city: string
  imgSrc: string
  description: string
  emails: string[]
  contactNumbers: string[]
  geometry: {
    coordinates: number[]
    type: string
  }
}

type TAppointmentDoc = {
  id: string
  name: string
}

export type TAppointment = {
  id: string
  serialNumber: number
  mode: string
  type: string
  status: string
  appointmentDate: string
  appointmentTime: string
  purposeOfVisit: string[]
  testName: string | null
  referredBy: TAppointmentDoc | null
  doctor: TAppointmentDoc
  hospital: TAppointmentDoc & {
    address: string
  }
  patientNote: string | null
  doctorNote: string | null
}

export type TBookingAppointment = {
  doctor: string
  doctorId: string
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

export type TBookingPrompt = {
  doctor: string
  location: string
  hospital: string
}

export type TMedications = {
  id: string
  patientId: string
  doctorId: string | null
  appointmentId: string | null
  primaryGoals: string
  medications:
    | {
        name: string
        amount: number
        times: string[]
        description?: string
      }[]
    | null
  dietary:
    | {
        time: "breakfast" | "lunch" | "dinner" | "snacks"
        energy: number
      }[]
    | null
  nutritions:
    | {
        name: "protein" | "fat" | "carbs"
        amount: number
      }[]
    | null
  bmiGoal: number | null
  energyGoal: number
  hydration: string
  sleep: string
  exercises:
    | {
        name: string
        times: string[]
        duration: string
        description?: string
      }[]
    | null
  monitoring: { name: string; times: string }[] | null
  expiry: number
  allergies: string[] | null
  recommendedIngredients: string[] | null
  preferredCuisine: string | null
  generatedBy: "doctor" | "system"
  createdAt: string
}

export type TMeal = {
  id: string
  name: string
  ingredients: string[]
  calories: number
  fat: number
  carbs: number
  imgSrc: string
  description: string
  category: string
  time: string
  protein: number
  blog: string
}

export type TInfoOptions = {
  name: string
  gender: string
  imgSrc: string
  address: string
  profession: string
  dateOfBirth: Date | null
  contactNumber: string
  emergencyNumber: string
  weight: number | string
  height: number | string
  bloodGroup: string
  smokingStatus: string
  physicalActivity: string
  previousDiabetesRecords: string[]
}

export type TSocketMessage = {
  id: string
  type: string
  content: string
  created_at: string
  is_seen: boolean
  sender_id: string
  receiver_id?: string | null
}

export type TMessage = {
  id: string
  type: string
  content: string
  createdAt: string
  isSeen: boolean
  senderId: string
  receiverId?: string | null
}

export type TRouteProps = {
  name: string
  icon: IconNames
  dest?: string
}

export type TRequestAppointment = TAppointment & {
  patient: TAppointmentDoc
}

export type TypeAnalytics = Record<
  string,
  {
    patients: { male: number; female: number }
    appointments: { male: number; female: number }
  }
>

export type TypeAnalyticsParam = "week" | "month"

export type AnalyticMetrics = {
  name: string
  male: number
  female: number
  hasMetrics: boolean
}
