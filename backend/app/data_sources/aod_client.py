import random

def get_satellite_aod(latitude: float, longitude: float, current_pm25: float) -> float:
    """
    Simulate Aerosol Optical Depth (AOD) from MODIS/VIIRS.
    AOD typically ranges from 0.1 (very clean) to 2.5 (extreme smoke).
    It is heavily correlated with ground-level PM2.5.
    """
    # Simple linear correlation with some noise
    base_aod = current_pm25 / 150.0
    noise = random.uniform(-0.08, 0.08)
    aod = max(0.05, base_aod + noise)
    
    # Cap aod at 3.0 for extreme events
    return float(round(min(3.0, aod), 2))
