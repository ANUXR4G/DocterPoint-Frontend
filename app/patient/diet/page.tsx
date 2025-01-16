import {
  DietPreference,
  NutrientsRecommendationChart,
  FoodRecommendations,
  DietCategory,
} from "@/components"
import { format, startOfToday } from "date-fns"

export default function DietPage() {
  const today = startOfToday()

  return (
    <div className="pb-4 lg:pb-6">
      <div className="flex flex-col ml-1">
        <span className="text-sm font-bold opacity-70">
          {format(today, "PPP")}
        </span>
        <h3 className="text-2xl font-extrabold leading-7">Daily Plan</h3>
      </div>

      {/* preference customization popover modal */}
      <DietPreference />

      {/* meal recommendations */}
      <div className="flex flex-col 2xl:flex-row w-full 2xl:gap-2 lg:items">
        {/* recommendation categories */}
        <DietCategory />

        {/* Nutrition Chart */}
        <NutrientsRecommendationChart />
      </div>

      {/* meal details */}
      <FoodRecommendations />
    </div>
  )
}
