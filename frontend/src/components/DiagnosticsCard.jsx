import React from "react";

export default function DiagnosticsCard({ currentData }) {
  if (!currentData) return null;

  const { 
    smoke_pm25, 
    baseline_pm25, 
    final_pm25, 
    boundary_layer_height, 
    relative_humidity, 
    precipitation 
  } = currentData;

  // Calculate percentage splits
  const smokePercent = final_pm25 > 0 ? (smoke_pm25 / final_pm25) * 100 : 0;
  const baselinePercent = final_pm25 > 0 ? (baseline_pm25 / final_pm25) * 100 : 100;

  // Calculate PBLH trapping factor
  // reference height in backend is 700.0
  const trappingRatio = 700.0 / boundary_layer_height;
  const clampedRatio = Math.max(0.35, Math.min(2.5, trappingRatio));

  // Determine dry deposition rate based on humidity (cloned from backend logic)
  let dryDepRate = 2.5;
  if (relative_humidity > 80) {
    dryDepRate = 2.5 + 5.0 * ((relative_humidity - 80.0) / 20.0);
  }

  // Wet deposition washout rate (15% per mm/h, max 85%)
  const wetWashout = Math.min(85, 15 * precipitation);

  return (
    <div className="glass-card">
      <h2>System Diagnostics</h2>
      <div className="weather-details" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        
        {/* Source apportionment progress bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>
            <span>Source Apportionment</span>
            <span>Smoke {smokePercent.toFixed(0)}% | City {baselinePercent.toFixed(0)}%</span>
          </div>
          <div style={{ width: "100%", height: "8px", background: "var(--panel-hover)", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${smokePercent}%`, height: "100%", background: "var(--severity-high)" }} />
            <div style={{ width: `${baselinePercent}%`, height: "100%", background: "var(--text-secondary)" }} />
          </div>
        </div>

        {/* Detailed stats grid */}
        <div className="weather-row">
          <span>Background City PM2.5</span>
          <span style={{ color: "var(--text-secondary)", fontWeight: "500" }}>{baseline_pm25.toFixed(1)} µg/m³</span>
        </div>
        
        <div className="weather-row">
          <span>Stubble Smoke PM2.5</span>
          <span style={{ color: "var(--severity-high)", fontWeight: "600" }}>+{smoke_pm25.toFixed(1)} µg/m³</span>
        </div>

        <div className="weather-row">
          <span>Boundary Layer Trapping</span>
          <span style={{ 
            fontWeight: "bold", 
            color: clampedRatio > 1.2 ? "var(--severity-high)" : clampedRatio > 0.8 ? "var(--severity-mid)" : "var(--severity-low)" 
          }}>
            {clampedRatio.toFixed(2)}x ({Math.round(boundary_layer_height)}m)
          </span>
        </div>

        <div className="weather-row">
          <span>Dry Deposition Rate</span>
          <span style={{ color: "var(--transition-blue)" }}>{dryDepRate.toFixed(1)}% / hr</span>
        </div>

        <div className="weather-row">
          <span>Precipitation Washout</span>
          <span style={{ color: precipitation > 0 ? "var(--severity-low)" : "var(--text-secondary)" }}>
            {precipitation > 0 ? `${wetWashout.toFixed(0)}% (${precipitation} mm/h)` : "0% (No Rain)"}
          </span>
        </div>

      </div>
    </div>
  );
}
