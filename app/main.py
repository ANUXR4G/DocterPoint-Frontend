from fastapi import (
    FastAPI,
    HTTPException,
    Request,
    APIRouter,
)
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from time import time

from app.core.security import origins, decode_token
from app.core.config import settings

from app.routers import (
    auth,
    chats,
    meals,
    healths,
    patients,
    public,
    websockets,
    medications,
    appointments,
)


from app.routers.admin import (
    patients as patients_admin,
    hospitals as hospitals_admin,
    doctors as doctors_admin,
    users,
)

# from app.routers import doctor
# import app.routers.doctor as doctor
from app.routers.doctor import general as doctor_general_routes
from app.routers.doctor import appointments as doctor_appointment_routes

from app.workers.celery import celery
from app.workers.tasks import send_email_task


version = "v1"


# Initialize FastAPI Server
app = FastAPI(
    root_path=f"/api/{version}",
    docs_url=f"/docs",
    openapi_url=f"/openapi.json",
    title="Gluco Guide Backend",
    version=version,
    contact={"name": "firedev99", "email": "firethedev@gmail.com"},
)


# Backend Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router for doctors
doctor_router = APIRouter(prefix="/users/doctor", tags=["User / Doctors"])


# Custom exception handler
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "unsuccessful", "message": exc.detail},
    )


rate_limit_data = {}
burst_control_data = {}

# Default Rate Limits
RATE_LIMIT = 50
TIME_WINDOW = 60
BURST_LIMIT = 20  # Allow up to 20 extra requests within a short burst
BURST_WINDOW = 5  # Burst period of 5 seconds

# Configuration for public and autheticated users
RATE_LIMIT_CONFIG = {
    "public": {"rate_limit": 60, "time_window": 60},  # 60 requests per 60 seconds
    "user": {"rate_limit": 200, "time_window": 60},  # 200 requests per 60 seconds
}


# Custom rate limiter middleware
@app.middleware("http")
async def rate_limiter(request: Request, next):
    client_ip = request.client.host
    current_time = time()

    # Indetify is the user is autheticated
    bearer = request.headers.get("authorization")

    # Define the configuration of the Rate Limiter
    if bearer:
        token = bearer.split("Bearer ")[1].strip()
        decode_token(token)
        # Update the default configuration
        config = RATE_LIMIT_CONFIG.get("user")
    else:
        config = RATE_LIMIT_CONFIG.get("public")

    # Get the limits
    rate_limit = config["rate_limit"]
    time_window = config["time_window"]

    # Initialize data for the client if not present
    if client_ip not in rate_limit_data:
        rate_limit_data[client_ip] = []
    if client_ip not in burst_control_data:
        burst_control_data[client_ip] = []

    # Handle Burst Control
    burst_control_data[client_ip] = [
        timestamp
        for timestamp in burst_control_data[client_ip]
        if current_time - timestamp < BURST_WINDOW
    ]

    # Check if the burst amount is within the limit
    if len(burst_control_data[client_ip]) > BURST_LIMIT:
        raise HTTPException(status_code=429, detail="Burst limit exceeded.")

    # Add burst request within burst window
    burst_control_data[client_ip].append(current_time)

    # Handle Tiered Rate Limits
    rate_limit_data[client_ip] = [
        timestamp
        for timestamp in rate_limit_data[client_ip]
        if current_time - timestamp < time_window
    ]

    # Check if the client is within the limit
    if len(rate_limit_data[client_ip]) >= rate_limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded.")

    # Record the current requests' timestamp
    rate_limit_data[client_ip].append(current_time)

    # Proceed to the next middleware or endpoint
    response = await next(request)
    return response


# Root Endpoint
@app.get("/")
async def root():
    return {
        "name": "firedev99",
        "email": "firethedev@gmail.com",
        "about": "Gluco Guide is an integrated health monitoring app for diabetic care, featuring separate dashboards for patients, doctors, and admins. It enables doctor bookings, maps to nearby hospitals, real-time health tracking, and AI-powered recommendations for diet, exercise, and lifestyle, ensuring effective diabetes management and wellness.",
    }


# Celery tasks testing apis
@app.get("/send-email")
async def run_task():
    task = send_email_task.apply_async(
        args=(
            "sauravagun1999@gmail.com",
            "GlucoGuide Email Tasks",
            "Testing SMTP Connection!",
        ),
        countdown=60,
    )
    return {
        "status": "successful",
        "message": f"successfully, sent mail from {settings.owner_email}",
        "tast_id": task.id,
    }


# Query a celery task w task id
@app.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    task = celery.AsyncResult(task_id)
    return {"task_id": task_id, "status": task.status, "result": task.result}


# General routes (authentication not required)
app.include_router(auth.router, prefix=f"/auth", tags=["Users / Authentication"])
app.include_router(public.router1, prefix=f"/doctors", tags=["General / Doctors"])
app.include_router(public.router2, prefix=f"/hospitals", tags=["General / Hospitals"])


# Patient profile routes (authetication required)
app.include_router(patients.router, prefix=f"/patient", tags=["Patient / Profile"])

# Patient health records routes (authetication required)
app.include_router(
    healths.router,
    prefix=f"/patient/health",
    tags=["Patient / Health Monitoring Records"],
)

# Patient appointments routes (authetication required)
app.include_router(
    appointments.router,
    prefix=f"/patient/appointments",
    tags=["Patient / Appointments"],
)


# Patient medication routes (authetication required)
app.include_router(
    medications.router,
    prefix=f"/patient/medication",
    tags=["Patient / Medications"],
)

# Meal details (authentication required)
app.include_router(
    meals.router,
    prefix=f"/diet",
    tags=["Diet / Meals"],
)

# The following routes are used by Doctors
doctor_router.include_router(doctor_general_routes.router)
doctor_router.include_router(doctor_appointment_routes.router)
app.include_router(doctor_router)

# app.include_router(
#     doctor_general_routes.router, prefix="/users/doctor", tags=["User / Doctors"]
# )
# app.include_router(
#     doctor_appointment_routes.router,
#     prefix="/users/doctor",
#     tags=["User / Doctors"],
# )

# The following routes are used by every users for chats (authentication required)
app.include_router(chats.router, prefix="/chats", tags=["User / Chats"])

# Websocket routes for realtime simulation (authentication required)
app.include_router(websockets.router, prefix="/ws")


# # admin routes (administrational authetication required)
# app.include_router(
#     users.router,
#     prefix=f"/admin/users",
#     tags=["Admin / Users"],
#     dependencies=[Depends(include_admin)],
# )

# app.include_router(
#     patients_admin.router,
#     prefix=f"/admin/users/patients",
#     tags=["Admin / Patients"],
#     dependencies=[Depends(include_admin)],
# )

# app.include_router(
#     doctors_admin.router,
#     prefix=f"/admin/users/doctors",
#     tags=["Admin / Doctors"],
#     dependencies=[Depends(include_admin)],
# )

# app.include_router(
#     hospitals_admin.router,
#     prefix=f"/admin/hospitals",
#     tags=["Admin / Hospitals"],
#     dependencies=[Depends(include_admin)],
# )
