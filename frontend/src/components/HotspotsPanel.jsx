import React, { useEffect } from "react";
import { getStateNameSync, primeCache } from "../utils/geoLocate";

// Re-export for backward compat with ClusterSidebar / ClusterDetailCard
export { getStateNameSync as getClosestCity };
export { getStateNameSync };

function frpColor(frp) {
  const t = Math.max(0, Math.min(1, (frp - 60) / 440));
  return `color-mix(in srgb, var(--severity-high) ${Math.round((1 - t) * 100)}%, var(--severity-critical) ${Math.round(t * 100)}%)`;
}

export default function HotspotsPanel({ fires, onFlyTo }) {
  // Prime the geo cache so state names resolve on next render
  useEffect(() => { primeCache(fires); }, [fires]);

  return (
    <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <h2>
        <span>Active Stubble Hotspots</span>
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          {fires.length} Locations
        </span>
      </h2>
      
      {fires.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontStyle: "italic", textAlign: "center", padding: "1rem" }}>
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
            const stateName = getStateNameSync(fire.latitude, fire.longitude);
            return (
              <div 
                key={fire.id} 
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--panel-subtle)",
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
                      backgroundColor: frpColor(fire.frp),
                      border: fire.is_custom ? "1px dashed var(--text-secondary)" : "none"
                    }} />
                    {stateName}
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
                    border: "1px solid color-mix(in srgb, var(--text-primary) 15%, transparent)"
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
