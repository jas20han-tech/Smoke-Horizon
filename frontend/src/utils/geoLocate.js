/**
 * geoLocate.js — reverse geocode a lat/lon to Indian state name
 * using the same india-fast.json GeoJSON we already bundle.
 *
 * Uses point-in-polygon. Result is cached indefinitely (immutable geo data).
 */

let _geoData = null;
const _cache = new Map();

// Load GeoJSON once (dynamic import so it doesn't block initial render)
async function loadGeo() {
  if (_geoData) return _geoData;
  const mod = await import("../data/india-fast.json");
  _geoData = mod.default;
  return _geoData;
}

// Ray-casting PIP
function pip(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function pointInFeature(lng, lat, geo) {
  if (!geo) return false;
  const ok = r => pip(lng, lat, r);
  if (geo.type === "Polygon")      return geo.coordinates.some(ok);
  if (geo.type === "MultiPolygon") return geo.coordinates.some(p => p.some(ok));
  return false;
}

/**
 * Returns the Indian state name for a lat/lon coordinate.
 * Falls back to a coordinate-based label if outside India or GeoJSON not loaded yet.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string>}
 */
export async function getStateName(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (_cache.has(key)) return _cache.get(key);

  try {
    const geo = await loadGeo();
    for (const f of geo.features) {
      if (pointInFeature(lon, lat, f.geometry)) {
        const name = f.properties.name || "Unknown";
        _cache.set(key, name);
        return name;
      }
    }
  } catch (e) {
    // GeoJSON not available yet
  }

  // Outside all features — give a rough region name
  const fallback = getFallbackName(lat, lon);
  _cache.set(key, fallback);
  return fallback;
}

/**
 * Synchronous best-effort version — returns cached value or fallback.
 * Use this in render; call getStateName() once to prime the cache.
 */
export function getStateNameSync(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (_cache.has(key)) return _cache.get(key);
  // Not cached yet — return fallback and let async version fill cache
  return getFallbackName(lat, lon);
}

/** Prime the cache for a batch of fires */
export async function primeCache(fires) {
  if (!fires?.length) return;
  await Promise.all(fires.map(f => getStateName(f.latitude, f.longitude)));
}

function getFallbackName(lat, lon) {
  // Rough bounding boxes for common states not in punjab/haryana
  if (lat > 32 && lon > 74 && lon < 80)  return "Jammu & Kashmir";
  if (lat > 30 && lat <= 32 && lon > 75 && lon < 79) return "Himachal Pradesh";
  if (lat > 28.5 && lat < 31 && lon > 77.5 && lon < 81) return "Uttarakhand";
  if (lat > 23.5 && lat < 30 && lon > 77 && lon < 84) return "Uttar Pradesh";
  if (lat > 23 && lat < 27 && lon > 84 && lon < 88)  return "Bihar";
  if (lat > 20 && lat < 24 && lon > 80 && lon < 84)  return "Madhya Pradesh";
  if (lat > 17 && lat < 21 && lon > 76 && lon < 80)  return "Maharashtra";
  if (lat > 22 && lat < 27 && lon > 72 && lon < 75)  return "Rajasthan";
  if (lat > 20 && lat < 24 && lon > 85 && lon < 87)  return "Odisha";
  if (lat > 22 && lat < 26 && lon > 87 && lon < 90)  return "West Bengal";
  if (lat > 24 && lat < 28 && lon > 91 && lon < 94)  return "Assam";
  if (lat > 8  && lat < 14 && lon > 76 && lon < 80)  return "Tamil Nadu";
  if (lat > 14 && lat < 18 && lon > 79 && lon < 84)  return "Andhra Pradesh";
  if (lat > 14 && lat < 19 && lon > 74 && lon < 77)  return "Karnataka";
  if (lat > 8  && lat < 13 && lon > 74 && lon < 78)  return "Kerala";
  if (lat > 19 && lat < 23 && lon > 80 && lon < 86)  return "Chhattisgarh";
  if (lat > 21 && lat < 25 && lon > 85 && lon < 87)  return "Jharkhand";
  if (lat > 25 && lat < 28 && lon > 88 && lon < 90)  return "West Bengal";
  if (lat > 26 && lat < 28 && lon > 89 && lon < 92)  return "Assam";
  if (lat > 27 && lon > 93)                           return "Arunachal Pradesh";
  if (lat > 23 && lat < 27 && lon > 92 && lon < 94)  return "Nagaland / Manipur";
  return `${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E`;
}

// Legacy compatibility — synchronous nearest-city lookup replaced by state lookup
export function getClosestCity(lat, lon) {
  return getStateNameSync(lat, lon);
}
