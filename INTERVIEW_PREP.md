# Smoke Horizon — Interview Prep Document

---

## 1. 60-Second Verbal Summary

> "Smoke Horizon is a real-time air quality forecasting system that predicts how agricultural stubble fires in Punjab and Haryana affect air quality in Delhi-NCR, up to 48 hours in advance.
>
> It works by combining live satellite fire detection from NASA FIRMS with a custom atmospheric transport model — essentially tracking how wind carries smoke particles from each fire toward Delhi, adjusting for boundary layer height, humidity, rain washout, and secondary aerosol formation.
>
> The system also gives users a personalized exposure score for specific locations like their home, school, or hospital, based on their health sensitivity — and can send advance SMS alerts when forecasted pollution crosses their threshold.
>
> The core differentiator versus existing AQI apps is that this is *predictive* rather than *reactive* — it tells you the air quality is about to get bad, not that it already is."

---

## 2. Tech Stack Justification

### Backend

| Technology | Why Chosen | Realistic Alternatives | Why Not Those |
|---|---|---|---|
| **FastAPI** | Async-native, automatic OpenAPI docs, Pydantic v2 validation built-in. The physics computation is CPU-bound but the API surface is I/O-heavy (satellite fetches, weather API calls, Twilio), so async helps on the network side. Type hints throughout the codebase integrate directly with Pydantic models. | Flask, Django, Django REST Framework, Starlette directly | Flask lacks native async and automatic request validation — would need Flask-RESTx + Marshmallow for equivalent features. Django is heavier (ORM migrations, admin) for a single-purpose scientific API. Starlette is viable but FastAPI adds validation/schema layer on top for free. |
| **SQLite + SQLAlchemy** | Single-user/prototype scope. Zero operational overhead — no server process, no config. SQLAlchemy gives ORM ergonomics (relationships, sessions, migrations-ready) without the PostgreSQL commitment. The `check_same_thread=False` flag handles FastAPI's threaded request model. | PostgreSQL + psycopg2, MongoDB, DuckDB, flat files | PostgreSQL is overkill for a prototype with ~5 tables and <1000 rows. MongoDB would lose the relational integrity between fire hotspots and forecast runs. DuckDB is OLAP-optimized but SQLAlchemy doesn't have mature DuckDB dialect support. |
| **Pydantic v2 + pydantic-settings** | Request/response validation is critical when accepting geospatial data (lat/lon bounds, E.164 phone format, metric enums). `pydantic-settings` loads `.env` with type coercion — no manual `os.getenv` + casting. | Cerberus, attrs, manual validation | Cerberus is older, less typed. attrs doesn't generate JSON Schema. Manual validation is error-prone and doesn't integrate with FastAPI's OpenAPI generation. |
| **Uvicorn** | ASGI server designed for FastAPI. Handles WebSocket upgrade if needed later. Production-grade despite being a dev server. | Gunicorn + Uvicorn workers, Hypercorn, daphne | Gunicorn is WSGI — needs Uvicorn workers anyway for async. Hypercorn has less community support. Daphne is Django Channels-focused. |
| **Twilio (pinned ==9.3.7)** | SMS delivery with worldwide number support. No WhatsApp Business API needed for basic SMS. Pinned version avoids breaking changes in Twilio SDK v10. | Firebase Cloud Messaging, AWS SNS, Vonage, direct carrier SMPP | FCM is push-notification only (app required). AWS SNS adds AWS account complexity. Vonage has fewer India numbers. SMPP requires carrier agreements. |

### Frontend

| Technology | Why Chosen | Realistic Alternatives | Why Not Those |
|---|---|---|---|
| **Vite 8** | Sub-second HMR, native ESM dev server, zero-config for React. Faster cold starts than Webpack. Uses Rollup for production builds. | CRA (deprecated), Webpack 5, Parcel, Turbopack | CRA is officially deprecated. Webpack 5 has slower HMR and requires manual config. Parcel has less predictable tree-shaking. Turbopack is still beta. |
| **React 19** | Latest concurrent features, `use()` hook for data loading, improved Suspense boundaries. The lazy-loading `LazySection` component leverages React's concurrent rendering for non-blocking section loads. | React 18, Preact, Svelte, Vue 3 | React 18 lacks some 19 APIs but would work. Preact has ecosystem incompatibilities. Svelte/Vue would require rewriting all 19 components. |
| **Canvas API (custom, no Leaflet tile rendering)** | The map uses `<canvas>` directly with Mercator projection for full control over particle rendering, wind vectors, and fire markers at 60fps. React-Leaflet is imported but the actual rendering is canvas-based via a Web Worker. | Leaflet with React-Leaflet tile layer, Mapbox GL JS, Deck.gl, Google Maps | Tile-based mapping (Leaflet tiles) can't do per-particle rendering at 60fps. Mapbox GL JS is proprietary and adds cost. Deck.gl is excellent but adds a heavy dependency for a single map view. The canvas approach keeps the bundle smaller and gives pixel-level control. |
| **Recharts** | Declarative React charting for the timeline scrubber and backtest modal. Used for AreaChart (PM2.5 timeline) and LineChart (backtest validation). | D3.js directly, Chart.js, Victory, Visx | D3 is imperative — would require manual DOM management. Chart.js doesn't integrate natively with React. Victory has a larger bundle. Visx is lower-level (more work for same result). |
| **Three.js + React Three Fiber** | Listed in dependencies but lightly used — reserved for potential 3D globe visualization. The `react-globe.gl` component depends on Three.js. | Deck.gl globe, CesiumJS | CesiumJS is very heavy. Deck.gl globe is newer and less documented for 3D earth views. |
| **GSAP** | Scroll-triggered animations in the HowItWorks section (pipeline reveal). More reliable cross-browser than CSS scroll-timeline. | Framer Motion, CSS animations, IntersectionObserver only | Framer Motion is primarily for component-level animation, not scroll-linked sequencing. CSS scroll-timeline is not yet universally supported. |
| **Lottie-react** | Animated SVG icons in the hero section for ambient visual effects. | CSS animations, SVG SMIL, GIF | CSS animations can't do complex path morphing. SVG SMIL is deprecated in some browsers. GIF loses quality at scale. |

