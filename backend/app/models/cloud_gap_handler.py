import datetime
from typing import List, Dict, Any

def handle_cloud_gaps(
    current_fires: List[Dict[str, Any]],
    historical_fires: List[Dict[str, Any]],
    cloud_coverage_percent: float
) -> tuple[List[Dict[str, Any]], bool, float]:
    """
    Check if cloud coverage is high enough to obstruct satellite fire detection.
    If cloud_coverage_percent > 40.0, we interpolate missing fires by pulling
    active fires from the last 24 hours that are not already present in the active list.
    
    Returns:
        tuple (interpolated_fires, is_gap_filled, confidence_score)
    """
    is_gap_filled = False
    
    # Calculate initial confidence score based on cloud cover
    # 100% clouds = 10% confidence, 0% clouds = 100% confidence
    confidence_score = max(10.0, 100.0 - (cloud_coverage_percent * 0.9))
    
    if cloud_coverage_percent <= 40.0:
        # Clear skies, no gap-filling required
        return current_fires, is_gap_filled, float(round(confidence_score, 1))
        
    # Cloud gap detected! We need to interpolate
    is_gap_filled = True
    interpolated_fires = list(current_fires)
    
    # Extract unique coordinates of current fires to avoid duplicates (within ~5km)
    existing_coords = [(f["latitude"], f["longitude"]) for f in current_fires]
    
    # Filter historical fires from the last 24 hours
    now = datetime.datetime.utcnow()
    cutoff_time = now - datetime.timedelta(hours=24)
    
    for hist_fire in historical_fires:
        hist_time = hist_fire.get("acq_time")
        if isinstance(hist_time, str):
            try:
                hist_time = datetime.datetime.fromisoformat(hist_time)
            except ValueError:
                continue
                
        # If it's within the last 24 hours
        if hist_time and hist_time >= cutoff_time:
            # Check if this fire is already represented in current fires
            is_duplicate = False
            for lat, lon in existing_coords:
                # ~5km proximity check
                if abs(hist_fire["latitude"] - lat) < 0.05 and abs(hist_fire["longitude"] - lon) < 0.05:
                    is_duplicate = True
                    break
                    
            if not is_duplicate:
                # Add historical fire to active list but mark it as a gap-filled fire
                cloned_fire = dict(hist_fire)
                cloned_fire["is_interpolated"] = True
                interpolated_fires.append(cloned_fire)
                
    return interpolated_fires, is_gap_filled, float(round(confidence_score, 1))
