/**
 * WhatsAppAlerts.jsx
 *
 * UI for configuring WhatsApp advance-warning alerts.
 * Alerts fire on FORECASTED values, not current live readings.
 *
 * Visual language: deep slate, ember amber for alert states,
 * atmospheric blue for forecast/info states — consistent with
 * Smoke Horizon's environmental forecasting aesthetic.
 */
import React, { useState } from "react";
import { createAlertSubscription, deleteAlertSubscription, testAlertSend } from "../api/client";

// ── Palette (mirrors index.css tokens) ───────────────────────
const T = {
  amber:   "#E8A33D",
  blue:    "#4A8FE0",
  green:   "#1D9E75",
  red:     "#E85D3D",
  muted:   "#6B7280",
  border:  "#1C2430",
  surface: "#111519",
  text:    "#E8E6E0",
};

// ── Subcomponents ─────────────────────────────────────────────

function FieldLabel({ children, required }) {
  return (
    <label style={{
      display: "block",
      fontSize: "0.68rem",
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: T.muted,
      marginBottom: 5,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {children}
      {required && <span style={{ color: T.amber, marginLeft: 3 }}>*</span>}
    </label>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <FieldLabel required={required}>{label}</FieldLabel>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "7px 10px",
  background: "rgba(255,255,255,0.03)",
  border: `1px solid ${T.border}`,
  borderRadius: 3,
  color: T.text,
  fontSize: "0.82rem",
  fontFamily: "inherit",
  outline: "none",
  transition: "border-color 0.15s",
  boxSizing: "border-box",
};

const selectStyle = { ...inputStyle, cursor: "pointer" };

function StatusBanner({ status }) {
  if (!status) return null;
  const cfg = {
    success: { bg: "rgba(29,158,117,0.08)", border: "rgba(29,158,117,0.3)", color: T.green, icon: "✓" },
    error:   { bg: "rgba(232,93,61,0.08)",  border: "rgba(232,93,61,0.3)",  color: T.red,   icon: "✕" },
    info:    { bg: "rgba(74,143,224,0.06)",  border: "rgba(74,143,224,0.25)",color: T.blue,  icon: "ℹ" },
    warn:    { bg: "rgba(232,163,61,0.06)",  border: "rgba(232,163,61,0.25)",color: T.amber, icon: "⚠" },
  }[status.type] || {};

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      padding: "8px 10px",
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: 3, fontSize: "0.76rem", color: cfg.color,
      lineHeight: 1.45,
    }}>
      <span style={{ flexShrink: 0, fontWeight: 700, marginTop: 1 }}>{cfg.icon}</span>
      <span>{status.message}</span>
    </div>
  );
}