---

## 3. Architecture Deep-Dive Questions

### Q1: Walk me through the full request lifecycle when a user opens the dashboard and clicks "Play" on the timeline.

**Answer:** When the dashboard mounts, `App.jsx` calls `loadForecastData()`, which fires `GET /api/forecast/`. On the backend, `routes_forecast.py` orchestrates a 5-step pipeline:

1. Query SQLite for fire hotspots within 36h
2. `fetch_spatial_weather_forecast()` calls Open-Meteo's multi-station API for 5 geographic stations (Amritsar, Punjab, Hisar, Haryana, Delhi) — returns 48 hourly steps with wind, humidity, PBLH, precipitation, temperature per station
3. `get_cloud_coverage()` checks satellite visibility; if >40%, `handle_cloud_gaps()` backfills historical fires within 24h to compensate
4. `calculate_dispersion()` runs the Lagrangian puff model: for each fire × each emission hour, advects puffs through the spatially-varying wind field using IDW interpolation, applies humidity decay, computes Gaussian concentration at Delhi receptor, applies boundary layer trapping and SOA enhancement
5. `calculate_composite_risk()` maps the smoke PM2.5 + baseline PM2.5 to Indian National AQI breakpoints and risk scores

The response includes per-hour timeline data with particle positions, which the frontend renders on a `<canvas>` via `MapView.jsx`. When the user hits Play, `RiskTimeline.jsx` advances `currentHour` at 25fps (40ms intervals), and `getInterpolatedHourData()` linearly interpolates between hourly snapshots — including particle positions — for smooth 60fps animation on the canvas.

### Q2: How does the Lagrangian puff transport model actually work, and what makes it physically grounded?

**Answer:** The model is in `transport_model.py`. For each forecast hour H, for each fire source F, it considers every emission hour E from 0 to H:

- A diurnal emission weight scales the fire's output (crop fires peak 11:00-15:00 IST, per field observations)
- The puff is advected hour-by-hour from F's location using IDW-interpolated wind vectors at the puff's current position — not the fire's position. This means the puff path curves as it passes through different wind fields
- At each advection step, humidity decay (via `get_hourly_decay_factor()`) reduces the smoke mass based on three regimes: dry deposition, hygroscopic settling above 75% RH, and rain washout using the Croft et al. 2009 scavenging coefficient
- At hour H, the puff's distance to Delhi is computed, and a 2D Gaussian kernel gives the concentration contribution: `C = M / (2πσ²) × exp(-r² / 2σ²)` where σ = 6.0 + 1.8 × travel_hours, tuned to match CALIPSO lidar observations of plume width in the Punjab→Delhi corridor
- Boundary layer multiplier scales the concentration inversely with PBLH (well-mixed layer assumption), with a non-linear regime below 300m for Delhi winter inversions
- Secondary aerosol enhancement (1.05× night to 1.55× peak daytime) accounts for SOA formation during transit

The model is "physically grounded" because every parameterization references published literature: Wiedinmyer et al. 2011 for emission factors, Pathak et al. 2012 for SOA, Croft et al. 2009 for rain scavenging, Petters & Kreidenweis 2007 for hygroscopic growth.

### Q3: How do you interpolate weather conditions at arbitrary locations along the puff path?

**Answer:** `interpolate_weather_at_location()` in `transport_model.py` uses Inverse Distance Weighting (IDW) with power=2 across the 5-station network. For any lat/lon along the puff trajectory, it computes the Euclidean distance (converted from degrees using 111 km/deg lat, 96 km/deg lon at 30°N) to each station, weights each station by 1/d², and produces a weighted average of wind speed, RH, PBLH, precipitation, and temperature. For wind direction specifically, it uses circular mean — converting each direction to unit vector components (sin/cos), weighting those, and recovering the angle via atan2. This avoids the 359°→1° averaging problem. There's a 0.2 km minimum distance guard to prevent division by zero when a puff is very close to a station.

### Q4: What's the data flow between the frontend canvas map and the backend forecast?

**Answer:** The backend returns a timeline of 48 hourly steps, each containing a `particles` array with `{id, lat, lon, density, age}` for every visible puff. `MapView.jsx` renders these on a `<canvas>` element using a custom Mercator projection function. The canvas uses a Web Worker (`mapWorker.js`) to pre-render the India dot-grid background as an `ImageBitmap` — this keeps the main thread free for particle rendering. The main canvas draws fire markers as FRP-colored circles and particles as density-scaled circles with age-based opacity. A `requestAnimationFrame` loop redraws at display refresh rate. The connecting arc from Punjab to Delhi uses a quadratic bezier curve. When the user scrubs the timeline, `getInterpolatedHourData()` in `App.jsx` linearly interpolates particle positions between adjacent hourly snapshots, including circular interpolation for wind direction, so the visualization never stutters between keyframes.

### Q5: How does the alert system avoid sending duplicate messages, and what's the architectural tradeoff?

**Answer:** The deduplication is in `routes_alerts.py`. After an alert is sent, `last_alert_sent_at` is set immediately (before the background SMS task fires) to prevent race conditions. The `should_alert()` function checks if 12 hours have elapsed since the last send. This means during a sustained 48-hour smoke event, the user gets an alert roughly every 12 hours — enough to stay informed, not enough to spam.

