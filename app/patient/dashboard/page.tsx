import {
  BloodGlucose,
  BloodPressure,
  ConnectDeviceBanner,
  ConsultDoctors,
  Greeting,
  HealthInformations,
  PendingTasks,
} from "@/components"

export default function Dashboard() {
  return (
    <div className="mb-4">
      <Greeting />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2 3xl:mt-3">
        <PendingTasks />
        <HealthInformations />
        <ConsultDoctors />
        <ConnectDeviceBanner />
        <BloodGlucose />
        <BloodPressure />
      </div>
    </div>
  )
}
