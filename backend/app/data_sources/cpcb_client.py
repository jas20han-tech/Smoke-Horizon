import math
import datetime

def get_baseline_pm25(dt: datetime.datetime) -> float:
    """
    Calculate the typical background (urban) PM2.5 concentration in Delhi
    for a given datetime. Delhi's PM2.5 peaks in the morning (traffic/inversion)
    and late evening, and reaches a minimum in the afternoon due to atmospheric mixing.
    """
    hour = dt.hour
    
    # Baseline fluctuates between ~70 and ~130 µg/m³ based on a diurnal wave
    # Shift wave so peak is at ~8:00 AM and ~10:00 PM
    # Standard double peak diurnal cycle:
    wave1 = math.cos((hour - 8) * (2 * math.pi / 24))  # morning peak
    wave2 = math.cos((hour - 22) * (2 * math.pi / 12)) # night peak (semi-diurnal)
    
    base_val = 100.0
    diurnal_variation = 25.0 * wave1 + 10.0 * wave2
    
    final_baseline = max(40.0, base_val + diurnal_variation)
    
    # Slight seasonal variation (higher baseline in winter/autumn months Oct-Feb)
    month = dt.month
    if month in [10, 11, 12, 1]:
        final_baseline *= 1.4  # winter stagnation increases baseline
    
    return float(round(final_baseline, 1))
