import json
import requests

from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, Response, Security

from app.models import Patient
from app.core.config import settings
from app.db import get_async_db as db
from app.services.auth import AuthService
from app.schemas.users import UserCredentials
from app.core.security import get_user_token
from app.core.dependecies import include_auth
from app.core.utils import ResponseHandler, Custom


router = APIRouter()


@router.post("/signup")
async def user_signup(credentials: UserCredentials, db: AsyncSession = Depends(db)):
    """
    Sign up a new user with the provided credentials.
    -------------------------------------------------

    Parameters:
    -----------
    - credentials (UserCredentials): The user credentials containing details such as email, password, and other required signup information.
    - db (AsyncSession): The asynchronous database session used for storing the user's information in the database.

    Returns:
    --------
    - The result of the signup process, which may include the created user's details or confirmation of successful signup.

    """

    return await AuthService.signup(credentials, db)


@router.post("/login")
async def user_login(credentials: UserCredentials, db: AsyncSession = Depends(db)):
    """
    Log in a user with the provided credentials.
    --------------------------------------------

    Parameters:
    -----------
    - credentials (UserCredentials): The user credentials containing details such as email and password for authentication.
    - db (AsyncSession): The asynchronous database session used for verifying the user's credentials against the stored data.

    Returns:
    --------
    - The result of the login process, which may include a success message, a token for authentication, or an error if the credentials are invalid.

    """

    return await AuthService.login(credentials, db)


@router.get("/token/refresh")
async def refresh_token(
    user: Patient = Security(include_auth),
):
    """
    Generate a new user authentication token using the refresh token.
    -----------------------------------------------------------------

    Parameters:
    -----------
    - user (Patient): The authenticated user making the request, validated using the existing refresh token.

    Returns:
    --------
    - A new authentication token for the user to continue accessing secure resources.

    """

    try:
        return await get_user_token(user)
    except Exception:
        raise ResponseHandler.invalid_token()


@router.get("/google")
async def user_google_auth(state: str):
    """
    Generate the Google OAuth 2.0 authentication URL for user login.
    ----------------------------------------------------------------

    Parameters:
    -----------
    - state (str): A state parameter used to prevent cross-site request forgery (CSRF) attacks and to maintain user session.

    Returns:
    --------
    - A formatted URL string for initiating the Google OAuth 2.0 authentication flow with the specified scope and redirect settings.

    """

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


@router.get("/google/callback")
async def user_google_callback(
    state,
    code: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(db),
):
    """
    Handle the Google OAuth 2.0 callback after user authentication.
    ---------------------------------------------------------------

    Parameters:
    -----------
    - state: The state parameter to verify the user's session and prevent CSRF attacks.
    - code (str | None): The authorization code returned by Google if the authentication is successful.
    - error (str | None): An error message returned by Google if the authentication fails.
    - db (AsyncSession): The asynchronous database session used for storing or retrieving user-related data.

    Returns:
    --------
    - The result of the callback process, which may include user session updates or error handling based on the parameters provided.

    """

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
    """
    Log out the user by clearing authentication cookies.
    ----------------------------------------------------

    Parameters:
    -----------
    - response (Response): The response object used to delete cookies from the user's browser.

    Returns:
    --------
    - None: The function removes the 'access_token' and 'refresh_token' cookies to log out the user.

    """

    response.delete_cookie(key="access_token")
    response.delete_cookie(key="refresh_token")
