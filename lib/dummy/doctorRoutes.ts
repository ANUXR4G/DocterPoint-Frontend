import { TRouteProps } from "@/types"

export const doctorRoutes: TRouteProps[] = [
  {
    name: "Dashboard",
    icon: "home",
    dest: "/doctor/dashboard",
  },
  {
    name: "Patients",
    icon: "beat-graphics",
    dest: "/doctor/appointments/patients",
  },
  {
    name: "Inbox",
    icon: "inbox",
    dest: "/doctor/inbox",
  },
  {
    name: "Appointments",
    icon: "calendar",
    dest: "/doctor/appointments",
  },
  {
    name: "Doctors",
    icon: "three-people",
    dest: "/hospitals/doctors",
  },
  {
    name: "Hospitals",
    icon: "heart",
    dest: "/hospitals",
  },
  {
    name: "Settings",
    icon: "settings",
    dest: "/doctor/settings",
  },
  {
    name: "Help",
    icon: "two-people",
  },
  {
    name: "Logout",
    icon: "logout",
  },
]
