/**
 * ExposureScore.jsx — Personalized Exposure Score panel.
 *
 * Lets users pin locations (Home, School, Office, Hospital, Custom)
 * and see a 0-100 forecasted exposure risk score for each, based on
 * predicted smoke transport — not current AQI.
 *
 * Visual language: deep slate, ember amber/red for high risk,
 * atmospheric blue for forecast data, public-health tone.
 */
import React, { useState, useEffect, useCallback } from "react";
import { createPin, listPins, deletePin, scoreAllPins } from "../api/client";

// ── Palette ───────────────────────────────────────────────────
const C = {
  amber:   "#E8A33D",
  blue:    "#4A8FE0",
  green:   "#1D9E75",
  orange:  "#F07040",
  red:     "#E85D3D",
  muted:   "#6B7280",
  border:  "#1C2430",
  surface: "rgba(17,21,25,0.95)",
  text:    "#E8E6E0",
};

const RISK_COLORS = {
  Low:      C.green,
  Moderate: C.amber,
  High:     C.orange,
  Severe:   C.red,
};

const SENSITIVITY_LABELS = {
  adult:          "Adult (healthy)",
  child:          "Child (<12 yrs)",
  elderly:        "Elderly (60+)",
  asthma_copd:    "Asthma / COPD",
  outdoor_worker: "Outdoor Worker",
};

const LABEL_ICONS = {
  Home:     "🏠",
  School:   "🏫",
  Office:   "🏢",
  Hospital: "🏥",
  Custom:   "📍",
};

const DEFAULTS = {
  label: "Home", name: "", address: "",
  latitude: "", longitude: "",
  user_sensitivity: "adult",
};

// ── Sub-components ────────────────────────────────────────────

function ScoreRing({ score, riskLevel }) {
  const color = RISK_COLORS[riskLevel] || C.muted;
  const pct   = Math.min(100, Math.max(0, score));
  const r = 20, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        {/* Track */}
        <circle cx="28" cy="28" r={r} fill="none" stroke={C.border} strokeWidth="4"/>
        {/* Fill */}
        <circle cx="28" cy="28" r={r} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      {/* Score number */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1,
          fontFamily: "JetBrains Mono, monospace" }}>{score}</span>
        <span style={{ fontSize: 7, color: C.muted, letterSpacing: "0.04em" }}>/100</span>
      </div>
    </div>
  );
}

function RiskBadge({ level }) {
  const color = RISK_COLORS[level] || C.muted;
  return (
    <span style={{
      fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em",
      padding: "2px 7px", borderRadius: 2,
      border: `1px solid ${color}44`, color,
      background: color + "12",
      fontFamily: "JetBrains Mono, monospace",
      whiteSpace: "nowrap",
    }}>
      {level?.toUpperCase()}
    </span>
  );
}

