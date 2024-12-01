from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from typing import Generator
from app.core.config import settings


DATABASE_URL = f"postgresql://{settings.postgres_user}:{settings.postgres_pass}@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_database_name}"

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# connect the database using the local session
def get_db() -> Generator:
  db = SessionLocal()
  try: 
    yield db
  finally:
    db.close()
