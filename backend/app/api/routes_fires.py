from fastapi import Depends, HTTPException, APIRouter
from sqlalchemy.orm import Session
from typing import List
import datetime

from app.db.session import get_db
from app.db.models import FireHotspot
from app.data_sources.firms_client import fetch_active_fires
from app.config import settings

router = APIRouter(prefix="/api/fires", tags=["fires"])

@router.get("/")
def get_fires(db: Session = Depends(get_db)):
    """
    Get active fire hotspots. If no fires are present in the DB,
    fetch them (real or simulated) and save them to the DB.
    """
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=24)
    db_fires = db.query(FireHotspot).filter(FireHotspot.acq_time >= cutoff).all()
    
    if not db_fires:
        # DB is empty, fetch and seed
        logger_fires = fetch_active_fires()
        for f in logger_fires:
            db_f = FireHotspot(
                latitude=f["latitude"],
                longitude=f["longitude"],
                frp=f["frp"],
                acq_time=f["acq_time"],
                is_custom=False
            )
            db.add(db_f)
        db.commit()
        db_fires = db.query(FireHotspot).filter(FireHotspot.acq_time >= cutoff).all()
        
    return db_fires

@router.post("/")
def create_custom_fire(latitude: float, longitude: float, frp: float = 100.0, db: Session = Depends(get_db)):
    """
    Spawn a custom crop residue fire in the sandbox simulation.
    """
    if not (20.0 <= latitude <= 37.0) or not (68.0 <= longitude <= 97.0):
        raise HTTPException(status_code=400, detail="Coordinates out of India regional bounds.")
        
    custom_fire = FireHotspot(
        latitude=latitude,
        longitude=longitude,
        frp=frp,
        acq_time=datetime.datetime.utcnow(),
        is_custom=True
    )
    db.add(custom_fire)
    db.commit()
    db.refresh(custom_fire)
    return custom_fire

@router.delete("/custom")
def clear_custom_fires(db: Session = Depends(get_db)):
    """
    Clear all sandbox user-created fires.
    """
    db.query(FireHotspot).filter(FireHotspot.is_custom == True).delete()
    db.commit()
    return {"message": "Custom sandbox fires cleared successfully"}

@router.post("/key")
def update_firms_key(key: str, db: Session = Depends(get_db)):
    """
    Update the NASA FIRMS API key dynamically in memory.
    Clears all existing fire hotspots and triggers an immediate sync from real satellites.
    """
    import re
    stripped_key = key.strip()
    
    # If the key is empty, we revert to simulated feed
    if not stripped_key:
        settings.NASA_FIRMS_API_KEY = ""
        db.query(FireHotspot).delete()
        db.commit()
        
        # Seed with simulated fires
        new_fires = fetch_active_fires()
        for f in new_fires:
            db_f = FireHotspot(
                latitude=f["latitude"],
                longitude=f["longitude"],
                frp=f["frp"],
                acq_time=f["acq_time"],
                is_custom=False
            )
            db.add(db_f)
        db.commit()
        
        return {
            "status": "Success",
            "message": "NASA FIRMS API key cleared. Reverted to simulated active fires.",
            "fires_synced": len(new_fires)
        }
        
    # Format validation: must be 32 alphanumeric characters
    if not re.match(r"^[a-zA-Z0-9]{32}$", stripped_key):
        raise HTTPException(status_code=400, detail="NASA FIRMS API key must be exactly 32 alphanumeric characters.")
        
    try:
        # Verify the key with real API before committing any state changes
        new_fires = fetch_active_fires(api_key=stripped_key, raise_on_error=True)
        
        # If verification succeeded, save key and clear/refresh DB
        settings.NASA_FIRMS_API_KEY = stripped_key
        db.query(FireHotspot).delete()
        db.commit()
        
        for f in new_fires:
            db_f = FireHotspot(
                latitude=f["latitude"],
                longitude=f["longitude"],
                frp=f["frp"],
                acq_time=f["acq_time"],
                is_custom=False
            )
            db.add(db_f)
        db.commit()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to verify API key: {e}")
        
    return {
        "status": "Success",
        "message": "NASA FIRMS API key registered. Synchronized active fires.",
        "fires_synced": len(new_fires)
    }
