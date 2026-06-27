from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import datetime

from app.db.session import get_db
from app.db.models import FireHotspot
from app.data_sources.openmeteo_client import fetch_spatial_weather_forecast
from app.data_sources.cpcb_client import get_baseline_pm25
from app.data_sources.cloud_mask_client import get_cloud_coverage
from app.models.cloud_gap_handler import handle_cloud_gaps
from app.models.transport_model import calculate_dispersion
from app.models.composite_score import calculate_composite_risk
from app.models.boundary_layer import get_boundary_layer_multiplier
from app.models.humidity_decay import get_hourly_decay_factor
from app.config import settings

router = APIRouter(prefix="/api/forecast", tags=["forecast"])

@router.get("/")
def get_forecast(db: Session = Depends(get_db)):
    """
    Generate the 48-hour smoke dispersion forecast.
    Calculates hourly wind vector drifts, particle distributions using a
    2D spatially varying wind field (Punjab, Haryana, Delhi stations),
    and Delhi composite PM2.5 risk index.
    """
    now = datetime.datetime.utcnow()
    cutoff = now - datetime.timedelta(hours=24)
    
    # 1. Fetch active fires from DB
    fires = db.query(FireHotspot).filter(FireHotspot.acq_time >= cutoff).all()
    
    # Format fire objects
    fire_list = []
    for f in fires:
        fire_list.append({
            "id": f.id,
            "latitude": f.latitude,
            "longitude": f.longitude,
            "frp": f.frp,
            "acq_time": f.acq_time,
            "is_custom": f.is_custom
        })
        
    # 2. Fetch live Open-Meteo multi-station weather forecasts
    weather_forecast = fetch_spatial_weather_forecast()
    
    # 3. Simulate cloud cover gap detection
    cloud_cover = get_cloud_coverage(now)
    
    # Get historical fires (older fires to carry forward in case of cloud gaps)
    historical_cutoff = now - datetime.timedelta(hours=72)
    hist_db_fires = db.query(FireHotspot).filter(
        FireHotspot.acq_time >= historical_cutoff,
        FireHotspot.is_custom == False
    ).all()
    
    historical_list = [
        {"latitude": h.latitude, "longitude": h.longitude, "frp": h.frp, "acq_time": h.acq_time}
        for h in hist_db_fires
    ]
    
    # Apply cloud gap handler (re-injects past fires if view is blocked)
    active_fires, is_gap_filled, confidence_score = handle_cloud_gaps(
        fire_list, historical_list, cloud_cover
    )
    
    # 4. Run Spatially Varying Physics/Transport simulation model
    dispersion_timeline = calculate_dispersion(
        fires=active_fires,
        weather_forecast=weather_forecast,
        boundary_layer_adjuster=get_boundary_layer_multiplier,
        humidity_decay_adjuster=get_hourly_decay_factor
    )
    
    # 5. Build final composite score and forecast payload
    final_timeline = []
    for i, step in enumerate(dispersion_timeline):
        w_step = weather_forecast[i]
        smoke_pm25 = step["delhi_smoke_pm25"]
        delhi_w = step["interpolated_delhi_weather"] # local weather at Delhi receptor
        
        # Get baseline PM2.5 for Delhi at the specific forecast hour
        baseline = get_baseline_pm25(w_step["time"])
        
        # Calculate final risk levels
        composite = calculate_composite_risk(
            fires=active_fires,
            wind_speed=delhi_w["wind_speed"],
            wind_direction=delhi_w["wind_direction"],
            smoke_pm25=smoke_pm25,
            baseline_pm25=baseline
        )
        
        final_timeline.append({
            "time": w_step["time"],
            "wind_speed": delhi_w["wind_speed"],
            "wind_direction": delhi_w["wind_direction"],
            "relative_humidity": delhi_w["relative_humidity"],
            "boundary_layer_height": delhi_w["boundary_layer_height"],
            "precipitation": delhi_w["precipitation"],
            "smoke_pm25": smoke_pm25,
            "baseline_pm25": baseline,
            "final_pm25": composite["final_pm25"],
            "aqi": composite["aqi"],
            "risk_score": composite["risk_score"],
            "risk_level": composite["risk_level"],
            "particles": step["particles"] # coordinates of plume puffs
        })
        
    return {
        "meta": {
            "satellite_sync_status": "Connected" if settings.NASA_FIRMS_API_KEY else "Simulated",
            "cloud_cover_percent": cloud_cover,
            "is_gap_filled": is_gap_filled,
            "confidence_score": confidence_score,
            "fires_tracked": len(active_fires)
        },
        "fires": active_fires,
        "timeline": final_timeline
    }
