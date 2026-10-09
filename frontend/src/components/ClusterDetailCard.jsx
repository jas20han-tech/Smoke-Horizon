import { useMemo, useEffect, useState } from "react";
import { getStateNameSync, primeCache } from "../utils/geoLocate";

// ── Palette ───────────────────────────────────────────────────
const FIRE_HIGH = "var(--severity-high)";
const BLUE = "var(--transition-blue)";

function riskCol(level) {
  if (level === "Severe") return "var(--severity-critical)";
  if (level === "High") return "var(--severity-high)";
  if (level === "Moderate" || level === "Medium") return "var(--severity-mid)";
  return "var(--severity-low)";
}

// ── Transit progress calculation ─────────────────────────────
// Punjab centroid → Haryana centroid → Delhi
const WAYPOINTS = [
  { label: "Punjab",    lat: 31.1,    lon: 75.34  },
  { label: "Haryana",   lat: 29.65,   lon: 76.09  },
  { label: "Delhi-NCR", lat: 28.6139, lon: 77.209 },
];

function haversine(lat1, lon1, lat2, lon2) {
  const R  = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function transitProgress(fire, windSpeed = 15) {
  // Total corridor distance
  const totalDist = haversine(
    WAYPOINTS[0].lat, WAYPOINTS[0].lon,
    WAYPOINTS[2].lat, WAYPOINTS[2].lon
  );
  // Distance from fire to Delhi
  const distToDelhi = haversine(
    fire.latitude, fire.longitude,
    WAYPOINTS[2].lat, WAYPOINTS[2].lon
  );
  // Distance from fire to Punjab origin
  const distFromPunjab = haversine(
    fire.latitude, fire.longitude,
    WAYPOINTS[0].lat, WAYPOINTS[0].lon
  );

  // Progress: how far along the corridor from Punjab to Delhi
  const progress = Math.max(0, Math.min(1, distFromPunjab / totalDist));

  // Estimated hours to Delhi at wind speed (km/h), accounting for remaining dist
  const hoursToDelhi = distToDelhi / Math.max(windSpeed, 5);

  // Estimated PM2.5 contribution (rough: FRP-based scaling, decay with distance)
  const pm25Contribution = Math.round(
    (fire.frp * 0.08) * Math.exp(-distToDelhi / 400)
  );

  return { progress, distToDelhi: Math.round(distToDelhi), hoursToDelhi, pm25Contribution };
}

// ── Stage badge ───────────────────────────────────────────────
function StageBadge({ label, active, color }) {
  return (
    <div
      className="cdc-stage"
      style={{
        borderColor: active ? color : "var(--border-flat)",
        color:       active ? color : "var(--text-secondary)",
        background:  active ? color + "18" : "transparent",
      }}
    >
      {label}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function ClusterDetailCard({ fire, windSpeed, onClose }) {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (fire) primeCache([fire]).then(() => forceUpdate(n => n + 1));
  }, [fire]);

  const stateName = fire ? getStateNameSync(fire.latitude, fire.longitude) : "";
  const { progress, distToDelhi, hoursToDelhi, pm25Contribution } = useMemo(
    () => fire ? transitProgress(fire, windSpeed) : { progress: 0, distToDelhi: 0, hoursToDelhi: 0, pm25Contribution: 0 },
    [fire, windSpeed]
  );

  if (!fire) return null;

  const riskLevel =
    pm25Contribution > 60 ? "High" : pm25Contribution > 25 ? "Moderate" : "Low";

  // Which stage is the fire currently in?
  const stage =
    progress < 0.38 ? 0 :
    progress < 0.72 ? 1 : 2;

  const arrivalLabel =
    hoursToDelhi < 1
      ? "< 1 hour"
      : hoursToDelhi < 24
        ? `~${Math.round(hoursToDelhi)} hours`
        : `~${Math.round(hoursToDelhi / 24)} days`;

  return (
    <div className="cluster-detail-card glass-card">
      {/* Header */}
      <div className="cdc-header">
        <div>
          <span className="cdc-id mono">
            {fire.is_custom ? "CUSTOM FIRE" : `CLUSTER F-${String(fire.id).padStart(3, "0")}`}
          </span>
          <div className="cdc-city">{stateName}</div>
        </div>
        <button className="cdc-close" onClick={onClose} aria-label="Close detail">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Stats row */}
      <div className="cdc-stats">
        <div className="cdc-stat">
          <div className="cdc-stat-label mono">FRP</div>
          <div className="cdc-stat-value" style={{ color: FIRE_HIGH }}>{fire.frp.toFixed(0)} MW</div>
        </div>
        <div className="cdc-stat">
          <div className="cdc-stat-label mono">Distance to Delhi</div>
          <div className="cdc-stat-value" style={{ color: BLUE }}>{distToDelhi} km</div>
        </div>
        <div className="cdc-stat">
          <div className="cdc-stat-label mono">Estimated Arrival</div>
          <div className="cdc-stat-value" style={{ color: riskCol(riskLevel) }}>{arrivalLabel}</div>
        </div>
        <div className="cdc-stat">
          <div className="cdc-stat-label mono">PM2.5 Contribution</div>
          <div className="cdc-stat-value" style={{ color: riskCol(riskLevel) }}>+{pm25Contribution} µg/m³</div>
        </div>
      </div>

      {/* Route progress bar */}
      <div className="cdc-route">
        <div className="cdc-route-label mono">Transit corridor</div>

        {/* Stage chips */}
        <div className="cdc-stages">
          <StageBadge label="Punjab"    active={stage === 0} color={BLUE} />
          <div className="cdc-stage-arrow mono">→</div>
          <StageBadge label="Haryana"   active={stage === 1} color={BLUE}  />
          <div className="cdc-stage-arrow mono">→</div>
          <StageBadge label="Delhi-NCR" active={stage === 2} color={riskCol(riskLevel)} />
        </div>

        {/* Progress track */}
        <div className="cdc-track">
          <div
            className="cdc-track-fill"
            style={{
              width: `${Math.round(progress * 100)}%`,
              background: `linear-gradient(90deg, ${BLUE}, ${riskCol(riskLevel)})`,
            }}
          />
          {/* Moving marker */}
          <div
            className="cdc-track-dot"
            style={{ left: `${Math.round(progress * 100)}%`, borderColor: BLUE }}
          />
        </div>
        <div className="cdc-track-labels mono">
          <span>SOURCE</span>
          <span style={{ color: riskCol(riskLevel) }}>
            {Math.round(progress * 100)}% of route
          </span>
          <span>DELHI</span>
        </div>
      </div>

      {/* Coords */}
      <div className="cdc-coords mono">
        {fire.latitude.toFixed(4)}°N &nbsp;{fire.longitude.toFixed(4)}°E
        {fire.is_custom && <span style={{ color: BLUE, marginLeft: 8 }}>SANDBOX</span>}
      </div>
    </div>
  );
}
