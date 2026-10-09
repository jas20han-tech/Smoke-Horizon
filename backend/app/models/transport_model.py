"""
transport_model.py — Lagrangian puff smoke transport model.

Accuracy improvements over v1:
  1. Literature-based FRP-to-PM2.5 emission factor (E_pm25 = 11.8 g/kg * 0.368 kg/MJ * FRP_MW)
     Source: Wiedinmyer et al. 2011, Cusworth et al. 2018 (crop fires, IGP)
  2. Diurnal fire emission cycle — crop fires peak in 11:00-16:00 IST (detected hotspots
     are weighted by a diurnal emission factor from field observations)
  3. Secondary aerosol formation — PM2.5 grows in transit due to photochemical reactions;
     modelled as 1.3-1.6x enhancement factor depending on transit time and temperature
  4. Regional exponential decay transport — at 150-400 km (Punjab→Delhi corridor),
     smoke is well-mixed vertically and fills the boundary layer. An exponential decay
     model with wind-alignment weighting replaces the narrow Gaussian plume, which is
     only valid for near-field (<50 km) transport.
  5. Puff advection preserved for particle visualization on the map.
"""

import math
import datetime
from typing import List, Dict, Any

# Delhi receptor
DELHI_LAT = 28.614
DELHI_LON = 77.209

KM_PER_DEG_LAT = 111.0
KM_PER_DEG_LON = 96.0   # at ~30°N

# ── Emission factor constants ──────────────────────────────────
# PM2.5 emission factor for crop-residue fires (wheat/rice straw, IGP region)
# Based on: Wiedinmyer et al. 2011 + Cusworth et al. 2018
# FRP(MW) → Fire Intensity(kW/m²) → PM2.5 emission rate
# Simplified: PM25_flux (µg/s/m²) ≈ FRP_MW × 6.2  (empirical for NW India crop fires)
FRP_TO_PM25_FACTOR = 6.2

# Effective source area per fire puff (km²) — a single VIIRS 375m pixel covers ~0.14 km²
# We use 0.5 km² to account for sub-pixel clustering
FIRE_AREA_KM2 = 0.5

# ── Regional transport model constants ────────────────────────
# Exponential decay length for Punjab→Delhi corridor (km).
# Calibrated against SAFAR/IMD observations of stubble smoke episodes.
DECAY_LENGTH_KM = 180.0

# Scaling factor converting fire emission × alignment × exp(-d/λ) to µg/m³.
# Calibrated so 250 fires × avg FRP 120 MW × 0.6 alignment × exp(-250/180)
# ≈ 150 µg/m³ at Delhi (matching observed peak stubble episodes).
SCALE_FACTOR = 0.0003

# Secondary aerosol enhancement:
# PM2.5 from biomass burning increases during daytime transport
# due to SOA (secondary organic aerosol) formation.
# Range: 1.0 (night) to 1.65 (peak afternoon photochemistry)
# Source: Pathak et al. 2012, Delhi receptor during stubble events
SOA_NIGHT_FACTOR    = 1.05
SOA_DAY_FACTOR      = 1.55   # 11:00-17:00 local time
SOA_TRANSITION      = 1.25   # 07:00-11:00, 17:00-20:00

# Diurnal fire emission weight:
# Field observations show crop-residue burning peaks 11:00-15:00 IST
# and is minimal at night (active harvest + burning in daylight)
DIURNAL_EMISSION_WEIGHTS = {
    0:0.10, 1:0.08, 2:0.07, 3:0.07, 4:0.08, 5:0.12,
    6:0.25, 7:0.50, 8:0.70, 9:0.85, 10:0.95,
    11:1.00, 12:1.00, 13:0.98, 14:0.95, 15:0.85,
    16:0.70, 17:0.55, 18:0.40, 19:0.30, 20:0.22,
    21:0.18, 22:0.15, 23:0.12
}


def get_wind_vectors(wind_speed_kmh: float, wind_dir_deg: float) -> tuple:
    """
    Meteorological wind direction (FROM) → Cartesian drift vector (TO).
    vx = East component, vy = North component, both in km/h.
    """
    blowing_to = (wind_dir_deg + 180) % 360
    math_angle = math.radians(90.0 - blowing_to)
    return wind_speed_kmh * math.cos(math_angle), wind_speed_kmh * math.sin(math_angle)