function PinCard({ pin, score, onDelete, onRefresh, loading }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(pin.id);
    setDeleting(false);
  };

  const riskColor = score ? (RISK_COLORS[score.risk_level] || C.muted) : C.muted;

  return (
    <div style={{
      background: "rgba(255,255,255,0.018)",
      border: `1px solid ${score ? riskColor + "44" : C.border}`,
      borderRadius: 4,
      overflow: "hidden",
      transition: "border-color 0.3s",
    }}>
      {/* Header row */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 10,
          padding: "10px 12px", cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}
      >
        {score
          ? <ScoreRing score={score.exposure_score} riskLevel={score.risk_level} />
          : <div style={{ width: 56, height: 56, borderRadius: "50%",
              background: C.border, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
              {LABEL_ICONS[pin.label] || "📍"}
            </div>
        }

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: C.text }}>
              {LABEL_ICONS[pin.label]} {pin.name}
            </span>
            {score && <RiskBadge level={score.risk_level} />}
          </div>
          <div style={{ fontSize: "0.68rem", color: C.muted, marginTop: 2,
            fontFamily: "JetBrains Mono, monospace" }}>
            {SENSITIVITY_LABELS[pin.user_sensitivity] || pin.user_sensitivity}
            {pin.address && ` · ${pin.address}`}
          </div>
          {score && (
            <div style={{ fontSize: "0.68rem", marginTop: 3, color: C.muted }}>
              AQI <strong style={{ color: riskColor }}>{score.forecasted_aqi}</strong>
              {" · "}PM2.5 <strong style={{ color: riskColor }}>{score.forecasted_pm25} µg/m³</strong>
              {" · "}{score.forecast_window_hours}h window
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); onRefresh(pin.id); }}
            disabled={loading}
            style={{ background: "none", border: `1px solid ${C.border}`,
              borderRadius: 3, color: C.muted, cursor: loading ? "not-allowed" : "pointer",
              padding: "3px 6px", fontSize: 10, transition: "all 0.15s" }}
            title="Refresh score">
            ↺
          </button>
          <button onClick={e => { e.stopPropagation(); handleDelete(); }}
            disabled={deleting}
            style={{ background: "none", border: `1px solid ${C.red}44`,
              borderRadius: 3, color: C.red, cursor: deleting ? "not-allowed" : "pointer",
              padding: "3px 6px", fontSize: 10, opacity: deleting ? 0.5 : 1 }}
            title="Remove pin">
            ✕
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && score && (
        <div style={{ borderTop: `1px solid ${C.border}`,
          padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Risk reason */}
          <p style={{ fontSize: "0.75rem", color: C.text, lineHeight: 1.55, margin: 0 }}>
            {score.main_risk_reason}
          </p>
          {/* Recommended action */}
          <div style={{
            padding: "8px 10px", borderRadius: 3,
            background: riskColor + "0D",
            border: `1px solid ${riskColor}33`,
            fontSize: "0.72rem", color: C.text, lineHeight: 1.55,
          }}>
            <span style={{ fontWeight: 700, color: riskColor }}>Action: </span>
            {score.recommended_action}
          </div>
          {/* Stats row */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              { label: "Safe limit", value: `${score.safe_pm25_limit} µg/m³` },
              { label: "Sensitivity", value: `${score.sensitivity_multiplier}×` },
              { label: "Coords",      value: `${pin.latitude.toFixed(3)}°N, ${pin.longitude.toFixed(3)}°E` },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: "0.58rem", color: C.muted,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  fontFamily: "JetBrains Mono, monospace" }}>{label}</div>
                <div style={{ fontSize: "0.74rem", color: C.text }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Input style ───────────────────────────────────────────────
const inp = {
  width: "100%", padding: "7px 10px", boxSizing: "border-box",
  background: "rgba(255,255,255,0.03)",
  border: `1px solid ${C.border}`, borderRadius: 3,
  color: C.text, fontSize: "0.82rem", fontFamily: "inherit", outline: "none",
};
const sel = { ...inp, cursor: "pointer" };

// ── Main component ────────────────────────────────────────────

export default function ExposureScore({ forecast }) {
  const [pins,       setPins]       = useState([]);
  const [scores,     setScores]     = useState({});  // {pin_id: scoreObj}
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState(DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [loadingId,  setLoadingId]  = useState(null);
  const [error,      setError]      = useState(null);
  const [useMap,     setUseMap]     = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Load saved pins on mount
  useEffect(() => {
    listPins().then(setPins).catch(() => {});
  }, []);

  // Score all pins whenever forecast updates
  const refreshScores = useCallback(async (pinsToScore, window = 24) => {
    if (!forecast?.timeline || !pinsToScore?.length) return;
    try {
      const results = await scoreAllPins(
        forecast.timeline, forecast.fires || [], window
      );
      const map = {};
      results.forEach(r => { map[r.pin_id] = r; });
      setScores(prev => ({ ...prev, ...map }));
    } catch (e) {
      console.error("Score refresh failed:", e.message);
    }
  }, [forecast]);

  useEffect(() => {
    if (pins.length > 0) refreshScores(pins);
  }, [pins, forecast, refreshScores]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const lat = parseFloat(form.latitude);
    const lon = parseFloat(form.longitude);
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (isNaN(lat) || lat < 8 || lat > 38)  { setError("Latitude must be between 8 and 38 (India)."); return; }
    if (isNaN(lon) || lon < 68 || lon > 98) { setError("Longitude must be between 68 and 98 (India)."); return; }

    setSubmitting(true);
    try {
      const pin = await createPin({
        label:            form.label,
        name:             form.name.trim(),
        address:          form.address.trim() || null,
        latitude:         lat,
        longitude:        lon,
        user_sensitivity: form.user_sensitivity,
      });
      const updated = [...pins, pin];
      setPins(updated);
      await refreshScores(updated);
      setForm(DEFAULTS);
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deletePin(id);
      const updated = pins.filter(p => p.id !== id);
      setPins(updated);
      setScores(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRefresh = async (pinId) => {
    setLoadingId(pinId);
    await refreshScores(pins);
    setLoadingId(null);
  };

  return (
    <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      {/* Header */}
      <h2 style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={C.amber} strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          Exposure Score
        </span>
        <button onClick={() => { setShowForm(f => !f); setError(null); }}
          style={{
            fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.07em",
            padding: "3px 9px", borderRadius: 2,
            background: showForm ? "rgba(232,163,61,0.12)" : "transparent",
            border: `1px solid ${showForm ? C.amber : C.border}`,
            color: showForm ? C.amber : C.muted,
            cursor: "pointer", fontFamily: "JetBrains Mono, monospace",
            transition: "all 0.15s",
          }}>
          {showForm ? "CANCEL" : "+ PIN LOCATION"}
        </button>
      </h2>

      {/* Subhead */}
      <p style={{ fontSize: "0.73rem", color: C.muted, lineHeight: 1.55, marginTop: -6 }}>
        Pin your home, school, or workplace to get a personalised
        forecasted exposure risk score — hours before smoke arrives.
      </p>

      {/* Error */}
      {error && (
        <div style={{ fontSize: "0.74rem", color: C.red, padding: "7px 10px",
          background: "rgba(232,93,61,0.08)", border: "1px solid rgba(232,93,61,0.3)",
          borderRadius: 3 }}>
          {error}
        </div>
      )}

      {/* Add pin form */}
      {showForm && (
        <form onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* Label */}
            <div>
              <div style={{ fontSize: "0.63rem", fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", color: C.muted, marginBottom: 4,
                fontFamily: "JetBrains Mono, monospace" }}>
                Type <span style={{ color: C.amber }}>*</span>
              </div>
              <select style={sel} value={form.label} onChange={e => set("label", e.target.value)}>
                {Object.keys(LABEL_ICONS).map(l => (
                  <option key={l} value={l}>{LABEL_ICONS[l]} {l}</option>
                ))}
              </select>
            </div>
            {/* Sensitivity */}
            <div>
              <div style={{ fontSize: "0.63rem", fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", color: C.muted, marginBottom: 4,
                fontFamily: "JetBrains Mono, monospace" }}>
                Who uses this place <span style={{ color: C.amber }}>*</span>
              </div>
              <select style={sel} value={form.user_sensitivity}
                onChange={e => set("user_sensitivity", e.target.value)}>
                {Object.entries(SENSITIVITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Name */}
          <div>
            <div style={{ fontSize: "0.63rem", fontWeight: 600, letterSpacing: "0.08em",
              textTransform: "uppercase", color: C.muted, marginBottom: 4,
              fontFamily: "JetBrains Mono, monospace" }}>
              Location Name <span style={{ color: C.amber }}>*</span>
            </div>
            <input style={inp} value={form.name} placeholder="e.g. Home — Rohini Sector 8"
              onChange={e => set("name", e.target.value)}
              onFocus={e => e.target.style.borderColor = C.blue}
              onBlur={e  => e.target.style.borderColor = C.border} />
          </div>

          {/* Address */}
          <div>
            <div style={{ fontSize: "0.63rem", fontWeight: 600, letterSpacing: "0.08em",
              textTransform: "uppercase", color: C.muted, marginBottom: 4,
              fontFamily: "JetBrains Mono, monospace" }}>
              Address (optional)
            </div>
            <input style={inp} value={form.address} placeholder="Street / area / landmark"
              onChange={e => set("address", e.target.value)}
              onFocus={e => e.target.style.borderColor = C.blue}
              onBlur={e  => e.target.style.borderColor = C.border} />
          </div>

          {/* Lat/Lon */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: "0.63rem", fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", color: C.muted, marginBottom: 4,
                fontFamily: "JetBrains Mono, monospace" }}>
                Latitude <span style={{ color: C.amber }}>*</span>
              </div>
              <input style={inp} type="number" step="0.0001"
                value={form.latitude} placeholder="28.6139"
                onChange={e => set("latitude", e.target.value)}
                onFocus={e => e.target.style.borderColor = C.blue}
                onBlur={e  => e.target.style.borderColor = C.border} />
            </div>
            <div>
              <div style={{ fontSize: "0.63rem", fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", color: C.muted, marginBottom: 4,
                fontFamily: "JetBrains Mono, monospace" }}>
                Longitude <span style={{ color: C.amber }}>*</span>
              </div>
              <input style={inp} type="number" step="0.0001"
                value={form.longitude} placeholder="77.2090"
                onChange={e => set("longitude", e.target.value)}
                onFocus={e => e.target.style.borderColor = C.blue}
                onBlur={e  => e.target.style.borderColor = C.border} />
            </div>
          </div>

          <div style={{ fontSize: "0.68rem", color: C.blue, lineHeight: 1.45,
            padding: "6px 9px", borderRadius: 3,
            background: "rgba(74,143,224,0.05)", border: "1px solid rgba(74,143,224,0.18)" }}>
            💡 Find lat/lon: right-click any location on Google Maps → "What's here?"
          </div>

          <button type="submit" disabled={submitting} style={{
            padding: "9px 0", fontWeight: 700, fontSize: "0.78rem",
            fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.08em",
            background: submitting ? "rgba(232,163,61,0.06)" : "rgba(232,163,61,0.12)",
            border: `1px solid ${C.amber}`, borderRadius: 3,
            color: C.amber, cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.6 : 1, transition: "all 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            📍 {submitting ? "SAVING…" : "PIN THIS LOCATION"}
          </button>
        </form>
      )}

      {/* Pinned location cards */}
      {pins.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: "0.6rem", letterSpacing: "0.1em",
            textTransform: "uppercase", color: C.muted,
            fontFamily: "JetBrains Mono, monospace", opacity: 0.6 }}>
            {pins.length} pinned location{pins.length > 1 ? "s" : ""}
          </div>
          {pins.map(pin => (
            <PinCard
              key={pin.id}
              pin={pin}
              score={scores[pin.id] || null}
              onDelete={handleDelete}
              onRefresh={handleRefresh}
              loading={loadingId === pin.id}
            />
          ))}
        </div>
      ) : !showForm && (
        <div style={{ textAlign: "center", padding: "16px 0",
          fontSize: "0.73rem", color: C.muted, opacity: 0.5,
          fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.04em" }}>
          No pinned locations yet. Click + PIN LOCATION to add one.
        </div>
      )}

      {/* Risk scale legend */}
      {pins.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap",
          paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
          {[["Low","#1D9E75"],["Moderate","#E8A33D"],["High","#F07040"],["Severe","#E85D3D"]]
            .map(([l, c]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%",
                background: c, display: "inline-block" }} />
              <span style={{ fontSize: "0.62rem", color: C.muted,
                fontFamily: "JetBrains Mono, monospace" }}>{l}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
