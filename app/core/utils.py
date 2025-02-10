from fastapi import HTTPException
from fastapi.responses import JSONResponse

scopes = {
    "user": [
        "users:chat",
        "patient:read",
        "patient:write",
        "patient:update",
        "monitoring:read",
        "monitoring:write",
        "monitoring:update",
        "appointment:read",
        "appointment:write",
        "appointment:update",
        "medication:read",
        "medication:write",
        "medication:update",
    ],
    "doctor": [
        "users:chat",
        "patient:read",
        "doctor:read",
        "doctor:update",
        "doctor:analytics",
        "monitoring:read",
        "medication:read",
        "medication:update",
        "appointment:read",
        "appointment:write",
        "appointment:update",
    ],
    "admin": [
        "users:chat",
        "users:read",
        "users:write",
        "users:update",
        "users:delete",
        "doctor:analytics",
        "appointment:read",
        "appointment:write",
        "appointment:update",
        "appointment:delete",
        "monitoring:read",
        "monitoring:delete",
        "medication:read",
        "medication:delete",
    ],
}


def get_age_group(age: int):
    if 18 <= age <= 24:
        return "18-24"
    elif 25 <= age <= 34:
        return "25-34"
    elif 35 <= age <= 44:
        return "35-44"
    elif 45 <= age <= 54:
        return "45-54"
    elif 55 <= age <= 64:
        return "55-64"
    elif age >= 65:
        return "65+"
    else:
        return "firey"


class Custom:
    @staticmethod
    def snake_to_title(snake_str: str):
        return " ".join(word.capitalize() for word in snake_str.split("_"))


class ResponseHandler:
    @staticmethod
    def invalid_token(msg: str | None = "invalid token."):
        raise HTTPException(
            status_code=401,
            detail=f"{msg}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    @staticmethod
    def not_found_error(warning: str | None = "not found."):
        raise HTTPException(status_code=404, detail=f"{warning}")

    @staticmethod
    def unauthorized(message: str):
        raise HTTPException(status_code=401, detail=f"{message}")

    @staticmethod
    def no_permission(message: str):
        raise HTTPException(status_code=403, detail=f"{message}")

    @staticmethod
    def fetch_successful(msg, data, total: int | None = None):
        response_content = {
            "status": "successful",
            "message": msg,
            "data": data,
        }

        if total:
            response_content["total"] = total

        return JSONResponse(status_code=200, content=response_content)

    @staticmethod
    def create_successful(msg, data):
        return JSONResponse(
            status_code=201,
            content={"status": "successful", "message": msg, "data": data},
        )
