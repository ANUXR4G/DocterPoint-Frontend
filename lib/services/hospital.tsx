import { ApiResponse } from "@/types"

async function retrive_names(): Promise<ApiResponse<string[]>> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/hospitals/tags/names`
  )
  if (!response.ok) {
    throw new Error("failed to retrieve hosptial names!")
  }
  return response.json()
}

async function retrive_locations(): Promise<ApiResponse<string[]>> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/hospitals/tags/cities`
  )
  if (!response.ok) {
    throw new Error("failed to retrieve hosptial locations!")
  }
  return response.json()
}

export const hospitalService = {
  retrive_names,
  retrive_locations,
}
