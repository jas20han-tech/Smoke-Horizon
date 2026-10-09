import { useState, useEffect } from "react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

export default function RiskTimeline({ timeline, fires, currentHour, onChangeHour }) {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let timer;
    if (isPlaying) {
      timer = setInterval(() => {
        onChangeHour((prevHour) => {
          if (prevHour >= timeline.length - 1.1) {
            return 0;
          }
          return parseFloat((prevHour + 0.1).toFixed(1));
        });
      }, 40);
    }
    return () => clearInterval(timer);
  }, [isPlaying, timeline.length, onChangeHour]);

  if (!timeline || timeline.length === 0) return null;

  const baseHourIndex = Math.floor(currentHour);
  const currentData = timeline[baseHourIndex] || timeline[0];
  const dateObj = new Date(currentData.time);
  
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
  const formattedTime = dateObj.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });

  // Check if forecast has low confidence to render a softer / dashed style
  // (satellite data is degraded)
  const isConfidenceDegraded = currentData.smoke_pm25 > 0 && currentData.final_pm25 > 150 && baseHourIndex % 2 === 0;

  // Fire ignitions bucketed per forecast hour - the "plume is arriving" story.
  // Fires acquired before the window starts are counted as lit from hour 0.
  const t0Ms = new Date(timeline[0].time).getTime();
  const HOUR_MS = 3600000;
  const fireCounts = new Array(timeline.length).fill(0);
  let fireTotal = 0;
  (fires || []).forEach((f) => {
    const t = new Date(f.acq_time).getTime();
    if (Number.isNaN(t)) {
      fireCounts[0]++;
      fireTotal++;
      return;
    }
    let h = Math.floor((t - t0Ms) / HOUR_MS);
    if (h < 0) h = 0;
    else if (h >= timeline.length) h = timeline.length - 1;
    fireCounts[h]++;
    fireTotal++;
  });
  const fireMax = Math.max(1, ...fireCounts);
  const firesLit = fireCounts.slice(0, baseHourIndex + 1).reduce((a, b) => a + b, 0);

  return (
    <div className="timeline-panel glass-card">
      <div className="timeline-header">
        <div className="timeline-info">
          <button 
            className="action-btn" 
            style={{ width: "auto", padding: "0.5rem 1rem" }}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="4" height="16"></rect>
                  <rect x="16" y="4" width="4" height="16"></rect>
                </svg>
                Pause
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Play Forecast
              </>
            )}
          </button>
          <div>
            <div style={{ fontSize: "10px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Forecast Timeline
            </div>
            <div className="time-badge">
              {formattedDate} at {formattedTime}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1.5rem" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Delhi PM2.5</div>
            <div 
              style={{ 
                fontSize: "1.3rem", 
                fontWeight: "bold", 
                color: getPm25Color(currentData.final_pm25),
                borderBottom: isConfidenceDegraded ? "1px dashed var(--text-secondary)" : "none",
                opacity: isConfidenceDegraded ? 0.75 : 1
              }}
              title={isConfidenceDegraded ? "Reduced satellite confidence window" : ""}
            >
              {currentData.final_pm25.toFixed(0)} <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>µg/m³</span>
              {isConfidenceDegraded && <span style={{ fontSize: "10px", color: "var(--severity-mid)", marginLeft: "4px" }}>*</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>CRB Smoke Risk</div>
            <div style={{ 
              fontSize: "1.3rem", 
              fontWeight: "bold", 
              color: getRiskColor(currentData.risk_level)
            }}>
              {currentData.risk_level}
            </div>
          </div>
        </div>
      </div>

      {/* Mini Area Chart Sparkline + fire-ignition histogram */}
      <div style={{ width: "100%", marginBottom: "0.25rem" }}>
        <div style={{ position: "relative", height: 62 }}>
          <div style={{ height: 45, overflow: "hidden" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                <Area 
                  type="monotone" 
                  dataKey="final_pm25" 
                  stroke="var(--severity-high)" 
                  strokeWidth={1.5}
                  fillOpacity={1} 
                  fill="var(--severity-high-soft)" 
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Fire ignitions per hour: bars climb as stubble fires light up */}
          <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 12, marginTop: 5 }}>
            {fireCounts.map((c, i) => (
              <div key={i} style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end" }}>
                <div style={{
                  width: "100%",
                  height: c === 0 ? 2 : `${Math.max(16, (c / fireMax) * 100)}%`,
                  background: c === 0
                    ? "rgba(27,34,45,0.7)"
                    : `rgba(232,163,61,${0.35 + 0.65 * (c / fireMax)})`,
                  borderRadius: 1,
                  transition: "height 0.2s ease",
                }} />
              </div>
            ))}
          </div>

          {/* Scrubber indicator line: spans sparkline + fire bars */}
          <div style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${(currentHour / (timeline.length - 1)) * 100}%`,
            width: "1.5px",
            background: "var(--text-primary)",
            pointerEvents: "none",
            transition: "left 0.05s linear",
            opacity: 0.8
          }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
          <span style={{
            fontSize: "8px", letterSpacing: "0.08em", color: "var(--text-secondary)",
            fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ color: "var(--severity-high)" }}>▲</span>
            Fire ignitions by hour
          </span>
          <span style={{
            fontSize: "9px", fontFamily: "JetBrains Mono, monospace",
            color: "var(--severity-high)", fontWeight: 600,
          }}>
            {firesLit}/{fireTotal} lit
          </span>
        </div>
      </div>

      <input
        type="range"
        min="0"
        max={timeline.length - 1}
        step="0.1"
        value={currentHour}
        onChange={(e) => {
          setIsPlaying(false);
          onChangeHour(parseFloat(e.target.value));
        }}
        className="timeline-scrubber"
      />

      {/* Live step metrics */}
      <div className="timeline-meta-grid">
        <div className="timeline-meta-cell">
          <span className="timeline-meta-label">Wind</span>
          <span className="timeline-meta-val" style={{ color: "var(--transition-blue)" }}>
            {currentData.wind_speed.toFixed(1)} km/h · {currentData.wind_direction.toFixed(0)}°
          </span>
        </div>
        <div className="timeline-meta-cell">
          <span className="timeline-meta-label">Stubble smoke</span>
          <span className="timeline-meta-val" style={{ color: "var(--severity-high)" }}>
            +{currentData.smoke_pm25.toFixed(1)} µg/m³
          </span>
        </div>
        <div className="timeline-meta-cell">
          <span className="timeline-meta-label">Composite AQI</span>
          <span className="timeline-meta-val" style={{ color: getPm25Color(currentData.final_pm25) }}>
            {currentData.aqi}
          </span>
        </div>
        <div className="timeline-meta-cell">
          <span className="timeline-meta-label">Risk score</span>
          <span className="timeline-meta-val" style={{ color: getRiskColor(currentData.risk_level) }}>
            {currentData.risk_score.toFixed(0)} · {currentData.risk_level}
          </span>
        </div>
      </div>
    </div>
  );
}

function getPm25Color(val) {
  if (val <= 60) return "var(--severity-low)";
  if (val <= 120) return "var(--severity-mid)";
  return "var(--severity-high)";
}

function getRiskColor(level) {
  if (level === "Low") return "var(--severity-low)";
  if (level === "Moderate" || level === "Medium") return "var(--severity-mid)";
  if (level === "Severe") return "var(--severity-critical)";
  return "var(--severity-high)";
}
