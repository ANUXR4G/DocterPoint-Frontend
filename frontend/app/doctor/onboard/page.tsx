import DoctorsManagePage from "@/components/ui/procto/DoctorsManagePage"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"

export default function DoctorDoctorsPage() {
  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        eyebrow="Doctor"
        title="Manage doctors"
        subtitle="Add doctors to your practice, update profiles, and manage team access."
      />
      <div className="dashboard-panel">
        <DoctorsManagePage />
      </div>
    </div>
  )
}
