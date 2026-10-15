# Smoke Horizon: Stubble Burning Forecast System

Smoke Horizon is a real-time predictive dashboard that estimates the downwind PM2.5 impact of agricultural fires in Punjab and Haryana on Delhi-NCR.

## Tech Stack
* **Backend**: FastAPI, SQLite + SQLAlchemy, Uvicorn, Requests.
* **Physics Engine**: Custom 2D transport vector drift model, PBLH (boundary layer) height compression adjustment, relative humidity decay/growth, and satellite cloud mask gap detection.
* **Frontend**: Vite + React, React-Leaflet for mapping, custom sci-fi dark stylesheet, scrubbable 48-hour forecasting timeline.

## Key Features

- **Real-Time Fire Monitoring:** Track agricultural fire activity
  in Punjab and Haryana.
- **PM2.5 Impact Forecasting:** Estimate potential downwind
  pollution impacts on Delhi-NCR.
- **Interactive Map:** Visualize fire locations and
  environmental information.
- **48-Hour Forecast Timeline:** Explore forecast changes
  over time.
- **Environmental Data Integration:** Use available satellite,
  weather, and air-quality data sources.


## Setup Instructions

### Backend Setup
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

### Frontend Setup
1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite React development server:
   ```bash
   npm run dev
   ```
4. Open the browser to the local URL (usually `http://localhost:5173`).
