import React from "react";

export default function SandboxControls({ 
  customFrp, 
  onChangeFrp, 
  customFireCount, 
  onClearCustom, 
  onSyncSatellite, 
  isSyncing 
}) {
  return (
    <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h2>
        <span>Simulation Sandbox</span>
        {customFireCount > 0 && (
          <span style={{ 
            fontSize: "0.75rem", 
            background: "var(--severity-low-soft)", 
            color: "var(--severity-low)", 
            padding: "0.1rem 0.5rem", 
            border: "1px solid var(--severity-low-soft)",
            borderRadius: "10px" 
          }}>
            {customFireCount} Custom Fire{customFireCount > 1 ? "s" : ""} Active
          </span>
        )}
      </h2>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
          <span>Spawn Fire Intensity (FRP)</span>
          <span style={{ color: "var(--transition-blue)", fontWeight: "bold" }}>{customFrp} MW</span>
        </div>
        <input 
          type="range" 
          min="50" 
          max="500" 
          step="50"
          value={customFrp} 
          onChange={(e) => onChangeFrp(parseInt(e.target.value, 10))}
          className="timeline-scrubber"
          style={{ height: "4px" }}
        />
        <div className="sandbox-instructions">
          Double-click anywhere on the map grid (Punjab/Haryana regions) to spawn a custom fire hotspot at that coordinate with the selected intensity!
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
        <button 
          className="action-btn secondary"
          onClick={onSyncSatellite}
          disabled={isSyncing}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
          </svg>
          {isSyncing ? "Syncing..." : "Sync Feeds"}
        </button>

        <button 
          className="action-btn danger"
          onClick={onClearCustom}
          disabled={customFireCount === 0}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
          Reset Sandbox
        </button>
      </div>
    </div>
  );
}
