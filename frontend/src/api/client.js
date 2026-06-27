const API_BASE = "http://localhost:8000/api";

export async function fetchForecast() {
  const response = await fetch(`${API_BASE}/forecast/`);
  if (!response.ok) {
    throw new Error("Failed to fetch forecast simulation data.");
  }
  return response.json();
}

export async function fetchFires() {
  const response = await fetch(`${API_BASE}/fires/`);
  if (!response.ok) {
    throw new Error("Failed to fetch active fire hotspots.");
  }
  return response.json();
}

export async function addCustomFire(latitude, longitude, frp = 100) {
  const response = await fetch(`${API_BASE}/fires/?latitude=${latitude}&longitude=${longitude}&frp=${frp}`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error("Failed to add custom fire hotspot.");
  }
  return response.json();
}

export async function clearCustomFires() {
  const response = await fetch(`${API_BASE}/fires/custom`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error("Failed to clear custom fires.");
  }
  return response.json();
}

export async function fetchBacktest() {
  const response = await fetch(`${API_BASE}/backtest/`);
  if (!response.ok) {
    throw new Error("Failed to fetch backtest validation results.");
  }
  return response.json();
}

export async function updateFirmsKey(key) {
  const response = await fetch(`${API_BASE}/fires/key?key=${encodeURIComponent(key)}`, {
    method: "POST"
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.detail || "Failed to register NASA API key.");
  }
  return response.json();
}
