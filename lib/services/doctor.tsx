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
async function getAppointments(token: string, params: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctor/appointments?${params}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to retrieve list of appointments`)
  }

  return response.json()
}

// Retrieve a list of appointments for of a specific patient
async function getPatientAppointments(token: string, patient_id: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctor/appointments/patient/${patient_id}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(
      `Failed to retrieve appointments of the patient #${patient_id}.`
    )
  }

  return response.json()
}

// Retrieve the number of appointments that has to be done today
async function getTotalAppointmentCount(
  token: string,
  doctorId: string
): Promise<number> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctor/${doctorId}/appointments/today`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(
      `Failed to retrieve appointment count of today #${doctorId}`
    )
  }

  return response.json()
}

// Retrieve information of a specific appointment
async function getAppointmentInfo(token: string, appointmentId: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctor/appointments/info/${appointmentId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(
      `Failed to retrieve appointment information #${appointmentId}`
    )
  }

  return response.json()
}

// Upate information of a specific appointment by id
async function updateAppointmentInfo(
  token: string,
  appointmentId: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctor/appointments/info/${appointmentId}`,
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
    throw new Error(
      `Failed to update appointment information #${appointmentId}`
    )
  }

  return response.json()
}

// Retrieve a list of requested appointments for a specific doctor
async function getRequestedAppointments(token: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/users/doctor/appointments/requested`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to retrieve requested appointments`)
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
  getAppointmentInfo,
  updateAppointmentInfo,
  getPatientAppointments,
  getDoctorsFromHospital,
  getTotalAppointmentCount,
  getRequestedAppointments,
}