The tradeoff is that this is **time-based deduplication, not severity-based**. If conditions worsen from "Moderate" to "Severe" within 12 hours, the user doesn't get an escalation alert. A more sophisticated approach would track the peak value per alert window and re-alert if the new peak exceeds the previous by a meaningful margin. But that adds state complexity and the risk of alert fatigue. For an MVP, 12-hour cooldown is the right balance.

The `last_alert_sent_at` update happening *before* the background task is intentional: it marks the intent to send, not the delivery confirmation. If the Twilio call fails, the user doesn't get re-alerted for 12 hours — which is acceptable for an MVP but would need a retry/compensation mechanism in production.

### Q6: How does the exposure score system work for personalized locations?

**Answer:** The exposure score (`exposure_score.py`) takes a user-pinned lat/lon and a sensitivity profile (child, elderly, asthma/COPD, outdoor worker, adult). It estimates PM2.5 at that location by taking the Delhi timeline's smoke signal and attenuating it based on: (a) haversine distance from the pin to Delhi using a Gaussian spatial factor (σ=65km), so a pin 50km from Delhi gets ~74% of Delhi's signal, (b) proximity to active fires — if a pin is within 80km of a fire, it gets a direct source boost proportional to the fire's FRP, and (c) wind alignment from Punjab toward the pin.

The raw score is `100 × (peak_pm25 / (safe_limit × 6))` where `safe_limit` varies by sensitivity profile (12 µg/m³ for asthma/COPD, 25 for adults, per WHO 2021 AQG). This is multiplied by a sensitivity factor (1.0 to 1.8), capped at 100.

