import { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { fetchBacktest } from "../api/client";

export default function BacktestModal({ isOpen, onClose }) {
  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    fetchBacktest()
      .then((res) => {
        setData(res.data);
        setMetrics(res.metrics);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: "1.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.3rem", fontWeight: 700, margin: 0, color: "var(--transition-blue)" }}>
            Model Validation & Backtest
          </h2>
          <button 
            className="action-btn secondary" 
            style={{ width: "auto", padding: "0.4rem 0.8rem", borderRadius: "var(--r-sm)" }}
            onClick={onClose}
          >
            ✕ Close
          </button>
        </div>

        {loading && <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem" }}>Analyzing historical ground stations...</div>}
        {error && <div style={{ color: "var(--severity-high)", textAlign: "center", padding: "2rem" }}>{error}</div>}

        {!loading && !error && data && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.45" }}>
              The line chart compares forecasted PM2.5 levels against actual CPCB ITO station readings
              during <strong>{metrics.evaluation_period}</strong>. Fire inputs use simulated coordinates
              calibrated to real NW India stubble hotspots (NASA FIRMS). The transport model uses
              real Open-Meteo reanalysis weather for each day.
            </p>

            {/* Metrics cards grid */}
            <div className="stat-group">
              <div className="stat-box" style={{ background: "var(--transition-blue-soft)" }}>
                <span className="stat-label">R² (Total PM2.5)</span>
                <span className="stat-value" style={{ color: "var(--transition-blue)" }}>{metrics.r_squared}</span>
              </div>
              <div className="stat-box" style={{ background: "var(--severity-low-soft)" }}>
                <span className="stat-label">MAE (Total PM2.5)</span>
                <span className="stat-value" style={{ color: "var(--severity-low)" }}>{metrics.mean_absolute_error} µg/m³</span>
              </div>
              <div className="stat-box" style={{ background: "rgba(255,183,77,0.08)" }}>
                <span className="stat-label">Smoke Bias</span>
                <span className="stat-value" style={{ color: "#ffb74d" }}>{metrics.bias ?? "--"} µg/m³</span>
              </div>
              <div className="stat-box" style={{ background: "rgba(129,199,132,0.08)" }}>
                <span className="stat-label">Smoke MAE</span>
                <span className="stat-value" style={{ color: "#81c784" }}>{metrics.smoke_mae ?? "--"} µg/m³</span>
              </div>
            </div>

            {/* Recharts Comparison Container */}
            <div style={{ width: "100%", height: 300, background: "var(--bg-panel)", border: "1px solid var(--border-flat)", borderRadius: "var(--r-md)", padding: "0.5rem" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 15, right: 15, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-flat)" />
                  <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={11} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} label={{ value: 'PM2.5 (µg/m³)', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 10, offset: 10 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "var(--bg-panel)", 
                      border: "1px solid var(--border-flat)",
                      borderRadius: "var(--r-sm)",
                      color: "var(--text-primary)",
                      fontSize: "12px"
                    }} 
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "5px" }} />
                  <Line 
                    name="Delhi Baseline PM2.5" 
                    type="monotone" 
                    dataKey="baseline" 
                    stroke="var(--text-secondary)" 
                    strokeWidth={1.5}
                    strokeDasharray="5 5" 
                    dot={false}
                  />
                  <Line 
                    name="Model Forecasted PM2.5" 
                    type="monotone" 
                    dataKey="predicted" 
                    stroke="var(--severity-high)" 
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line 
                    name="Actual CPCB PM2.5" 
                    type="monotone" 
                    dataKey="actual" 
                    stroke="var(--transition-blue)" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic", textAlign: "right" }}>
              Model Status: {metrics.model_status}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
