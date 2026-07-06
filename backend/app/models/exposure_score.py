"""
exposure_score.py — Personalized Exposure Score engine.

Calculates a 0-100 score for a pinned location based on:
  1. Forecasted smoke PM2.5 at the pin's lat/lon
     (interpolated from the Lagrangian puff transport model)
  2. Distance from the active smoke plume path
  3. Wind direction alignment toward the pin
  4. User sensitivity profile (child, elderly, asthma/COPD, etc.)
  5. Forecast window (18h / 24h / 36h peak)

Score bands:
  0-25  → Low
  26-50 → Moderate
  51-75 → High
  76-100 → Severe

Architecture note:
  This module is deliberately decoupled from the transport model.
  It consumes a pre-computed `timeline` (list of hourly forecast steps)
  identical to what the /api/forecast endpoint already returns.
  When a higher-resolution gridded transport model is available, only
  `_interpolate_pm25_at_location` needs to be updated.
"""

import math
from typing import Any


# ── Sensitivity multipliers ────────────────────────────────────
# Based on WHO/CPCB guidelines for vulnerable populations:
#   Children (<12): developing lungs, 1.5× risk per µg/m³
#   Elderly (>60): reduced respiratory reserve, 1.4×
#   Asthma/COPD: direct trigger threshold much lower, 1.8×
#   Outdoor worker: 8h continuous exposure vs ~2h typical, 1.6×
#   Adult (healthy): baseline 1.0×
SENSITIVITY = {
    "child":          1.55,
    "elderly":        1.40,
    "asthma_copd":    1.80,
    "outdoor_worker": 1.60,
    "adult":          1.00,
}

# ── Safe PM2.5 thresholds by profile (µg/m³ / 24h) ───────────
# Source: WHO 2021 AQG + CPCB India standards
SAFE_PM25 = {
    "child":          15.0,   # WHO AQG annual
    "elderly":        20.0,
    "asthma_copd":    12.0,   # stricter for respiratory patients
    "outdoor_worker": 25.0,   # CPCB 24h standard
    "adult":          25.0,   # CPCB 24h standard
}

# ── Score thresholds ───────────────────────────────────────────
SCORE_BANDS = [
    (0,  25,  "Low",      "#1D9E75"),
    (26, 50,  "Moderate", "#E8A33D"),
    (51, 75,  "High",     "#F07040"),
    (76, 100, "Severe",   "#E85D3D"),
]

# ── Recommended actions per risk level ────────────────────────
ACTIONS = {
    "Low": (
        "Air quality near this location is forecast to remain acceptable. "
        "Sensitive individuals may wish to limit prolonged outdoor activity."
    ),
    "Moderate": (
        "Moderate smoke transport expected. Reduce extended outdoor activity, "
        "especially for children and elderly. Keep windows closed during "
        "peak smoke hours (early morning and evening)."
    ),
    "High": (
        "High smoke exposure forecast. Avoid outdoor exercise. Keep all windows "
        "and doors closed. Run air purifiers if available. Wear N95 masks outdoors. "
        "Sensitive groups (asthma, children, elderly) should stay indoors."
    ),
    "Severe": (
        "Severe smoke exposure forecast for this location. Stay indoors with "
        "windows sealed. Use N95/FFP2 mask if going outside is unavoidable. "
        "Seek medical attention if respiratory symptoms develop. School and "
        "outdoor activities should be cancelled."
    ),
}

# ── Score reasons ──────────────────────────────────────────────
REASONS = {
    "Low":      "Smoke plume not forecast to reach this location in the next {w} hours.",
    "Moderate": "Light smoke transport forecast to reach this area within {w} hours.",
    "High":     "Significant smoke plume expected to pass over this location within {w} hours.",
    "Severe":   "Dense smoke transport directly forecast over this location within {w} hours.",
}


# ── Geo helpers ────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in km between two lat/lon points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _wind_alignment(wind_dir_deg: float, from_lat: float, from_lon: float,
                    to_lat: float, to_lon: float) -> float:
    """
    How well is the wind blowing from (from_lat,from_lon) toward (to_lat,to_lon)?
    Returns 0-1.  1.0 = perfectly aligned.
    """
    dy = to_lat - from_lat
    dx = to_lon - from_lon
    bearing = math.degrees(math.atan2(dx, dy)) % 360.0
    blowing_to = (wind_dir_deg + 180) % 360.0
    diff = abs(blowing_to - bearing)
    diff = min(diff, 360.0 - diff)
    return max(0.0, math.cos(math.radians(diff)))


# ── Core interpolation ────────────────────────────────────────

