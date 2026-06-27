import math
from typing import List, Dict, Any

def get_wind_alignment(wind_dir_deg: float, fire_lat: float, fire_lon: float) -> float:
    """
    Calculate how well the wind direction aligns with the path to Delhi.
    Delhi is located South-East of Punjab/Haryana.
    Angle from Punjab/Haryana center (~30.5, 75.5) to Delhi (28.6, 77.2)
    is approximately 138 degrees (South-East).
    
    If the wind is blowing towards 138 degrees (i.e. wind is coming from ~318 degrees, North-West),
    alignment factor is 1.0. If blowing away, alignment is near 0.1.
    """
    # Wind direction is coming FROM. Convert to direction blowing TO:
    blowing_to = (wind_dir_deg + 180) % 360
    
    # Calculate angle from average fire to Delhi
    dy = 28.6 - fire_lat
    dx = 77.2 - fire_lon
    
    # angle in degrees from North (0 = North, 90 = East, 180 = South, 270 = West)
    angle_rad = math.atan2(dx, dy)
    angle_deg = math.degrees(angle_rad) % 360
    
    # Difference between wind direction (blowing TO) and angle to Delhi
    diff = abs(blowing_to - angle_deg)
    diff = min(diff, 360.0 - diff)
    
    # Convert to cosine-based alignment [0.1, 1.0]
    alignment = math.cos(math.radians(diff))
    return max(0.1, alignment)

def calculate_composite_risk(
    fires: List[Dict[str, Any]],
    wind_speed: float,
    wind_direction: float,
    smoke_pm25: float,
    baseline_pm25: float
) -> Dict[str, Any]:
    """
    Calculate the composite risk score (0-100) and forecast parameters.
    Risk Score = (Average Fire Intensity) * (Number of Fires) * Wind Speed Factor * Wind Alignment
    
    Matches the user's risk levels:
      0-30: Low
      31-60: Medium
      61-100: High
    """
    if not fires:
        return {
            "risk_score": 0.0,
            "risk_level": "Low",
            "final_pm25": float(round(baseline_pm25, 1)),
            "aqi": pm25_to_aqi(baseline_pm25)
        }
        
    num_fires = len(fires)
    avg_frp = sum(f["frp"] for f in fires) / num_fires
    
    # Average fire location
    avg_lat = sum(f["latitude"] for f in fires) / num_fires
    avg_lon = sum(f["longitude"] for f in fires) / num_fires
    
    # Calculate alignment factor of wind blowing towards Delhi
    alignment = get_wind_alignment(wind_direction, avg_lat, avg_lon)
    
    # Wind speed factor: higher speed carries smoke faster (but causes some dilution).
    # We normalize around 15 km/h.
    wind_factor = wind_speed / 15.0
    wind_factor = max(0.2, min(2.0, wind_factor))
    
    # User formula: (Fire Intensity) * (Number of Fires) * Wind Speed Factor
    # We scale it with alignment and scale factor to fit in 0-100 range
    intensity_scale = avg_frp / 100.0  # normalize around 100 MW
    fire_count_scale = num_fires / 10.0 # normalize around 10 fires
    
    raw_score = (intensity_scale * fire_count_scale * 45.0) * wind_factor * alignment
    risk_score = float(round(max(0.0, min(100.0, raw_score)), 1))
    
    # Map score to risk level
    if risk_score <= 30.0:
        risk_level = "Low"
    elif risk_score <= 60.0:
        risk_level = "Moderate"
    else:
        risk_level = "High"
        
    # Calculate final combined PM2.5
    final_pm25 = float(round(baseline_pm25 + smoke_pm25, 1))
    
    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "final_pm25": final_pm25,
        "aqi": pm25_to_aqi(final_pm25)
    }

def pm25_to_aqi(pm25: float) -> int:
    """
    Convert PM2.5 concentration (µg/m³) to Indian National AQI.
    AQI breakpoints for PM2.5 (24hr average in µg/m³):
      Good: 0-30      -> AQI 0-50
      Satisfactory: 31-60 -> AQI 51-100
      Moderate: 61-90  -> AQI 101-200
      Poor: 91-120    -> AQI 201-300
      Very Poor: 121-250 -> AQI 301-400
      Severe: 250+     -> AQI 401-500
    """
    if pm25 <= 30:
        return int(0 + (50 - 0) * (pm25 - 0) / (30 - 0))
    elif pm25 <= 60:
        return int(51 + (100 - 51) * (pm25 - 30) / (60 - 30))
    elif pm25 <= 90:
        return int(101 + (200 - 101) * (pm25 - 60) / (90 - 60))
    elif pm25 <= 120:
        return int(201 + (300 - 201) * (pm25 - 90) / (120 - 90))
    elif pm25 <= 250:
        return int(301 + (400 - 301) * (pm25 - 120) / (250 - 120))
    else:
        # Severe
        val = int(401 + (500 - 401) * (pm25 - 250) / (350 - 250))
        return min(500, val)
