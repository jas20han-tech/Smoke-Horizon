/**
 * SourceAttribution.jsx
 * ─────────────────────────────────────────────────────────────
 * Visualises the estimated PM2.5 source split:
 *   • Stubble-burning contribution  (warm orange/red)
 *   • Other urban sources           (neutral blue-gray)
 *
 * Uses calculateSourceAttribution() from sourceAttribution.js.
 * Falls back to mock fire data when no live fires are available.
 */
import { useMemo, useState } from "react";
import {
  calculateSourceAttribution,
  getMockFires,
} from "../utils/sourceAttribution";

// ── Palette tokens ────────────────────────────────────────────
const T = {
  fire:    "#E8743B",  // stubble: warm fire orange
  fireHi:  "#E04848",  // severe stubble
  fireLo:  "#D4913A",  // light stubble
  other:   "#4A8FBF",  // other sources: atmospheric blue
  otherDim:"#263F52",  // other dim
  bg:      "#0F1419",
  border:  "#1E2933",
  text1:   "#EAE8E2",
  text2:   "#8FA3B1",
  text3:   "#576470",
  green:   "#2DB87A",
  amber:   "#D4913A",
  red:     "#E04848",
};

const CONFIDENCE_COLOR = { High: T.green, Medium: T.amber, Low: T.red };

// ── Donut chart - pure SVG, no library ───────────────────────
function DonutChart({ stubblePct, otherPct }) {
  const R = 36, CX = 50, CY = 50;
  const circ = 2 * Math.PI * R;

  // stubble arc
  const stubbleDash = (stubblePct / 100) * circ;
  // other arc starts after stubble
  const otherDash   = (otherPct  / 100) * circ;

  // color based on severity
  const stubbleColor =
    stubblePct >= 60 ? T.fireHi : stubblePct >= 30 ? T.fire : T.fireLo;

  return (
    <svg viewBox="0 0 100 100" width="110" height="110" aria-hidden="true">
      {/* Track */}
      <circle cx={CX} cy={CY} r={R} fill="none"
        stroke={T.border} strokeWidth="12" />

      {/* Other sources arc */}
      <circle cx={CX} cy={CY} r={R} fill="none"
        stroke={T.other} strokeWidth="12"
        strokeDasharray={`${otherDash} ${circ - otherDash}`}
        strokeDashoffset={-stubbleDash}   /* starts after stubble */
        strokeLinecap="butt"
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
      />

      {/* Stubble arc */}
      <circle cx={CX} cy={CY} r={R} fill="none"
        stroke={stubbleColor} strokeWidth="12"
        strokeDasharray={`${stubbleDash} ${circ - stubbleDash}`}
        strokeLinecap="butt"
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%",
          transition: "stroke-dasharray 0.8s ease" }}
      />

      {/* Centre label */}
      <text x="50" y="46" textAnchor="middle"
        fontSize="13" fontWeight="800" fill={stubbleColor}
        fontFamily="JetBrains Mono, monospace">
        {stubblePct}%
      </text>
      <text x="50" y="57" textAnchor="middle"
        fontSize="6.5" fill={T.text3}
        fontFamily="JetBrains Mono, monospace" letterSpacing="0.04em">
        STUBBLE
      </text>
    </svg>
  );
}

// ── Stacked bar ───────────────────────────────────────────────
function StackedBar({ stubblePct, otherPct }) {
  const stubbleColor =
    stubblePct >= 60 ? T.fireHi : stubblePct >= 30 ? T.fire : T.fireLo;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        height: 8, borderRadius: 4, overflow: "hidden",
        background: T.border, display: "flex",
      }}>
        <div style={{
          width: `${stubblePct}%`, background: stubbleColor,
          transition: "width 0.8s ease",
        }} />
        <div style={{
          width: `${otherPct}%`, background: T.other,
          transition: "width 0.8s ease",
        }} />
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        marginTop: 4, fontSize: "0.62rem",
        fontFamily: "JetBrains Mono, monospace", color: T.text3,
      }}>
        <span style={{ color: stubbleColor }}>{stubblePct}% stubble</span>
        <span style={{ color: T.other }}>{otherPct}% other</span>
      </div>
    </div>
  );
}

// ── Confidence pill ───────────────────────────────────────────
function ConfidencePill({ level }) {
  const color = CONFIDENCE_COLOR[level] || T.text2;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em",
      fontFamily: "JetBrains Mono, monospace",
      padding: "2px 8px", borderRadius: 2,
      border: `1px solid ${color}44`, color,
      background: color + "10",
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: color, display: "inline-block",
      }} />
      {level.toUpperCase()} CONFIDENCE
    </span>
  );
}