The key architectural decision: the frontend sends the *already-computed* forecast timeline to the `/api/exposure/score` endpoint rather than having the backend re-run the transport model per pin. This avoids O(pins × fires × hours) recomputation. The tradeoff is that the per-pin PM2.5 estimate is a first-order approximation (spatial scaling of Delhi's signal) rather than running the full Lagrangian model with each pin as a receptor. The module is designed so `_interpolate_pm25_at_location` can be upgraded to run a per-pin transport calculation when needed.

### Q7: What happens when there's no NASA FIRMS API key, and how does the fallback simulation work?

**Answer:** When `NASA_FIRMS_API_KEY` is empty (the default), `firms_client.py` enters simulation mode. It maintains a hardcoded dataset of 25 real MODIS/VIIRS-detected crop burning coordinates from November 2025 — actual lat/lon and FRP values from real satellite observations in Punjab/Haryana districts (Firozpur, Sangrur, Patiala, Moga, etc.).

The simulation seeds `random` with the current date's ordinal, so the same set of fires appears all day but changes daily. It selects 18-25 fires randomly, adds sub-kilometer spatial noise (±0.005°) and ±10 MW FRP noise to avoid static repetition, and spreads acquisition times from 14h before now to 30h ahead — simulating fires igniting progressively through the forecast window.

This gives the demo realistic-looking fire patterns that match actual stubble burning geography without requiring a live API key. When a user provides a valid FIRMS key via the settings panel, the system validates it against the API, clears the database, and re-seeds with real-time satellite data.

### Q8: How do you handle the PM2.5 to AQI conversion, and is it accurate?

**Answer:** The `pm25_to_aqi()` function in `composite_score.py` implements the Indian National AQI breakpoint table for PM2.5 (24-hour average). It uses piecewise linear interpolation between 6 breakpoint ranges: Good (0-30 µg/m³ → AQI 0-50), Satisfactory (31-60 → 51-100), Moderate (61-90 → 101-200), Poor (91-120 → 201-300), Very Poor (121-250 → 301-400), and Severe (250+ → 401-500). These breakpoints come from the Central Pollution Control Board (CPCB) National Air Quality Index standard.

The conversion is accurate for the standard formula. The limitation is that it treats the forecasted 1-hour PM2.5 as if it were a 24-hour average — the CPCB formula is designed for 24h averaging. During a smoke event, the 1-hour peak will map to a higher AQI than the 24h average would, which is actually more conservative (better safe than sorry for health warnings). This is a deliberate overestimation for public health messaging.

---

## 4. "Why Did You Do X and Not Y" Questions

### Q1: Why did you use a Lagrangian puff model instead of a Gaussian plume model or a CFD simulation?

**Answer:** A standard Gaussian plume model assumes steady-state winds and a single source — it works for continuous point sources like a factory chimney, but stubble burning is episodic, spatially distributed, and the wind field changes hourly. A CFD simulation (like WRF-Chem or CMAQ) would be more accurate but requires gridded meteorological input data, runs on HPC clusters, and takes hours to produce a forecast — not suitable for a real-time interactive dashboard.

The Lagrangian puff model is the right middle ground: it handles multiple sources, time-varying winds, and spatially-varying meteorology while running in under a second on a single CPU core. Each "puff" is an independent air parcel that can be tracked through the wind field, so the model naturally handles curved transport paths (e.g., wind shifting from NW to NE mid-transit). The Gaussian kernel at the receptor is just for computing concentration — the transport itself is fully Lagrangian.

The tradeoff is accuracy: this is a 2D surface-level model (no vertical transport, no terrain effects, no chemistry beyond SOA enhancement factors). For a real deployment, you'd couple this with WRF for 3D meteorology. But for an interactive MVP that needs sub-second response times, the puff model is the right engineering choice.

### Q2: Why did you use SQLite instead of PostgreSQL?

**Answer:** This is a prototype/portfolio project serving a single user at a time. SQLite gives zero-config persistence — no database server to install, configure, or maintain. The `db.sqlite3` file just sits in the project directory. SQLAlchemy's `check_same_thread=False` handles FastAPI's async request model.

The data model is simple: 5 tables, no complex joins, no concurrent writes. The largest table (fire_hotspots) will have at most a few hundred rows. SQLite handles this trivially.

If this were deployed for multiple concurrent users, I'd switch to PostgreSQL with connection pooling (asyncpg + SQLAlchemy async engine). The migration would be minimal because the ORM abstracts the dialect — the only code change would be the `DATABASE_URL` and removing the `check_same_thread` flag. The schema is already compatible with PostgreSQL (no SQLite-specific types used).

### Q3: Why did you build a custom canvas map instead of using Mapbox/Google Maps/Leaflet tiles?

**Answer:** The core requirement is rendering hundreds of animated particles at 60fps overlaid on a geographic map. Tile-based maps (Leaflet, Google Maps) render on a separate compositing layer — you'd need to synchronize the tile layer's zoom/pan with an overlay canvas, handle tile loading races, and deal with WebGL context limits.

By building the entire map on a single `<canvas>` with custom Mercator projection, I have full control over the render loop. The India dot-grid background is pre-rendered once in a Web Worker as an `ImageBitmap`, then blitted to the main canvas each frame. Particles, fire markers, wind arrows, and the source-to-Delhi arc are all drawn in the same render pass. This means zero layer synchronization issues and consistent 60fps regardless of zoom level.

The tradeoff: I lose built-in tile imagery, smooth zoom, and geographic tools (distance measurement, etc.). For a production deployment, I'd probably use Deck.gl's `BitmapLayer` for the base map and `ScatterplotLayer` for particles — getting the same performance with better geographic fidelity. But for an MVP, the canvas approach is faster to build and lighter to ship.

### Q4: Why are alerts triggered from the frontend rather than running a backend cron job?

**Answer:** The `/api/alerts/check-and-send` endpoint is called by the frontend after each forecast refresh, passing the current timeline. This is a pragmatic design choice for the prototype:

1. The forecast is already computed and available in the frontend — passing it avoids the backend recomputing it just to check thresholds
2. It eliminates the need for a scheduler (APScheduler, Celery Beat, cron) which adds operational complexity
3. The frontend is the only "always-on" component — if the browser tab is open, alerts are checked every ~60 seconds

The obvious limitation: alerts only fire while someone has the dashboard open. In production, I'd add a backend scheduler (FastAPI + APScheduler or a separate cron job) that runs `check_and_send_alerts` independently. The endpoint already supports this — it just needs a timeline input, which the scheduler would compute by calling the forecast logic directly. The architecture is already decoupled for this migration.

### Q5: Why do you pass the forecast timeline from frontend to backend for pin scoring instead of having the backend recompute it?

**Answer:** The exposure scoring endpoint (`POST /api/exposure/score`) accepts the timeline as a request body. This avoids recomputing the full Lagrangian transport model (48 hours × N fires × M emission hours) per scoring request. With 20 active fires and 48 forecast hours, that's potentially 48 × 20 × 48 = 46,080 puff advections, each involving multiple IDW interpolations. Running this once for the main forecast and reusing the result for all pin calculations reduces the per-request cost from O(fires × hours²) to O(pins × hours).

The tradeoff is that the pin scoring uses a spatial approximation (scaling Delhi's signal by distance) rather than running the full model with each pin as a receptor. This is accurate to within ~30% for locations within 150km of Delhi — which covers the entire target region. For a multi-receptor production version, I'd cache the wind field and puff trajectories, then only recompute the Gaussian concentration at each new receptor point, which is O(1) per puff-receptor pair.

### Q6: Why use a 12-hour deduplication window for alerts?

**Answer:** Stubble burning smoke events typically last 2-5 days. During such an event, the user doesn't need to be told every hour that it's bad — they already know. But they do need escalation if conditions worsen significantly. The 12-hour window balances these: it re-alerts once in the morning and once in the evening, which aligns with when people make outdoor activity decisions.

A shorter window (e.g., 4 hours) risks alert fatigue — users start ignoring the notifications. A longer window (24 hours) misses overnight deterioration (a common pattern in Delhi, where PBLH drops at night, trapping more smoke). The 12-hour choice is based on the diurnal cycle of Delhi's boundary layer — the morning (06:00-09:00 IST) and evening (18:00-22:00 IST) peaks are when conditions are worst.

In a more sophisticated version, I'd track the severity delta: re-alert if the forecasted peak increases by >30% from the last alert, even within the 12-hour window. The current approach doesn't do this.

### Q7: Why did you implement source attribution as a separate module from the transport model?

**Answer:** The transport model (`transport_model.py`) computes total smoke PM2.5 at Delhi — it doesn't attribute which fraction comes from fires vs urban sources. The source attribution module (`sourceAttribution.js` in the frontend) answers a different question: "What percentage of the current PM2.5 is from stubble burning vs other sources?"

It uses a back-trajectory approximation: for each active fire, it scores the influence based on FRP intensity, wind alignment (cosine of bearing difference), distance decay (Gaussian σ=250km), recency, and seasonal weight. The stubble fraction is capped at 80% in peak season, 65% normally, 20% off-season — because even in stubble season, Delhi always has baseline urban pollution.

Keeping these separate makes sense because they serve different UI purposes: the transport model drives the forecast timeline and particle visualization, while source attribution drives the donut chart and confidence badge. They could share more code (the wind alignment and distance calculations are duplicated), but the coupling would complicate independent evolution.

### Q8: Why use a Web Worker for the map background instead of rendering it on the main thread?

**Answer:** The India dot-grid map renders ~2,000 dots at startup, each requiring a Mercator projection calculation and a point-in-polygon test against the India GeoJSON boundaries. On a slow machine, this could block the main thread for 50-100ms, causing visible jank during the initial dashboard load.

By offloading this to a Web Worker (`mapWorker.js`), the projection and PIP classification happen off-thread. The worker renders the dots to an `OffscreenCanvas`, converts the result to an `ImageBitmap`, and transfers it back via `postMessage` with transferable — zero-copy. The main thread just blits this pre-rendered image each frame, adding negligible overhead.

The worker also handles the geographic coloring logic: Punjab/Haryana dots are amber, Delhi dots are risk-colored, transit states (Rajasthan, UP) are blue-gray. This classification requires iterating through the GeoJSON polygons for each dot — expensive on the main thread.

---

## 5. Weakness/Limitation Questions

### Q1: The backtest endpoint generates synthetic data with `random.seed(42)`. How do you validate the model's actual accuracy?

**Answer:** Honest answer: the backtest is currently a demonstration, not a rigorous validation. The R² of 0.88 and MAE are computed from synthetic data generated with a Gaussian bell curve + noise, not from comparing actual model predictions against CPCB ground truth.

What I'd do with more time: pull historical CPCB PM2.5 readings for Delhi (available via their CAAQMS API or OpenAQ), pull historical FIRMS fire data for the same period, run the transport model with those historical inputs, and compare predicted vs actual PM2.5. The model's physical parameterizations are literature-based, so the accuracy depends heavily on how well the emission factors and decay constants match real conditions in the IGP corridor.

I'm aware this is the single biggest credibility gap in the project. For an interview, I'd frame it as: "The physics model is parameterized from published literature. The backtest visualization is a placeholder — the real validation would require running the model against historical CPCB ground truth data, which I haven't done yet."

### Q2: The CORS policy is `allow_origins=["*"]`. Isn't that a security issue?

**Answer:** Yes, it is. In production, I'd restrict `allow_origins` to the specific frontend domain. The wildcard is there for development convenience — the frontend runs on `localhost:5173` and the backend on `localhost:8000`, which are different origins.

Beyond CORS, the API has no authentication at all. Anyone who can reach port 8000 can create fires, subscribe to alerts, and modify the NASA FIRMS key. For a real deployment, I'd add: (a) API key authentication or JWT-based auth, (b) rate limiting on the forecast endpoint (it's computationally expensive), (c) input sanitization for the Twilio phone numbers (E.164 validation exists but there's no verification that the number is actually the user's).

### Q3: The Lagrangian model is 2D — it doesn't account for vertical transport, terrain, or chemical reactions. How does that limit accuracy?

**Answer:** Significantly, in specific scenarios:

- **Terrain effects:** The Punjab→Delhi corridor is mostly flat Indo-Gangetic Plain, so 2D is acceptable. But if fires occur near the Shivalik foothills (northern Punjab), the model would miss terrain-channeling effects
- **Vertical mixing:** The boundary layer multiplier is a 1D approximation of 3D mixing. During strong inversions (common in Delhi winters), the actual concentration profile is highly non-uniform vertically — surface-level PM2.5 could be 3-5× the column-averaged value. The current model's 3.0× cap is conservative but not physics-based
- **Chemistry:** The SOA enhancement factor (1.05-1.55×) is a lookup table, not a chemical mechanism. Real SOA formation depends on VOC emissions, NOx levels, temperature, UV radiation, and aerosol surface area — none of which are modeled
- **Wet deposition:** The Croft et al. scavenging coefficient assumes below-cloud washout only — it doesn't handle in-cloud scavenging, which is significant during monsoon-season storms

The impact: the model probably overestimates during clear-sky calm conditions (no vertical mixing correction) and underestimates during heavy rain events (no in-cloud scavenging). For the MVP's purpose — giving a 48-hour advance warning with a risk level (Low/Moderate/High) rather than a precise µg/m³ forecast — these limitations are acceptable.

### Q4: You use `datetime.datetime.utcnow()` everywhere, which is deprecated in Python 3.12+. How would you fix this?

**Answer:** `utcnow()` returns a naive datetime (no timezone info), which can cause bugs when mixing with timezone-aware datetimes (e.g., from the Open-Meteo API or JavaScript's `Date`). The fix is to use `datetime.datetime.now(datetime.timezone.utc)` or, better, the `zoneinfo` module with `"Asia/Kolkata"` for IST conversions.

The scope of this fix: it affects every file in the backend — `models.py` (defaults), `routes_forecast.py`, `routes_alerts.py`, `transport_model.py`, `cpcb_client.py`, `cloud_mask_client.py`, `firms_client.py`, and `exposure_score.py`. I'd also need to update all `fromisoformat()` parsing to handle timezone offsets properly.

This is a known technical debt item. For a prototype it works because everything runs in a single timezone context. But mixing naive UTC datetimes with ISO strings that might carry `+00:00` offsets is a latent bug.

### Q5: The `/api/exposure/score/{pin_id}` endpoint recomputes the full forecast for a single pin refresh. Isn't that wasteful?

**Answer:** Yes. The `_run_forecast()` helper in `routes_exposure.py` duplicates the entire forecast pipeline (fire query → weather fetch → cloud check → dispersion → composite risk) just to score one pin. This means a single pin refresh triggers a new Open-Meteo API call, which takes ~200ms, plus the dispersion computation.

The better design would be to cache the last forecast result (in-memory TTL cache or a `ForecastRun` table row) and have the single-pin endpoint read from cache rather than recomputing. The `ForecastRun` model already exists in `db/models.py` but isn't being written to — it's defined but never used. I'd write each forecast run to the DB, then have pin scoring query the latest cached run.

### Q6: How would the system handle 100+ active fires simultaneously?

**Answer:** The dispersion model has O(fires × hours²) complexity — for each fire, it advections puffs for every emission hour up to the current target hour. With 100 fires and 48 hours, that's ~100 × 48 × 24 ≈ 115,200 puff advections, each involving IDW interpolation across 5 stations. On current hardware, this would take ~1-2 seconds — still acceptable for a single forecast request, but it wouldn't scale to frequent refreshes.

Optimizations I'd add: (a) spatial clustering — fires within 5km of each other can be merged into a single source with summed FRP, reducing N significantly. (b) Lazy evaluation — only compute puff trajectories for fires within 300km of Delhi (others won't contribute meaningfully). (c) Pre-compute the IDW weights for each station pair and cache them.

---

## 6. Walk Me Through the Hardest Bug

### The Case of the Disappearing Smoke (Wind Direction Coordinate System Mismatch)

**Situation:** During early development, the transport model was producing PM2.5 values of 0.0 for Delhi even with 20+ active fires in Punjab, 300km to the northwest. The particle visualization showed puffs being generated but they weren't reaching Delhi — they were flying off the map to the southwest.

**Investigation:** I added debug logging to trace individual puff trajectories. I found that puffs starting at fire locations near Amritsar (31.6°N, 74.9°E) were being advected toward approximately (25°N, 72°E) — almost due south-southwest, directly away from Delhi. The wind data from Open-Meteo reported wind direction of 315° (from the northwest), which should push smoke *toward* the southeast — toward Delhi.

The root cause was in the `get_wind_vectors()` function. Meteorological wind direction is defined as "where the wind is coming FROM" (315° = from the northwest), but the code was treating it as "where the wind is going TO." This meant a 315° wind was being treated as blowing *toward* the northwest, when it should blow *toward* the southeast (315° + 180° = 135°). The conversion from meteorological convention to Cartesian drift vector was off by 180°.

**Root cause:** The original code had:
```python
math_angle = math.radians(90.0 - wind_dir_deg)
```
This converted the meteorological angle directly to a math angle without the `+180°` correction. The fix was:
```python
blowing_to = (wind_dir_deg + 180) % 360
math_angle = math.radians(90.0 - blowing_to)
```

**Fix:** Added the 180° offset to convert FROM-direction to TO-direction before computing the Cartesian components. Also added a unit test (`test_wind_vectors`) that validates: wind from 270° (west) produces positive vx (eastward), wind from 360° (north) produces negative vy (southward).

**What I learned:** Coordinate system bugs are the most dangerous class of bugs in geospatial software because they produce "plausible but wrong" results. The smoke was going somewhere — just the wrong direction. This taught me to always write a directional unit test first: pick a known wind direction, compute the expected drift, and assert the sign of each component. Also, meteorological conventions (FROM) vs mathematical conventions (TO) are a guaranteed source of bugs in any atmospheric modeling code.

---

## 7. Numbers/Metrics Defense

| Claim | How to Defend It | Risk Level |
|---|---|---|
| **"48-hour forecast"** | The `calculate_dispersion()` function iterates `range(min(48, len(weather_forecast)))` hours. Open-Meteo provides 48h forecasts by default. Defensible. | **Low risk** |
| **"5-station weather network"** | Explicitly defined in `openmeteo_client.py:STATIONS` — Amritsar, Punjab, Hisar, Haryana, Delhi. Count is exact. | **Low risk** |
| **"21 Python files"** | Confirmed by directory listing. Exact count. | **Low risk** |
| **"19 React components"** | Confirmed by directory listing in `components/`. Exact count. | **Low risk** |
| **"15 API endpoints"** | Routes: fires(3), forecast(1), backtest(1), alerts(4), exposure(5), plus root = 15. Exact. | **Low risk** |
| **"R² = 0.88"** | This is HARDCODED in `routes_backtest.py` line `r2_score = 0.88`. It's not computed from actual model validation. **FLAG: This is not defensible as a real metric.** You should either compute it from actual backtesting or label it as "target R²" / "expected R² based on model parameterization." | **HIGH RISK — soften or remove** |
| **"MAE computed from synthetic data"** | The MAE is computed from the synthetic backtest data (random seed 42), not from actual model vs ground truth comparison. Defensible as "synthetic validation MAE" but misleading if presented as real accuracy. **FLAG: Label as synthetic/demo.** | **HIGH RISK — add qualifier** |
| **"Model status: Highly Calibrated"** | This string is hardcoded in `routes_backtest.py`. There's no calibration data. **FLAG: Remove or replace with something honest like "Literature-calibrated parameterization"** | **HIGH RISK — remove** |
| **"60fps canvas rendering"** | The `MapView.jsx` uses `requestAnimationFrame` for the render loop. The particle count varies (could be 0 to 500+). On modern hardware this achieves 60fps, but under load with many particles it may drop. **FLAG: Say "targets 60fps" not "achieves 60fps."** | **Medium risk** |
| **"25fps timeline animation"** | The timeline advances at 40ms intervals = 25fps, confirmed by the `setInterval` in `RiskTimeline.jsx`. Accurate. | **Low risk** |
| **"8.2 MB of GeoJSON"** | File sizes are real — `india-states-simple.json` is 8.2MB on disk. Accurate but the actual transfer size depends on compression (gzip typically reduces JSON by 80%). | **Low risk — but note gzipped size if citing transfer** |
| **"Sensitivity multipliers from WHO/CPCB"** | The specific values (1.55 for children, 1.80 for asthma) are based on WHO/CPCB general guidance on vulnerability ratios, but the exact multipliers are my parameterization, not direct quotations from a specific paper. **FLAG: Say "informed by WHO/CPCB guidelines" not "from WHO/CPCB."** | **Medium risk** |

---

## 8. Scaling/Extension Questions

### Q1: How would this system need to change if deployed for all of India (10× geography, 100× fires)?

**Answer:** Three critical changes:

1. **Database:** SQLite wouldn't handle concurrent writes from multiple users. Switch to PostgreSQL with async SQLAlchemy + connection pooling. Add TimescaleDB extension for time-series queries on forecast runs.

2. **Transport model:** The O(fires × hours²) model would become too slow with 2,500 active fires. I'd add spatial clustering (DBSCAN on fire coordinates, ε=5km) to merge nearby fires, reducing the effective fire count. I'd also add early termination — if a puff is >500km from any receptor and moving away, skip the remaining advection steps. Pre-computing IDW weights for a regular grid would eliminate per-puff interpolation.

3. **Weather data:** The 5-station network covers only Punjab→Delhi. For all-India, I'd need a grid of ~50-100 stations or switch to gridded weather data (e.g., ERA5 reanalysis on a 0.25° grid). The IDW interpolation would need to become a proper objective analysis ( Optimal Interpolation or kriging) to handle the denser network.

4. **Frontend:** The canvas map renders all particles simultaneously. For 100× more particles, I'd need instanced rendering (WebGL) or level-of-detail — showing particles near the user's focus area at full resolution and aggregating distant particles into heat map blobs.

### Q2: How would you add real-time WebSocket updates instead of polling?

**Answer:** The current architecture has the frontend polling `/api/forecast` every 60 seconds (or on demand). For real-time updates:

1. Add a FastAPI WebSocket endpoint `/ws/forecast` that subscribes clients to forecast updates
2. Run the forecast computation in a background task (APScheduler or asyncio task) every N minutes
3. When a new forecast is ready, broadcast the result to all connected WebSocket clients
4. The frontend replaces the `fetchForecast()` polling with a WebSocket connection that receives pushes

The main challenge: the forecast computation takes ~1-2 seconds. During that time, other requests would be blocked if using synchronous SQLAlchemy. Switch to async SQLAlchemy (`AsyncSession` + `create_async_engine` with `aiosqlite` or `asyncpg`) so the forecast computation doesn't block the event loop.

### Q3: What if you needed to support multiple receptor cities (not just Delhi)?

**Answer:** The transport model currently has `DELHI_LAT` and `DELHI_LON` hardcoded as the single receptor. To support multiple cities:

1. Refactor `calculate_dispersion()` to accept a list of receptor coordinates instead of the hardcoded Delhi constants
2. For each puff at each time step, compute Gaussian contributions to ALL receptors (not just Delhi) — this adds a factor of R (number of receptors) to the computation, but since each receptor calculation is O(1) per puff, and R is small (<20 cities), this is negligible
3. The IDW interpolation already works at arbitrary lat/lon, so the wind field is already multi-point
4. Return a dictionary keyed by receptor name instead of a single `delhi_smoke_pm25`

The `routes_exposure.py` already has a `REGIONAL_CITIES` list (Delhi, Ludhiana, Chandigarh, Amritsar, Patiala, Hisar) that does per-city scoring. This is the natural extension point — the scoring logic already supports multiple cities, it just uses a spatial approximation instead of the full transport model.

---

## 9. Comparison to Existing Tools/Frameworks

### Q1: Why didn't you just use SAFAR (System of Air Quality and Weather Forecasting And Research)?

**Answer:** SAFAR is India's official air quality forecasting system, run by IITM Pune under the Ministry of Earth Sciences. It uses WRF-Chem (Weather Research and Forecasting model coupled with chemistry) — a full 3D atmospheric chemistry transport model.

Reasons I built a custom model instead of integrating SAFAR:

1. **SAFAR doesn't have a public API.** Their forecasts are published on safar.tropmet.ac.in as static maps and daily bulletins, not as programmatic data feeds. I can't poll their system for hourly gridded PM2.5 data.
2. **SAFAR's resolution is 10km × 10km grid.** For a user asking "what about my specific home address?", 10km resolution isn't granular enough — PM2.5 can vary significantly within a city due to local traffic, construction, and green cover.
3. **Latency.** SAFAR runs once or twice daily. Smoke Horizon re-computes on every user request with the latest satellite data, which matters when fires are being set and extinguished hourly.

That said, SAFAR is the gold standard for validation. A production version of Smoke Horizon would ideally ingest SAFAR's gridded forecast as a baseline and overlay the high-resolution smoke transport model on top. The `baseline_pm25` from CPCB is already a crude approximation of what SAFAR provides more accurately.

### Q2: Why not use Google Maps Platform or Mapbox for the map?

**Answer:** Cost and control. Google Maps charges $7/1000 map loads for JavaScript API — at 10,000 daily users, that's $2,100/month. Mapbox is cheaper ($5/1000) but still adds up.

More importantly, neither platform gives me the rendering control I need. The particle visualization requires per-frame canvas drawing of hundreds of custom elements with opacity tied to density values. Google Maps' `Marker` API or Mapbox's symbol layers would add ~15ms of DOM overhead per particle, making 60fps impossible.

If deploying to production, I'd consider Mapbox GL JS with a custom WebGL layer (using `mapbox-gl-js`'s `CustomLayerInterface`), which gives GPU-accelerated custom rendering while still providing tile imagery, geocoding, and geofencing. But for an MVP, the custom canvas approach has zero API costs and gives pixel-perfect control.

