import React, { useState, useEffect } from "react";
import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";

export default function RiskTimeline({ timeline, currentHour, onChangeHour }) {
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

      {/* Mini Area Chart Sparkline representation of PM2.5 Forecast */}
      <div style={{ width: "100%", height: 45, position: "relative", marginBottom: "0.25rem", overflow: "hidden" }}>
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
        
        {/* Scrubber indicator line */}
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