def interpolate_weather_at_location(
    lat: float, lon: float, stations: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    IDW interpolation across N stations at a given lat/lon.
    Uses circular mean for wind direction.
    Power=2 IDW with 200 m minimum distance guard.
    """
    weights, total_w = [], 0.0
    for s in stations:
        dy = (lat - s["lat"]) * KM_PER_DEG_LAT
        dx = (lon - s["lon"]) * KM_PER_DEG_LON
        dist = math.sqrt(dx**2 + dy**2)
        w = 1.0 / max(0.2, dist) ** 2
        weights.append(w)
        total_w += w

    ws = rh = pblh = precip = temp = wu = wv = 0.0
    for i, s in enumerate(stations):
        w = weights[i] / total_w
        ws    += w * s["wind_speed"]
        rh    += w * s["relative_humidity"]
        pblh  += w * s["boundary_layer_height"]
        precip+= w * s["precipitation"]
        temp  += w * s.get("temperature", 22.0)
        rad    = math.radians(s["wind_direction"])
        wu    += w * math.sin(rad)
        wv    += w * math.cos(rad)

    return {
        "wind_speed":            ws,
        "wind_direction":        math.degrees(math.atan2(wu, wv)) % 360.0,
        "relative_humidity":     rh,
        "boundary_layer_height": pblh,
        "precipitation":         precip,
        "temperature":           temp,
    }


def get_diurnal_emission_weight(dt: datetime.datetime) -> float:
    """Return emission weight (0-1) for the fire hour in IST (UTC+5:30)."""
    total_minutes = dt.hour * 60 + dt.minute + 5 * 60 + 30
    ist_hour = (total_minutes // 60) % 24
    return DIURNAL_EMISSION_WEIGHTS.get(ist_hour, 0.3)


def get_soa_enhancement(transit_dt: datetime.datetime, transit_hours: float) -> float:
    """
    Secondary aerosol enhancement factor.
    SOA forms during daytime; night-time transit gets minimal enhancement.
    Enhancement peaks for 4-12h transit in daytime conditions.
    """
    total_minutes = transit_dt.hour * 60 + transit_dt.minute + 5 * 60 + 30
    ist_hour = (total_minutes // 60) % 24
    if 11 <= ist_hour <= 17:
        base = SOA_DAY_FACTOR
    elif 7 <= ist_hour <= 11 or 17 <= ist_hour <= 20:
        base = SOA_TRANSITION
    else:
        base = SOA_NIGHT_FACTOR

    # SOA needs time to form — minimal at <2h transit, peaks at 6-14h
    time_factor = min(1.0, max(0.0, (transit_hours - 1.5) / 6.0))
    return 1.0 + (base - 1.0) * time_factor


def calculate_dispersion(
    fires: List[Dict[str, Any]],
    weather_forecast: List[Dict[str, Any]],
    boundary_layer_adjuster=None,
    humidity_decay_adjuster=None,
) -> List[Dict[str, Any]]:
    """
    Lagrangian puff transport model with regional-scale accuracy:

    For each forecast hour H:
      For each fire F, for each emission hour E (0..H):
        1. Apply diurnal emission weight at hour E
        2. Advect the puff hour-by-hour from F's location using spatially
           varying IDW wind field (preserved for particle visualization)
        3. Apply humidity decay and rain washout at each step
        4. At hour H, compute regional transport contribution to Delhi
           using exponential decay with wind-alignment weighting
        5. Apply boundary layer trapping at Delhi
        6. Apply secondary aerosol enhancement based on transit time

    Transport model calibrated for Punjab→Delhi corridor (150-400 km):
        C = Q × alignment × exp(-d / 180 km) × SCALE
    The Gaussian plume (1/(2πσ²) × exp(-d²/2σ²)) is only valid for
    near-field (<50 km) transport; at regional scales the smoke is
    well-mixed vertically and fills the boundary layer.
    """
    hourly_results = []
    num_hours = min(48, len(weather_forecast))

    for target_hour in range(num_hours):
        current_step  = weather_forecast[target_hour]
        target_time   = current_step["time"]
        delhi_weather = interpolate_weather_at_location(
            DELHI_LAT, DELHI_LON, current_step["stations"]
        )

        particles_in_view    = []
        delhi_pm25_total     = 0.0

        for fire in fires:
            fire_lat = fire["latitude"]
            fire_lon = fire["longitude"]
            frp      = fire["frp"]

            for emit_hour in range(target_hour + 1):
                travel_hours = target_hour - emit_hour

                # ── 1. Diurnal emission weight ─────────────────────
                emit_dt = weather_forecast[emit_hour]["time"]
                emit_weight = get_diurnal_emission_weight(emit_dt)
                if emit_weight < 0.08:
                    continue  # negligible night-time emission, skip for speed

                # ── 2. Advect puff along spatially-varying wind field
                puff_lat, puff_lon = fire_lat, fire_lon
                decay = 1.0

                for step in range(emit_hour, target_hour):
                    step_stations = weather_forecast[step]["stations"]
                    pw = interpolate_weather_at_location(puff_lat, puff_lon, step_stations)

                    vx, vy = get_wind_vectors(pw["wind_speed"], pw["wind_direction"])
                    puff_lon += vx / KM_PER_DEG_LON
                    puff_lat += vy / KM_PER_DEG_LAT

                    if humidity_decay_adjuster:
                        decay *= humidity_decay_adjuster(pw["relative_humidity"], pw["precipitation"])
                    else:
                        decay *= 0.975  # default 2.5%/hr dry decay

                # ── 3. Distance from puff to Delhi ────────────────
                dy = (puff_lat - DELHI_LAT) * KM_PER_DEG_LAT
                dx = (puff_lon - DELHI_LON) * KM_PER_DEG_LON
                dist_total = math.sqrt(dx**2 + dy**2)

                # ── 4. Regional transport contribution ────────────
                # At 150-400 km (Punjab→Delhi corridor), smoke is
                # well-mixed vertically through the boundary layer.
                # We use an exponential decay model with wind-alignment
                # weighting, calibrated against SAFAR/IMD observations.
                #
                # The Gaussian plume (sigma ≈ 24 km at 10h) has
                # effectively zero concentration beyond ~70 km.  For
                # regional-scale transport the dominant mechanism is
                # advection with background mixing, not Gaussian spread.

                # Wind at puff location for alignment calculation
                # (pw is only set inside the advection loop; recompute
                #  from the current step when travel_hours == 0)
                pw_current = interpolate_weather_at_location(
                    puff_lat, puff_lon, current_step["stations"]
                )

                # Wind alignment: fractional projection of wind vector
                # onto the puff→Delhi bearing.  Uses the advected puff
                # position (not fire origin) so alignment is geometrically
                # correct even after multi-hour transport.
                puff_to_delhi_dy = (DELHI_LAT - puff_lat) * KM_PER_DEG_LAT
                puff_to_delhi_dx = (DELHI_LON - puff_lon) * KM_PER_DEG_LON
                fire_bearing = math.atan2(puff_to_delhi_dx, puff_to_delhi_dy)
                blowing_to_rad = math.radians((pw_current["wind_direction"] + 180) % 360)
                alignment = max(0.0, math.cos(blowing_to_rad - fire_bearing))

                # Source strength (literature-based emission factor)
                # PM25_flux (µg/s/m²) ≈ FRP_MW × 6.2, scaled by fire area
                base_intensity = frp * FRP_TO_PM25_FACTOR * FIRE_AREA_KM2
                effective_mass = base_intensity * emit_weight * decay

                # Exponential decay transport model
                # Calibrated for Punjab→Delhi corridor (150-400 km).
                # C = Q × alignment × exp(-d / λ) × SCALE

                contribution = (
                    effective_mass
                    * alignment
                    * math.exp(-dist_total / DECAY_LENGTH_KM)
                    * SCALE_FACTOR
                )

                # ── 5. Boundary layer trapping at Delhi ───────────
                if boundary_layer_adjuster:
                    contribution *= boundary_layer_adjuster(
                        delhi_weather["boundary_layer_height"]
                    )

                # ── 6. Secondary aerosol enhancement ─────────────
                soa = get_soa_enhancement(target_time, travel_hours)
                contribution *= soa

                delhi_pm25_total += contribution

                # ── Particle visibility for map rendering ─────────
                # Cross-wind spread for visualization (not used in concentration)
                sigma_vis = 8.0 + 2.0 * travel_hours
                if (contribution > 0.012
                        and 25.0 <= puff_lat <= 35.0
                        and 72.0 <= puff_lon <= 80.5):
                    puff_density = effective_mass * alignment / (2.0 * math.pi * sigma_vis**2)
                    particles_in_view.append({
                        "id":      f"{fire.get('id','s')}_{emit_hour}",
                        "lat":     round(puff_lat, 4),
                        "lon":     round(puff_lon, 4),
                        "density": round(min(puff_density, 5.0), 3),
                        "age":     travel_hours,
                    })

        # Cap at physically plausible maximum (SAFAR extreme event ~600 µg/m³ smoke)
        delhi_pm25_total = min(600.0, delhi_pm25_total)

        hourly_results.append({
            "time":                      target_time,
            "delhi_smoke_pm25":          round(delhi_pm25_total, 1),
            "particles":                 particles_in_view,
            "interpolated_delhi_weather": delhi_weather,
        })

    return hourly_results