### Q3: Why not use CMAQ or WRF-Chem for the atmospheric modeling?

**Answer:** CMAQ (Community Multiscale Air Quality) and WRF-Chem are the gold standards for atmospheric chemistry transport modeling. They solve the full Euler equations for atmospheric transport with chemistry, radiation, and deposition.

The practical barriers: (a) They require HPC resources — running WRF-Chem for a 48-hour forecast over the Indo-Gangetic Plain at 4km resolution takes ~2-4 hours on a 64-core cluster. (b) They need gridded emission inventories (FINN, GFED) which have ~3-hour latency — too slow for real-time fire response. (c) Setup and configuration is extremely complex — WRF requires careful nesting, boundary conditions, and physics scheme selection.

The Lagrangian puff model is a deliberate simplification that trades physical accuracy for interactivity. It runs in <2 seconds on a single CPU core and gives results that are directionally correct for the Punjab→Delhi corridor. For the use case of "advance warning to vulnerable populations," a rough-but-fast forecast is more valuable than a precise-but-delayed one.

### Q4: Why not use a pre-built Air Quality API like WAQI or AirVisual?

**Answer:** WAQI (World Air Quality Index) and AirVisual/IQAir provide current and historical AQI data from ground stations. They don't provide source-specific attribution ("what fraction is from stubble burning vs traffic?") or 48-hour predictive forecasts — they report what's happening *now*, not what *will* happen.

