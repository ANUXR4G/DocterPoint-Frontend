async function retrive_all(params: URLSearchParams) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/doctors/info/all?${params}`
  )
  if (!response.ok) {
    throw new Error("failed to retrieve doctor informations!")
  }
  return response.json()
}

async function profile(id: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/doctors/profile?id=${id}`
  )
  if (!response.ok) {
    throw new Error(`failed to retrieve doctor #${id} information!`)
  }
  return response.json()
}

async function from_hospital_all(hospitalId: string, params: URLSearchParams) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/doctors/${hospitalId}/all?${params}`
  )
  if (!response.ok) {
    throw new Error(
      `failed to retrieve doctors information of hospital #${hospitalId}!`
    )
  }
  return response.json()
}

export const doctorServices = {
  retrive_all,
  from_hospital_all,
  profile,
}