function ActiveSubscriptionCard({ sub, onDelete, onTest }) {
  const [deleting, setDeleting] = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [testStatus, setTestStatus] = useState(null);

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(sub.id);
    setDeleting(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestStatus(null);
    try {
      await onTest(sub.id);
      setTestStatus({ type: "success", message: "Test message sent! Check your WhatsApp." });
    } catch (e) {
      const msg = e.message.includes("Twilio credentials not configured")
        ? "Twilio credentials missing — add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to your .env file and restart the backend."
        : e.message.includes("not a valid")
        ? "Make sure you have sent 'join <keyword>' from your WhatsApp to the Twilio sandbox number first."
        : e.message;
      setTestStatus({ type: "error", message: msg });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${T.border}`,
      borderRadius: 4, padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 7,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: "0.82rem", fontWeight: 600, color: T.text }}>{sub.name}</div>
          <div style={{ fontSize: "0.7rem", color: T.muted, fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>
            {sub.phone_number}
          </div>
        </div>
        <div style={{
          fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em",
          padding: "2px 7px", borderRadius: 2,
          border: `1px solid ${T.amber}44`, color: T.amber,
          background: "rgba(232,163,61,0.08)",
          fontFamily: "JetBrains Mono, monospace",
          whiteSpace: "nowrap",
        }}>
          {sub.metric} &gt; {sub.threshold}
        </div>
      </div>

      {/* Details */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "Location", value: sub.location },
          { label: "Window",   value: `${sub.forecast_window_hours}h ahead` },
          { label: "Status",   value: sub.is_active ? "Active" : "Paused",
            color: sub.is_active ? T.green : T.muted },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div style={{ fontSize: "0.6rem", color: T.muted, textTransform: "uppercase",
              letterSpacing: "0.08em", fontFamily: "JetBrains Mono, monospace" }}>{label}</div>
            <div style={{ fontSize: "0.76rem", color: color || T.text, marginTop: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {testStatus && <StatusBanner status={testStatus} />}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        <button onClick={handleTest} disabled={testing} style={{
          flex: 1, padding: "5px 0", fontSize: "0.7rem", fontWeight: 600,
          fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.06em",
          background: "rgba(74,143,224,0.07)", border: `1px solid ${T.blue}55`,
          borderRadius: 3, color: T.blue, cursor: testing ? "not-allowed" : "pointer",
          opacity: testing ? 0.5 : 1, transition: "all 0.15s",
        }}>
          {testing ? "SENDING…" : "TEST SEND"}
        </button>
        <button onClick={handleDelete} disabled={deleting} style={{
          flex: 1, padding: "5px 0", fontSize: "0.7rem", fontWeight: 600,
          fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.06em",
          background: "rgba(232,93,61,0.07)", border: `1px solid ${T.red}55`,
          borderRadius: 3, color: T.red, cursor: deleting ? "not-allowed" : "pointer",
          opacity: deleting ? 0.5 : 1, transition: "all 0.15s",
        }}>
          {deleting ? "REMOVING…" : "REMOVE"}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

const DEFAULTS = {
  name: "",
  phone_number: "",
  location: "Delhi-NCR",
  metric: "AQI",
  threshold: "200",
  forecast_window_hours: "24",
};

export default function WhatsAppAlerts() {
  const [form, setForm]           = useState(DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus]       = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [showForm, setShowForm]   = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);

    // Basic frontend validation
    if (!form.name.trim()) {
      setStatus({ type: "error", message: "Name is required." });
      setSubmitting(false); return;
    }
    if (!form.phone_number.startsWith("+")) {
      setStatus({ type: "error", message: "Phone number must start with country code, e.g. +91 9876543210" });
      setSubmitting(false); return;
    }
    const thresh = parseFloat(form.threshold);
    if (isNaN(thresh) || thresh <= 0) {
      setStatus({ type: "error", message: "Threshold must be a positive number." });
      setSubmitting(false); return;
    }

    try {
      const sub = await createAlertSubscription({
        name: form.name.trim(),
        phone_number: form.phone_number.replace(/\s/g, ""),
        location: form.location,
        metric: form.metric,
        threshold: thresh,
        forecast_window_hours: parseInt(form.forecast_window_hours),
      });
      setSubscriptions(prev => [...prev, sub]);
      setStatus({
        type: "success",
        message: `Alert created. You'll receive a WhatsApp message at ${sub.phone_number} when forecasted ${sub.metric} exceeds ${sub.threshold} within ${sub.forecast_window_hours} hours.`,
      });
      setForm(DEFAULTS);
      setShowForm(false);
    } catch (err) {
      if (err.message.includes("already exists")) {
        setStatus({ type: "warn", message: err.message });
      } else {
        setStatus({ type: "error", message: err.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteAlertSubscription(id);
      setSubscriptions(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    }
  };

  const handleTest = async (id) => {
    return testAlertSend(id); // caller handles status display
  };

  return (
    <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header */}
      <h2 style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={T.amber} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.21 3.44 2 2 0 0 1 3.22 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.09a16 16 0 0 0 6 6l.62-.62a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/>
          </svg>
          SMS Alerts
        </span>
        <button
          onClick={() => { setShowForm(f => !f); setStatus(null); }}
          style={{
            fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.07em",
            padding: "3px 9px", borderRadius: 2,
            background: showForm ? "rgba(232,163,61,0.12)" : "transparent",
            border: `1px solid ${showForm ? T.amber : T.border}`,
            color: showForm ? T.amber : T.muted,
            cursor: "pointer", fontFamily: "JetBrains Mono, monospace",
            transition: "all 0.15s",
          }}
        >
          {showForm ? "CANCEL" : "+ NEW ALERT"}
        </button>
      </h2>

      {/* Description */}
      <p style={{ fontSize: "0.74rem", color: T.muted, lineHeight: 1.55, marginTop: -4 }}>
        Receive advance SMS warnings when the <em>forecast</em> shows AQI or PM2.5
        will cross your threshold — hours before the smoke arrives.
      </p>

      {/* Status banner */}
      {status && <StatusBanner status={status} />}

      {/* New subscription form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Your Name" required>
              <input
                style={inputStyle} value={form.name} placeholder="e.g. Riya Sharma"
                onChange={e => set("name", e.target.value)}
                onFocus={e => e.target.style.borderColor = T.blue}
                onBlur={e  => e.target.style.borderColor = T.border}
              />
            </Field>
            <Field label="WhatsApp Number" required>
              <input
                style={inputStyle} value={form.phone_number} placeholder="+91 98765 43210"
                onChange={e => set("phone_number", e.target.value)}
                onFocus={e => e.target.style.borderColor = T.blue}
                onBlur={e  => e.target.style.borderColor = T.border}
              />
            </Field>
          </div>

          <Field label="Location / City">
            <input
              style={inputStyle} value={form.location} placeholder="Delhi-NCR"
              onChange={e => set("location", e.target.value)}
              onFocus={e => e.target.style.borderColor = T.blue}
              onBlur={e  => e.target.style.borderColor = T.border}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Alert Metric" required>
              <select style={selectStyle} value={form.metric} onChange={e => set("metric", e.target.value)}>
                <option value="AQI">AQI</option>
                <option value="PM2.5">PM2.5 (µg/m³)</option>
              </select>
            </Field>
            <Field label="Threshold" required>
              <input
                style={inputStyle} type="number" min="1" value={form.threshold}
                placeholder={form.metric === "AQI" ? "200" : "90"}
                onChange={e => set("threshold", e.target.value)}
                onFocus={e => e.target.style.borderColor = T.amber}
                onBlur={e  => e.target.style.borderColor = T.border}
              />
            </Field>
            <Field label="Forecast Window" required>
              <select
                style={selectStyle} value={form.forecast_window_hours}
                onChange={e => set("forecast_window_hours", e.target.value)}
              >
                <option value="18">18 hours</option>
                <option value="24">24 hours</option>
                <option value="36">36 hours</option>
              </select>
            </Field>
          </div>

          {/* Info note — forecasted not live */}
          <div style={{
            fontSize: "0.7rem", color: T.blue, lineHeight: 1.45,
            padding: "7px 10px", borderRadius: 3,
            background: "rgba(74,143,224,0.05)", border: `1px solid rgba(74,143,224,0.18)`,
            display: "flex", gap: 7, alignItems: "flex-start",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Alert triggers when the <strong style={{ color: T.blue }}>&nbsp;forecast&nbsp;</strong>
            crosses your threshold — giving you advance warning, not a real-time reading.
          </div>

          <button type="submit" disabled={submitting} style={{
            padding: "9px 0", fontWeight: 700, fontSize: "0.78rem",
            fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.08em",
            background: submitting ? "rgba(232,163,61,0.06)" : "rgba(232,163,61,0.12)",
            border: `1px solid ${T.amber}`,
            borderRadius: 3, color: T.amber,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.6 : 1, transition: "all 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {submitting ? "CREATING ALERT…" : "CREATE SMS ALERT"}
          </button>
        </form>
      )}

      {/* Active subscriptions */}
      {subscriptions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{
            fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
            color: T.muted, fontFamily: "JetBrains Mono, monospace", opacity: 0.6,
          }}>
            Active Subscriptions · {subscriptions.length}
          </div>
          {subscriptions.map(sub => (
            <ActiveSubscriptionCard
              key={sub.id} sub={sub}
              onDelete={handleDelete} onTest={handleTest}
            />
          ))}
        </div>
      )}

      {subscriptions.length === 0 && !showForm && (
        <div style={{
          textAlign: "center", padding: "16px 0",
          fontSize: "0.74rem", color: T.muted, opacity: 0.55,
          fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.04em",
        }}>
          No active alerts. Click + NEW ALERT to set one up.
        </div>
      )}
    </div>
  );
}