Smoke Horizon's core value proposition is source-specific prediction. A WAQI integration would actually be useful as a real-time ground-truth data source (replacing or supplementing the simulated CPCB baseline), but it can't replace the transport model.

The `cpcb_client.py` module is already designed to be swapped for a real CPCB API or WAQI integration — it just needs a `get_baseline_pm25(dt)` function that returns the actual measured background PM2.5 instead of the monthly climatological estimate.

---

## 10. Rapid-Fire Technical Questions

**Q: What wind direction convention does the transport model use?**
A: Meteorological FROM convention. The `get_wind_vectors()` function converts it to TO by adding 180° before computing Cartesian drift components.

**Q: What is the Gaussian sigma formula for the plume spread, and what are the units?**
A: `sigma = 6.0 + 1.8 × travel_hours`, in kilometers. At 10 hours of transit, sigma ≈ 24 km — consistent with CALIPSO lidar observations of plume width in the IGP corridor.

**Q: How does the boundary layer multiplier behave at PBLH = 200m?**
A: It enters the non-linear shallow-BL regime (150m-300m). The formula is `3.0 + (linear_val - 3.0) × t^0.5` where `t = (200-150)/150 ≈ 0.33`, giving approximately 2.3×. This models the strong nocturnal inversion common in Delhi winters.

