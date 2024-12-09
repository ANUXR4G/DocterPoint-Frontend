from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
    Security,
)
from websockets.exceptions import ConnectionClosed
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.routers import patients, auth, health, hospital, doctor
from app.routers.admin import (
    patients as patients_admin,
    users,
    hospitals as hospitals_admin,
    doctors as doctors_admin,
)
from app.core.security import origins
from app.core.dependecies import include_admin, include_auth
from app.models import Patient

from app.core.config import settings
from app.workers.celery import celery
from app.workers.tasks import send_email_task
from app.core.socket import WebSocketManager
from app.core.socket import socket_manager


version = "v1"


app = FastAPI(
    root_path=f"/api/{version}",
    docs_url=f"/docs",
    openapi_url=f"/openapi.json",
    title="Gluco Guide Backend",
    version=version,
    contact={"name": "firedev99", "email": "firethedev@gmail.com"},
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# custom exception handler
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "unsuccessful", "message": exc.detail},
    )


socket = WebSocketManager()


@app.get("/")
async def root():
    return JSONResponse(
        content={"status": "successful", "contact": f"{settings.owner_email}"}
    )


# celery tasks testing apis
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


# query a celery task w task id
@app.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    task = celery.AsyncResult(task_id)
    return {"task_id": task_id, "status": task.status, "result": task.result}


# endpoint to monitor real time health records
@app.websocket("/ws/monitoring/{room_id}")
async def websocket_monitoring(websocket: WebSocket, room_id: str):
    await socket_manager.connect(websocket, room_id)
    try:
        while True:
            await websocket.receive_text()  # keep the connection alive
    except WebSocketDisconnect:
        socket_manager.disconnect(websocket, room_id)
        print(f"patient #{id} left the monitoring room!")


# general routes
app.include_router(auth.router, prefix=f"/auth", tags=["Users / Auth"])
app.include_router(hospital.router, prefix=f"/hospitals", tags=["General / Hospitals"])
app.include_router(doctor.router, prefix=f"/users/doctors", tags=["General / Doctors"])


# patient routes
app.include_router(
    patients.router, prefix=f"/users/patient", tags=["Patient / Profile"]
)

app.include_router(
    health.router,
    prefix=f"/users/patient/health",
    tags=["Patient / Health Monitoring Records"],
)


# admin routes
app.include_router(
    users.router,
    prefix=f"/admin/users",
    tags=["Admin / Users"],
    dependencies=[Depends(include_admin)],
)

app.include_router(
    patients_admin.router,
    prefix=f"/admin/users/patients",
    tags=["Admin / Patients"],
    dependencies=[Depends(include_admin)],
)

app.include_router(
    doctors_admin.router,
    prefix=f"/admin/users/doctors",
    tags=["Admin / Doctors"],
    dependencies=[Depends(include_admin)],
)

app.include_router(
    hospitals_admin.router,
    prefix=f"/admin/hospitals",
    tags=["Admin / Hospitals"],
    dependencies=[Depends(include_admin)],
)
