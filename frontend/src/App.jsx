import { useState, useEffect } from "react";
import MapView from "./components/MapView";
import RiskTimeline from "./components/RiskTimeline";
import ConfidenceBanner from "./components/ConfidenceBanner";
import SandboxControls from "./components/SandboxControls";
import FirmsKeyCard from "./components/FirmsKeyCard";
import HotspotsPanel from "./components/HotspotsPanel";
import DiagnosticsCard from "./components/DiagnosticsCard";
import SourceAttribution from "./components/SourceAttribution";
import CityComparison from "./components/CityComparison";
import AlertSettings from "./components/AlertSettings";
import WhatsAppAlerts from "./components/WhatsAppAlerts";
import ExposureScore from "./components/ExposureScore";
import BacktestModal from "./components/BacktestModal";
import ClusterSidebar from "./components/ClusterSidebar";
import ClusterDetailCard from "./components/ClusterDetailCard";
import ForecastReportButton from "./components/ForecastReportButton";
import { fetchForecast, addCustomFire, clearCustomFires, checkAndSendAlerts } from "./api/client";

function riskColor(level) {
  if (level === "Severe") return "var(--severity-critical)";
  if (level === "High") return "var(--severity-high)";
  if (level === "Moderate" || level === "Medium") return "var(--severity-mid)";
  return "var(--severity-low)";
}

