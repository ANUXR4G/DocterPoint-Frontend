import { TRouteProps } from "@/types"

export const routes: Record<string, TRouteProps[]> = {
  user: [
    {
      name: "Dashboard",
      icon: "home",
      dest: "/patient/dashboard",
    },
    {
      name: "Find clinics",
      icon: "three-people",
      dest: "/practices",
    },
    {
      name: "My Bookings",
      icon: "calendar",
      dest: "/patient/bookings",
    },
    {
      name: "Profile",
      icon: "written-page",
      dest: "/patient/profile",
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
      name: "Appointments",
      icon: "beat-graphics",
      dest: "/doctor/appointments",
    },
    {
      name: "Patients",
      icon: "two-people",
      dest: "/doctor/patients",
    },
    {
      name: "Calendar",
      icon: "calendar",
      dest: "/doctor/calendar",
    },
    {
      name: "Analytics",
      icon: "beat-graphics",
      dest: "/doctor/analytics",
    },
    {
      name: "Subscription",
      icon: "heart-w-pulse",
      dest: "/doctor/subscription",
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
  clinic: [
    {
      name: "Dashboard",
      icon: "home",
      dest: "/clinic/dashboard",
    },
    {
      name: "Queue",
      icon: "inbox",
      dest: "/clinic/queue",
    },
    {
      name: "Appointments",
      icon: "beat-graphics",
      dest: "/clinic/appointments",
    },
    {
      name: "Doctors",
      icon: "doctor",
      dest: "/clinic/doctors",
    },
    {
      name: "Patients",
      icon: "two-people",
      dest: "/doctor/patients",
    },
    {
      name: "Calendar",
      icon: "calendar",
      dest: "/doctor/calendar",
    },
    {
      name: "Analytics",
      icon: "beat-graphics",
      dest: "/clinic/analytics",
    },
    {
      name: "Hours & blocks",
      icon: "calendar",
      dest: "/settings?tab=practice&subtab=setup",
    },
    {
      name: "Subscription",
      icon: "heart-w-pulse",
      dest: "/clinic/subscription",
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
    { name: "Dashboard", icon: "home", dest: "/admin/dashboard" },
    { name: "Doctors", icon: "doctor", dest: "/admin/doctors" },
    { name: "Patients", icon: "two-people", dest: "/admin/patients" },
    { name: "Clinics", icon: "three-people", dest: "/admin/clinics" },
    { name: "Bookings", icon: "calendar", dest: "/admin/bookings" },
    { name: "Payments", icon: "heart-w-pulse", dest: "/admin/payments" },
    { name: "Approvals", icon: "inbox", dest: "/admin/approvals" },
    { name: "WhatsApp", icon: "heart", dest: "/admin/whatsapp" },
    { name: "WA Signup", icon: "phone", dest: "/admin/whatsapp/signup" },
    { name: "Settings", icon: "settings", dest: "/settings" },
    { name: "Support", icon: "two-people", dest: "/admin/support" },
    { name: "Logout", icon: "logout" },
  ],
}
