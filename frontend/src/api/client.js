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

// ── Exposure Score / Pinned Locations ────────────────────────

export async function createPin(payload) {
  const r = await fetch(`${API_BASE}/exposure/pins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.detail || "Failed to create pin.");
  return d;
}

export async function listPins() {
  const r = await fetch(`${API_BASE}/exposure/pins`);
  if (!r.ok) throw new Error("Failed to fetch pins.");
  return r.json();
}

export async function deletePin(id) {
  const r = await fetch(`${API_BASE}/exposure/pins/${id}`, { method: "DELETE" });
  const d = await r.json();
  if (!r.ok) throw new Error(d.detail || "Failed to delete pin.");
  return d;
}

export async function scoreAllPins(timeline, fires, forecastWindowHours = 24) {
  const r = await fetch(`${API_BASE}/exposure/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timeline, fires, forecast_window_hours: forecastWindowHours }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.detail || "Failed to score pins.");
  return d;
}

export async function createAlertSubscription(payload) {
  const response = await fetch(`${API_BASE}/alerts/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Failed to create alert subscription.");
  return data;
}

export async function deleteAlertSubscription(id) {
  const response = await fetch(`${API_BASE}/alerts/subscribe/${id}`, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Failed to delete subscription.");
  return data;
}

export async function testAlertSend(id) {
  const response = await fetch(`${API_BASE}/alerts/test-send/${id}`, { method: "POST" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Test send failed.");
  return data;
}

export async function checkAndSendAlerts(timeline) {
  const response = await fetch(`${API_BASE}/alerts/check-and-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timeline }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Alert check failed.");
  return data;
}