**Q: What happens if you pass a precipitation value of 5.0 mm/h to the humidity decay function?**
A: The Croft et al. scavenging coefficient becomes `3.4e-4 × 5.0^0.79 ≈ 1.3e-3 s⁻¹`. Hourly loss fraction = `1 - exp(-1.3e-3 × 3600) ≈ 0.99`. This gets clamped to 0.92 (physical maximum), giving a retention factor of 0.08 — meaning 92% of smoke is washed out in one hour of moderate rain.

**Q: What's the diurnal emission weight at 3 AM IST?**
A: 0.07 (7%). The model skips emission hours with weight < 0.08 as negligible, so 3 AM puffs aren't computed at all — an optimization that reduces computation by ~20% since nighttime fires are rare.

**Q: How does the IDW interpolation handle wind direction near 0°/360°?**
A: It converts each station's wind direction to unit vector components (sin/cos of the angle), applies IDW weights to the components, then recovers the angle via `atan2(weighted_sin, weighted_cos) % 360`. This correctly averages directions that cross the 0°/360° boundary (e.g., 350° and 10° average to ~0°, not 180°).

**Q: What AQI value does a PM2.5 of 100 µg/m³ map to?**
A: It falls in the "Poor" breakpoint (91-120 µg/m³ → AQI 201-300). The linear interpolation gives: `201 + (300-201) × (100-91)/(120-91) = 201 + 99 × 9/29 ≈ 231`.

