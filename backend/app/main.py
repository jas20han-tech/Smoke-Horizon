from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.db.session import engine, Base, SessionLocal
from app.db.models import FireHotspot
from app.api import routes_fires, routes_forecast, routes_backtest
from app.data_sources.firms_client import fetch_active_fires

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Smoke Horizon API",
    description="Real-Time crop residue burning transport forecast API",
    version="1.0.0"
)

# CORS configurations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(routes_fires.router)
app.include_router(routes_forecast.router)
app.include_router(routes_backtest.router)

@app.on_event("startup")
def seed_database():
    """
    On application startup, seed the SQLite database with active fires
    if no hotspots are present.
    """
    db = SessionLocal()
    try:
        count = db.query(FireHotspot).count()
        if count == 0:
            logger.info("Database is empty. Fetching initial active fires...")
            initial_fires = fetch_active_fires()
            for f in initial_fires:
                db_f = FireHotspot(
                    latitude=f["latitude"],
                    longitude=f["longitude"],
                    frp=f["frp"],
                    acq_time=f["acq_time"],
                    is_custom=False
                )
                db.add(db_f)
            db.commit()
            logger.info(f"Seeded {len(initial_fires)} initial fire hotspots into the database.")
    except Exception as e:
        logger.error(f"Error seeding database on startup: {e}")
    finally:
        db.close()

@app.get("/")
def read_root():
    return {
        "status": "Online",
        "message": "Smoke Horizon Backend API is operational.",
        "endpoints": {
            "forecast": "/api/forecast",
            "fires": "/api/fires",
            "backtest": "/api/backtest"
        }
    }
