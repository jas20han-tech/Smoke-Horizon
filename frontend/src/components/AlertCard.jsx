import React from "react";

export default function AlertCard({ riskLevel, pm25 }) {
  const getAlertContent = (level) => {
    switch (level) {
      case "High":
        return {
          title: "Critical Smoke Plume Alert",
          message: `Stubble burning smoke transport is projected to cause severe air stagnation in Delhi-NCR, pushing PM2.5 levels to approximately ${pm25.toFixed(0)} µg/m³.`,
          precautions: [
            "Avoid strenuous outdoor activities and exercise.",
            "Sensitive groups must remain indoors.",
            "Ensure air purifiers are running at home.",
            "Wear N95 respiratory masks if going outside is mandatory."
          ],
          color: "var(--severity-high)",
          bgColor: "var(--severity-high-soft)",
          borderColor: "var(--border-flat)"
        };
      case "Medium":
        return {
          title: "Moderate Pollution Warning",
          message: `Elevated PM2.5 levels (~${pm25.toFixed(0)} µg/m³) expected as light smoke plumes drift towards Delhi.`,
          precautions: [
            "Asthmatics and elderly should minimize outdoor exposures.",
            "Keep doors and windows closed during peak morning/night hours.",
            "Consider indoor exercise rather than outdoor jogging."
          ],
          color: "var(--severity-mid)",
          bgColor: "var(--severity-mid-soft)",
          borderColor: "var(--border-flat)"
        };
      default:
        return {
          title: "Air Quality Normal",
          message: `Atmospheric dispersion remains favorable. Stubble smoke trajectory is blowing away from Delhi or fire counts are minimal. PM2.5 is stable at ~${pm25.toFixed(0)} µg/m³.`,
          precautions: [
            "Outdoor activities are safe to proceed.",
            "No special respirator precautions required."
          ],
          color: "var(--severity-low)",
          bgColor: "var(--severity-low-soft)",
          borderColor: "var(--border-flat)"
        };
    }
  };

  const alert = getAlertContent(riskLevel);

  return (
    <div className="glass-card" style={{ 
      background: alert.bgColor, 
      borderColor: alert.borderColor,
      transition: "all 0.3s ease"
    }}>
      <h2 style={{ color: alert.color, fontSize: "1.1rem" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ 
            width: "10px", 
            height: "10px", 
            borderRadius: "50%", 
            backgroundColor: alert.color
          }} />
          {alert.title}
        </span>
      </h2>
      <p style={{ fontSize: "0.85rem", lineHeight: "1.45", margin: "0.5rem 0 0.75rem 0", color: "var(--text-primary)" }}>
        {alert.message}
      </p>
      <div>
        <div style={{ fontSize: "0.75rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
          Recommended Precautions
        </div>
        <ul style={{ 
          fontSize: "0.8rem", 
          lineHeight: "1.4", 
          color: "var(--text-secondary)", 
          paddingLeft: "1.2rem", 
          display: "flex", 
          flexDirection: "column",
          gap: "0.3rem"
        }}>
          {alert.precautions.map((p, idx) => (
            <li key={idx}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
