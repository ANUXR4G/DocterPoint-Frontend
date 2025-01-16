async function getHospitalNames(): Promise<string[]> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/hospitals/tags/names`
  )
  if (!response.ok) {
    throw new Error("failed to retrieve hosptial names.")
  }
  return response.json()
}

async function getHospitalLocations(): Promise<string[]> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/hospitals/tags/cities`
  )
  if (!response.ok) {
    throw new Error("failed to retrieve hosptial locations!")
  }
  return response.json()
}

async function getHospitalInfo(hospitalId: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/hospitals/${hospitalId}/info`
  )
  if (!response.ok) {
    throw new Error(`failed to retrieve hospital #${hospitalId} information.`)
  }
  return response.json()
}

async function getHospitals(params: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/hospitals/info?${params}`
  )
  if (!response.ok) {
    throw new Error("failed to retrieve hospital informations!")
  }
  return response.json()
}

async function search(q: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/hospitals/info?q=${q}`
  )
  if (!response.ok) {
    throw new Error("failed to search hospital informations.")
  }
  return response.json()
}

export const hospitalService = {
  search,
  getHospitalNames,
  getHospitalLocations,
  getHospitalInfo,
  getHospitals,
}
