import random
import datetime

def get_cloud_coverage(dt: datetime.datetime = None) -> float:
    """
    Get the percentage of cloud cover over the Punjab/Haryana/Delhi region.
    If cloud coverage is high (e.g. >40%), satellites cannot detect fires reliably,
    triggering cloud gap interpolation algorithms and raising UI warnings.
    """
    if dt is None:
        dt = datetime.datetime.utcnow()
        
    # Seed the cloud generator based on day of year to keep it stable
    random.seed(dt.date().toordinal())
    
    # Typically, harvest season (Oct/Nov) has very clear skies in North India (5-15% clouds)
    # Monsoons (June-Sept) have high clouds (70-95%)
    month = dt.month
    if month in [7, 8, 9]:
        base_cloud = 75.0
    elif month in [10, 11]:
        base_cloud = 12.0
    else:
        base_cloud = 25.0
        
    cloud_cover = base_cloud + random.uniform(-10.0, 15.0)
    cloud_cover = max(0.0, min(100.0, cloud_cover))
    
    # Reset random seed
    random.seed()
    
    return float(round(cloud_cover, 1))
