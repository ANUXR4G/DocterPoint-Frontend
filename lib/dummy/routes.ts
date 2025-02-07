import { TRouteProps } from "@/types"

export const routes: Record<string, TRouteProps[]> = {
  user: [
    {
      name: "Dashboard",
      icon: "home",
      dest: "/patient/dashboard",
    },
    {
      name: "Diet Management",
      icon: "chart-pie",
      dest: "/patient/diet",
    },
    {
      name: "Doctors",
      icon: "three-people",
      dest: "/hospitals/doctors",
    },
    {
      name: "Appointments",
      icon: "calendar",
      dest: "/patient/appointments",
    },
    {
      name: "Monitoring",
      icon: "chart-graph",
      dest: "/patient/monitoring",
    },
    {
      name: "Hospitals",
      icon: "heart",
      dest: "/hospitals",
    },
    {
      name: "Settings",
      icon: "settings",
      dest: "/settings",
    },
    {
      name: "Help",
      icon: "two-people",
    },
    {
      name: "Logout",
      icon: "logout",
    },
  ],
  doctor: [
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
      dest: "/settings",
    },
    {
      name: "Help",
      icon: "two-people",
    },
    {
      name: "Logout",
      icon: "logout",
    },
  ],
  admin: [
    {
      name: "Dashboard",
      icon: "home",
      dest: "/admin/dashboard",
    },
    {
      name: "Inbox",
      icon: "inbox",
      dest: "/admin/inbox",
    },
    {
      name: "Patients",
      icon: "beat-graphics",
      dest: "/admin/users/patients",
    },
    {
      name: "Appointments",
      icon: "calendar",
      dest: "/admin/users/doctor/appointments",
    },
    {
      name: "Doctors",
      icon: "three-people",
      dest: "/admin/users/doctor",
    },
    {
      name: "Hospitals",
      icon: "heart",
      dest: "/admin/hospitals",
    },
    {
      name: "Settings",
      icon: "settings",
      dest: "/settings",
    },
    {
      name: "Logout",
      icon: "logout",
    },
  ],
}
