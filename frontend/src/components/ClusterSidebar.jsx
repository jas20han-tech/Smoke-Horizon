import { useMemo, useEffect, useState } from "react";
import { getStateNameSync, primeCache } from "../utils/geoLocate";

// ── Palette ───────────────────────────────────────────────────
function riskCol(level) {
  if (level === "Severe") return "var(--severity-critical)";
  if (level === "High") return "var(--severity-high)";
  if (level === "Moderate" || level === "Medium") return "var(--severity-mid)";
  return "var(--severity-low)";
}

function frpSeverity(frp) {
  const t = Math.max(0, Math.min(1, (frp - 60) / 440));
  const fireColor = `color-mix(in srgb, var(--severity-high) ${Math.round((1 - t) * 100)}%, var(--severity-critical) ${Math.round(t * 100)}%)`;
  if (frp > 300) return { label: "SEVERE", color: fireColor };
  if (frp > 150) return { label: "HIGH", color: fireColor };
  if (frp > 60) return { label: "MODERATE", color: fireColor };
  return { label: "LOW", color: "var(--text-secondary)" };
}

// Estimate risk to Delhi based on frp and proximity
function estimateRisk(fire) {
  const distToDelhiLat = Math.abs(fire.latitude - 28.6139);
  const distToDelhiLon = Math.abs(fire.longitude - 77.209);
  const dist = Math.sqrt(distToDelhiLat ** 2 + distToDelhiLon ** 2);
  const score = (fire.frp / (dist + 1)) * 4;
  if (score > 80) return "High";
  if (score > 35) return "Moderate";
  return "Low";
}

// Format acquisition time
function formatTime(acqTime) {
  if (!acqTime) return "--";
  try {
    const d = new Date(acqTime);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) +
           " · " + d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return acqTime;
  }
}

// ── Single cluster row ────────────────────────────────────────
function ClusterRow({ fire, isSelected, onClick }) {
  const stateName = getStateNameSync(fire.latitude, fire.longitude);
  const severity = frpSeverity(fire.frp);
  const risk     = estimateRisk(fire);

  return (
    <button
      onClick={onClick}
      className={`cluster-row${isSelected ? " cluster-row--selected" : ""}`}
      aria-pressed={isSelected}
    >
      {/* Left: ID + location */}
      <div className="cluster-row-left">
        <div className="cluster-id mono">
          <span
            className="cluster-dot"
            style={{ background: severity.color }}
          />
          {fire.is_custom ? "CUSTOM" : `F-${String(fire.id).padStart(3, "0")}`}
        </div>
        <div className="cluster-city">{stateName}</div>
        <div className="cluster-meta mono">{stateName} · {formatTime(fire.acq_time)}</div>
      </div>

      {/* Right: FRP badge + risk badge */}
      <div className="cluster-row-right">
        <span className="cluster-badge mono" style={{ color: severity.color, borderColor: `color-mix(in srgb, ${severity.color} 28%, transparent)` }}>
          {severity.label}
        </span>
        <span className="cluster-badge mono" style={{ color: riskCol(risk), borderColor: `color-mix(in srgb, ${riskCol(risk)} 28%, transparent)` }}>
          {risk}↑
        </span>
      </div>
    </button>
  );
}

// ── Main sidebar ──────────────────────────────────────────────
export default function ClusterSidebar({ fires, selectedClusterId, onSelectCluster }) {
  const [, forceUpdate] = useState(0);

  // Prime geo cache async - triggers re-render once state names resolve
  useEffect(() => {
    primeCache(fires).then(() => forceUpdate(n => n + 1));
  }, [fires]);

  const sorted = useMemo(() =>
    [...(fires || [])].sort((a, b) => b.frp - a.frp),
    [fires]
  );

  const realFires   = sorted.filter((f) => !f.is_custom);
  const customFires = sorted.filter((f) =>  f.is_custom);

  return (
    <div className="cluster-sidebar glass-card">
      <h2 className="cluster-sidebar-title">
        Tracked Clusters
        <span className="cluster-count mono">{fires?.length || 0}</span>
      </h2>

      {fires?.length === 0 ? (
        <p className="cluster-empty mono">No active fire clusters detected.</p>
      ) : (
        <div className="cluster-list">
          {/* Real FIRMS clusters */}
          {realFires.length > 0 && (
            <>
              <div className="cluster-group-label mono">NASA FIRMS · {realFires.length} clusters</div>
              {realFires.map((fire) => (
                <ClusterRow
                  key={fire.id}
                  fire={fire}
                  isSelected={selectedClusterId === fire.id}
                  onClick={() => onSelectCluster(fire)}
                />
              ))}
            </>
          )}

          {/* Custom sandbox fires */}
          {customFires.length > 0 && (
            <>
              <div className="cluster-group-label mono" style={{ marginTop: 8 }}>
                Sandbox · {customFires.length} custom
              </div>
              {customFires.map((fire) => (
                <ClusterRow
                  key={fire.id}
                  fire={fire}
                  isSelected={selectedClusterId === fire.id}
                  onClick={() => onSelectCluster(fire)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