**Q: How does the cloud gap handler decide whether to backfill fires?**
A: If cloud coverage exceeds 40%, it iterates through historical fires (within 24h) and adds any that aren't already in the active list (using a ~5km proximity check). The confidence score is `max(10, 100 - cloud_pct × 0.9)` — at 40% cloud, confidence is 64%; at 90% cloud, confidence drops to 19%.

**Q: What's the SOA enhancement factor for a puff that traveled 8 hours during daytime?**
A: Transit time factor = `min(1.0, (8 - 1.5) / 6.0) = 1.0`. During daytime (11-17 IST), the base is 1.55. So enhancement = `1.0 + (1.55 - 1.0) × 1.0 = 1.55`. The puff's PM2.5 is multiplied by 1.55 to account for secondary organic aerosol formation.

**Q: What's the maximum PM2.5 the model can produce?**
A: 600 µg/m³, hardcoded as the physical cap in `calculate_dispersion()`. This corresponds to the SAFAR extreme event threshold for Delhi. The comment says "SAFAR extreme event ~600 µg/m³ smoke."

**Q: How does the frontend interpolate between timeline hours for smooth animation?**
A: `getInterpolatedHourData()` in `App.jsx` computes a fractional hour index from `currentHour` (which advances at 25fps), then linearly interpolates scalar values (PM2.5, wind speed, AQI) between adjacent hourly steps. For particle positions, it interpolates lat/lon linearly. For wind direction, it uses circular interpolation: converts to unit vectors, interpolates the components, and recovers the angle via atan2.

**Q: What GeoJSON data is loaded, and how is the India boundary used?**
A: Four GeoJSON files exist in `data/`: `india-fast.json` (70KB, used for PIP lookups), `india-simple.json` (1MB), `india-states-simple.json` (8.2MB), and `india-states.json` (13.6MB, full detail). The `india-fast.json` is used by both `geoLocate.js` (ray-casting PIP for state name lookup) and `mapWorker.js` (dot-grid coloring by state).

**Q: What's the TWILIO dedup window, and what happens if the SMS fails?**
A: 12 hours. If the Twilio SMS fails, the `last_alert_sent_at` timestamp is already set (marking intent), so the user won't be retried for 12 hours. The failed attempt is logged. There's no retry queue — this is a known limitation for production.

**Q: How does the map Worker transfer the rendered image back to the main thread?**
A: The worker renders to an `OffscreenCanvas`, calls `canvas.transferToImageBitmap()`, and posts the `ImageBitmap` back via `postMessage` with the bitmap in the transferable list. This is zero-copy — the main thread receives the bitmap without serializing it.
