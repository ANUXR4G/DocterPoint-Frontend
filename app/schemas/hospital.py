from typing import List
from pydantic import BaseModel


class HospitalRecordBase(BaseModel):
  def none_excluded(self): 
    return { k: v for k, v in self.model_dump().items() if v is not None }
  
  def is_empty(self) -> bool:
    return all(value is None for value in self.model_dump().values())
  
  pass


class GeometryValues(BaseModel):
  coordinates: List[float]
  type: str


class HospitalBase(BaseModel):
  url: str
  name: str
  address: str
  city: str 
  img_src: str 
  description: str 
  emails: List[str]
  contact_numbers: List[str]
  geometry: GeometryValues


# admin hospital 
class HospitalCreateAdmin(BaseModel):
  name: str
  address: str
  city: str 
  img_src: str 
  description: str 
  emails: List[str]
  contact_numbers: List[str]
  geometry: GeometryValues


# admin hospital 
class HospitalUpdateAdmin(HospitalRecordBase):
  name: str = None 
  address: str = None 
  city: str = None 
  img_src: str = None 
  description: str = None 
  emails: List[str] = None 
  contact_numbers: List[str] = None 
  geometry: GeometryValues = None 