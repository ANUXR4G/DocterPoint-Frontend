"use client"

import React, { useEffect, useState } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { mealRecommendationOptions } from "@/lib/dummy/diets"
import { firey } from "@/utils"
import { CityScene, Meal, Pagination } from "@/components"
import { partsOfDay } from "@/lib/dummy/recommededOptData"
import { useApi } from "@/hooks/useApi"
import { mealService } from "@/lib/services/meal"
import { TMeal } from "@/types"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export default function FoodRecommendations() {
  const options = partsOfDay({
    breakfast: 580,
    lunch: 700,
    snacks: 120,
    dinner: 700,
  })
  const router = useRouter()
  const searchParams = useSearchParams()

  const page = Number(searchParams.get("page")) || 1
  const [limit] = useState<number>(10)
  const [totalPages, setTotalPages] = useState<number>(1)

  const time = new Date().getHours() // get current date in hours

  // get the current part of the day
  const currentPOD = options.filter(
    (pod) => time >= pod.start && time <= pod.end
  )[0]

  // get the recommeded meals based on category, e.g - breakfast, lunch, dinner
  const category = searchParams.get("category") || currentPOD.status

  // retrieve all the meals based on the selected category
  const { data, isLoading } = useApi(
    [
      `${
        totalPages > 1
          ? `patients:meals:${category}:page:${page}`
          : `patients:meals:${category}`
      }`,
    ],
    async (_, token) => {
      const params = firey.createSearchParams({
        page: totalPages > 1 ? String(page) : String(1),
        limit,
        category,
      })
      return mealService.getMeals(token, params.toString())
    },
    {
      // reconstruct the response to have keys with camelCasing
      select: (data) => {
        if (data) {
          return firey.convertKeysToCamelCase(data) as {
            total: number
            meals: TMeal[]
          }
        }
      },
    }
  )

  // handle page number indicator (pagination)
  function handlePageChange(page: number) {
    const oldParams = new URLSearchParams(searchParams)
    oldParams.delete("page")
    router.push(
      `${
        oldParams.size === 0
          ? `?page=${page}`
          : `?${oldParams.toString()}&page=${page}`
      }`
    )
  }

  // handle previous page (pagination btn)
  function handlePreviousPage() {
    const oldParams = new URLSearchParams(searchParams)
    oldParams.delete("page")
    const prevPageKey = `page=${Math.max(page - 1, 1)}`
    router.push(
      `${
        oldParams.size === 0
          ? `?${prevPageKey}`
          : `?${oldParams.toString()}&${prevPageKey}`
      }`
    )
  }

  // handle next page (pagination btn)
  function handleNextPage() {
    const oldParams = new URLSearchParams(searchParams)
    oldParams.delete("page")
    const prevNextKey = `page=${Math.min(page + 1, totalPages)}`
    router.push(
      `${
        oldParams.size === 0
          ? `?${prevNextKey}`
          : `?${oldParams.toString()}&${prevNextKey}`
      }`
    )
  }

  // update the total size of page
  useEffect(() => {
    if (!data) return
    setTotalPages(Math.ceil(data.total / limit))
  }, [data, limit])

  return (
    <React.Fragment>
      {/* recommended meals */}
      <h4 className="text-center text-sm lg:text-xl mt-8 lg:mt-10 ml-2 font-bold opacity-70 dark:opacity-100 xl:text-start xl:text-base">
        Recommended Foods
      </h4>

      {/* meal options */}
      <div className="mt-3 center gap-4 lg:mt-6 xl:justify-start xl:mt-4">
        {mealRecommendationOptions.map((option, idx) => (
          <div
            key={`recommended_meal_option_${idx}`}
            onClick={() => {
              const oldParams = new URLSearchParams(searchParams)
              oldParams.delete("category")
              oldParams.delete("page")
              router.push(
                `${
                  oldParams.size === 0
                    ? `?category=${option.category}&page=1`
                    : `?category=${
                        option.category
                      }&page=1&${oldParams.toString()}`
                }`
              )
            }}
            className={`min-w-14 shadow-sm min-h-12 lg:min-w-36 lg:min-h-32 center cursor-pointer rounded-2xl flex items-center ml-1 ${
              category === option.category
                ? `outline outline-offset-4 outline-2 outline-blue-500`
                : `hover:shadow-md`
            }`}
            style={{ background: `${option.bg}` }}
          >
            <div
              className={`relative ${
                option.title === "Breakfast" && "-mb-0.5"
              } ${
                option.size === "smaller"
                  ? "w-7 h-7 lg:w-12 lg:h-12"
                  : "w-12 h-12 lg:w-20 lg:h-20"
              }`}
            >
              <Image
                fill
                src={option.imgSrc}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                alt={`${option.title}.png`}
                style={{ objectFit: "contain", filter: "contrast(0.9)" }}
              />
            </div>
            <span
              className={`hidden ${option.title === "Breakfast" && "-mt-4"} ${
                option.title === "Snacks" && "mt-1"
              } font-bold`}
            >
              {option.title}
            </span>
          </div>
        ))}
      </div>

      {/* meal recommendations */}
      <div className="ml-2 mt-8 opacity-90 overflow-hidden xl:mt-9">
        <motion.div
          key={category}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <h3 className="text-lg uppercase font-extrabold tracking[0.2px]">
            {category}
          </h3>
        </motion.div>
      </div>

      <div className="ml-1.5 overflow-hidden">
        <motion.div
          key={options.filter((opt) => opt.status === category)[0].calories}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }}
          exit={{ opacity: 0 }}
          className="flex items-end"
        >
          <h3 className="text-4xl leading-8 lg:leading-9 font-extrabold tracking[0.2px]">
            {options.filter((opt) => opt.status === category)[0].calories}kcal
          </h3>
          <span className="leading-7 font-bold opacity-80">(goal)</span>
        </motion.div>
      </div>

      <motion.div className="mt-4 mb-4 grid grid-cols-1 xxs:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 gap-2 md:gap-2.5 lg:gap-3 2xl:gap-4">
        {data &&
          data.meals.length > 0 &&
          data.meals.map((meal: any, idx: number) => (
            <Meal
              meal={meal}
              idx={idx}
              key={`meal-recommendation-${meal.category}-${idx}`}
            />
          ))}
      </motion.div>

      {/* pagination controls */}
      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          handlePreviousPage={handlePreviousPage}
          handleNextPage={handleNextPage}
          onPageChange={handlePageChange}
        />
      )}

      {/* empty data and loading state */}
      {isLoading && <CityScene content="Loading..." />}
      {data && data.total === 0 && <CityScene content="No Meal Found" />}
    </React.Fragment>
  )
}
