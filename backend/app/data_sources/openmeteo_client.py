import datetime
import requests
import logging

logger = logging.getLogger(__name__)

# Three reference stations for spatially varying wind fields
STATIONS = [
    {"id": 0, "name": "Punjab (Source)", "lat": 30.8, "lon": 75.2},
    {"id": 1, "name": "Haryana (Transition)", "lat": 29.7, "lon": 76.3},
    {"id": 2, "name": "Delhi (Receptor)", "lat": 28.6, "lon": 77.2}
]

def fetch_spatial_weather_forecast():
    """
    Fetch a 48-hour hourly weather forecast from Open-Meteo for all three key
    stations (Punjab, Haryana, Delhi) simultaneously.
    Returns:
        List of 48 hourly steps, where each step has:
            - time: datetime
            - stations: List of weather dicts for each of the 3 stations
    """
    # Join latitudes and longitudes with commas
    lats = ",".join(str(s["lat"]) for s in STATIONS)
    lons = ",".join(str(s["lon"]) for s in STATIONS)
    
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lats}&longitude={lons}&hourly=relative_humidity_2m,wind_speed_10m,wind_direction_10m,boundary_layer_height,precipitation&wind_speed_unit=kmh&timezone=auto"
    
    try:
        response = requests.get(url, timeout=6)
        if response.status_code == 200:
            data = response.json()
            
            # Open-Meteo returns a list of result objects if multiple locations are requested
            if isinstance(data, list) and len(data) == len(STATIONS):
                timeline = []
                for hr in range(48):
                    step_time = None
                    step_stations = []
                    
                    for idx, station_data in enumerate(data):
                        hourly = station_data.get("hourly", {})
                        times = hourly.get("time", [])
                        
                        if hr < len(times):
                            if step_time is None:
                                step_time = datetime.datetime.fromisoformat(times[hr])
                                
                            rh = hourly.get("relative_humidity_2m", [])
                            wind_sp = hourly.get("wind_speed_10m", [])
                            wind_dir = hourly.get("wind_direction_10m", [])
                            pblh = hourly.get("boundary_layer_height", [])
                            precip = hourly.get("precipitation", [])
                            
                            step_stations.append({
                                "station_id": idx,
                                "lat": STATIONS[idx]["lat"],
                                "lon": STATIONS[idx]["lon"],
                                "wind_speed": wind_sp[hr] if (wind_sp and hr < len(wind_sp)) else 12.0,
                                "wind_direction": wind_dir[hr] if (wind_dir and hr < len(wind_dir)) else 315.0,
                                "relative_humidity": rh[hr] if (rh and hr < len(rh)) else 50.0,
                                "boundary_layer_height": pblh[hr] if (pblh and hr < len(pblh) and pblh[hr] is not None) else 800.0,
                                "precipitation": precip[hr] if (precip and hr < len(precip) and precip[hr] is not None) else 0.0
                            })
                            
                    if step_time:
                        timeline.append({
                            "time": step_time,
                            "stations": step_stations
                        })
                if timeline:
                    logger.info("Successfully fetched multi-station weather forecasts.")
                    return timeline
    except Exception as e:
        logger.error(f"Failed to fetch spatial weather forecast: {e}. Generating spatial fallbacks.")
        
    # High-fidelity spatial fallback generators (autumn NW wind pattern)
    fallback_timeline = []
    base_time = datetime.datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    
    for hr in range(48):
        dt = base_time + datetime.timedelta(hours=hr)
        hour_of_day = dt.hour
        step_stations = []
        
        for idx, s in enumerate(STATIONS):
            # Spatial gradients:
            # - Wind speed decreases slightly as it moves southwards (towards Delhi urban boundary)
            # - Humidity is higher in rural Punjab than urban Delhi
            # - Boundary layer has minor temperature/city inversion offsets
            if idx == 0: # Punjab
                base_speed = 14.0
                base_dir = 310.0 # NW
                base_pblh = 750.0
                base_rh = 65.0
            elif idx == 1: # Haryana
                base_speed = 12.0
                base_dir = 315.0
                base_pblh = 700.0
                base_rh = 55.0
            else: # Delhi
                base_speed = 8.5
                base_dir = 325.0 # slight friction rotation
                base_pblh = 600.0
                base_rh = 48.0
                
            # Add diurnal waves:
            # PBLH diurnal wave (high in afternoon, low at night)
            if 12 <= hour_of_day <= 16:
                pblh = base_pblh * 1.8
            elif hour_of_day >= 22 or hour_of_day <= 6:
                pblh = base_pblh * 0.45
            else:
                pblh = base_pblh * 0.9
                
            wind_speed = base_speed + 2.5 * (-0.5 if hour_of_day >= 19 or hour_of_day <= 6 else 1.0)
            wind_direction = base_dir + 10.0 * (hour_of_day % 3 - 1)
            rh = base_rh + 10.0 * (1.0 if hour_of_day >= 20 or hour_of_day <= 7 else -1.0)
            
            step_stations.append({
                "station_id": idx,
                "lat": s["lat"],
                "lon": s["lon"],
                "wind_speed": float(round(wind_speed, 1)),
                "wind_direction": float(round(wind_direction, 1)),
                "relative_humidity": float(round(rh, 1)),
                "boundary_layer_height": float(round(pblh, 1)),
                "precipitation": 0.0
            })
            
        fallback_timeline.append({
            "time": dt,
            "stations": step_stations
        })
        
    return fallback_timeline
