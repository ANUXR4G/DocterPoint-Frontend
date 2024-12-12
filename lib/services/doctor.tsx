import { ApiResponse, TDoctor } from "@/types"

async function retrive_all(page: number, limit: number) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctors/all?page=${page}&limit=${limit}`
  )
  if (!response.ok) {
    throw new Error("failed to retrieve doctors informations!")
  }
  return response.json()
}

export const doctorServices = {
  retrive_all,
}
