import math
import datetime
from typing import List, Dict, Any

# Delhi Coordinates
DELHI_LAT = 28.6
DELHI_LON = 77.2

# Scaling factors: km per degree
KM_PER_DEG_LAT = 111.0
KM_PER_DEG_LON = 96.0 # at ~30 degrees latitude

def get_wind_vectors(wind_speed_kmh: float, wind_dir_deg: float) -> tuple:
    """
    Convert meteorological wind speed (km/h) and direction (degrees)
    into Cartesian velocity components (vx, vy) pointing to where the wind is BLOWING.
    vx is positive East, vy is positive North.
    """
    # Meteorological wind direction is where the wind is coming FROM.
    # Convert to direction blowing TO:
    blowing_to_deg = (wind_dir_deg + 180) % 360
    
    # In math polar coordinates:
    # Converting meteorological angle to math polar angle:
    math_angle_rad = math.radians(90.0 - blowing_to_deg)
    
    vx = wind_speed_kmh * math.cos(math_angle_rad)
    vy = wind_speed_kmh * math.sin(math_angle_rad)
    return vx, vy

def interpolate_weather_at_location(lat: float, lon: float, stations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Interpolate weather variables at a specific latitude/longitude using 
    Inverse Distance Weighting (IDW) from the three weather stations.
    Handles circular angular average of wind directions correctly.
    """
    weights = []
    total_weight = 0.0
    
    for s in stations:
        # Calculate distance in km
        dy = (lat - s["lat"]) * KM_PER_DEG_LAT
        dx = (lon - s["lon"]) * KM_PER_DEG_LON
        dist = math.sqrt(dx**2 + dy**2)
        
        # Avoid division by zero (minimum distance 200 meters)
        weight = 1.0 / (max(0.2, dist) ** 2)
        weights.append(weight)
        total_weight += weight
        
    # Calculate weighted averages
    interp_wind_speed = 0.0
    interp_rh = 0.0
    interp_pblh = 0.0
    interp_precip = 0.0
    
    # Wind angle unit vectors
    wind_u = 0.0
    wind_v = 0.0
    
    for i, s in enumerate(stations):
        w = weights[i] / total_weight
        
        interp_wind_speed += w * s["wind_speed"]
        interp_rh += w * s["relative_humidity"]
        interp_pblh += w * s["boundary_layer_height"]
        interp_precip += w * s["precipitation"]
        
        # Resolve angle to components
        rad = math.radians(s["wind_direction"])
        wind_u += w * math.sin(rad)
        wind_v += w * math.cos(rad)
        
    # Reconstruct angle in degrees
    interp_wind_dir = math.degrees(math.atan2(wind_u, wind_v)) % 360.0
    
    return {
        "wind_speed": interp_wind_speed,
        "wind_direction": interp_wind_dir,
        "relative_humidity": interp_rh,
        "boundary_layer_height": interp_pblh,
        "precipitation": interp_precip
    }

def calculate_dispersion(
    fires: List[Dict[str, Any]], 
    weather_forecast: List[Dict[str, Any]],
    boundary_layer_adjuster=None,
    humidity_decay_adjuster=None
) -> List[Dict[str, Any]]:
    """
    Simulates the movement of smoke puffs emitted by active fires over a 48-hour forecast horizon
    using a spatially varying 2D wind field model (multi-station interpolation).
    """
    hourly_results = []
    num_hours = min(48, len(weather_forecast))
    
    for target_hour in range(num_hours):
        current_weather_step = weather_forecast[target_hour]
        target_time = current_weather_step["time"]
        stations_weather = current_weather_step["stations"]
        
        # Weather exactly at Delhi for receptor scoring
        delhi_weather = interpolate_weather_at_location(DELHI_LAT, DELHI_LON, stations_weather)
        
        particles_in_view = []
        delhi_pm25_contribution = 0.0
        
        for fire in fires:
            fire_lat = fire["latitude"]
            fire_lon = fire["longitude"]
            frp = fire["frp"]
            
            # Emit a puff at each hour up to the target hour
            for emit_hour in range(target_hour + 1):
                travel_time = target_hour - emit_hour # in hours
                
                # Trace path of the puff by evaluating weather at its location at each step
                puff_lat = fire_lat
                puff_lon = fire_lon
                
                # Apply spatially varying wind vectors step-by-step
                # Accumulate humidity decay along the path
                decay = 1.0
                
                for step in range(emit_hour, target_hour):
                    step_stations = weather_forecast[step]["stations"]
                    
                    # Interpolate weather AT current puff coordinate
                    puff_weather = interpolate_weather_at_location(puff_lat, puff_lon, step_stations)
                    
                    # Apply local wind drift
                    vx, vy = get_wind_vectors(puff_weather["wind_speed"], puff_weather["wind_direction"])
                    dlon = vx / KM_PER_DEG_LON
                    dlat = vy / KM_PER_DEG_LAT
                    
                    puff_lon += dlon
                    puff_lat += dlat
                    
                    # Apply local decay
                    if humidity_decay_adjuster:
                        decay *= humidity_decay_adjuster(
                            puff_weather["relative_humidity"], 
                            puff_weather["precipitation"]
                        )
                    else:
                        decay *= 0.97
                
                # Now at target_hour, evaluate distance of puff to Delhi
                dy = (puff_lat - DELHI_LAT) * KM_PER_DEG_LAT
                dx = (puff_lon - DELHI_LON) * KM_PER_DEG_LON
                dist_to_delhi = math.sqrt(dx**2 + dy**2)
                
                # Gaussian dispersion standard deviation (sigma) grows over time (puff expands)
                sigma = 8.0 + 1.6 * travel_time
                base_intensity = frp * 9.5
                
                # If there's no path accumulation decay applied, fall back to default
                if not humidity_decay_adjuster:
                    decay = (0.97) ** travel_time
                
                # Calculate puff density
                puff_density = (base_intensity / (2 * math.pi * (sigma**2))) * decay
                
                # Ground PM2.5 contribution to Delhi receptor
                contribution = puff_density * math.exp(-(dist_to_delhi**2) / (2 * (sigma**2)))
                
                # Apply local Boundary Layer Trapping factor at Delhi receptor
                if boundary_layer_adjuster:
                    trapping_multiplier = boundary_layer_adjuster(delhi_weather["boundary_layer_height"])
                    contribution *= trapping_multiplier
                
                delhi_pm25_contribution += contribution
                
                # Filter visible particles in regional bounds [26.0 - 34.0 Lat, 72.0 - 80.0 Lon]
                if puff_density > 0.015 and (26.0 <= puff_lat <= 34.0) and (72.0 <= puff_lon <= 80.0):
                    particles_in_view.append({
                        "id": f"{fire.get('id', 'sim')}_{emit_hour}",
                        "lat": float(round(puff_lat, 4)),
                        "lon": float(round(puff_lon, 4)),
                        "density": float(round(puff_density, 3)),
                        "age": travel_time
                    })
        
        delhi_pm25_contribution = min(600.0, delhi_pm25_contribution)
        
        hourly_results.append({
            "time": target_time,
            "delhi_smoke_pm25": float(round(delhi_pm25_contribution, 1)),
            "particles": particles_in_view,
            "interpolated_delhi_weather": delhi_weather # pass this up
        })
        
    return hourly_results
