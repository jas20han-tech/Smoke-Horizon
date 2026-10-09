import { useEffect, useState } from "react";
import { scoreCities } from "../api/client";

const T = {
  text1: "#EAE8E2",
  text2: "#8FA3B1",
  text3: "#7E93A2",
  border: "#1E2933",
  green: "#1D9E75",
  amber: "#E8A33D",
  orange: "#F07040",
  red: "#E85D3D",
  blue: "#4A8FE0",
};

const RISK_COLOR = { Low: T.green, Moderate: T.amber, High: T.orange, Severe: T.red };

export default function CityComparison({ forecast }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!forecast || !Array.isArray(forecast.timeline)) return;
    let cancelled = false;
    setLoading(true);
    scoreCities(
      forecast.timeline,
      Array.isArray(forecast.fires) ? forecast.fires : [],
      24,
    )
      .then((data) => {
        if (cancelled) return;
        setRows([...data].sort((a, b) => b.forecasted_pm25 - a.forecasted_pm25));
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to score regional cities.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [forecast]);

  return (
    <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke={T.blue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18"/>
              <path d="M5 21V7l7-4 7 4v14"/>
              <path d="M9 21v-4h6v4"/>
            </svg>
            Regional Cities
          </span>
        </h2>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em",
          fontFamily: "JetBrains Mono, monospace",
          padding: "2px 8px", borderRadius: 2,
          border: `1px solid ${T.blue}44`, color: T.blue,
          background: T.blue + "10",
        }}>
          PEAK PM2.5 · 24H
        </span>
      </div>

      <p style={{
        margin: 0, fontSize: "0.7rem", color: T.text2, lineHeight: 1.5,
      }}>
        Exposure outlook across Punjab, Haryana and NCR hubs, scored with the
        same transport model as pinned locations. Ranked by forecast PM2.5.
      </p>

      {loading && !rows && (
        <div style={{
          fontSize: "0.7rem", color: T.text3,
          fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.05em",
        }}>
          SCORING CITIES…
        </div>
      )}

      {error && (
        <div style={{
          fontSize: "0.68rem", color: T.red, lineHeight: 1.5,
          border: `1px solid ${T.red}33`, borderRadius: 3,
          padding: "6px 8px", background: T.red + "0d",
        }}>
          {error}
        </div>
      )}

      {rows && rows.length === 0 && !error && (
        <div style={{ fontSize: "0.7rem", color: T.text3 }}>
          No city scores available yet.
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((city) => {
            const riskColor = RISK_COLOR[city.risk_level] || T.text2;
            return (
              <div key={city.city} style={{
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${T.border}`,
                borderRadius: 3, padding: "8px 10px",
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: T.text1 }}>
                    {city.city}
                  </span>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em",
                    fontFamily: "JetBrains Mono, monospace",
                    padding: "2px 7px", borderRadius: 2,
                    border: `1px solid ${riskColor}44`, color: riskColor,
                    background: riskColor + "12",
                  }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: riskColor, display: "inline-block",
                    }} />
                    {city.risk_level.toUpperCase()}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{
                    fontSize: "0.72rem", color: T.text2,
                    fontFamily: "JetBrains Mono, monospace",
                  }}>
                    {city.forecasted_pm25.toFixed(1)} µg/m³ PM2.5
                  </span>
                  <span style={{
                    fontSize: "0.72rem", color: T.text2,
                    fontFamily: "JetBrains Mono, monospace",
                  }}>
                    AQI {city.forecasted_aqi}
                  </span>
                </div>

                <div style={{
                  height: 5, borderRadius: 3, overflow: "hidden",
                  background: T.border,
                }}>
                  <div style={{
                    width: `${Math.min(100, city.exposure_score)}%`,
                    height: "100%", background: riskColor,
                    transition: "width 0.8s ease",
                  }} />
                </div>

                <div style={{
                  display: "flex", justifyContent: "space-between",
                  fontSize: "0.58rem", letterSpacing: "0.06em",
                  fontFamily: "JetBrains Mono, monospace", color: T.text3,
                }}>
                  <span>EXPOSURE {city.exposure_score}/100</span>
                  <span>± {city.forecast_window_hours}h</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{
        fontSize: "0.62rem", color: T.text3, lineHeight: 1.45,
        borderTop: `1px solid ${T.border}`, paddingTop: 8, margin: 0,
        fontStyle: "italic",
      }}>
        Scores interpolate the Delhi smoke transport forecast to each city and
        weight proximity to active fire clusters. Research-grade estimate - not
        an official regulatory forecast.
      </p>
    </div>
  );
}
