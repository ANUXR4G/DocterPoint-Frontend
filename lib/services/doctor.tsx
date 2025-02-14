import { TypeAnalyticsParam } from "@/types"

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

// Retrieve information of a specific doctor
async function getDoctorProfile(token: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctor/info`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to retrieve doctor profile information`)
  }

  return response.json()
}

// Retrieve a list of appointments for a specific doctor
async function getPatients(token: string, doctor_id: string, params: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctor/${doctor_id}/patients?${params}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to retrieve patients #${doctor_id}.`)
  }

  return response.json()
}

// Retrieve a list of appointments for a specific doctor
async function getAppointments(
  token: string,
  doctor_id: string,
  params: string
) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctor/${doctor_id}/appointments?${params}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to retrieve appointments #${doctor_id}.`)
  }

  return response.json()
}

// Retrieve a list of requested appointments for a specific doctor
async function getAppointmentRequests(token: string, doctor_id: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctor/${doctor_id}/appointments/requested`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to retrieve requested appointments #${doctor_id}.`)
  }

  return response.json()
}

// Retrieve analytics of patients and appointments for a specific doctor
async function fetchAnalytics(
  token: string,
  doctor_id: string,
  type: TypeAnalyticsParam
) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctor/${doctor_id}/analytics?type=${type}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to retrieve requested appointments #${doctor_id}.`)
  }

  return response.json()
}

export const doctorServices = {
  search,
  getDoctors,
  getPatients,
  getDoctorInfo,
  fetchAnalytics,
  getAppointments,
  getDoctorProfile,
  getAppointmentRequests,
  getDoctorsFromHospital,
}