def _interpolate_pm25_at_location(
    lat: float, lon: float,
    timeline: list,
    fires: list,
    forecast_window_hours: int,
) -> tuple[float, float]:
    """
    Estimate peak forecasted PM2.5 and AQI at (lat, lon) over the
    next `forecast_window_hours` hours.

    Method:
      We use the existing Delhi-receptor smoke_pm25 values from the
      timeline as the base signal, then attenuate/amplify based on:
        - Geographic distance from Delhi (the current receptor)
        - Wind alignment from the smoke source toward the pin
        - Distance from the nearest active fire cluster

    This is a first-order approximation.  For full accuracy, the
    Lagrangian model should be extended with arbitrary receptor points.
    The function signature is designed for easy replacement.

    Returns: (peak_pm25, peak_aqi)
    """
    DELHI_LAT, DELHI_LON = 28.614, 77.209

    # Distance from pin to Delhi (the reference receptor)
    dist_to_delhi = _haversine_km(lat, lon, DELHI_LAT, DELHI_LON)

    # Gaussian spread from Delhi center — pins within ~50 km get close to
    # the Delhi signal; beyond 100 km it decays significantly
    delhi_sigma = 65.0  # km — represents lateral plume width at receptor
    spatial_factor = math.exp(-(dist_to_delhi ** 2) / (2 * delhi_sigma ** 2))
    spatial_factor = max(0.05, spatial_factor)

    # For pins closer to the fire sources (Punjab/Haryana), factor in
    # proximity to fires — these locations may get HIGHER exposure than Delhi
    source_boost = 0.0
    for fire in (fires or []):
        d_fire = _haversine_km(lat, lon, fire["latitude"], fire["longitude"])
        if d_fire < 80:
            # Very close to a fire cluster — direct local impact
            source_boost = max(source_boost, (1.0 - d_fire / 80.0) * 0.5 * (fire["frp"] / 200.0))

    effective_spatial = min(1.5, spatial_factor + source_boost)

    # Walk timeline up to forecast_window_hours
    import datetime
    now = datetime.datetime.utcnow()
    cutoff = now + datetime.timedelta(hours=forecast_window_hours)

    peak_smoke   = 0.0
    peak_aqi     = 0
    peak_baseline = 0.0

    for step in timeline:
        try:
            t = datetime.datetime.fromisoformat(str(step["time"]).replace("Z", ""))
            t = t.replace(tzinfo=None)
        except Exception:
            continue
        if t < now or t > cutoff:
            continue

        smoke    = float(step.get("smoke_pm25",    0.0))
        baseline = float(step.get("baseline_pm25", 40.0))
        aqi      = int(step.get("aqi",             0))

        local_smoke = smoke * effective_spatial
        local_total = baseline + local_smoke

        if local_total > peak_baseline + peak_smoke:
            peak_smoke    = local_smoke
            peak_baseline = baseline
            peak_aqi      = aqi

    peak_pm25 = round(peak_baseline + peak_smoke, 1)
    return peak_pm25, peak_aqi


# ── Score calculator ──────────────────────────────────────────

def calculate_exposure_score(
    lat: float,
    lon: float,
    user_sensitivity: str,
    timeline: list,
    fires: list,
    forecast_window_hours: int = 24,
) -> dict:
    """
    Calculate a Personalized Exposure Score (0-100) for a pinned location.

    Parameters:
        lat, lon              — pin coordinates
        user_sensitivity      — "adult" | "child" | "elderly" |
                                "asthma_copd" | "outdoor_worker"
        timeline              — hourly forecast list from /api/forecast
        fires                 — list of active fire dicts
        forecast_window_hours — 18, 24, or 36

    Returns a dict matching the ExposureScoreOut schema.
    """
    profile    = user_sensitivity.lower() if user_sensitivity else "adult"
    sens_mult  = SENSITIVITY.get(profile, 1.0)
    safe_limit = SAFE_PM25.get(profile, 25.0)

    # ── Get forecasted PM2.5 at pin location ──────────────────
    peak_pm25, peak_aqi = _interpolate_pm25_at_location(
        lat, lon, timeline, fires, forecast_window_hours
    )

    # ── Base score from PM2.5 vs safe limit ───────────────────
    # Score = 100 × (peak_pm25 / (safe_limit × 6))
    # At safe_limit → ~17 (Low); at 6× safe_limit → 100 (Severe)
    raw = (peak_pm25 / (safe_limit * 6.0)) * 100.0
    raw_with_sensitivity = raw * sens_mult
    score = int(round(min(100.0, max(0.0, raw_with_sensitivity))))

    # ── Wind alignment bonus ──────────────────────────────────
    # If wind is strongly blowing from fire source toward this pin,
    # add up to 8 points to score
    PUNJAB_LAT, PUNJAB_LON = 30.8, 75.3
    if timeline:
        first = timeline[0]
        wind_dir = float(first.get("wind_direction", 315.0))
        wind_spd = float(first.get("wind_speed",     10.0))
        align = _wind_alignment(wind_dir, PUNJAB_LAT, PUNJAB_LON, lat, lon)
        wind_bonus = int(align * (wind_spd / 20.0) * 8.0)
        score = min(100, score + wind_bonus)

    # ── Risk level and messaging ──────────────────────────────
    risk_level = "Low"
    for lo, hi, label, _ in SCORE_BANDS:
        if lo <= score <= hi:
            risk_level = label
            break

    main_reason = REASONS[risk_level].format(w=forecast_window_hours)
    action      = ACTIONS[risk_level]

    # Sensitivity note
    if profile == "child":
        sens_note = "Children have developing lungs and are more vulnerable to PM2.5."
    elif profile == "elderly":
        sens_note = "Elderly individuals have reduced respiratory reserve."
    elif profile == "asthma_copd":
        sens_note = "People with asthma or COPD face a lower trigger threshold."
    elif profile == "outdoor_worker":
        sens_note = "Outdoor workers face extended continuous exposure."
    else:
        sens_note = ""

    if sens_note:
        main_reason = f"{main_reason} {sens_note}"

    return {
        "exposure_score":        score,
        "risk_level":            risk_level,
        "forecast_window_hours": forecast_window_hours,
        "forecasted_aqi":        peak_aqi,
        "forecasted_pm25":       peak_pm25,
        "main_risk_reason":      main_reason,
        "recommended_action":    action,
        "sensitivity_multiplier": sens_mult,
        "safe_pm25_limit":       safe_limit,
    }
