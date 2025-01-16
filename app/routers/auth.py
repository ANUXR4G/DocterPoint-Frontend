import json
import requests

from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, Response, Security

from app.models import Patient
from app.db import get_async_db as db
from app.services.auth import AuthService
from app.schemas.users import UserCredentials
from app.core.config import settings
from app.core.security import get_user_token
from app.core.dependecies import include_auth
from app.core.utils import ResponseHandler, Custom


router = APIRouter()


# user signup endpoint
@router.post("/signup")
async def user_signup(credentials: UserCredentials, db: AsyncSession = Depends(db)):
    return await AuthService.signup(credentials, db)


# user login endpoint
@router.post("/login")
async def user_login(credentials: UserCredentials, db: AsyncSession = Depends(db)):
    return await AuthService.login(credentials, db)


# generate new user token using refresh token
@router.get("/token/refresh")
async def refresh_token(
    user: Patient = Security(include_auth),
):
    try:
        return await get_user_token(user)
    except Exception:
        raise ResponseHandler.invalid_token()


# redirect to google concent page
@router.get("/google")
async def user_google_auth(state: str):
    url = (
        f"https://accounts.google.com/o/oauth2/v2/auth"
        f"?scope=openid email profile"
        f"&access_type=offline"
        f"&response_type=code"
        f"&state={state}"
        f"&redirect_uri={settings.google_redirect_uri}"
        f"&client_id={settings.google_client_id}"
    )

    return f"{url}"


# handle google callback
@router.get("/google/callback")
async def user_google_callback(
    state,
    code: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(db),
):
    token_url = "https://accounts.google.com/o/oauth2/token"
    payload = {
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_redirect_uri,
        "grant_type": "authorization_code",
    }

    if error:
        raise ResponseHandler.unauthorized(
            f"something went wrong try again - mostly {Custom.snake_to_title(error)}!"
        )

    # get user google token
    response = requests.post(token_url, data=payload)
    access_token = response.json().get("access_token")

    # request for user informations
    user_info = requests.get(
        "https://www.googleapis.com/oauth2/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    # retrive the user informations
    user_data = user_info.json()
    email = user_data.get("email")
    name = user_data.get("name")
    img_src = user_data.get("picture")

    # extract the state params from the url
    state = json.loads(state)
    source_tag = state.get("source", "")

    # check if the google account is verified or not
    if not user_data.get("verified_email", False):
        raise ResponseHandler.unauthorized(f"{email} is not a verified google account!")

    payload = {
        "name": name,
        "email": email,
        "picture": img_src,
    }

    return await AuthService.google_auth(payload, source_tag, db)


# handle user log out session
@router.post("/logout")
async def user_logout(response: Response):
    response.delete_cookie(key="access_token")
    response.delete_cookie(key="refresh_token")
