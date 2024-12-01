from pydantic_settings import BaseSettings, SettingsConfigDict



class Settings(BaseSettings):
  frontend_origins: str
  postgres_user: str
  postgres_pass: str
  postgres_host: str
  postgres_port: str
  postgres_database_name: str
  pgadmin_default_email: str
  pgadmin_default_pass: str
  redis_password: str 
  redis_host: str 
  redis_port: int 
  flower_basic_auth: str
  jwt_secret_key: str
  jwt_algorithm: str
  hashing_secret_key: str
  access_token_expires: int
  refresh_token_expires: int
  google_client_id: str
  google_client_secret: str
  google_redirect_uri: str
  celery_broker_url: str
  celery_result_backend: str 
  owner_email: str
  smtp_password: str 
  smtp_port: int
  smtp_host: str
  
  model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
