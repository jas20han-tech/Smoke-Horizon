import datetime
from sqlalchemy import Column, Integer, Float, String, Boolean, DateTime
from app.db.session import Base

class FireHotspot(Base):
    __tablename__ = "fire_hotspots"

    id = Column(Integer, primary_key=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    frp = Column(Float, default=10.0)
    acq_time = Column(DateTime, default=datetime.datetime.utcnow)
    is_custom = Column(Boolean, default=False)

class WeatherRecord(Base):
    __tablename__ = "weather_records"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    wind_speed = Column(Float)
    wind_direction = Column(Float)
    relative_humidity = Column(Float)
    boundary_layer_height = Column(Float)
    precipitation = Column(Float)

class ForecastRun(Base):
    __tablename__ = "forecast_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_time = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    target_time = Column(DateTime, index=True)
    predicted_pm25 = Column(Float)
    baseline_pm25 = Column(Float)
    final_pm25 = Column(Float)
    risk_level = Column(String)


class AlertSubscription(Base):
    """
    Stores a user's WhatsApp alert subscription.
    Alerts fire when FORECASTED values cross the threshold —
    never based on current live readings.
    """
    __tablename__ = "alert_subscriptions"

    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String, nullable=False)
    phone_number  = Column(String, nullable=False, index=True)
    location      = Column(String, default="Delhi-NCR")
    metric        = Column(String, default="AQI")
    threshold     = Column(Float, nullable=False)
    forecast_window_hours = Column(Integer, default=24)
    is_active     = Column(Boolean, default=True)
    last_alert_sent_at = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=datetime.datetime.utcnow)


class PinnedLocation(Base):
    """
    A user-pinned place (home, school, hospital, etc.) for which
    Smoke Horizon calculates a Personalized Exposure Score.

    The score is based on FORECASTED smoke transport to the pin's
    lat/lon — not current AQI.  Score is 0-100:
        0-25  Low | 26-50 Moderate | 51-75 High | 76-100 Severe
    """
    __tablename__ = "pinned_locations"

    id              = Column(Integer, primary_key=True, index=True)
    # Label: "Home" | "School" | "Office" | "Hospital" | "Custom"
    label           = Column(String, default="Home")
    name            = Column(String, nullable=False)      # display name
    address         = Column(String, nullable=True)       # optional address
    latitude        = Column(Float,  nullable=False)
    longitude       = Column(Float,  nullable=False)
    # Sensitivity profile affects risk weighting
    # "adult" | "child" | "elderly" | "asthma_copd" | "outdoor_worker"
    user_sensitivity = Column(String, default="adult")
    is_active        = Column(Boolean, default=True)
    created_at       = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.datetime.utcnow,
                              onupdate=datetime.datetime.utcnow)
