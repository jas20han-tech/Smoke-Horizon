import pytest
from app.models.transport_model import get_wind_vectors, interpolate_weather_at_location
from app.models.boundary_layer import get_boundary_layer_multiplier
from app.models.humidity_decay import get_hourly_decay_factor
from app.models.composite_score import pm25_to_aqi

def test_wind_vectors():
    # Meteorological Wind 270 (West) should blow East (vx > 0, vy = 0)
    vx, vy = get_wind_vectors(10.0, 270.0)
    assert vx > 0
    assert abs(vy) < 1e-5

    # Meteorological Wind 360/0 (North) should blow South (vx = 0, vy < 0)
    vx, vy = get_wind_vectors(10.0, 360.0)
    assert abs(vx) < 1e-5
    assert vy < 0

def test_boundary_layer():
    # Standard reference height is 700.0. If pblh = 700, multiplier = 1.0
    mult = get_boundary_layer_multiplier(700.0)
    assert mult == 1.0
    
    # Lower boundary layer height should trap pollutants (multiplier > 1.0)
    mult_low = get_boundary_layer_multiplier(350.0)
    assert mult_low == 2.0
    
    # Boundary layer multiplier is clamped / transitions to nocturnal severe inversions (up to 3.0) and convective dilution (down to 0.30)
    assert get_boundary_layer_multiplier(100.0) == 3.0
    assert get_boundary_layer_multiplier(3000.0) == 0.30

def test_humidity_decay():
    # CPCB baseline relative humidity (50%), no rain -> standard decay
    factor_dry = get_hourly_decay_factor(50.0, 0.0)
    assert factor_dry == 0.975 # 2.5% decay per hour
    
    # CPCB baseline relative humidity (95%), no rain -> higher dry deposition
    factor_humid = get_hourly_decay_factor(95.0, 0.0)
    assert factor_humid < 0.975 # faster decay
    
    # Rain should wash out particles (wet deposition)
    factor_rain = get_hourly_decay_factor(50.0, 1.5)
    assert factor_rain < 0.975 # rain washout

def test_aqi_breakpoints():
    # Good: 0-30 -> AQI 0-50
    assert pm25_to_aqi(15.0) == 25
    
    # Satisfactory: 31-60 -> AQI 51-100
    assert pm25_to_aqi(45.0) == 75
    
    # Severe: 250+ -> AQI 400+
    assert pm25_to_aqi(300.0) == 450

def test_idw_weather_interpolation():
    stations = [
        {"lat": 30.0, "lon": 75.0, "wind_speed": 10.0, "wind_direction": 350.0, "relative_humidity": 60.0, "boundary_layer_height": 800.0, "precipitation": 0.0},
        {"lat": 30.0, "lon": 76.0, "wind_speed": 20.0, "wind_direction": 10.0, "relative_humidity": 50.0, "boundary_layer_height": 600.0, "precipitation": 0.0},
        {"lat": 29.0, "lon": 75.5, "wind_speed": 15.0, "wind_direction": 180.0, "relative_humidity": 55.0, "boundary_layer_height": 700.0, "precipitation": 0.0}
    ]
    
    # Test point extremely close to station 0
    interp = interpolate_weather_at_location(30.0, 75.001, stations)
    assert abs(interp["wind_speed"] - 10.0) < 0.2
    assert abs(interp["relative_humidity"] - 60.0) < 0.2

    # Circular wind direction average: 350 deg (station 0) and 10 deg (station 1)
    # Exactly halfway (weight is equal) should yield ~0.0 degrees (straight North)
    interp_mid = interpolate_weather_at_location(30.0, 75.5, stations)
    diff = abs(interp_mid["wind_direction"] - 0.0)
    diff = min(diff, 360.0 - diff)
    assert diff < 1.0
