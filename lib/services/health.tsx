import { ApiResponse, TPatientHealth } from "@/types"

// retrive patient health record fetch request
async function getPatientHealthRecord(
  token: string,
  patientId?: string
): Promise<ApiResponse<TPatientHealth | []>> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/patient/health/records?id=${patientId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`failed to retrieve patient health record`)
  }

  return response.json()
}

// create patient health record fetch request
async function createPatientHealthRecord(
  token: string,
  payload: any,
  patientId?: string
): Promise<ApiResponse<TPatientHealth>> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/patient/health/records?id=${patientId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  )

  if (!response.ok) {
    throw new Error(`failed to create patient health record`)
  }

  return response.json()
}

// update patient health record fetch request
async function updatePatientHealthRecord(
  token: string,
  payload: any,
  recordId: string
): Promise<ApiResponse<TPatientHealth | []>> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/patient/health/records?id=${recordId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  )

  if (!response.ok) {
    throw new Error(`failed to update patient health record!`)
  }

  return response.json()
}

export const healthServices = {
  getPatientHealthRecord,
  createPatientHealthRecord,
  updatePatientHealthRecord,
}
