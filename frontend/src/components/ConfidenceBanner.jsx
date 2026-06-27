import React from "react";

export default function ConfidenceBanner({ meta }) {
  if (!meta) return null;

  const { satellite_sync_status, cloud_cover_percent, is_gap_filled, confidence_score } = meta;

  const getConfidenceColor = (score) => {
    if (score >= 80) return "var(--risk-low)";
    if (score >= 50) return "var(--risk-med)";
    return "var(--risk-high)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {is_gap_filled && (
        <div className="banner warning">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <div>
            <strong>Satellite Cloud Gap Detected</strong>
            <div style={{ fontSize: "11px", marginTop: "2px", opacity: 0.85 }}>
              Heavy cloud cover ({cloud_cover_percent}%) detected. Spatial-temporal gap filling has re-injected past active hotspots to maintain forecast accuracy.
            </div>
          </div>
        </div>
      )}

      <div className="glass-card">
        <h2>Satellite Sync Health</h2>
        <div className="weather-details">
          <div className="weather-row">
            <span>Satellite Feed Status</span>
            <span style={{ 
              fontWeight: "bold", 
              color: satellite_sync_status === "Connected" ? "var(--risk-low)" : "var(--primary)" 
            }}>
              {satellite_sync_status}
            </span>
          </div>
          <div className="weather-row">
            <span>Regional Cloud Coverage</span>
            <span style={{ fontWeight: "bold" }}>{cloud_cover_percent}%</span>
          </div>
          <div className="weather-row">
            <span>Forecast Confidence Rating</span>
            <span style={{ 
              fontWeight: "bold", 
              color: getConfidenceColor(confidence_score)
            }}>
              {confidence_score}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
