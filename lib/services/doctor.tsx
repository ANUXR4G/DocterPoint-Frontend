async function getDoctors(params: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/doctors/info?${params}`
  )
  if (!response.ok) {
    throw new Error("failed to retrieve doctor informations!")
  }
  return response.json()
}

async function getDoctorInfo(id: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/doctors/${id}/info`
  )
  if (!response.ok) {
    throw new Error(`failed to retrieve doctor information.`)
  }
  return response.json()
}

async function getDoctorsFromHospital(hospitalId: string, params: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/doctors/hospital?id=${hospitalId}&${params}`
  )
  if (!response.ok) {
    throw new Error(
      `failed to retrieve doctors information of hospital #${hospitalId}.`
    )
  }
  return response.json()
}

async function search(q: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/doctors/info?q=${q}`
  )
  if (!response.ok) {
    throw new Error("failed to search doctor informations.")
  }
  return response.json()
}

export const doctorServices = {
  search,
  getDoctors,
  getDoctorInfo,
  getDoctorsFromHospital,
}
