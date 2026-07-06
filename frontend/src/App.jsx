import React, { useState, useEffect } from "react";
import MapView from "./components/MapView";
import RiskTimeline from "./components/RiskTimeline";
import ConfidenceBanner from "./components/ConfidenceBanner";
import AlertCard from "./components/AlertCard";
import SandboxControls from "./components/SandboxControls";
import FirmsKeyCard from "./components/FirmsKeyCard";
import HotspotsPanel from "./components/HotspotsPanel";
import DiagnosticsCard from "./components/DiagnosticsCard";
import SourceAttribution from "./components/SourceAttribution";
import AlertSettings from "./components/AlertSettings";
import WhatsAppAlerts from "./components/WhatsAppAlerts";
import ExposureScore from "./components/ExposureScore";
import BacktestModal from "./components/BacktestModal";
import ClusterSidebar from "./components/ClusterSidebar";
import ClusterDetailCard from "./components/ClusterDetailCard";
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

  const loadForecastData = async () => {
    try {
      const data = await fetchForecast();
      setForecast(data);
      setError("");
      // After each forecast refresh, silently check subscriptions against
      // the new timeline. Runs in background — never blocks the UI.
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
    } catch (err) {
      alert(`Error spawning custom fire: ${err.message}`);
      setLoading(false);
    }
  };

  const handleClearCustomFires = async () => {
    try {
      setLoading(true);
      await clearCustomFires();
      await loadForecastData();
    } catch (err) {
      alert(`Error clearing custom fires: ${err.message}`);
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
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "var(--bg-base)", color: "var(--transition-blue)" }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: "Outfit", fontSize: "1.8rem", marginBottom: "1rem" }}>Smoke Horizon</h2>
          <p style={{ color: "var(--text-secondary)" }}>Initializing atmospheric physics solver...</p>
        </div>
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
            <span>Weather forecast for crop smoke</span>
          </h1>
        </div>
        
        {/* Minimal Navigation */}
        <nav style={{ display: "flex", gap: "1.5rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
          <span 
            style={{ 
              color: !showDashboard ? "var(--text-primary)" : "var(--text-secondary)", 
              cursor: "pointer", 
              borderBottom: !showDashboard ? "1.5px solid var(--transition-blue)" : "none", 
              paddingBottom: "2px" 
            }}
            onClick={() => setShowDashboard(false)}
          >
            Overview
          </span>
          <span 
            style={{ 
              color: showDashboard ? "var(--text-primary)" : "var(--text-secondary)", 
              cursor: "pointer", 
              borderBottom: showDashboard ? "1.5px solid var(--transition-blue)" : "none", 
              paddingBottom: "2px" 
            }}
            onClick={() => setShowDashboard(true)}
          >
            Telemetry Board
          </span>
          <span style={{ cursor: "pointer" }} onClick={() => setIsBacktestOpen(true)}>
            Historical Verification
          </span>
        </nav>
        
        <div className="system-status">
          {/* Settings & Alerts Icons */}
          <div style={{ display: "flex", gap: "0.75rem", marginRight: "0.5rem" }}>
            <button 
              title="Notifications" 
              style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center" }}
              onClick={() => alert("Notification center active.")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </button>
            <button 
              title="Simulator Config" 
              style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center" }}
              onClick={() => {
                setShowDashboard(true);
                setTimeout(() => {
                  const sandboxPanel = document.querySelector('.sidebar');
                  if (sandboxPanel) sandboxPanel.scrollTo({ top: 300, behavior: 'smooth' });
                }, 100);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
          
          <div style={{ color: "var(--border-flat)", marginRight: "0.75rem" }}>|</div>
          
          <div className="status-indicator" style={{ marginRight: "0.75rem" }}>
            <span className="status-dot" style={{ backgroundColor: "var(--severity-low)" }} />
            <span>Open-Meteo API: <strong style={{ color: "var(--text-primary)" }}>Connected</strong></span>
          </div>

          <div style={{ color: "var(--border-flat)", marginRight: "0.75rem" }}>|</div>
          
          <div className="status-indicator">
            <span className="status-dot" style={{ 
              backgroundColor: riskColor(currentData.risk_level)
            }} />
            <span>Risk Level: <strong>{currentData.risk_level}</strong></span>
          </div>
        </div>
      </header>

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
              />
            </div>
            
            {/* Right: Scientific Brand text */}
            <div className="hero-text-card">
              <h2>Delhi's smog has a known origin. Now you can see it coming.</h2>
              <p>
                Smoke Horizon is a predictive early-warning meteorological instrument. By tracking live 
                stubble-burning coordinates via satellite scans and resolving them downwind against 2D wind field velocities, 
                we forecast agricultural smoke arrival times 18 to 36 hours before pollution peaks in Delhi-NCR.
              </p>
              
              <div style={{ display: "flex", gap: "1rem" }}>
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
              <div className="flow-card-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </div>
              <h3>1. Detect Source</h3>
              <p>NASA VIIRS & MODIS thermal satellite coordinates fetch active crop residue burning locations across Punjab and Haryana farmland.</p>
            </div>
            
            <div className="flow-card">
              <div className="flow-card-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"></path>
                </svg>
              </div>
              <h3>2. Model Drift</h3>
              <p>Open-Meteo multi-station wind speed vectors interpolate downwind drift paths, adjusting for boundary layers and humidity washout.</p>
            </div>

            <div className="flow-card">
              <div className="flow-card-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"></circle>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </div>
              <h3>3. Warn Delhi</h3>
              <p>Receptor risk halos surrounding Delhi-NCR calculate expected PM2.5 increments and trigger safety notifications ahead of stagnation spikes.</p>
            </div>
          </div>

          {/* Predictive vs Reactive AQI */}
          <div className="comparison-section">
            <div className="comparison-box">
              <h3>
                <span style={{ color: "var(--text-secondary)" }}>●</span>
                Reactive AQI Apps (Generic readings)
              </h3>
              <p>
                Standard AQI monitors display current readings from localized ground stations. They report when the air is 
                already bad, focusing entirely on the effect. No advance warnings are generated, leaving citizens unprotected 
                until pollution stagnation has occurred.
              </p>
            </div>
            <div className="comparison-box">
              <h3>
                <span style={{ color: "var(--severity-low)" }}>●</span>
                Predictive early warning (Smoke Horizon)
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
              {/* Cluster tracked list — left rail */}
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
                currentHour={currentHour}
                onChangeHour={setCurrentHour}
              />
            )}
          </section>

          {/* Right Column: Sidebar Panels */}
          <section className="sidebar">
            
            {/* CRB Smoke Risk Card */}
            <div className="glass-card">
              <h2>CRB Smoke Risk</h2>
              <div className="weather-details" style={{ marginTop: "0.25rem" }}>
                <div className="weather-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
                  <span>Risk Warning Tier</span>
                  <span style={{ 
                    fontWeight: "bold",
                    fontSize: "1.1rem",
                    color: riskColor(currentData.risk_level)
                  }}>
                    {currentData.risk_level}
                  </span>
                </div>
                <div className="weather-row" style={{ borderBottom: "none", paddingBottom: 0, marginTop: "0.5rem" }}>
                  <span>Estimated Arrival</span>
                  <span style={{ fontWeight: "600", color: "var(--text-primary)", fontSize: "0.82rem" }}>
                    {expectedArrival}
                  </span>
                </div>
              </div>
            </div>

            {/* Estimated Total AQI Card */}
            <div className="glass-card">
              <h2>Estimated Total AQI</h2>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", margin: "0.4rem 0" }}>
                <span style={{ 
                  fontFamily: "Outfit", 
                  fontSize: "2rem", 
                  fontWeight: "800",
                  color: currentData.aqi > 200 ? "var(--severity-high)" : currentData.aqi > 100 ? "var(--severity-mid)" : "var(--severity-low)"
                }}>
                  {currentData.aqi}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Composite AQI index</span>
              </div>
              
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.4", borderTop: "1px solid var(--border-flat)", paddingTop: "0.6rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                  <span>CPCB Urban Baseline</span>
                  <span className="mono" style={{ fontWeight: "500", color: "var(--text-primary)" }}>{baseAqiFraction} AQI</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Crop Residue Smoke Contribution</span>
                  <span className="mono" style={{ fontWeight: "600", color: "var(--severity-high)" }}>+{smokeAqiFraction} AQI</span>
                </div>
              </div>
            </div>

            {/* Detailed Diagnostics */}
            <DiagnosticsCard currentData={currentData} />

            {/* Source Attribution — PM2.5 split by source */}
            <SourceAttribution currentData={currentData} fires={fires} />

            {/* Hotspots Panel with flight targeted zoom */}
            <HotspotsPanel fires={fires} onFlyTo={handleFlyToFire} />

            {/* Notification alert thresholds toggles */}
            <AlertSettings />

            {/* WhatsApp advance-warning alerts via Twilio */}
            <WhatsAppAlerts />

            {/* Personalized Exposure Score — pinned locations */}
            <ExposureScore forecast={forecast} />

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
