export async function patientDetails(token: string | null) {
  if (!token) return null
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API}/users/patient/profile`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    )
    return response.json()
  } catch (error) {
    console.log(error)
  }
}

export const patientService = {
  patientDetails,
}
