import React from "react";

const burningHubs = [
  { name: "Sangrur, Punjab", lat: 30.24, lon: 75.84 },
  { name: "Bathinda, Punjab", lat: 30.21, lon: 74.94 },
  { name: "Patiala, Punjab", lat: 30.34, lon: 76.38 },
  { name: "Moga, Punjab", lat: 30.80, lon: 75.17 },
  { name: "Ludhiana, Punjab", lat: 30.90, lon: 75.85 },
  { name: "Firozpur, Punjab", lat: 30.92, lon: 74.62 },
  { name: "Tarn Taran, Punjab", lat: 31.45, lon: 74.92 },
  { name: "Amritsar, Punjab", lat: 31.63, lon: 74.87 },
  { name: "Kaithal, Haryana", lat: 29.80, lon: 76.40 },
  { name: "Karnal, Haryana", lat: 29.68, lon: 76.99 },
  { name: "Kurukshetra, Haryana", lat: 29.97, lon: 76.84 },
  { name: "Fatehabad, Haryana", lat: 29.51, lon: 75.45 },
  { name: "Jind, Haryana", lat: 29.92, lon: 75.98 },
  { name: "Sirsa, Haryana", lat: 29.71, lon: 75.68 }
];

export function getClosestCity(lat, lon) {
  let closest = burningHubs[0];
  let minDist = Infinity;
  for (const hub of burningHubs) {
    const d = Math.sqrt((lat - hub.lat)**2 + (lon - hub.lon)**2);
    if (d < minDist) {
      minDist = d;
      closest = hub;
    }
  }
  return closest.name;
}

export default function HotspotsPanel({ fires, onFlyTo }) {
  return (
    <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <h2>
        <span>Active Stubble Hotspots</span>
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          {fires.length} Locations
        </span>
      </h2>
      
      {fires.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "1rem" }}>
          No active crop fires detected.
        </div>
      ) : (
        <div style={{ 
          maxHeight: "180px", 
          overflowY: "auto", 
          display: "flex", 
          flexDirection: "column", 
          gap: "0.5rem",
          paddingRight: "4px" 
        }}>
          {fires.map((fire) => {
            const cityName = getClosestCity(fire.latitude, fire.longitude);
            return (
              <div 
                key={fire.id} 
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border-flat)",
                  borderRadius: "8px",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.8rem"
                }}
              >
                <div>
                  <div style={{ fontWeight: "600", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ 
                      width: "6px", 
                      height: "6px", 
                      borderRadius: "50%", 
                      backgroundColor: "var(--fire-amber)",
                      border: fire.is_custom ? "1px dashed var(--text-secondary)" : "none"
                    }} />
                    {cityName}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "2px" }}>
                    {fire.latitude.toFixed(2)}°N, {fire.longitude.toFixed(2)}°E | {fire.frp.toFixed(0)} MW
                  </div>
                </div>
                
                <button 
                  onClick={() => onFlyTo([fire.latitude, fire.longitude])}
                  className="action-btn secondary"
                  title="Zoom to Fire"
                  style={{
                    width: "30px",
                    height: "30px",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,255,255,0.15)"
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="3"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
