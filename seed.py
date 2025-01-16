from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

import asyncio

from app.db import get_async_db
from app.core.security import generate_hash
from app.models import Patient, Doctor, Hospital, Meal
from app.core.dummy import patients_data, hospitals_data, doctors_data, meals_data


async def initialize_database():
    async for db in get_async_db():
        db: AsyncSession  # explicitly define database type
        # seed the patient informations in the database
        for patient in patients_data:
            query = select(Patient).where(Patient.email == patient["email"])
            result = await db.execute(query)
            existing_patient = result.scalar_one_or_none()

            if not existing_patient:
                hashed_password = generate_hash("test123")  # generate hashed password
                patient["password"] = hashed_password
                db_patient = Patient(**patient)
                db.add(db_patient)

        # seed the hospital informations in the database
        for hospital in hospitals_data:
            new_hospital = Hospital(**hospital)
            db.add(new_hospital)

        await db.commit()
        # print("successfully seeded patients into the database.")
        # print("successfully seeded hospitals into the database.")

        # seed the doctor informations in the database
        for doctor in doctors_data:
            query = select(Doctor).where(Doctor.email == doctor["email"])
            result = await db.execute(query)
            existing_doctor = result.scalar_one_or_none()

            if not existing_doctor:
                hashed_password = generate_hash("test123")  # generate hashed password
                doctor["password"] = hashed_password

                # get the hospital id
                query = select(Hospital.id).where(
                    Hospital.name == doctor["hospital_name"]
                )
                result = await db.execute(query)
                hospital_id = result.scalar_one_or_none()

                # restructure the doctor payload beforing storing it into the database
                if hospital_id:
                    payload = {
                        "hospital_id": hospital_id,
                        **{
                            key: val
                            for key, val in doctor.items()
                            if key != "hospital_name"  # exclude hospital_name field
                        },
                    }
                    db_doctor = Doctor(**payload)
                    db.add(db_doctor)

        await db.commit()
        # print("successfully seeded doctors into the database.")

        # seed the meal informations into the database
        for meal in meals_data:
            db_meal = Meal(**meal)
            db.add(db_meal)

        await db.commit()
        # print("successfully seeded meals into the database.")

        print("successfully seeded patients into the database.")
        print("successfully seeded hospitals into the database.")
        print("successfully seeded doctors into the database.")
        print("successfully seeded meals into the database.")


if __name__ == "__main__":
    asyncio.run(initialize_database())
