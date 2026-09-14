import {
  DietPreference,
  NutrientsRecommendationChart,
  FoodRecommendations,
  ActivitySuggestions,
} from "@/components"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import { format, startOfToday } from "date-fns"

export default function DietPage() {
  const today = startOfToday()

  return (
    <div className="dashboard-page">
      <DashboardPageHeader
        eyebrow={format(today, "EEEE, d MMMM yyyy")}
        title={
          <>
            Daily{" "}
            <span className="text-blue-600 dark:text-sky-400">nutrition plan</span>
          </>
        }
        subtitle="Personalised meal ideas, activity suggestions, and nutrient targets for your day."
        action={<DietPreference />}
      />

      <div className="flex w-full flex-col gap-5 2xl:flex-row 2xl:items-start">
        <section className="dashboard-panel min-w-0 flex-1">
          <ActivitySuggestions />
        </section>
        <section className="dashboard-panel min-w-0 flex-1">
          <NutrientsRecommendationChart />
        </section>
      </div>

      <section className="dashboard-panel">
        <FoodRecommendations />
      </section>
    </div>
  )
}
