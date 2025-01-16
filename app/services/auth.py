from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import status, HTTPException
from fastapi.responses import RedirectResponse

from app.models import User, Patient
from app.schemas.users import UserCredentials, UserLoginGoogle
from app.core.security import decrypt, generate_hash, verify_password, get_user_token
from app.core.utils import ResponseHandler


class AuthService:
    @staticmethod
    async def signup(credentials: UserCredentials, db: AsyncSession):
        query = select(User).where(User.email == credentials.email)
        result = await db.execute(query)
        exists = result.scalar_one_or_none()

        # check if the user exists
        if exists:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{credentials.email} already exists!",
            )

        # decrypt the password from the client
        decrypted_password = await decrypt(credentials.password)

        # generate hashed password
        hashed_password = generate_hash(decrypted_password)
        credentials.password = hashed_password

        # create a patient w the hashed password
        new_patient = Patient(**credentials.model_dump())

        db.add(new_patient)
        await db.commit()
        await db.refresh(new_patient)

        # return user details w token
        return await get_user_token(new_patient, 201)

    # handle built in login
    @staticmethod
    async def login(credentials: UserCredentials, db: AsyncSession):
        query = select(User).where(User.email == credentials.email)
        result = await db.execute(query)
        user = result.scalar_one_or_none()

        # check if the user exists
        if not user:
            raise ResponseHandler.not_found_error("invalid credentials!")

        # decrypt the password from the client
        decrypted_password = await decrypt(credentials.password)

        # verify password
        if not verify_password(decrypted_password, user.password):
            raise ResponseHandler.unauthorized("password is incorrect")

        return await get_user_token(user)

    # handle google authetication (patient)
    @staticmethod
    async def google_auth(
        credentials: UserLoginGoogle, tag: str | None, db: AsyncSession
    ):
        try:
            email = credentials.get("email")
            name = credentials.get("name")
            img_src = credentials.get("picture")

            if tag not in ["gg_login", "gg_signup"]:  # allow only custom context
                raise HTTPException(
                    status_code=400, detail=f"{tag} is not a valid context!"
                )

            # get the user using the payload email
            query = select(User).where(User.email == email)
            result = await db.execute(query)
            user = result.scalar_one_or_none()

            # handle user login
            # verify if the user exists
            if tag == "gg_login" and not user:
                return RedirectResponse("/login?success=attempted&status=nuser")

            # redirect url from login based on role
            redirect_url = f"/patient/dashboard"

            # if the user is verified then directly return the tokens
            if tag == "gg_login" and user:
                return await get_user_token(
                    user,
                    redirect_url=redirect_url,
                )

            # handle user signup
            # if the user already exists directly return the tokens
            if tag == "gg_signup" and user:
                return await get_user_token(
                    user,
                    redirect_url=redirect_url,
                )

            # create a new patient
            new_patient = Patient(email=email, name=name, img_src=img_src)

            db.add(new_patient)
            await db.commit()
            await db.refresh(new_patient)

            # return the tokens for the newly created user
            return await get_user_token(
                new_patient,
                status=201,
                redirect_url=redirect_url,
            )
        except Exception:
            print(Exception)
            return RedirectResponse("/login?success=attempted&status=unknown")
