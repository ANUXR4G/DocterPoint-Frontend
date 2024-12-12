async function retrive_all(params: URLSearchParams) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctors/all?${params}`
  )
  if (!response.ok) {
    throw new Error("failed to retrieve doctors informations!")
  }
  return response.json()
}

export const doctorServices = {
  retrive_all,
}
