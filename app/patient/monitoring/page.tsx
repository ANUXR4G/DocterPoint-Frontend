import { HealthMonitoring, Medications } from "@/components"
import dynamic from "next/dynamic"

const DateHeading = dynamic(
  () => import("../../../components/dates/DateHeading"),
  {
    ssr: false,
  }
)

export default function PatientMonitoringPage() {
  return (
    <div className="relative overflow-hidden">
      <DateHeading />
      <HealthMonitoring />
      <Medications />
    </div>
  )
}