// ── Legend item ───────────────────────────────────────────────
function LegendDot({ color, label, pct }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{
        width: 9, height: 9, borderRadius: 2,
        background: color, display: "inline-block", flexShrink: 0,
      }} />
      <span style={{ fontSize: "0.74rem", color: T.text2, flex: 1 }}>{label}</span>
      <span style={{
        fontSize: "0.82rem", fontWeight: 700,
        color: T.text1, fontFamily: "JetBrains Mono, monospace",
      }}>
        {pct}%
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function SourceAttribution({ currentData, fires }) {
  const [showFactors, setShowFactors] = useState(false);

  const result = useMemo(() => {
    if (!currentData) return null;

    // Use live fires if available; fall back to mock for demo
    const fireData =
      fires && fires.length > 0 ? fires : getMockFires();

    return calculateSourceAttribution({
      totalPm25:    currentData.final_pm25  ?? 100,
      smokePm25:    currentData.smoke_pm25  ?? 0,
      baselinePm25: currentData.baseline_pm25 ?? 100,
      windDirection:currentData.wind_direction ?? 315,
      windSpeed:    currentData.wind_speed  ?? 10,
      fires:        fireData,
      forecastDate: currentData.time ? new Date(currentData.time) : new Date(),
    });
  }, [currentData, fires]);

  if (!result) return null;

  const {
    stubblePct, otherPct,
    totalPm25, windLabel, windSpeed, fireCount,
    isBurningSeason, confidence, factors,
  } = result;

  const stubbleColor =
    stubblePct >= 60 ? T.fireHi : stubblePct >= 30 ? T.fire : T.fireLo;

  return (
    <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke={T.fire} strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2c1 2 2 3.5 2 5.5 0 2.5-1.5 4.5-4 4.5s-4-2-4-4.5c0-2 1-3.5 2-5.5z"/>
              <path d="M17.5 12c1.5 1.5 2.5 3 2.5 5 0 3.5-3 6.5-6.5 6.5-3.5 0-6.5-3-6.5-6.5 0-2 1-3.5 2.5-5"/>
            </svg>
            Source Attribution
          </span>
        </h2>
        <ConfidencePill level={confidence} />
      </div>

      {/* Visual: donut and legend side by side */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <DonutChart stubblePct={stubblePct} otherPct={otherPct} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <LegendDot
            color={stubbleColor}
            label="Stubble burning"
            pct={stubblePct}
          />
          <LegendDot
            color={T.other}
            label="Traffic / industry / dust"
            pct={otherPct}
          />

          {/* Stacked bar */}
          <StackedBar stubblePct={stubblePct} otherPct={otherPct} />
        </div>
      </div>

      {/* Meta row */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 6,
      }}>
        {[
          { label: "Total PM2.5",    value: `${totalPm25} µg/m³` },
          { label: "Wind",           value: `${windLabel} · ${windSpeed.toFixed(0)} km/h` },
          { label: "Active clusters",value: fireCount > 0 ? `${fireCount}` : "--" },
          { label: "Season",         value: isBurningSeason ? "Burning ✓" : "Off-season" },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.02)",
            border: `1px solid ${T.border}`,
            borderRadius: 3, padding: "5px 8px",
          }}>
            <div style={{
              fontSize: "0.58rem", color: T.text3,
              textTransform: "uppercase", letterSpacing: "0.08em",
              fontFamily: "JetBrains Mono, monospace",
            }}>{label}</div>
            <div style={{
              fontSize: "0.75rem", fontWeight: 600, color: T.text1,
              marginTop: 2, fontFamily: "JetBrains Mono, monospace",
            }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Influence factors: collapsible */}
      <div>
        <button
          onClick={() => setShowFactors(f => !f)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: "0.7rem", color: T.text2,
            display: "flex", alignItems: "center", gap: 4,
            padding: 0, fontFamily: "inherit",
            transition: "color 0.15s",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            style={{ transform: showFactors ? "rotate(90deg)" : "none",
              transition: "transform 0.2s" }}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          {showFactors ? "Hide" : "Show"} estimation factors
        </button>

        {showFactors && (
          <ul style={{
            marginTop: 6, paddingLeft: 14,
            display: "flex", flexDirection: "column", gap: 3,
          }}>
            {factors.map((f, i) => (
              <li key={i} style={{
                fontSize: "0.72rem", color: T.text2, lineHeight: 1.45,
              }}>
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Disclaimer */}
      <p style={{
        fontSize: "0.62rem", color: T.text3, lineHeight: 1.45,
        borderTop: `1px solid ${T.border}`, paddingTop: 8, margin: 0,
        fontStyle: "italic",
      }}>
        Approximate research-grade estimate based on fire hotspots, wind
        direction, distance decay, and seasonal weighting. Not an official
        regulatory source apportionment result.
      </p>
    </div>
  );
}
