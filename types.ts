export type IconNames =
  | "search"
  | "key"
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
  url: string
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
