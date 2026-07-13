import React, { useState } from "react";
import { updateFirmsKey } from "../api/client";

export default function FirmsKeyCard({ onKeySuccess, currentStatus }) {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanKey = key.trim();
    
    // If the input is empty, we clear the key and revert to simulated mode
    if (!cleanKey) {
      setLoading(true);
      setError("");
      setMessage("");
      try {
        const res = await updateFirmsKey("");
        setMessage("Reverted to simulated satellite feed.");
        setKey(""); // Clear input
        onKeySuccess(); // Trigger forecast reload in App
      } catch (err) {
        setError(err.message || "Failed to clear API key.");
      } finally {
        setLoading(false);
      }
      return;
    }
    
    // Enforce exactly 32 alphanumeric characters format
    const apiRegex = /^[a-zA-Z0-9]{32}$/;
    if (!apiRegex.test(cleanKey)) {
      setError("NASA FIRMS API key must be exactly 32 alphanumeric characters.");
      return;
    }
    
    setLoading(true);
    setError("");
    setMessage("");
    
    try {
      const res = await updateFirmsKey(cleanKey);
      setMessage(`Sync Success: Tracking ${res.fires_synced} live fires.`);
      setKey(""); // Clear input
      onKeySuccess(); // Trigger forecast reload in App
    } catch (err) {
      setError(err.message || "Failed to sync key.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card">
      <h2>
        <span>NASA Satellite Feed</span>
        <span style={{ 
          fontSize: "0.75rem", 
          background: currentStatus === "Connected" ? "var(--severity-low-soft)" : "var(--transition-blue-soft)",
          color: currentStatus === "Connected" ? "var(--severity-low)" : "var(--transition-blue)",
          padding: "0.1rem 0.5rem",
          borderRadius: "10px",
          border: "1px solid var(--border-flat)"
        }}>
          {currentStatus === "Connected" ? "Real-Time Feed" : "Simulated"}
        </span>
      </h2>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
          To unlock real-time global hotspots, enter your 32-character NASA FIRMS MAPS API key.
        </p>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="password"
            placeholder="Paste 32-character API key..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            style={{
              flex: 1,
              background: "var(--bg-base)",
              border: "1px solid var(--border-flat)",
              borderRadius: "4px",
              padding: "0.5rem",
              color: "var(--text-primary)",
              fontSize: "0.8rem",
              outline: "none"
            }}
          />
          <button 
            type="submit" 
            className="action-btn" 
            style={{ width: "auto", padding: "0.5rem 1rem" }}
            disabled={loading}
          >
            {loading ? "Linking..." : "Link API"}
          </button>
        </div>

        {error && (
          <div style={{ fontSize: "0.75rem", color: "var(--severity-high)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
            ⚠️ {error}
          </div>
        )}
        {message && (
          <div style={{ fontSize: "0.75rem", color: "var(--severity-low)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
            ✓ {message}
          </div>
        )}

        {/* Open-Meteo Status */}
        <div style={{ 
          fontSize: "0.7rem", 
          color: "var(--text-secondary)", 
          display: "flex", 
          justifyContent: "space-between", 
          borderTop: "1px solid var(--border-flat)", 
          paddingTop: "0.6rem", 
          marginTop: "0.25rem" 
        }}>
          <span>Open-Meteo Weather API</span>
          <span style={{ color: "var(--severity-low)", fontWeight: "600" }}>● Connected (Live 3-Station Sync)</span>
        </div>
      </form>
    </div>
  );
}
