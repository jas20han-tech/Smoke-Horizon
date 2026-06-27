import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, Polyline, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

// Delhi Center
const DELHI_COORDS = [28.6139, 77.2090];

// Map Event Handler for Custom Fire Spawning
function MapEventsHandler({ onMapDoubleClick }) {
  useMapEvents({
    dblclick(e) {
      onMapDoubleClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

// Handler to smooth fly-to targeted coordinates
function MapFlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target.coords, target.zoom || 9.5, {
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  }, [target, map]);
  return null;
}

export default function MapView({ 
  fires, 
  particles, 
  windSpeed, 
  windDirection, 
  onAddFire, 
  flyTarget,
  riskLevel,
  smokePm25,
  isConfidenceDegraded,
  showConnectingArc = false
}) {
  const [is3D, setIs3D] = useState(showConnectingArc);

  // Bezier curve calculations for Punjab-to-Delhi Causal Arc
  // Centroids: Punjab (30.6, 75.4), Delhi (28.6139, 77.2090)
  const startPt = [30.6, 75.4];
  const endPt = [28.6139, 77.2090];
  const ctrlPt = [29.8, 76.7]; // deflection control point

  const getBezierPoints = (p1, p2, control, numPoints = 30) => {
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const lat = (1 - t) * (1 - t) * p1[0] + 2 * (1 - t) * t * control[0] + t * t * p2[0];
      const lon = (1 - t) * (1 - t) * p1[1] + 2 * (1 - t) * t * control[1] + t * t * p2[1];
      points.push([lat, lon]);
    }
    return points;
  };

  const getArcColor = (t) => {
    const s = Math.abs(2 * t - 1);
    // Interpolate: s=0 (fully blue var(--primary) #4A8FE0) -> s=1 (fully amber var(--fire-amber) #E8A33D)
    // Blue RGB: (74, 143, 224)
    // Amber RGB: (232, 163, 61)
    const r = Math.round(74 + s * (232 - 74));
    const g = Math.round(143 + s * (163 - 143));
    const b = Math.round(224 + s * (61 - 224));
    return `rgb(${r}, ${g}, ${b})`;
  };

  const getBezierPoint = (t, p1, p2, control) => {
    const lat = (1 - t) * (1 - t) * p1[0] + 2 * (1 - t) * t * control[0] + t * t * p2[0];
    const lon = (1 - t) * (1 - t) * p1[1] + 2 * (1 - t) * t * control[1] + t * t * p2[1];
    return [lat, lon];
  };

  // State to animate moving dot along causal arc
  const [arcProgress, setArcProgress] = useState(0);
  useEffect(() => {
    if (!showConnectingArc) return;
    const interval = setInterval(() => {
      setArcProgress((prev) => (prev >= 1 ? 0 : prev + 0.006));
    }, 35);
    return () => clearInterval(interval);
  }, [showConnectingArc]);

  const arcPoints = getBezierPoints(startPt, endPt, ctrlPt, 30);
  const movingDotCoords = getBezierPoint(arcProgress, startPt, endPt, ctrlPt);
  const movingDotColor = getArcColor(arcProgress);

  const riskColor = riskLevel === "High" ? "var(--risk-high)" : riskLevel === "Moderate" ? "var(--risk-med)" : "var(--safe-green)";
  const haloOpacity = Math.max(0.06, Math.min(0.5, smokePm25 / 150.0));

  return (
    <div className={showConnectingArc ? "tilted-map-container" : (is3D ? "map-container-wrapper map-3d-active" : "map-container-wrapper")} style={{ height: "100%", width: "100%", position: "relative" }}>
      {/* 5. One accent gradient maximum - atmospheric radial scattering overlay */}
      {showConnectingArc && <div className="map-atmospheric-glow" />}

      {/* Flat HUD View Toggle (Dashboard map only) */}
      {!showConnectingArc && (
        <div className="map-hud-controls">
          <button 
            className={`hud-btn ${!is3D ? "active" : ""}`}
            onClick={() => setIs3D(false)}
          >
            Tactical 2D
          </button>
          <button 
            className={`hud-btn ${is3D ? "active" : ""}`}
            onClick={() => setIs3D(true)}
          >
            Satellite 3D
          </button>
        </div>
      )}

      <div className={showConnectingArc ? "tilted-map-view" : ""} style={{ height: "100%", width: "100%" }}>
        <MapContainer
          center={[22.5, 78.96]} // Geographic center of India
          zoom={showConnectingArc ? 5.2 : 5.0} // Show the full map of India
          doubleClickZoom={false}
          zoomControl={!showConnectingArc} // Hide default zoom buttons on tilted landing map
          className="map-view"
          style={{ height: "100%", width: "100%" }}
        >
        {/* CartoDB Dark Matter tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* Permanent Geographic Context Labels for Full India Map */}
        <Marker position={[30.8, 75.2]} icon={L.divIcon({ className: "empty-icon", iconSize: [0, 0] })}>
          <Tooltip permanent direction="top" className="location-text-label">
            PUNJAB (SOURCE)
          </Tooltip>
        </Marker>
        <Marker position={[29.7, 76.3]} icon={L.divIcon({ className: "empty-icon", iconSize: [0, 0] })}>
          <Tooltip permanent direction="top" className="location-text-label">
            HARYANA (TRANSITION)
          </Tooltip>
        </Marker>
        <Marker position={[28.6139, 77.2090]} icon={L.divIcon({ className: "empty-icon", iconSize: [0, 0] })}>
          <Tooltip permanent direction="bottom" className="location-text-label" offset={[0, 10]}>
            DELHI-NCR (RECEPTOR)
          </Tooltip>
        </Marker>

        {/* Causal Chain Arc - only shown on overview / landing page */}
        {showConnectingArc && arcPoints.map((pt, i) => {
          if (i === arcPoints.length - 1) return null;
          const t = i / (arcPoints.length - 1);
          return (
            <Polyline
              key={`arc-${i}`}
              positions={[arcPoints[i], arcPoints[i+1]]}
              pathOptions={{
                color: getArcColor(t),
                weight: 3.5,
                opacity: 0.85
              }}
            />
          );
        })}

        {/* Flow Dot Animating down the arc */}
        {showConnectingArc && (
          <CircleMarker
            center={movingDotCoords}
            radius={5.5}
            pathOptions={{
              color: movingDotColor,
              fillColor: movingDotColor,
              fillOpacity: 0.95,
              weight: 1.5,
              className: "fire-glow"
            }}
          />
        )}

        {/* Delhi Receptor Node */}
        <CircleMarker
          center={DELHI_COORDS}
          radius={8}
          pathOptions={{
            color: "var(--text-primary)",
            fillColor: "var(--bg-panel)",
            fillOpacity: 0.95,
            weight: 1.5
          }}
        >
          <Popup>
            <div>
              <strong>Delhi-NCR Receptor Node</strong><br/>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Monitoring PM2.5 & Risk Arrival</span>
            </div>
          </Popup>
        </CircleMarker>

        {/* Dynamic Risk Zone Halo over Delhi-NCR */}
        <Circle
          center={DELHI_COORDS}
          radius={35000} // 35 km radius
          pathOptions={{
            color: riskColor,
            fillColor: riskColor,
            fillOpacity: riskLevel === "Low" ? 0.05 : haloOpacity,
            weight: 1.5,
            dashArray: isConfidenceDegraded ? "4, 4" : null,
            className: (riskLevel === "Moderate" || riskLevel === "High") ? "pulse-halo" : ""
          }}
        >
          <Popup>
            <div>
              <strong>Delhi-NCR Receptor Risk Halo</strong><br/>
              Predicted Transport Risk: <span style={{ color: riskColor, fontWeight: "bold" }}>{riskLevel}</span><br/>
              Smoke PM2.5 Increment: {smokePm25.toFixed(1)} µg/m³<br/>
              Status: {isConfidenceDegraded ? "Dashed boundary (degraded satellite confidence)" : "Solid boundary (active monitoring)"}
            </div>
          </Popup>
        </Circle>

        {/* Active Fire Hotspots */}
        {fires.map((fire) => {
          if (is3D) {
            // 3D CSS Column height representation (scales with FRP)
            const heightVal = Math.max(12, Math.min(85, Math.log(fire.frp) * 12.5));
            const icon3D = L.divIcon({
              className: 'custom-3d-fire-marker',
              html: `
                <div class="fire-column-3d" style="--height-val: ${heightVal}px;">
                  <div class="fire-column-face fire-column-front" style="height: ${heightVal}px;"></div>
                  <div class="fire-column-face fire-column-back" style="height: ${heightVal}px;"></div>
                  <div class="fire-column-face fire-column-left" style="height: ${heightVal}px;"></div>
                  <div class="fire-column-face fire-column-right" style="height: ${heightVal}px;"></div>
                  <div class="fire-column-top" style="transform: translateZ(${heightVal}px);"></div>
                </div>
              `,
              iconSize: [8, 8],
              iconAnchor: [4, 4]
            });

            return (
              <Marker
                key={fire.id}
                position={[fire.latitude, fire.longitude]}
                icon={icon3D}
              >
                <Popup>
                  <div>
                    <strong>{fire.is_custom ? "Custom Sandbox Fire (3D)" : "Satellite Hotspot (3D)"}</strong><br/>
                    Latitude: {fire.latitude.toFixed(4)}<br/>
                    Longitude: {fire.longitude.toFixed(4)}<br/>
                    Fire Radiative Power: {fire.frp} MW<br/>
                    Height telemetred: {heightVal.toFixed(0)}px
                  </div>
                </Popup>
              </Marker>
            );
          } else {
            // 2D Circle Marker
            return (
              <CircleMarker
                key={fire.id}
                center={[fire.latitude, fire.longitude]}
                radius={Math.max(6, Math.min(20, 5 + Math.log(fire.frp) * 2.3))}
                pathOptions={{
                  color: "var(--fire-amber)",
                  fillColor: "var(--fire-amber)",
                  fillOpacity: isConfidenceDegraded ? 0.45 : 0.7,
                  weight: fire.is_custom ? 1.5 : 2,
                  dashArray: fire.is_custom ? "3, 3" : (isConfidenceDegraded ? "2, 2" : null),
                  className: "fire-glow"
                }}
              >
                <Popup>
                  <div>
                    <strong>{fire.is_custom ? "Custom Sandbox Fire" : "Satellite Hotspot"}</strong><br/>
                    Latitude: {fire.latitude.toFixed(4)}<br/>
                    Longitude: {fire.longitude.toFixed(4)}<br/>
                    Fire Radiative Power (FRP): {fire.frp} MW<br/>
                    Type: {fire.is_custom ? "Manual Input" : "NASA MODIS/VIIRS"}
                  </div>
                </Popup>
              </CircleMarker>
            );
          }
        })}

        {/* Render Smoke Plume Particles (Spatially Interpolated) - Atmospheric Blue */}
        {particles && particles.map((p) => {
          const radiusMeters = (8000 + p.age * 1600);
          
          return (
            <Circle
              key={p.id}
              center={[p.lat, p.lon]}
              radius={radiusMeters}
              pathOptions={{
                color: "var(--primary)",
                fillColor: "var(--primary)",
                fillOpacity: Math.min(isConfidenceDegraded ? 0.12 : 0.28, p.density * 0.35),
                weight: 0.8,
                stroke: true,
                className: "particle-glow"
              }}
            />
          );
        })}

        {/* Listen for Sandbox spawn clicks */}
        <MapEventsHandler onMapDoubleClick={onAddFire} />
        
        {/* Listen for zoom/fly triggers */}
        <MapFlyTo target={flyTarget} />
      </MapContainer>
      </div>

      {/* Floating Wind Vane */}
      <div style={{
        position: "absolute",
        top: "20px",
        right: "20px",
        zIndex: 1000,
        background: "rgba(17, 24, 39, 0.95)",
        border: "1px solid var(--border-flat)",
        borderRadius: "8px",
        padding: "10px 15px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxShadow: "0 4px 15px rgba(0,0,0,0.5)"
      }}>
        <div style={{
          transform: `rotate(${(windDirection + 180) % 360}deg)`,
          width: "36px",
          height: "36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "2.5px solid var(--primary)",
          borderRadius: "50%",
          transition: "transform 0.1s linear"
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: "9px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Wind direction</div>
          <div style={{ fontSize: "13px", fontWeight: "bold", color: "#f8fafc" }}>
            {windSpeed.toFixed(1)} km/h <span style={{ color: "var(--primary)", fontSize: "11px" }}>{windDirection.toFixed(0)}&deg;</span>
          </div>
        </div>
      </div>
    </div>
  );
}
