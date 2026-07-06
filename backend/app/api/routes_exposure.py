"""
routes_exposure.py — Personalized Exposure Score API.

Endpoints:
  POST   /api/exposure/pins          — create a pinned location
  GET    /api/exposure/pins          — list all active pins
  DELETE /api/exposure/pins/{id}     — remove a pin
  POST   /api/exposure/score         — calculate scores for all pins
                                       given the current forecast timeline
  GET    /api/exposure/score/{pin_id} — score a single pin (runs forecast internally)
"""

import datetime
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, validator
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import PinnedLocation, FireHotspot
from app.models.exposure_score import calculate_exposure_score
from app.data_sources.openmeteo_client import fetch_spatial_weather_forecast
from app.data_sources.cpcb_client import get_baseline_pm25
from app.models.transport_model import calculate_dispersion
from app.models.boundary_layer import get_boundary_layer_multiplier
from app.models.humidity_decay import get_hourly_decay_factor
from app.models.composite_score import calculate_composite_risk
from app.models.cloud_gap_handler import handle_cloud_gaps
from app.data_sources.cloud_mask_client import get_cloud_coverage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/exposure", tags=["exposure"])

VALID_LABELS       = {"Home", "School", "Office", "Hospital", "Custom"}
VALID_SENSITIVITIES = {"adult", "child", "elderly", "asthma_copd", "outdoor_worker"}
VALID_WINDOWS       = {18, 24, 36}


# ── Pydantic schemas ──────────────────────────────────────────

class PinnedLocationCreate(BaseModel):
    label:            str = "Home"
    name:             str
    address:          Optional[str] = None
    latitude:         float
    longitude:        float
    user_sensitivity: str = "adult"

    @validator("label")
    def val_label(cls, v):
        if v not in VALID_LABELS:
            raise ValueError(f"label must be one of {VALID_LABELS}")
        return v

    @validator("user_sensitivity")
    def val_sens(cls, v):
        if v not in VALID_SENSITIVITIES:
            raise ValueError(f"user_sensitivity must be one of {VALID_SENSITIVITIES}")
        return v

    @validator("latitude")
    def val_lat(cls, v):
        if not (-90 <= v <= 90):
            raise ValueError("latitude must be between -90 and 90")
        return round(v, 6)

    @validator("longitude")
    def val_lon(cls, v):
        if not (-180 <= v <= 180):
            raise ValueError("longitude must be between -180 and 180")
        return round(v, 6)


class PinnedLocationOut(BaseModel):
    id:               int
    label:            str
    name:             str
    address:          Optional[str]
    latitude:         float
    longitude:        float
    user_sensitivity: str
    is_active:        bool
    created_at:       datetime.datetime

    class Config:
        from_attributes = True


class ScoreRequest(BaseModel):
    """Pass the forecast timeline from the frontend to avoid double computation."""
    timeline:             list
    fires:                list = []
    forecast_window_hours: int = 24

    @validator("forecast_window_hours")
    def val_window(cls, v):
        if v not in VALID_WINDOWS:
            raise ValueError(f"forecast_window_hours must be one of {VALID_WINDOWS}")
        return v


class PinScoreOut(BaseModel):
    pin_id:               int
    label:                str
    name:                 str
    latitude:             float
    longitude:            float
    user_sensitivity:     str
    exposure_score:       int
    risk_level:           str
    forecast_window_hours: int
    forecasted_aqi:       int
    forecasted_pm25:      float
    main_risk_reason:     str
    recommended_action:   str
    sensitivity_multiplier: float
    safe_pm25_limit:      float


# ── Helpers ───────────────────────────────────────────────────

