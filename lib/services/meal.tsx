async function getMeals(token: string, params: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/diet/meal?${params}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error("failed to retrieve meal informations.")
  }

  return response.json()
}

export const mealService = {
  getMeals,
}
