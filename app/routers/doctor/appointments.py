from redis import Redis

from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, Security, Query

from app.services.doctor import DoctorService
from app.services.doctor.appointments import AppointmentService
from app.services.doctor.patients import PatientService

from app.core.dependecies import include_auth, cache
from app.db import get_async_db as db
from app.models import Doctor
from app.schemas.doctor import UpdateAppointment


router = APIRouter()


@router.get("/appointments")
async def retrieve_appointments(
    session_user: Doctor = Security(
        include_auth, scopes=["doctor:read", "doctor:update", "patient:read"]
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
    date: str | None = "latest",
    status: int = 1,
    q: str | None = None,
    page: int = 1,
    limit: int = Query(default=10, le=100),
):
    """
    Retrieve a list of appointments for a specific doctor.
    ------------------------------------------------------

    Parameters:
    -----------
    - doctor_id (str): The ID of the doctor whose appointments are to be retrieved.
    - session_user (Doctor): The currently logged-in doctor (session user) with the required security scopes.
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.
    - date (str): The date filter to sort appointments by date | "latest" | "old" | default="None"
    - status (int): The status filter to filter appointments by their status | 1 | 2 | 3 | 4 | 5 | default=1
    - q (str): The search query to filter appointments by patient name or other criteria (case-insensitive) | default=None
    - page (int): The page number for pagination | default=1
    - limit (int): The maximum number of appointments to retrieve per page. Must be less than or equal to 100 | default=10

    Returns:
    --------
    - total: The total number of retrieved data.
    - appointments: A list containing the retrieved appointment information.

    """

    return await AppointmentService.get_appointments(
        session_user, db, redis, status, date, q, page, limit
    )


@router.get("/appointments/info/{id}")
async def retrieve_appointment_info(
    id: str,
    session_user: Doctor = Security(
        include_auth, scopes=["doctor:read", "doctor:update", "patient:read"]
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve detailed information for a specific appointment by its ID.
    ----------------------------------------------------------------------------

    Parameters:
    -----------
    - id (str): The unique identifier (UUID) of the appointment to retrieve.
    - session_user (Doctor): The authenticated doctor performing the request.
      Scoped permissions ensure the user has proper access rights.
    - db (AsyncSession): The asynchronous database session for executing queries.
    - redis (Redis): A Redis instance used for caching and optimized data retrieval.

    Returns:
    --------
    - dict: A dictionary containing the detailed appointment information,
      fetched from the database or cache for the specified appointment ID.
    """

    return await AppointmentService.get_info(id, session_user, db, redis)


@router.put("/appointments/info/{id}")
async def update_appointment_info(
    id: str,
    payload: UpdateAppointment,
    session_user: Doctor = Security(
        include_auth,
        scopes=[
            "patient:read",
            "medication:read",
            "medication:update",
            "appointment:read",
            "appointment:update",
        ],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    return await AppointmentService.update_info(id, session_user, db, payload, redis)


@router.get("/appointments/requested")
async def retrieve_requested_appointments(
    session_user: Doctor = Security(
        include_auth,
        scopes=["doctor:read", "doctor:update", "patient:read"],
    ),
    db: AsyncSession = Depends(db),
):
    """
    Retrieve a list of requested appointments for a specific doctor by doctor_id.
    ----------------------------------------------------------------------------

    Parameters:
    -----------
    - session_user (Doctor): The currently logged-in doctor (session user).
    - db (AsyncSession): The database session for executing SQL queries asynchronously.

    Returns:
    --------
    - A list containing the requested appointment information for the specified doctor.

    """

    return await AppointmentService.get_requests(session_user, db)


@router.get("/appointments/patient/{patient_id}")
async def retrieve_patient_appointments(
    patient_id: str,
    session_user: Doctor = Security(
        include_auth,
        scopes=["doctor:read", "doctor:update", "patient:read", "appointment:read"],
    ),
    db: AsyncSession = Depends(db),
):
    """
    Retrieve all appointments associated with a specific patient by their ID.
    ----------------------------------------------------------------------------

    Parameters:
    -----------
    - patient_id (str): The unique identifier of the patient whose appointments are being retrieved.
    - session_user (Doctor): The currently authenticated doctor performing the request.
      Scoped permissions ensure proper access control.
    - db (AsyncSession): The database session used for asynchronous query execution.

    Returns:
    --------
    - List[Appointment]: A list containing the patient's appointment details, filtered and validated
      based on the session user's access permissions.
    """

    return await PatientService.get_patient_appointments(patient_id, session_user, db)


@router.get("/{doctor_id}/appointments/today")
async def retrieve_appointment_today(
    doctor_id: str,
    session_user: Doctor = Security(
        include_auth,
        scopes=["doctor:read", "doctor:update", "patient:read", "appointment:read"],
    ),
    db: AsyncSession = Depends(db),
):
    """
    Retrieve appointments count which are scheduled for today of a specific doctor.
    ----------------------------------------------------------------------------

    Parameters:
    -----------
    - doctor_id (str): The unique identifier of the doctor whose appointments are being retrieved.
    - session_user (Doctor): The authenticated doctor performing the request, validated through
      role-based permissions (scopes).
    - db (AsyncSession): The asynchronous database session used for executing SQL queries.

    Returns:
    --------
    - Number: The total number for today's appointments for the specified doctor,
      filtered by the doctor_id and current date.
    """

    return await AppointmentService.get_appointmets_today(doctor_id, session_user, db)
