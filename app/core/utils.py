from fastapi import HTTPException
from fastapi.responses import JSONResponse

scopes = {
    "user": [
        "patient:read",
        "patient:write",
        "patient:update",
        "health:read",
        "health:write",
        "health:update",
        "health:delete",
    ],
    "doctor": [
        "patient:read",
        "patient:update",
        "doctor:read",
        "doctor:update",
        "health:read",
    ],
    "staff": [
        "staff:read",
        "staff:update",
        "doctor:read",
        "doctor:write",
        "doctor:update",
        "doctor:delete",
        "health:read",
    ],
    "admin": [
        "patient:read",
        "patient:write",
        "patient:update",
        "patient:delete",
        "doctor:read",
        "doctor:write",
        "doctor:update",
        "doctor:delete",
        "staff:read",
        "staff:write",
        "staff:update",
        "staff:delete",
        "admin:read",
        "admin:write",
        "admin:update",
        "admin:delete",
        "health:read",
        "health:write",
        "health:update",
        "health:delete",
    ],
}


class Custom:
    @staticmethod
    def snake_to_title(snake_str: str):
        return " ".join(word.capitalize() for word in snake_str.split("_"))


class ResponseHandler:
    @staticmethod
    def invalid_token():
        raise HTTPException(
            status_code=401,
            detail=f"invalid token!",
            headers={"WWW-Authenticate": "Bearer"},
        )

    @staticmethod
    def not_found_error(warning=""):
        raise HTTPException(status_code=404, detail=f"{warning}")

    @staticmethod
    def unauthorized(message: str):
        raise HTTPException(status_code=401, detail=f"{message}")

    @staticmethod
    def no_permission(message: str):
        raise HTTPException(status_code=403, detail=f"{message}")

    @staticmethod
    def fetch_successful(msg, data, total: int | None = None):
        return JSONResponse(
            status_code=200,
            content={
                "status": "successful",
                "message": msg,
                "data": data,
                "total": total,
            },
        )

    def create_successful(msg, data):
        return JSONResponse(
            status_code=201,
            content={"status": "successful", "message": msg, "data": data},
        )
