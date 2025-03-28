import { TMedications, TPatientHealth } from "@/types"

async function createAppointment(
  token: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/appointments/new`,
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
    throw new Error(`failed to create new appointment record.`)
  }

  return response.json()
}

async function updateAppointmentInfo(
  token: string,
  appointmentId: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/appointments/${appointmentId}/info`,
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
    throw new Error(`failed to retrieve appointment information.`)
  }

  return response.json()
}

async function getAppointmentInfo(token: string, appointmentId: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/appointments/${appointmentId}/info`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`failed to retrieve appointment information.`)
  }

  return response.json()
}

async function upcoming_appointments(token: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/appointments/upcoming`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`failed to retrieve upcoming appointments.`)
  }

  return response.json()
}

async function getAllAppointments(token: string, params: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/appointments/info?${params}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`failed to retrieve all appointments.`)
  }

  return response.json()
}

// retrive patient health record fetch request
async function getPatientHealthRecord(
  token: string
): Promise<TPatientHealth | []> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/health/records`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`failed to retrieve patient health record.`)
  }

  return response.json()
}

// create patient health record fetch request
async function createPatientHealthRecord(
  token: string,
  payload: any
): Promise<TPatientHealth> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/health/records/new`,
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
    throw new Error(`failed to create patient health record.`)
  }

  return response.json()
}

// update patient health record fetch request
async function updatePatientHealthRecord(
  token: string,
  payload: any,
  recordId?: string
): Promise<TPatientHealth> {
  if (!recordId) throw new Error(`record id was not provided.`)

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/health/records?id=${recordId}`,
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
    throw new Error(`failed to update patient health record.`)
  }

  return response.json()
}

async function getMedications(token: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/medication/suggestions`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`failed to retrieve patient medication details.`)
  }

  return response.json()
}

async function getAppointmentMedications(token: string, appointmentId: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/medication/appointment?id=${appointmentId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`failed to retrieve patient medication details.`)
  }

  return response.json()
}

async function generateSuggestions(token: string, payload: any) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/medication/generate`,
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
    throw new Error(`failed to generate suggestions.`)
  }

  return response.json()
}

// update patient health record fetch request
async function updateMedications(
  token: string,
  payload: Record<string, unknown>,
  patientId?: string
): Promise<TMedications> {
  const url_prefix = patientId
    ? `/patient/medication/suggestions?id=${patientId}`
    : `/patient/medication/suggestions`
  const response = await fetch(`${process.env.NEXT_PUBLIC_API}${url_prefix}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`failed to update patients medication record.`)
  }

  return response.json()
}

// Delete patient Medication record
async function deleteMedicationById(
  token: string,
  appointmentId: string
): Promise<TMedications> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/medication/appointment?id=${appointmentId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`failed to delete patients medication record.`)
  }

  return response.json()
}

export const patientService = {
  // appointments
  createAppointment,
  getAppointmentInfo,
  updateAppointmentInfo,
  getAllAppointments,
  upcoming_appointments,
  // health records
  createPatientHealthRecord,
  getPatientHealthRecord,
  updatePatientHealthRecord,
  // patient medications
  generateSuggestions,
  updateMedications,
  getMedications,
  getAppointmentMedications,
  deleteMedicationById,
}
