import { HealthMonitoring, Medications } from "@/components"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"

export default function PatientMonitoringPage() {
  return (
    <div className="dashboard-page">
      <DashboardPageHeader
        eyebrow="Patient"
        title={
          <>
            Health{" "}
            <span className="text-blue-600 dark:text-sky-400">monitoring</span>
          </>
        }
        subtitle="Track vitals, glucose, blood pressure, and medications in one place."
      />

      <div className="space-y-5">
        <section className="dashboard-panel">
          <HealthMonitoring />
        </section>
        <section className="dashboard-panel">
          <Medications />
        </section>
      </div>
    </div>
  )
}
