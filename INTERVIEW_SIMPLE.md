# Smoke Horizon — Simple Interview Answers

---

## 1. What the Project Does

> "Smoke Horizon is an air quality forecasting tool for Delhi. Every winter, farmers in Punjab and Haryana burn crop stubble, and the smoke drifts southeast into Delhi, making the air dangerously unhealthy. My system tracks those fires using satellite data and predicts how the smoke will travel and how bad the air quality will get in Delhi — up to two days in advance. It also lets users pin their home or school and get a personalized risk score based on their health sensitivity."

---

## 2. What Problem It Solves

Most air quality apps tell you the air *is* bad right now. They're reactive — by the time you see a red AQI number, you've already been breathing it.

Smoke Horizon is predictive. It says "the air is going to be bad in 18 hours, here's when the smoke arrives, here's what you should do." That advance warning is the real value — parents can keep kids indoors, hospitals can prepare, people with asthma can plan their day.

The target user is anyone in Delhi-NCR during the October-November stubble burning season, especially vulnerable groups like children, elderly, and people with respiratory conditions.

---

## 3. What Makes It Different

| Existing Apps | Smoke Horizon |
|---|---|
| Tell you current AQI | Predicts AQI 48 hours ahead |
| Generic — same reading for whole city | Personalized to your exact location |
| Don't tell you *why* the air is bad | Shows which fires are causing it and when the smoke arrives |
| No actionable advice | Gives specific guidance based on your health profile |
| No advance alerts | SMS alerts before conditions worsen |

The unique angle: it's not just a monitoring tool — it's an early warning system with source attribution. You can see exactly which fires are heading toward you and when the smoke will arrive.

---

## 4. Why I Built It This Way

| Choice | Simple Reason |
|---|---|
| **React + Vite** | Fast to develop, hot-reload lets me see changes instantly, and the component structure keeps the UI organized. |
| **FastAPI (Python)** | Python has the best libraries for scientific computing and atmospheric modeling, and FastAPI makes it easy to build a clean API on top. |
| **SQLite** | Simple, no setup needed, perfect for a prototype — just a file, no server to run. |
| **Canvas map (not Google Maps)** | I needed to draw hundreds of animated smoke particles at smooth frame rates. Standard map tools can't do that. |
| **Custom physics model** | No existing API gives source-specific smoke transport predictions for this corridor. I had to build the core science myself. |
| **Twilio SMS** | Reliable, easy to integrate, and works with any phone number — no app installation needed for the user. |

---

## 5. My Role and What I Actually Did

> "This is a solo project — I built everything end to end."

Specifically:
- Designed and implemented the **atmospheric smoke transport model** from scratch, using published scientific literature for the physics
- Built the **full backend API** — data ingestion from satellite and weather APIs, forecast computation, alert system, personalized scoring
- Built the **entire frontend** — interactive map with real-time particle visualization, timeline scrubber, dashboards, report generation
- Integrated **real external data sources** — NASA FIRMS for fire satellites, Open-Meteo for weather, Twilio for SMS alerts
- Made it work **without any API keys** by building a realistic simulation mode using actual historical satellite data

---

## 6. Common Interview Questions

### "Tell me about this project"

> "Smoke Horizon is a predictive air quality dashboard for Delhi. It tracks agricultural stubble fires in Punjab and Haryana using satellite data, then uses a custom atmospheric model to forecast how smoke will travel and impact Delhi's air quality up to 48 hours ahead. Users can pin their specific location and get personalized risk scores based on their health sensitivity, and receive advance SMS alerts before conditions worsen."

### "What was your role?"

> "I built this entirely on my own — from the physics model to the API to the frontend. I designed the data pipeline, chose the tech stack, implemented the atmospheric transport simulation, built the interactive map visualization, and integrated real satellite and weather data sources."

### "What challenges did you face?"

> "The biggest challenge was getting the smoke transport model right. Early on, the smoke was moving in the wrong direction because of a coordinate system mismatch — meteorological wind direction and mathematical angles use opposite conventions. I spent hours debugging before realizing the wind vectors were flipped 180 degrees. I fixed it by adding a unit test that validates the direction of drift for known wind inputs, and I've been careful about coordinate conventions ever since."

### "What would you improve with more time?"

> "Three things. First, I'd replace the simulated backtest with real validation against historical air quality data from CPCB ground stations — that would prove the model's accuracy rather than just demonstrating the interface. Second, I'd add a backend scheduler so alerts work even when the dashboard isn't open in a browser. Third, I'd upgrade the transport model from 2D to 3D to account for vertical mixing and terrain effects, which would improve accuracy during strong winter inversions."

### "What did you learn?"

> "Two big things. First, coordinate systems are the most dangerous class of bug in geospatial software — the results look plausible but are completely wrong. Now I always write a directional unit test first. Second, building something for real users taught me the value of graceful degradation — the system works without a satellite API key, without live weather data, and outside the burning season. That fallback thinking made the whole system more robust."

### "How is this useful in the real world?"

> "Delhi's air quality crisis affects over 20 million people every winter. Stubble burning contributes an estimated 30-40% of Delhi's peak PM2.5 during October-November. Right now, people have no advance warning — they find out the air is bad when they step outside. This tool gives them 18-48 hours of lead time to plan their day, protect vulnerable family members, and take precautions. Hospitals and schools could use it to make operational decisions."

---

## 7. A Good "Challenge I Faced" Story

**The Problem:**
Early in development, the smoke transport model was broken. I had 20+ active fires in Punjab, and the wind was blowing from the northwest — exactly the direction that should carry smoke toward Delhi. But the forecast kept showing zero smoke reaching Delhi. The particles on the map were flying off to the southwest, completely the wrong way.

**What I Did:**
I added debug logging to trace individual smoke particles. I found that a wind direction of 315 degrees (from the northwest) was being treated as blowing *toward* the northwest, when it should blow *toward* the southeast. The problem was a classic coordinate system mismatch — meteorological convention says "wind from 315" means coming from the northwest, but my code was treating it as going to the northwest.

**The Fix:**
I added a 180-degree offset to convert the "from" direction to a "to" direction before computing the drift vector. Then I wrote a unit test that checks: if wind comes from the west, particles should move east; if wind comes from the north, particles should move south. That test now catches this class of bug instantly.

**What I Learned:**
Coordinate system bugs are the most dangerous bugs in geospatial work because the results look plausible — the smoke is moving, it's just going the wrong way. Now I always start with a simple directional sanity test before building anything more complex.