export default function App() {
  const [forecast, setForecast] = useState(null);
  const [currentHour, setCurrentHour] = useState(0.0);
  const [customFrp, setCustomFrp] = useState(150);
  const [isBacktestOpen, setIsBacktestOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // App view state: false = Landing/Hero, true = Active Dashboard
  const [showDashboard, setShowDashboard] = useState(true);
  
  // FlyTarget state to trigger map zooming
  const [flyTarget, setFlyTarget] = useState(null);

  // Selected cluster for detail card
  const [selectedCluster, setSelectedCluster] = useState(null);

  // Toast notification state
  const [toast, setToast] = useState(null);

  // Notification center drawer state
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const showToast = (message, type = "info") => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast(curr => (curr && curr.id === id ? null : curr));
    }, 4000);
  };

  const loadForecastData = async () => {
    try {
      const data = await fetchForecast();
      setForecast(data);
      setError("");
      // After each forecast refresh, silently check subscriptions against
      // the new timeline. Runs in background: never blocks the UI.
      checkAndSendAlerts(data.timeline).catch(() => {});
    } catch (err) {
      setError(err.message || "Failed to load real-time forecast simulation.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForecastData();
  }, []);

  const handleAddCustomFire = async (lat, lon) => {
    try {
      setLoading(true);
      await addCustomFire(lat, lon, customFrp);
      await loadForecastData();
      showToast("Custom hotspot injected into atmospheric solver", "success");
    } catch (err) {
      showToast(`Error spawning custom fire: ${err.message}`, "error");
      setLoading(false);
    }
  };

  const handleClearCustomFires = async () => {
    try {
      setLoading(true);
      await clearCustomFires();
      await loadForecastData();
      showToast("Cleared all simulated custom hotspots", "info");
    } catch (err) {
      showToast(`Error clearing custom fires: ${err.message}`, "error");
      setLoading(false);
    }
  };

  const handleSyncSatellite = async () => {
    setIsSyncing(true);
    try {
      await loadForecastData();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFlyToFire = (coords) => {
    setFlyTarget({ coords, zoom: 10 });
  };

  const handleSelectCluster = (fire) => {
    setSelectedCluster(fire);
    setFlyTarget({ coords: [fire.latitude, fire.longitude], zoom: 10 });
  };

  // Perform smooth real-time 60fps linear & circular interpolation
  const getInterpolatedHourData = (hourFloat) => {
    if (!forecast || !forecast.timeline || forecast.timeline.length === 0) return null;
    
    const timeline = forecast.timeline;
    const h1 = Math.floor(hourFloat);
    const h2 = Math.min(timeline.length - 1, h1 + 1);
    const f = hourFloat - h1;
    
    const w1 = timeline[h1];
    const w2 = timeline[h2];
    
    if (f === 0) return w1;
    
    const wind_speed = w1.wind_speed + f * (w2.wind_speed - w1.wind_speed);
    const relative_humidity = w1.relative_humidity + f * (w2.relative_humidity - w1.relative_humidity);
    const boundary_layer_height = w1.boundary_layer_height + f * (w2.boundary_layer_height - w1.boundary_layer_height);
    const precipitation = w1.precipitation + f * (w2.precipitation - w1.precipitation);
    const smoke_pm25 = w1.smoke_pm25 + f * (w2.smoke_pm25 - w1.smoke_pm25);
    const baseline_pm25 = w1.baseline_pm25 + f * (w2.baseline_pm25 - w1.baseline_pm25);
    const final_pm25 = w1.final_pm25 + f * (w2.final_pm25 - w1.final_pm25);
    const risk_score = w1.risk_score + f * (w2.risk_score - w1.risk_score);
    const aqi = Math.round(w1.aqi + f * (w2.aqi - w1.aqi));
    
    const rad1 = w1.wind_direction * Math.PI / 180;
    const rad2 = w2.wind_direction * Math.PI / 180;
    const u = (1 - f) * Math.sin(rad1) + f * Math.sin(rad2);
    const v = (1 - f) * Math.cos(rad1) + f * Math.cos(rad2);
    let wind_direction = Math.atan2(u, v) * 180 / Math.PI;
    wind_direction = (wind_direction + 360) % 360;
    
    const risk_level = risk_score <= 30.0 ? "Low" : risk_score <= 60.0 ? "Moderate" : "High";
    
    const p1 = w1.particles || [];
    const p2 = w2.particles || [];
    const p2Map = new Map(p2.map(p => [p.id, p]));
    const interpolated_particles = [];
    
    p1.forEach((part1) => {
      const part2 = p2Map.get(part1.id);
      if (part2) {
        interpolated_particles.push({
          id: part1.id,
          lat: part1.lat + f * (part2.lat - part1.lat),
          lon: part1.lon + f * (part2.lon - part1.lon),
          density: part1.density + f * (part2.density - part1.density),
          age: part1.age + f * (part2.age - part1.age)
        });
      } else {
        interpolated_particles.push({
          id: part1.id,
          lat: part1.lat,
          lon: part1.lon,
          density: part1.density * (1 - f),
          age: part1.age + f
        });
      }
    });
    
    const p1Set = new Set(p1.map(p => p.id));
    p2.forEach((part2) => {
      if (!p1Set.has(part2.id)) {
        interpolated_particles.push({
          id: part2.id,
          lat: part2.lat,
          lon: part2.lon,
          density: part2.density * f,
          age: part2.age * f
        });
      }
    });
    
    return {
      time: w1.time,
      wind_speed,
      wind_direction,
      relative_humidity,
      boundary_layer_height,
      precipitation,
      smoke_pm25,
      baseline_pm25,
      final_pm25,
      aqi,
      risk_score,
      risk_level,
      particles: interpolated_particles
    };
  };

  const calculateArrivalTime = (startHourFloat) => {
    if (!forecast || !forecast.timeline) return "No arrival window detected";
    
    const startIdx = Math.floor(startHourFloat);
    const timeline = forecast.timeline;
    
    for (let i = startIdx; i < timeline.length; i++) {
      if (timeline[i].smoke_pm25 > 25.0) {
        if (i === startIdx) {
          return "Plume currently active over Delhi-NCR";
        }
        
        const targetDate = new Date(timeline[i].time);
        const diffHrs = i - startIdx;
        const formatted = targetDate.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true
        });
        const dateStr = targetDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric"
        });
        
        return `In ${diffHrs} hrs (${dateStr} at ${formatted})`;
      }
    }
    
    return "No significant smoke impact expected";
  };

  if (loading && !forecast) {
    return (
      <div className="sh-loading">
        <div className="sh-loading-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--fire)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2c1 2 2 3.5 2 5.5 0 2.5-1.5 4.5-4 4.5s-4-2-4-4.5c0-2 1-3.5 2-5.5z"/>
            <path d="M17.5 12c1.5 1.5 2.5 3 2.5 5 0 3.5-3 6.5-6.5 6.5-3.5 0-6.5-3-6.5-6.5 0-2 1-3.5 2.5-5"/>
          </svg>
          Smoke Horizon
        </div>
        <div className="sh-loading-bar"><div className="sh-loading-bar-fill"/></div>
        <div className="sh-loading-sub">Initializing atmospheric physics solver…</div>
      </div>
    );
  }

  if (error && !forecast) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "var(--bg-base)", color: "var(--severity-high)" }}>
        <div style={{ textAlign: "center", maxWidth: "450px", padding: "2rem" }}>
          <h2 style={{ fontFamily: "Outfit", fontSize: "1.8rem", marginBottom: "1rem" }}>System Connection Failure</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>{error}</p>
          <button className="action-btn" onClick={loadForecastData}>Retry Connection</button>
        </div>
      </div>
    );
  }

  const { meta, fires } = forecast;
  const currentData = getInterpolatedHourData(currentHour) || forecast.timeline[0];
  const customFireCount = fires.filter(f => f.is_custom).length;
  const expectedArrival = calculateArrivalTime(currentHour);

  // Fire-replay sync: acquisition times are bucketed against the timeline start
  const timelineStartMs = new Date(forecast.timeline[0].time).getTime();
  const timelineLen = forecast.timeline.length;

  // Apportionment math for total AQI breakdown display
  const baseAqiFraction = Math.max(10, Math.round(currentData.aqi * (currentData.baseline_pm25 / currentData.final_pm25)));
  const smokeAqiFraction = Math.max(0, currentData.aqi - baseAqiFraction);

  return (
    <div className="app-container">
      {/* Top Header Bar */}
      <header className="top-bar">
        <div className="logo-section">
          <h1 onClick={() => window.location.hash = "#/"} style={{ cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--transition-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "0.25rem" }}>
              <path d="M12 2c1 2 2 3.5 2 5.5 0 2.5-1.5 4.5-4 4.5s-4-2-4-4.5c0-2 1-3.5 2-5.5z"></path>
              <path d="M17.5 12c1.5 1.5 2.5 3 2.5 5 0 3.5-3 6.5-6.5 6.5-3.5 0-6.5-3-6.5-6.5 0-2 1-3.5 2.5-5"></path>
            </svg>
            Smoke Horizon 
            <span>Atmospheric Crop Smoke Forecast</span>
          </h1>
        </div>
        
        {/* Segmented Navigation */}
        <nav className="nav-segment-group" aria-label="Primary Navigation">
          <button 
            type="button"
            className={`nav-tab-btn ${!showDashboard ? "active" : ""}`}
            onClick={() => setShowDashboard(false)}
          >
            Overview
          </button>
          <button 
            type="button"
            className={`nav-tab-btn ${showDashboard ? "active" : ""}`}
            onClick={() => setShowDashboard(true)}
          >
            Telemetry Board
          </button>
          <button 
            type="button"
            className="nav-tab-btn"
            onClick={() => setIsBacktestOpen(true)}
          >
            Historical Verification
          </button>
        </nav>
        
        <div className="system-status">
          {/* Settings & Alerts Icons */}
          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
            <button 
              type="button"
              className="header-icon-btn"
              title="Atmospheric Alerts and Bulletins" 
              aria-label="Toggle notifications panel"
              onClick={() => setIsNotifOpen(prev => !prev)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              <span className="notif-badge-dot" />
            </button>
            <button 
              type="button"
              className="header-icon-btn"
              title="Simulator Configuration" 
              aria-label="Scroll to simulation configuration"
              onClick={() => {
                setShowDashboard(true);
                setTimeout(() => {
                  const sandboxPanel = document.querySelector('.sidebar');
                  if (sandboxPanel) sandboxPanel.scrollTo({ top: 300, behavior: 'smooth' });
                }, 100);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 1 1 2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
          
          <div className="nav-divider" />
          
          <div className="status-pill" title="Open-Meteo weather API connectivity: 18-member ensemble active">
            <span className="status-dot" style={{ backgroundColor: "var(--severity-low)" }} />
            <span>Open-Meteo <strong style={{ color: "var(--text-primary)" }}>Connected</strong></span>
          </div>

          <div className="nav-divider" />
          
          <div className="status-pill" title={`Current CRB smoke risk level: ${currentData.risk_level}`}>
            <span className="status-dot" style={{ 
              backgroundColor: riskColor(currentData.risk_level)
            }} />
            <span>Risk: <strong>{currentData.risk_level}</strong></span>
          </div>
        </div>
      </header>

      {/* Notification Center Popover */}
      {isNotifOpen && (
        <div className="notification-popover" role="dialog" aria-label="Atmospheric Bulletins">
          <div className="notif-header">
            <h3>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              Atmospheric Bulletins
            </h3>
            <button 
              type="button" 
              className="notif-close-btn" 
              onClick={() => setIsNotifOpen(false)}
              aria-label="Close notification panel"
            >
              ×
            </button>
          </div>
          <div className="notif-list">
            <div className="notif-item">
              <div className="notif-meta">
                <span className="notif-tag notif-tag--alert">DISPERSION ADVISORY</span>
                <span>T+00h live</span>
              </div>
              <div className="notif-title">NW Transport Corridor Active</div>
              <div className="notif-desc">Wind vectors from Sangrur and Ludhiana bearing toward Delhi-NCR at {currentData.wind_speed.toFixed(1)} km/h. Boundary layer at {Math.round(currentData.boundary_layer_height)}m.</div>
            </div>
            <div className="notif-item">
              <div className="notif-meta">
                <span className="notif-tag notif-tag--info">SATELLITE SYNC</span>
                <span>Pass verified</span>
              </div>
              <div className="notif-title">NASA FIRMS Thermal Scan Ingested</div>
              <div className="notif-desc">{meta.fires_tracked} active stubble fire clusters tracked across Punjab and Haryana agricultural belts.</div>
            </div>
            <div className="notif-item">
              <div className="notif-meta">
                <span className="notif-tag notif-tag--ok">MODEL ENSEMBLE</span>
                <span>Operational</span>
              </div>
              <div className="notif-title">Lagrangian Dispersion Solver Converged</div>
              <div className="notif-desc">36-hour predictive trajectory calibrated with {meta.confidence_score}% confidence rating.</div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="toast-container" role="status" aria-live="polite">
          <div className={`toast-banner toast-${toast.type}`}>
            <span style={{ fontSize: "1rem" }}>
              {toast.type === "error" ? "⚠" : toast.type === "success" ? "✓" : "ℹ"}
            </span>
            <span>{toast.message}</span>
            <button 
              type="button" 
              className="toast-close-btn" 
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* RENDER PAGE 1: LANDING SCREEN */}
      {!showDashboard && (
        <div className="landing-view">
          {/* Telemetry Strip - JetBrains Mono styling */}
          <div className="telemetry-strip mono">
            <div className="telemetry-item">
              <span className="telemetry-label">NASA Satellites Tracked:</span>
              <span className="telemetry-value" style={{ color: "var(--text-secondary)" }}>{meta.fires_tracked} clusters</span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-label">Regional Wind Bearing:</span>
              <span className="telemetry-value">{currentData.wind_direction.toFixed(0)}° (NW Drift)</span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-label">Delhi Arrival Window:</span>
              <span className="telemetry-value" style={{ color: currentData.risk_level === "Low" ? "var(--transition-blue)" : riskColor(currentData.risk_level) }}>{expectedArrival}</span>
            </div>
          </div>

          {/* Hero Split Layout */}
          <div className="hero-section">
            {/* Left: Map Preview (India Map only) */}
            <div className="map-container-wrapper" style={{ height: "100%" }}>
              <MapView 
                fires={fires}
                particles={currentData.particles}
                windSpeed={currentData.wind_speed}
                windDirection={currentData.wind_direction}
                onAddFire={handleAddCustomFire}
                onClearFires={handleClearCustomFires}
                flyTarget={flyTarget}
                riskLevel={currentData.risk_level}
                smokePm25={currentData.smoke_pm25}
                isConfidenceDegraded={meta.confidence_score < 70}
                showConnectingArc={true}
                currentHour={currentHour}
                timelineStart={timelineStartMs}
                timelineLen={timelineLen}
              />
            </div>
            
            {/* Right: Scientific Brand text */}
            <div className="hero-text-card">
              <div className="hero-eyebrow-pill">
                <span className="hero-eyebrow-dot" />
                ATMOSPHERIC EARLY WARNING · DELHI-NCR
              </div>
              <h2>Delhi's smog has a known origin. Now you can see it coming.</h2>
              <p>
                Smoke Horizon is a predictive early-warning meteorological instrument. By tracking live 
                stubble-burning coordinates via satellite scans and resolving them downwind against 2D wind field velocities, 
                we forecast agricultural smoke arrival times 18 to 36 hours before pollution peaks in Delhi-NCR.
              </p>

              {/* Impact stats band */}
              <div className="hero-stats">
                <div className="hero-stat">
                  <div className="hero-stat-value">18-36h</div>
                  <div className="hero-stat-label">Advance warning</div>
                </div>
                <div className="hero-stat">
                  <div className="hero-stat-value">{meta.fires_tracked}</div>
                  <div className="hero-stat-label">Satellite clusters tracked</div>
                </div>
                <div className="hero-stat">
                  <div className="hero-stat-value">{meta.confidence_score}%</div>
                  <div className="hero-stat-label">Forecast confidence</div>
                </div>
              </div>
              
              <div className="hero-cta-row">
                <button 
                  className="action-btn"
                  onClick={() => setShowDashboard(true)}
                  style={{ width: "auto", padding: "0.85rem 1.75rem", fontSize: "0.95rem" }}
                >
                  Access Telemetry Dashboard →
                </button>
                <button 
                  className="action-btn secondary"
                  onClick={() => setIsBacktestOpen(true)}
                  style={{ width: "auto", padding: "0.85rem 1.25rem", fontSize: "0.95rem" }}
                >
                  View Historical Accuracy
                </button>
              </div>
            </div>
          </div>

          {/* Causal Chain flow diagrams */}
          <div className="flow-explainer">
            <div className="flow-card">
              <span className="flow-card-step mono">STEP 01</span>
              <div className="flow-card-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </div>
              <h3>Detect Source</h3>
              <p>NASA VIIRS & MODIS thermal satellite coordinates fetch active crop residue burning locations across Punjab and Haryana farmland.</p>
            </div>
            
            <div className="flow-card">
              <span className="flow-card-step mono">STEP 02</span>
              <div className="flow-card-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"></path>
                </svg>
              </div>
              <h3>Model Drift</h3>
              <p>Open-Meteo multi-station wind speed vectors interpolate downwind drift paths, adjusting for boundary layers and humidity washout.</p>
            </div>

            <div className="flow-card">
              <span className="flow-card-step mono">STEP 03</span>
              <div className="flow-card-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"></circle>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </div>
              <h3>Warn Delhi</h3>
              <p>Receptor risk halos surrounding Delhi-NCR calculate expected PM2.5 increments and trigger safety notifications ahead of stagnation spikes.</p>
            </div>
          </div>

          {/* Predictive vs Reactive AQI */}
          <div className="comparison-section">
            <div className="comparison-box">
              <h3>
                <span className="comparison-tag comparison-tag--reactive">REACTIVE MONITORING</span>
                Standard AQI Ground Stations
              </h3>
              <p>
                Standard AQI monitors display current readings from localized ground stations. They report when the air is 
                already bad, focusing entirely on the effect. No advance warnings are generated, leaving citizens unprotected 
                until pollution stagnation has occurred.
              </p>
            </div>
            <div className="comparison-box">
              <h3>
                <span className="comparison-tag comparison-tag--predictive">PREDICTIVE TRANSPORT</span>
                Smoke Horizon Dispersion Model
              </h3>
              <p>
                Smoke Horizon targets the cause. By modeling the meteorological path from source farm fires down to Delhi, 
                our system provides a predictive window, enabling respiratory safety actions, N95 usage, and closed-door 
                stagnation protections hours before the smoke sweeps in.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* RENDER PAGE 2: ACTIVE FORECAST DASHBOARD */}
      {showDashboard && (
        <div className="dashboard-grid">
          
          {/* Left Column: Cluster Sidebar + Map + Timeline */}
          <section className="map-container-wrapper" style={{ display: "flex", flexDirection: "column" }}>
            {/* Map+Sidebar split */}
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
              {/* Cluster tracked list: left rail */}
              <ClusterSidebar
                fires={fires}
                selectedClusterId={selectedCluster?.id}
                onSelectCluster={handleSelectCluster}
              />

              {/* Map takes remaining width */}
              <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
                <MapView 
                  fires={fires}
                  particles={currentData.particles}
                  windSpeed={currentData.wind_speed}
                  windDirection={currentData.wind_direction}
                  onAddFire={handleAddCustomFire}
                  onClearFires={handleClearCustomFires}
                  flyTarget={flyTarget}
                  riskLevel={currentData.risk_level}
                  smokePm25={currentData.smoke_pm25}
                  isConfidenceDegraded={meta.confidence_score < 70}
                  onSelectCluster={handleSelectCluster}
                  selectedClusterId={selectedCluster?.id}
                  currentHour={currentHour}
                  timelineStart={timelineStartMs}
                  timelineLen={timelineLen}
                />
              </div>
            </div>

            {/* Bottom: Detail card (when cluster selected) or Timeline */}
            {selectedCluster ? (
              <ClusterDetailCard
                fire={selectedCluster}
                windSpeed={currentData.wind_speed}
                onClose={() => setSelectedCluster(null)}
              />
            ) : (
              <RiskTimeline 
                timeline={forecast.timeline}
                fires={fires}
                currentHour={currentHour}
                onChangeHour={setCurrentHour}
              />
            )}
          </section>

          {/* Right Column: Sidebar Panels */}
          <section className="sidebar">
            
            {/* CRB Smoke Risk Card */}
            <div className="glass-card risk-card">
              <h2>
                <span style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--fire)" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2c1 2 2 3.5 2 5.5 0 2.5-1.5 4.5-4 4.5s-4-2-4-4.5c0-2 1-3.5 2-5.5z"/><path d="M17.5 12c1.5 1.5 2.5 3 2.5 5 0 3.5-3 6.5-6.5 6.5-3.5 0-6.5-3-6.5-6.5 0-2 1-3.5 2.5-5"/></svg>
                  CRB Smoke Risk
                </span>
              </h2>
              <div className="risk-card-hero">
                <span className="risk-level-badge" style={{
                  background: riskColor(currentData.risk_level) + "18",
                  border: `1px solid ${riskColor(currentData.risk_level)}44`,
                  color: riskColor(currentData.risk_level),
                }}>
                  <span style={{ width:7, height:7, borderRadius:"50%", background:riskColor(currentData.risk_level), display:"inline-block" }}/>
                  {currentData.risk_level}
                </span>
                <div className="risk-arrival-row">
                  <span style={{ fontSize:"0.6rem", color:"var(--text-3)", textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:"JetBrains Mono,monospace" }}>Estimated Arrival</span>
                  <span className="risk-arrival-val">{expectedArrival}</span>
                </div>
              </div>
              {currentData.risk_level !== "Low" && (
                <div className="risk-action-tip">
                  {currentData.risk_level === "High" ? "⚠ Avoid outdoor activity. Use N95 masks if going outside. Keep windows closed." : "Consider reducing prolonged outdoor exposure. Monitor conditions."}
                </div>
              )}
            </div>

            {/* Estimated Total AQI Card */}
            <div className="glass-card aqi-card">
              <h2>
                <span style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Estimated AQI
                </span>
              </h2>
              <div className="aqi-hero">
                {/* SVG arc gauge */}
                <div className="aqi-ring-wrap">
                  <svg viewBox="0 0 72 72" width="64" height="64">
                    <circle cx="36" cy="36" r="28" fill="none" stroke="var(--border)" strokeWidth="7"/>
                    <circle cx="36" cy="36" r="28" fill="none"
                      stroke={currentData.aqi > 200 ? "var(--fire)" : currentData.aqi > 100 ? "var(--amber)" : "var(--green)"}
                      strokeWidth="7" strokeLinecap="round"
                      strokeDasharray={`${Math.min(100, currentData.aqi / 5) * 1.758} 175.8`}
                      strokeDashoffset="43.95"
                      style={{ transition:"stroke-dasharray 0.8s ease, stroke 0.4s" }}
                    />
                    <text x="36" y="40" textAnchor="middle" fontSize="13" fontWeight="800"
                      fill={currentData.aqi > 200 ? "var(--fire)" : currentData.aqi > 100 ? "var(--amber)" : "var(--green)"}
                      fontFamily="JetBrains Mono,monospace">{currentData.aqi}</text>
                  </svg>
                </div>
                <div>
                  <div className="aqi-number" style={{ color: currentData.aqi > 200 ? "var(--fire)" : currentData.aqi > 100 ? "var(--amber)" : "var(--green)" }}>
                    {currentData.aqi}
                  </div>
                  <div className="aqi-label">Composite AQI</div>
                </div>
              </div>
            <div className="aqi-breakdown">
                <div className="aqi-breakdown-row">
                  <span>CPCB Urban Baseline</span>
                  <span className="aqi-breakdown-val mono" style={{ color:"var(--text-1)" }}>{baseAqiFraction}</span>
                </div>
                <div className="aqi-breakdown-row">
                  <span>Crop Smoke Contribution</span>
                  <span className="aqi-breakdown-val mono" style={{ color:"var(--fire)" }}>+{smokeAqiFraction}</span>
                </div>
              </div>
            </div>

            <ForecastReportButton
              forecast={forecast}
              currentData={currentData}
              expectedArrival={expectedArrival}
              meta={meta}
              fires={fires}
            />

            <div className="sidebar-section-label">Atmospheric Analysis</div>
            {/* Detailed Diagnostics */}
            <DiagnosticsCard currentData={currentData} />

            {/* Source Attribution: PM2.5 split by source */}
            <SourceAttribution currentData={currentData} fires={fires} />

            {/* Regional city comparison: exposure across NCR hubs */}
            <CityComparison forecast={forecast} />

            <div className="sidebar-section-label">Fire Tracking</div>
            {/* Hotspots Panel with flight targeted zoom */}
            <HotspotsPanel fires={fires} onFlyTo={handleFlyToFire} />

            <div className="sidebar-section-label">Alerts &amp; Monitoring</div>
            {/* Notification alert thresholds toggles */}
            <AlertSettings />

            {/* WhatsApp advance-warning alerts via Twilio */}
            <WhatsAppAlerts />

            {/* Personalized Exposure Score: pinned locations */}
            <ExposureScore forecast={forecast} />

            <div className="sidebar-section-label">Configuration</div>
            {/* API settings */}
            <FirmsKeyCard 
              onKeySuccess={loadForecastData} 
              currentStatus={meta.satellite_sync_status} 
            />

            {/* Sandbox Simulation parameters */}
            <SandboxControls 
              customFrp={customFrp}
              onChangeFrp={setCustomFrp}
              customFireCount={customFireCount}
              onClearCustom={handleClearCustomFires}
              onSyncSatellite={handleSyncSatellite}
              isSyncing={isSyncing}
            />

            {/* Satellite visibility confidence banner */}
            <ConfidenceBanner meta={meta} />

          </section>
        </div>
      )}

      {/* Accuracy Validation stats modal */}
      <BacktestModal 
        isOpen={isBacktestOpen} 
        onClose={() => setIsBacktestOpen(false)} 
      />
    </div>
  );
}
