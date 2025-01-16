from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from typing import Generator
from app.core.config import settings


DATABASE_URL = f"postgresql://{settings.postgres_user}:{settings.postgres_pass}@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_database_name}"
ASYNC_DATABASE_URL = f"postgresql+asyncpg://{settings.postgres_user}:{settings.postgres_pass}@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_database_name}"

engine = create_engine(DATABASE_URL)
async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
AsyncSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=async_engine, class_=AsyncSession
)


# connect the database using the local session
def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# connect the database using the local async session
async def get_async_db():
    async with AsyncSessionLocal() as session:
        yield session