def _run_forecast(db: Session) -> tuple[list, list]:
    """
    Run a fresh forecast computation.  Returns (timeline, fires).
    Shared logic with routes_forecast — kept DRY by extracting here.
    """
    now = datetime.datetime.utcnow()
    cutoff = now - datetime.timedelta(hours=36)

    fires_db = db.query(FireHotspot).filter(FireHotspot.acq_time >= cutoff).all()
    fire_list = [{"id": f.id, "latitude": f.latitude, "longitude": f.longitude,
                  "frp": f.frp, "acq_time": f.acq_time, "is_custom": f.is_custom}
                 for f in fires_db]

    weather = fetch_spatial_weather_forecast()
    cloud   = get_cloud_coverage(now)

    hist_cutoff = now - datetime.timedelta(hours=72)
    hist_fires  = db.query(FireHotspot).filter(
        FireHotspot.acq_time >= hist_cutoff, FireHotspot.is_custom == False
    ).all()
    hist_list = [{"latitude": h.latitude, "longitude": h.longitude,
                  "frp": h.frp, "acq_time": h.acq_time} for h in hist_fires]

    active, _, _ = handle_cloud_gaps(fire_list, hist_list, cloud)

    dispersion = calculate_dispersion(
        fires=active, weather_forecast=weather,
        boundary_layer_adjuster=get_boundary_layer_multiplier,
        humidity_decay_adjuster=get_hourly_decay_factor,
    )

    timeline = []
    for i, step in enumerate(dispersion):
        w  = weather[i]
        dw = step["interpolated_delhi_weather"]
        smoke    = step["delhi_smoke_pm25"]
        baseline = get_baseline_pm25(w["time"])
        comp     = calculate_composite_risk(
            fires=active, wind_speed=dw["wind_speed"],
            wind_direction=dw["wind_direction"],
            smoke_pm25=smoke, baseline_pm25=baseline,
        )
        timeline.append({
            "time":         w["time"].isoformat() if hasattr(w["time"], "isoformat") else str(w["time"]),
            "wind_speed":    dw["wind_speed"],
            "wind_direction":dw["wind_direction"],
            "smoke_pm25":    smoke,
            "baseline_pm25": baseline,
            "final_pm25":    comp["final_pm25"],
            "aqi":           comp["aqi"],
            "risk_level":    comp["risk_level"],
        })

    return timeline, active


# ── Routes ────────────────────────────────────────────────────

@router.post("/pins", response_model=PinnedLocationOut, status_code=201)
def create_pin(payload: PinnedLocationCreate, db: Session = Depends(get_db)):
    """Save a new pinned location."""
    pin = PinnedLocation(
        label=payload.label,
        name=payload.name,
        address=payload.address,
        latitude=payload.latitude,
        longitude=payload.longitude,
        user_sensitivity=payload.user_sensitivity,
    )
    db.add(pin)
    db.commit()
    db.refresh(pin)
    logger.info(f"Pin created: {pin.name} ({pin.label}) at {pin.latitude},{pin.longitude}")
    return pin


@router.get("/pins", response_model=list[PinnedLocationOut])
def list_pins(db: Session = Depends(get_db)):
    """Return all active pinned locations."""
    return db.query(PinnedLocation).filter(PinnedLocation.is_active == True).all()


@router.delete("/pins/{pin_id}", status_code=200)
def delete_pin(pin_id: int, db: Session = Depends(get_db)):
    """Soft-delete a pin."""
    pin = db.query(PinnedLocation).filter(PinnedLocation.id == pin_id).first()
    if not pin:
        raise HTTPException(status_code=404, detail="Pin not found")
    pin.is_active = False
    db.commit()
    return {"message": f"Pin {pin_id} removed"}


@router.post("/score", response_model=list[PinScoreOut])
def score_all_pins(payload: ScoreRequest, db: Session = Depends(get_db)):
    """
    Calculate Personalized Exposure Scores for all active pins.

    The caller (frontend) passes the current forecast timeline so we
    avoid recomputing it.  This endpoint is called every time the
    forecast refreshes in the UI.
    """
    pins = db.query(PinnedLocation).filter(PinnedLocation.is_active == True).all()
    if not pins:
        return []

    results = []
    for pin in pins:
        score_data = calculate_exposure_score(
            lat=pin.latitude,
            lon=pin.longitude,
            user_sensitivity=pin.user_sensitivity,
            timeline=payload.timeline,
            fires=payload.fires,
            forecast_window_hours=payload.forecast_window_hours,
        )
        results.append(PinScoreOut(
            pin_id=pin.id,
            label=pin.label,
            name=pin.name,
            latitude=pin.latitude,
            longitude=pin.longitude,
            user_sensitivity=pin.user_sensitivity,
            **score_data,
        ))

    return results


@router.get("/score/{pin_id}", response_model=PinScoreOut)
def score_single_pin(
    pin_id: int,
    forecast_window_hours: int = 24,
    db: Session = Depends(get_db),
):
    """
    Score a single pin — runs a fresh forecast internally.
    Useful for on-demand refreshes from the detail card.
    """
    pin = db.query(PinnedLocation).filter(PinnedLocation.id == pin_id).first()
    if not pin:
        raise HTTPException(status_code=404, detail="Pin not found")
    if forecast_window_hours not in VALID_WINDOWS:
        raise HTTPException(status_code=400, detail="forecast_window_hours must be 18, 24, or 36")

    timeline, fires = _run_forecast(db)

    score_data = calculate_exposure_score(
        lat=pin.latitude,
        lon=pin.longitude,
        user_sensitivity=pin.user_sensitivity,
        timeline=timeline,
        fires=fires,
        forecast_window_hours=forecast_window_hours,
    )
    return PinScoreOut(
        pin_id=pin.id,
        label=pin.label,
        name=pin.name,
        latitude=pin.latitude,
        longitude=pin.longitude,
        user_sensitivity=pin.user_sensitivity,
        **score_data,
    )
