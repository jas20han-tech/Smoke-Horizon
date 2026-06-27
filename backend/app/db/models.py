import datetime
from sqlalchemy import Column, Integer, Float, String, Boolean, DateTime
from app.db.session import Base

class FireHotspot(Base):
    __tablename__ = "fire_hotspots"

    id = Column(Integer, primary_key=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    frp = Column(Float, default=10.0)  # Fire Radiative Power in MW
    acq_time = Column(DateTime, default=datetime.datetime.utcnow)
    is_custom = Column(Boolean, default=False)  # User added via simulation sandbox

class WeatherRecord(Base):
    __tablename__ = "weather_records"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    wind_speed = Column(Float)            # in km/h
    wind_direction = Column(Float)        # in degrees (0 = North, 90 = East, etc.)
    relative_humidity = Column(Float)    # percentage
    boundary_layer_height = Column(Float) # in meters
    precipitation = Column(Float)         # in mm

class ForecastRun(Base):
    __tablename__ = "forecast_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_time = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    target_time = Column(DateTime, index=True)  # The specific future hour this predicts
    predicted_pm25 = Column(Float)               # contribution from smoke transport
    baseline_pm25 = Column(Float)                # baseline urban pollution in Delhi
    final_pm25 = Column(Float)                   # baseline + smoke
    risk_level = Column(String)                  # "Low", "Medium", "High"
