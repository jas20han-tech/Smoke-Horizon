import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DATABASE_URL: str = "sqlite:///./db.sqlite3"
    NASA_FIRMS_API_KEY: str = ""
    OPENAQ_API_KEY: str = ""

    # Twilio SMS credentials
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    # Your Twilio SMS phone number in E.164 format e.g. +15017122661
    TWILIO_SMS_FROM: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
