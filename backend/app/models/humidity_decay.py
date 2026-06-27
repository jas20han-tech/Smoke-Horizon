def get_hourly_decay_factor(relative_humidity: float, precipitation: float) -> float:
    """
    Compute the hourly retention factor (how much smoke mass remains after 1 hour).
    
    Factors modeled:
    1. Rain Washout (Wet Deposition):
       Precipitation washes out PM2.5 particles from the atmosphere.
       Loss = 18% * precipitation_mm per hour, capped at 85% loss per hour.
       
    2. Humidity Settling (Dry Deposition / Growth):
       At high humidity (>80%), PM2.5 particles absorb moisture (hygroscopic growth),
       become heavier, and settle to the ground faster (dry deposition).
       - Moderate humidity (40-70%): normal decay of ~2.5% per hour.
       - High humidity (>80%): decay increases up to 7% per hour.
    """
    # 1. Base loss from dry deposition depending on humidity
    if relative_humidity > 80:
        # High humidity: higher deposition rate (up to 7.5% loss per hour)
        humidity_loss = 0.025 + 0.05 * ((relative_humidity - 80.0) / 20.0)
    else:
        # Standard loss: 2.5% per hour
        humidity_loss = 0.025
        
    # 2. Wet deposition loss from rain
    if precipitation > 0:
        # Rain washout scales with intensity
        rain_loss = 0.15 * precipitation
        rain_loss = min(0.85, rain_loss)
    else:
        rain_loss = 0.0
        
    # Combine losses (probabilities that particle is removed)
    total_loss = humidity_loss + rain_loss
    total_loss = min(0.95, total_loss) # keep at least 5% mass per hour
    
    # Return the retention factor (multiplier for remaining mass)
    return float(1.0 - total_loss)
