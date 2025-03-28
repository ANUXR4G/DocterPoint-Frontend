from fastapi import HTTPException
from fastapi.responses import JSONResponse
from datetime import datetime


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
        "medication:delete",
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
        "medication:delete",
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


status_priority_map = [
    {
        "upcoming": 1,
        "resheduled": 2,
        "missed": 3,
        "completed": 4,
        "cancelled": 5,
    },
    {
        "resheduled": 1,
        "upcoming": 2,
        "missed": 3,
        "completed": 4,
        "cancelled": 5,
    },
    {
        "missed": 1,
        "resheduled": 2,
        "upcoming": 3,
        "completed": 4,
        "cancelled": 5,
    },
    {
        "completed": 1,
        "missed": 2,
        "resheduled": 3,
        "upcoming": 4,
        "cancelled": 5,
    },
    {
        "cancelled": 1,
        "completed": 2,
        "missed": 3,
        "resheduled": 4,
        "upcoming": 5,
    },
]


def calculate_age(birth_date_str):
    if not birth_date_str:
        return
    birth_date = datetime.strptime(birth_date_str, "%m/%d/%Y")
    today = datetime.today()
    age = (
        today.year
        - birth_date.year
        - ((today.month, today.day) < (birth_date.month, birth_date.day))
    )
    return age


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

    def convert_list_to_str(items: list[str]):
        if len(items) > 1:
            return ", ".join(items[:-1] + " and " + items[-1])
        else:
            return items[0]


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
