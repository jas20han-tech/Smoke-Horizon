import datetime
import requests
import logging

logger = logging.getLogger(__name__)

# Stubble burning season: October 1 – November 30
STUBBLE_MONTHS = {10, 11}

def _is_stubble_season() -> bool:
    return datetime.datetime.utcnow().month in STUBBLE_MONTHS

# ── 5-station network for better spatial coverage ─────────────
# Added Amritsar (far NW Punjab source) and Hisar (SW Haryana)
# to properly capture the full transport corridor width.
STATIONS = [
    {"id": 0, "name": "Amritsar",  "lat": 31.63, "lon": 74.87},  # far NW Punjab source
    {"id": 1, "name": "Punjab",    "lat": 30.80, "lon": 75.20},  # central Punjab
    {"id": 2, "name": "Hisar",     "lat": 29.15, "lon": 75.72},  # SW Haryana (Yamuna corridor)
    {"id": 3, "name": "Haryana",   "lat": 29.70, "lon": 76.30},  # central Haryana
    {"id": 4, "name": "Delhi",     "lat": 28.60, "lon": 77.20},  # receptor
]


def fetch_spatial_weather_forecast():
    """
    Fetch a 48-hour hourly weather forecast from Open-Meteo for all 5 stations.
    Also fetches temperature_2m for secondary aerosol formation correction.

    Returns list of 48 hourly steps, each with:
        - time: datetime
        - stations: list of weather dicts for each station
    """
    lats = ",".join(str(s["lat"]) for s in STATIONS)
    lons = ",".join(str(s["lon"]) for s in STATIONS)

    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lats}&longitude={lons}"
        f"&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,"
        f"wind_direction_10m,boundary_layer_height,precipitation"
        f"&wind_speed_unit=kmh&timezone=auto"
    )

    # Outside stubble season: use climatological NW wind pattern
    # so the demo works year-round. Real data is only reliable Oct-Nov.
    if not _is_stubble_season():
        logger.info("Outside stubble season — using Oct/Nov climatological wind pattern for demo.")
        return _build_fallback_timeline()

    try:
        response = requests.get(url, timeout=8)
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) == len(STATIONS):
                timeline = []
                for hr in range(48):
                    step_time = None
                    step_stations = []
                    for idx, station_data in enumerate(data):
                        hourly = station_data.get("hourly", {})
                        times  = hourly.get("time", [])
                        if hr >= len(times):
                            continue
                        if step_time is None:
                            step_time = datetime.datetime.fromisoformat(times[hr])

                        def g(key, default):
                            arr = hourly.get(key, [])
                            v = arr[hr] if arr and hr < len(arr) else None
                            return v if v is not None else default

                        step_stations.append({
                            "station_id":           idx,
                            "lat":                  STATIONS[idx]["lat"],
                            "lon":                  STATIONS[idx]["lon"],
                            "wind_speed":           g("wind_speed_10m",       12.0),
                            "wind_direction":       g("wind_direction_10m",   315.0),
                            "relative_humidity":    g("relative_humidity_2m", 50.0),
                            "boundary_layer_height":g("boundary_layer_height",800.0),
                            "precipitation":        g("precipitation",          0.0),
                            "temperature":          g("temperature_2m",        20.0),
                        })
                    if step_time:
                        timeline.append({"time": step_time, "stations": step_stations})
                if timeline:
                    logger.info("Fetched 5-station weather forecasts from Open-Meteo.")
                    return timeline
    except Exception as e:
        logger.error(f"Weather fetch failed: {e}. Using fallback.")

    return _build_fallback_timeline()


def _build_fallback_timeline() -> list:
    fallback_timeline = []
    base_time = datetime.datetime.utcnow().replace(minute=0, second=0, microsecond=0)

    # Observed Oct-Nov climatology for each station:
    # wind generally NW 305-320°, speed 8-18 km/h, PBLH very low at night
    CLIMATOLOGY = [
        # Amritsar — windiest, driest
        {"base_speed":16.0,"base_dir":308.0,"base_pblh":820.0,"base_rh":58.0,"base_temp":22.0},
        # Central Punjab
        {"base_speed":14.0,"base_dir":312.0,"base_pblh":760.0,"base_rh":62.0,"base_temp":21.0},
        # Hisar — slightly drier, slightly slower
        {"base_speed":11.0,"base_dir":318.0,"base_pblh":680.0,"base_rh":52.0,"base_temp":23.0},
        # Central Haryana
        {"base_speed":10.5,"base_dir":320.0,"base_pblh":640.0,"base_rh":56.0,"base_temp":22.0},
        # Delhi — urban friction reduces speed, increases RH slightly
        {"base_speed": 7.5,"base_dir":325.0,"base_pblh":520.0,"base_rh":60.0,"base_temp":24.0},
    ]

    for hr in range(48):
        dt = base_time + datetime.timedelta(hours=hr)
        hod = dt.hour
        step_stations = []
        for idx, c in enumerate(CLIMATOLOGY):
            # Diurnal PBLH: peaks 12-16h, collapses 22-06h
            if 12 <= hod <= 16:
                pblh = c["base_pblh"] * 1.9
            elif hod >= 22 or hod <= 5:
                pblh = c["base_pblh"] * 0.35   # strong nocturnal inversion
            elif 6 <= hod <= 9:
                pblh = c["base_pblh"] * 0.55   # morning transition
            else:
                pblh = c["base_pblh"] * 1.0

            # Diurnal wind: weakens at night, peaks mid-afternoon
            wspeed = c["base_speed"] * (0.70 if (hod >= 20 or hod <= 6) else 1.15)
            # Wind direction: slight clockwise shift at night (land-breeze)
            wdir   = c["base_dir"] + (8.0 if (hod >= 20 or hod <= 6) else -4.0)
            # RH: peaks at night, dips in afternoon
            rh     = c["base_rh"]  + (12.0 if (hod >= 22 or hod <= 7) else -8.0)
            # Temperature diurnal
            temp   = c["base_temp"] - 5.0 * (1 if (hod >= 2 and hod <= 6) else 0) \
                     + 4.0 * (1 if (hod >= 13 and hod <= 16) else 0)

            step_stations.append({
                "station_id":            idx,
                "lat":                   STATIONS[idx]["lat"],
                "lon":                   STATIONS[idx]["lon"],
                "wind_speed":            round(max(1.0, wspeed), 1),
                "wind_direction":        round(wdir % 360, 1),
                "relative_humidity":     round(min(98.0, max(20.0, rh)), 1),
                "boundary_layer_height": round(max(80.0, pblh), 1),
                "precipitation":         0.0,
                "temperature":           round(temp, 1),
            })
        fallback_timeline.append({"time": dt, "stations": step_stations})

    return fallback_timeline
