/**
 * sourceAttribution.js
 * ─────────────────────────────────────────────────────────────
 * Approximate PM2.5 source apportionment model.
 *
 * Estimates the split between:
 *   (A) Crop-residue (stubble) burning contribution
 *   (B) Other urban sources — traffic, industry, dust, construction
 *
 * METHOD: Fire-hotspot-weighted back-trajectory approximation.
 *
 * For each fire hotspot we compute an "influence score":
 *
 *   fireInfluence = intensity × windAlignment × distanceDecay
 *                  × recencyWeight × seasonalWeight
 *
 * The sum is normalized and scaled to a stubble contribution %.
 * A pollution-sensitivity factor adjusts for current total PM2.5
 * (higher absolute PM2.5 → more weight given to transport events).
 *
 * Conservative caps keep the model honest:
 *   Outside burning season → max 20%
 *   Normal burning season  → max 65%
 *   Severe event (high fire count + favorable wind) → up to 80%
 *
 * Confidence scoring:
 *   High    — wind clearly aligned, multiple recent hotspots, burning season
 *   Medium  — partial alignment or few hotspots
 *   Low     — no nearby fires, off-season, or adverse wind
 *
 * NOTE: This is a research-grade approximation, not a certified
 * regulatory source apportionment result.
 */

// ── Geographic constants ──────────────────────────────────────
const DELHI_LAT = 28.614;
const DELHI_LON = 77.209;

// Source region centroids for back-trajectory check
const FIRE_REGION_CENTROID = { lat: 30.5, lon: 75.5 }; // Punjab/Haryana centroid

// Burning season definition (month numbers, 1-indexed)
const BURNING_SEASON_MONTHS = new Set([10, 11]); // October, November

// ── Helper: haversine distance in km ─────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Helper: bearing between two points (degrees) ─────────────
function bearing(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1R = (lat1 * Math.PI) / 180;
  const lat2R = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2R);
  const x =
    Math.cos(lat1R) * Math.sin(lat2R) -
    Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ── Helper: angular difference (0-180°) ──────────────────────
function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ── Wind alignment score (0-1) ───────────────────────────────
// 1.0 = wind blowing perfectly from fire source toward receptor
// 0.0 = perpendicular or opposing
function windAlignmentScore(windDirFrom, fireLat, fireLon, recepLat, recepLon) {
  // bearing FROM fire TO receptor
  const fireToReceptor = bearing(fireLat, fireLon, recepLat, recepLon);
  // wind direction is where wind comes FROM → where it blows TO = +180
  const windBlowingTo = (windDirFrom + 180) % 360;
  const diff = angleDiff(windBlowingTo, fireToReceptor);
  // cosine-based: 0° diff → 1.0,  90° → 0.0,  180° → -1 → clamp to 0
  return Math.max(0, Math.cos((diff * Math.PI) / 180));
}

// ── Distance decay (0-1) ─────────────────────────────────────
// Gaussian decay: σ = 250 km
// At 0 km → 1.0, at 250 km → 0.61, at 500 km → 0.14
function distanceDecay(distKm) {
  const sigma = 250;
  return Math.exp(-(distKm * distKm) / (2 * sigma * sigma));
}

// ── Recency weight (0-1) ─────────────────────────────────────
// Fires detected < 3h ago → 1.0, > 24h → 0.15
function recencyWeight(acqTimeStr) {
  if (!acqTimeStr) return 0.5;
  try {
    const ageHours = (Date.now() - new Date(acqTimeStr).getTime()) / 3600000;
    if (ageHours < 3) return 1.0;
    if (ageHours < 12) return 0.8;
    if (ageHours < 24) return 0.5;
    if (ageHours < 48) return 0.25;
    return 0.15;
  } catch {
    return 0.5;
  }
}

// ── Seasonal weight ───────────────────────────────────────────
// Oct-Nov: 1.0 (peak stubble burning)
// Sep/Dec: 0.4 (shoulder season)
// Otherwise: 0.1
function seasonalWeight(date = new Date()) {
  const month = date.getMonth() + 1; // 1-indexed
  if (BURNING_SEASON_MONTHS.has(month)) return 1.0;
  if (month === 9 || month === 12) return 0.4;
  return 0.1;
}

