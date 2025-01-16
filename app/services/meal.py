from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, not_, cast
from sqlalchemy.orm import defer, load_only
from sqlalchemy.dialects.postgresql import JSONB

import json
from redis import Redis
from fastapi.encoders import jsonable_encoder


from app.models import Meal, Patient, Medication
from app.core.security import uuid_to_base64


class MealService:
    @staticmethod
    async def retrieve_all(
        session_user: Patient,
        db: AsyncSession,
        redis: Redis,
        q: str | None,
        page: int,
        limit: int,
        category: str | None,
    ):
        """
        Retrieve a list of meals based on various optional search criteria.

        q: Query parameter for searching meals by name (partial matches allowed).
        page: Pagination parameter to specify the starting index of the returned results.
        limit: Pagination parameter to specify the maximum number of results to return.
        category: Query parameter for filtering meals by categories.
        """
        query = select(Meal)
        count = select(func.count(Meal.id))
        page = max(1, page)  # allow page only to be greater than 1
        offset = (page - 1) * limit  # calcuate offset based on page and limit
        filter_args = []

        patient_id = uuid_to_base64(session_user.id)
        redis_medication_key = f"patients:medications:{patient_id}"

        # retrieve medications data if already cached
        if cached_medication_details := redis.get(redis_medication_key):
            medication_details = json.loads(cached_medication_details)
            ingredients = medication_details.get("recommended_ingredients") or None
            allergies = medication_details.get("allergies") or None
            allergies = medication_details.get("allergies") or None
            preferred_cuisine = medication_details.get("preferred_cuisine") or None
        else:
            medication_query = (
                select(Medication)
                .where(Medication.patient_id == session_user.id)
                .options(
                    load_only(Medication.allergies, Medication.recommended_ingredients)
                )
            )
            medication_result = await db.execute(medication_query)
            medication_result = medication_result.scalar_one_or_none()
            ingredients = medication_result.recommended_ingredients or None
            allergies = medication_result.allergies or None
            preferred_cuisine = medication_result.preferred_cuisine or None

        # apply filtering arguments if provided (q, ingredients, category, allergies, cusine)
        if q:
            filter_args.append(Meal.name.ilike(f"%{q}%"))

        if category and not q:
            filter_args.append(Meal.category == category)

        if ingredients and not q:
            # check for ingredients in the meal plans
            meal_ingredients = cast(Meal.ingredients, JSONB)
            filter_conditions = [
                meal_ingredients.contains([ingredient]) for ingredient in ingredients
            ]
            filter_args.extend(filter_conditions)

        if allergies and not q:
            meal_ingredients = cast(Meal.ingredients, JSONB)
            # exlude the meals that has the allergic ingredients
            filter_conditions = [
                not_(meal_ingredients.contains([ingredient]))
                for ingredient in allergies
            ]
            filter_args.extend(filter_conditions)

        if preferred_cuisine and not q:
            filter_args.append(Meal.cuisine == preferred_cuisine)

        # get the result and the count of the query based on condition
        if filter_args:
            query = query.where(and_(*filter_args))
            # get the total length of filtered records
            count_query = count.where(and_(*filter_args))
            count_result = await db.execute(count_query)
        else:
            count_result = await db.execute(count)

        query = (
            query.options(
                defer(Meal.created_at),  # exclude created_at
                defer(Meal.updated_at),  # exclude updated_at
            )
            .order_by(Meal.updated_at)
            .offset(offset)
            .limit(limit)
        )

        # retrieve all the meal informations
        result = await db.execute(query)
        filtered_meals = result.scalars().all()

        # restructure doctor data from the result
        filtered_meals = jsonable_encoder(
            [meal_data(meal_info) for meal_info in filtered_meals]
        )

        # get the total length of the database
        total = count_result.scalar()

        return {"total": total, "meals": filtered_meals}


def meal_data(meal_info: Meal):
    return {
        "id": uuid_to_base64(meal_info.id),
        **{
            key: val
            for key, val in meal_info.__dict__.items()
            if key != "id"  # exclude 'id'
        },
    }
