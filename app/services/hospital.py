from typing import List
from sqlalchemy import func
from fastapi import Query, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session, defer
from redis import Redis
import json

from app.models import Hospital
from app.core.utils import ResponseHandler
from app.core.security import uuid_to_base64, base64_to_uuid
from app.schemas.hospital import HospitalBase, HospitalCreateAdmin, HospitalUpdateAdmin


class HospitalService:
    # retrieve all the hospital names
    @staticmethod
    async def retrieve_all_names(db: Session, redis: Redis):
        redis_key = "hopitals:names"
        if cached_hospital_names := redis.get(redis_key):
            result = json.loads(cached_hospital_names)
            return ResponseHandler.fetch_successful(
                f"successfully retrieved all the hospital names from cache", result
            )

        # get all the unique hospital names
        result = db.query(Hospital.name).distinct().all()
        hospital_names = [name[0] for name in result]

        # set the hospital names into redis
        hospital_names_json = json.dumps(hospital_names)
        redis.set(redis_key, hospital_names_json, 3600)

        return ResponseHandler.fetch_successful(
            f"successfully retrieved all the hospital names", hospital_names
        )

    # retrieve all the hospital locations
    @staticmethod
    async def retrieve_all_locations(db: Session, redis: Redis):
        redis_key = "hospital:locations"
        if cached_hospital_locations := redis.get(redis_key):
            result = json.loads(cached_hospital_locations)
            return ResponseHandler.fetch_successful(
                f"successfully retrieved all the hospital locations from cache", result
            )

        # get all the unique hospital loctions
        result = db.query(Hospital.city).distinct().all()
        cities = [city[0] for city in result]

        # set the hospital locations into redis
        hospital_locations_json = json.dumps(cities)
        redis.set(redis_key, hospital_locations_json, 3600)

        return ResponseHandler.fetch_successful(
            f"successfully retrieved all the hospital locations", cities
        )

    # retrieve all hospital informations /general
    @staticmethod
    async def retrieve_all_hospitals(
        db: Session,
        redis: Redis,
        page: int,
        limit: int,
        locations: list[str] | None,
    ):
        page = max(1, page)
        offset = (page - 1) * limit
        redis_key = f"hospitals:page:{page}"

        # get the total size of the doctor database
        total_count = db.query(Hospital).count()

        # retrive hospital informations from redis if found
        if (cached_hospitals_info := redis.get(redis_key)) and (locations is None):
            result = json.loads(cached_hospitals_info)
            return ResponseHandler.fetch_successful(
                f"successfully retrived hospital informations #page-{page} from cache",
                result,
                total_count,
            )

        # retrive the doctors information from database
        query = db.query(Hospital).options(
            defer(Hospital.updated_at), defer(Hospital.created_at)
        )

        # handle filtering params
        if locations:
            query = query.filter(Hospital.city.in_(locations))

        hospitals = query.offset(offset).limit(limit).all()

        # restructure the result for general users (replace id w base64 string)
        hospitals_info_data = jsonable_encoder(
            [
                {
                    "id": uuid_to_base64(hospital.id),
                    # key everything except for id
                    **{
                        key: val
                        for key, val in hospital.__dict__.items()
                        if key != "id"
                    },
                }
                for hospital in hospitals
            ]
        )

        # set the doctors information into redis
        if not locations:
            hospitals_info_json = json.dumps(hospitals_info_data)
            redis.set(redis_key, hospitals_info_json, 3600)

        # reassign the total size of the doctor database for filtering
        if locations:
            total_count = query.count()

        return ResponseHandler.fetch_successful(
            f"successfully retrived hospital informations #page-{page}",
            hospitals_info_data,
            total_count,
        )

    @staticmethod
    async def retrieve_hospital_information(id: str, db: Session, redis: Redis):
        hospital_id = base64_to_uuid(id)  # covert base64 string to uuid
        redis_key = f"hospital:info:{hospital_id}"  # set keys dynamically

        # retrive hospital information from redis if found
        if cached_hospital_info := redis.get(redis_key):
            result = json.loads(cached_hospital_info)
            return ResponseHandler.fetch_successful(
                f"successfully retrived hospital information #{hospital_id} from cache",
                result,
            )

        # query the hospital data w specific informations
        hospital = (
            db.query(Hospital)
            .where(Hospital.id == hospital_id)
            .options(defer(Hospital.created_at), defer(Hospital.updated_at))
            .first()
        )

        # handle not found
        if not hospital:
            raise ResponseHandler.not_found_error(f"hospital not found - {id}")

        # restructure the hospital profile informations
        hospital_data = {
            "id": id,
            "name": hospital.name,
            "address": hospital.address,
            "city": hospital.city,
            "img_src": hospital.img_src,
            "description": hospital.description,
            "emails": hospital.emails,
            "contact_numbers": hospital.contact_numbers,
            "geometry": hospital.geometry,
        }

        # update the hospital information into redis caching
        hospital_json = json.dumps(hospital_data)
        redis.set(redis_key, hospital_json, 3600)

        return ResponseHandler.fetch_successful(
            f"successfully retrived hospital information #{hospital_id}",
            hospital_data,
        )

    # create a new patient account /admin
    @staticmethod
    async def create_hospital_account_admin(details: HospitalCreateAdmin, db: Session):
        new_hospital = Hospital(**details.model_dump())

        db.add(new_hospital)
        db.commit()
        db.refresh(new_hospital)

        return {
            "status": "successful",
            "message": f"successfully created a new hospital - {new_hospital.id}",
        }

    # retrieve all hospital informations /admin
    @staticmethod
    async def retrieve_all_hospitals_admin(
        db: Session,
        offset: int = 0,
        # this way it adds a layer of constraint, asking the parameter either be 100 or less than 100
        limit: int = Query(default=100, le=100),
    ):
        hospitals = db.query(Hospital).offset(offset).limit(limit).all()

        return {
            "status": "successful",
            "message": "successfully fetched all hospitals!",
            "data": hospitals,
        }

    # get hospital information using id /admin
    @staticmethod
    async def get_hospital_information_admin(id: str, db: Session):
        hospital = db.query(Hospital).where(Hospital.id == id).first()

        if not hospital:
            raise ResponseHandler.not_found_error(f"hospital not found - {id}")

        return {
            "status": "successful",
            "message": f"successfully retrieved hospital information - {hospital.id}",
            "data": hospital,
        }

    # update hospital information using id /admin
    @staticmethod
    async def update_hospital_information_admin(
        id: str, details: HospitalUpdateAdmin, db: Session
    ):
        hospital = db.query(Hospital).where(Hospital.id == id).first()

        # if no patient found
        if not hospital:
            raise ResponseHandler.not_found_error(f"hospital not found - {id}")

        # handle if no if the body is empty
        if details.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"updating hospital failed, no field was provided - {hospital.id}",
            )

        # update the hospital information
        payload = {"updated_at": func.now(), **details.none_excluded()}
        db.query(Hospital).where(Hospital.id == id).update(payload)

        db.commit()
        db.refresh(hospital)

        return {
            "status": "successful",
            "message": f"successfully updated hospital information - {hospital.id}",
            "data": hospital,
        }

    # delete hospital using hospital id /admin
    @staticmethod
    async def delete_hospital_admin(id: str, db: Session):
        targeted_hospital = db.query(Hospital).where(Hospital.id == id).first()

        if not targeted_hospital:
            raise ResponseHandler.not_found_error(f"hospital not found - {id}")

        db.delete(targeted_hospital)
        db.commit()

        return {
            "status": "successful",
            "message": f"successfully deleted user account - {id}",
        }

    # delete a batch of user accounts /admin
    @staticmethod
    async def delete_hospital_batch_admin(ids: List[str], db: Session):
        targeted_hospitals = db.query(Hospital).filter(Hospital.id.in_(ids)).all()

        # get the missing ids if there is any
        existing_ids = [str(hospital.id) for hospital in targeted_hospitals]
        missing_ids = list(set(ids) - set(existing_ids))
        missing_message = None

        # if targeted hospitals not found
        if len(existing_ids) == 0:
            raise ResponseHandler.not_found_error(
                "hospital " + ", ".join(missing_ids) + " has not been found!"
            )

        # delete the targeted hospitals
        db.query(Hospital).filter(Hospital.id.in_(ids)).delete(
            synchronize_session=False
        )
        db.commit()

        # custom message when some of the ids are missing
        if len(missing_ids) > 0:
            missing_message = "hospital " + ", ".join(missing_ids) + " not found!"

        # message w custom message if there is any
        custom_message = (
            "hospital "
            + ", ".join(existing_ids)
            + " has been deleted successfully"
            + (" and " + missing_message if missing_message else "!")
        )

        return {"status": "successful", "message": custom_message}