// ── Pollution sensitivity factor ─────────────────────────────
// When total PM2.5 is very high (>200), more weight to transport events.
// Scale: 1.0 at 60 µg/m³ → 1.4 at 200+ µg/m³
function pollutionSensitivity(totalPm25) {
  return Math.min(1.4, 1.0 + Math.max(0, totalPm25 - 60) / 350);
}

// ── Cap computation ───────────────────────────────────────────
function getMaxCap(isBurningSeason, fireCount, windAlignment) {
  if (!isBurningSeason) return 20;
  if (fireCount >= 15 && windAlignment >= 0.7) return 80;
  if (fireCount >= 8 && windAlignment >= 0.5) return 65;
  return 50;
}

// ── Main export ───────────────────────────────────────────────

/**
 * calculateSourceAttribution
 *
 * @param {object} params
 *   @param {number}   params.totalPm25       - Current / forecasted total PM2.5 (µg/m³)
 *   @param {number}   params.smokePm25       - Transport model smoke contribution (µg/m³)
 *   @param {number}   params.baselinePm25    - Urban baseline PM2.5 (µg/m³)
 *   @param {number}   params.windDirection   - Met wind direction (degrees, FROM)
 *   @param {number}   params.windSpeed       - Wind speed (km/h)
 *   @param {Array}    params.fires           - Array of fire hotspot objects
 *                                             Each: { latitude, longitude, frp, acq_time }
 *   @param {number}   params.recepLat        - Receptor latitude (default Delhi)
 *   @param {number}   params.recepLon        - Receptor longitude (default Delhi)
 *   @param {Date}     params.forecastDate    - Date of the forecast step
 *
 * @returns {object} Attribution result
 */
export function calculateSourceAttribution({
  totalPm25 = 100,
  smokePm25 = 0,
  baselinePm25 = 100,
  windDirection = 315,
  windSpeed = 10,
  fires = [],
  recepLat = DELHI_LAT,
  recepLon = DELHI_LON,
  forecastDate = new Date(),
}) {
  const seasWeight = seasonalWeight(forecastDate);
  const isBurningSeason = BURNING_SEASON_MONTHS.has(forecastDate.getMonth() + 1);
  const polSens = pollutionSensitivity(totalPm25);

  // ── Score each fire hotspot ───────────────────────────────
  let totalInfluence = 0;
  let maxAlign = 0;
  let fireScores = [];

  for (const fire of fires) {
    const { latitude: fLat, longitude: fLon, frp = 100, acq_time } = fire;
    if (!fLat || !fLon) continue;

    const dist    = haversineKm(fLat, fLon, recepLat, recepLon);
    const align   = windAlignmentScore(windDirection, fLat, fLon, recepLat, recepLon);
    const decay   = distanceDecay(dist);
    const recency = recencyWeight(acq_time);
    // Normalize FRP: 200 MW = 1.0 reference intensity
    const intensity = Math.min(3.0, frp / 200);

    const score = intensity * align * decay * recency * seasWeight;
    totalInfluence += score;
    if (align > maxAlign) maxAlign = align;
    fireScores.push({ dist: Math.round(dist), align: +align.toFixed(2), score });
  }

  // ── Derive stubble contribution % ────────────────────────
  // Baseline: use the transport model's direct smoke % if available
  let directModelPct = totalPm25 > 0 ? (smokePm25 / totalPm25) * 100 : 0;

  // Hotspot-weighted supplement
  // normalizedInfluence: 0 at no fires, approaches 1 with many strong nearby fires
  const N_REF = 10; // reference fire count for normalization
  const normalizedInfluence =
    fires.length > 0
      ? Math.min(1, totalInfluence / (N_REF * seasWeight * polSens))
      : 0;

  // Blend: direct model % gives the base; hotspot influence adjusts it
  // Weight toward direct model (60%) + hotspot model (40%)
  const blendedPct =
    directModelPct * 0.6 +
    normalizedInfluence * 100 * polSens * 0.4;

  // Apply cap
  const maxCap = getMaxCap(isBurningSeason, fires.length, maxAlign);
  const stubblePct = Math.round(Math.min(maxCap, Math.max(0, blendedPct)));
  const otherPct   = 100 - stubblePct;

  // ── Confidence score ─────────────────────────────────────
  // High   ≥ 2 conditions, Medium = 1-2, Low = 0
  let confidenceScore = 0;
  if (isBurningSeason)        confidenceScore += 1;
  if (fires.length >= 5)      confidenceScore += 1;
  if (maxAlign >= 0.6)        confidenceScore += 1;
  if (windSpeed >= 8)         confidenceScore += 0.5;
  if (smokePm25 > 10)         confidenceScore += 1;

  const confidence =
    confidenceScore >= 3.5 ? "High"
    : confidenceScore >= 2  ? "Medium"
    : "Low";

  // ── Dominant wind bearing label ───────────────────────────
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const windLabel = dirs[Math.round(windDirection / 22.5) % 16];

  // ── Influence factors text ────────────────────────────────
  const factors = [];
  if (isBurningSeason)
    factors.push("Active crop-residue burning season (Oct–Nov)");
  else
    factors.push("Outside peak burning season — fire contribution capped at 20%");
  if (fires.length > 0)
    factors.push(`${fires.length} active fire cluster${fires.length > 1 ? "s" : ""} detected`);
  else
    factors.push("No active fire hotspots currently detected");
  if (maxAlign >= 0.6)
    factors.push(`Wind (${windLabel}, ${windSpeed.toFixed(0)} km/h) aligned with fire-source corridor`);
  else if (maxAlign >= 0.3)
    factors.push(`Wind partially aligned with source region`);
  else
    factors.push(`Wind direction (${windLabel}) not aligned with fire-source corridor`);
  if (smokePm25 > 5)
    factors.push(`Transport model: +${smokePm25.toFixed(1)} µg/m³ smoke at receptor`);

  return {
    stubblePct,
    otherPct,
    totalPm25: Math.round(totalPm25 * 10) / 10,
    smokePm25: Math.round(smokePm25 * 10) / 10,
    baselinePm25: Math.round(baselinePm25 * 10) / 10,
    windDirection,
    windLabel,
    windSpeed,
    fireCount: fires.length,
    isBurningSeason,
    maxCap,
    confidence,
    factors,
    // Internals for transparency / debugging
    _normalizedInfluence: +normalizedInfluence.toFixed(3),
    _directModelPct:      +directModelPct.toFixed(1),
    _maxAlign:            +maxAlign.toFixed(2),
  };
}

/**
 * getMockFires — fallback mock fire dataset for development/demo.
 * Returns a realistic Nov stubble-burning footprint across Punjab/Haryana.
 */
export function getMockFires() {
  const now = new Date();
  const base = (h) => new Date(now.getTime() - h * 3600000).toISOString();
  return [
    { latitude:30.258, longitude:75.884, frp:284, acq_time: base(2)  },
    { latitude:30.763, longitude:75.252, frp:312, acq_time: base(3)  },
    { latitude:31.354, longitude:74.679, frp:182, acq_time: base(5)  },
    { latitude:30.986, longitude:75.621, frp:113, acq_time: base(6)  },
    { latitude:30.159, longitude:74.886, frp:242, acq_time: base(8)  },
    { latitude:29.756, longitude:76.225, frp:91,  acq_time: base(4)  },
    { latitude:29.851, longitude:76.452, frp:143, acq_time: base(7)  },
    { latitude:29.541, longitude:75.521, frp:167, acq_time: base(10) },
    { latitude:30.090, longitude:75.923, frp:128, acq_time: base(12) },
    { latitude:30.556, longitude:75.125, frp:194, acq_time: base(3)  },
    { latitude:31.285, longitude:74.986, frp:165, acq_time: base(6)  },
    { latitude:30.659, longitude:76.251, frp:108, acq_time: base(9)  },
  ];
}
