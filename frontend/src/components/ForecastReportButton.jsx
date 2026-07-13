import { useMemo, useState } from "react";
import {
  calculateSourceAttribution,
  getMockFires,
} from "../utils/sourceAttribution";

const REPORT_FILENAME = "smoke-horizon-forecast-report.html";

function riskColor(level) {
  if (level === "Severe") return "#B42318";
  if (level === "High") return "#C2410C";
  if (level === "Moderate" || level === "Medium") return "#A16207";
  return "#047857";
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value, digits = 0) {
  return number(value).toFixed(digits);
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "Current forecast step";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSafetyActions(level) {
  if (level === "Severe") {
    return [
      "Avoid outdoor exposure during the peak-risk window.",
      "Keep schools, offices, and housing societies informed.",
      "Use indoor filtration where available and keep windows closed.",
      "Follow official AQI updates and public health advisories.",
    ];
  }

  if (level === "High") {
    return [
      "Avoid outdoor exercise and prolonged exertion.",
      "Use N95 masks for essential outdoor movement.",
      "Run an air purifier indoors if available.",
      "Protect children, elderly people, and asthma/COPD patients.",
      "Avoid outdoor sports or assemblies during high-risk hours.",
    ];
  }

  if (level === "Moderate" || level === "Medium") {
    return [
      "Reduce prolonged outdoor activity during the peak window.",
      "Close windows near the expected smoke arrival time.",
      "Sensitive groups should monitor AQI before outdoor plans.",
      "Keep masks available for longer outdoor travel.",
    ];
  }

  return [
    "Monitor local AQI updates.",
    "Normal activity is mostly okay for the general public.",
    "Sensitive groups should watch for changing smoke conditions.",
  ];
}

function getPeakRiskWindow(timeline, peakStep) {
  if (!timeline?.length || !peakStep) return "Not available";
  const peakIndex = timeline.indexOf(peakStep);
  const start = timeline[Math.max(0, peakIndex - 1)] || peakStep;
  const end = timeline[Math.min(timeline.length - 1, peakIndex + 1)] || peakStep;
  return `${formatDateTime(start.time)} to ${formatDateTime(end.time)}`;
}

function getConfidenceReason(meta) {
  if (!meta) return "available forecast inputs";
  if (meta.is_gap_filled) return "cloud-gap confidence adjustment";
  if (number(meta.cloud_cover_percent) >= 55) return "cloud cover over fire detections";
  if (meta.satellite_sync_status === "Connected") return "live satellite data";
  return "stable model inputs";
}

function getRecommendedAudience(riskLevel) {
  if (riskLevel === "Severe" || riskLevel === "High") {
    return "children, elderly people, asthma/COPD patients, and outdoor workers";
  }
  if (riskLevel === "Moderate" || riskLevel === "Medium") {
    return "sensitive groups and people with prolonged outdoor exposure";
  }
  return "general public";
}

function getReportData({ forecast, currentData, expectedArrival, meta, fires }) {
  const timeline = forecast?.timeline || [];
  const fallbackStep = currentData || timeline[0] || {};
  const peakAqiStep = timeline.reduce(
    (peak, step) => (number(step.aqi) > number(peak.aqi) ? step : peak),
    fallbackStep
  );
  const peakPm25Step = timeline.reduce(
    (peak, step) => (number(step.final_pm25) > number(peak.final_pm25) ? step : peak),
    fallbackStep
  );
  const fireData = fires?.length ? fires : getMockFires();
  const attribution = calculateSourceAttribution({
    totalPm25: number(fallbackStep.final_pm25, 0),
    smokePm25: number(fallbackStep.smoke_pm25, 0),
    baselinePm25: number(fallbackStep.baseline_pm25, 0),
    windDirection: number(fallbackStep.wind_direction, 315),
    windSpeed: number(fallbackStep.wind_speed, 10),
    fires: fireData,
    forecastDate: fallbackStep.time ? new Date(fallbackStep.time) : new Date(),
  });

  return {
    selectedTime: formatDateTime(fallbackStep.time),
    generatedAt: formatDateTime(new Date()),
    riskLevel: fallbackStep.risk_level || "Low",
    expectedArrival: expectedArrival || "No arrival window detected",
    peakAqi: Math.round(number(peakAqiStep.aqi, fallbackStep.aqi)),
    peakPm25: number(peakPm25Step.final_pm25, fallbackStep.final_pm25),
    baselinePm25: number(fallbackStep.baseline_pm25),
    smokePm25: number(fallbackStep.smoke_pm25),
    contributionPct: attribution.stubblePct,
    confidenceScore: Math.round(number(meta?.confidence_score, 0)),
    confidenceReason: getConfidenceReason(meta),
    peakRiskWindow: getPeakRiskWindow(timeline, peakAqiStep),
    recommendedAudience: getRecommendedAudience(fallbackStep.risk_level),
  };
}

function buildReportHtml(data) {
  const color = riskColor(data.riskLevel);
  const actions = getSafetyActions(data.riskLevel)
    .map((action) => `<li>${escapeHtml(action)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Smoke Horizon Forecast Alert</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef2f5;
      color: #17202a;
      font-family: Inter, Arial, sans-serif;
      line-height: 1.45;
    }
    .page {
      width: min(760px, 100%);
      margin: 0 auto;
      background: #fff;
      min-height: 100vh;
      padding: 28px;
    }
    .eyebrow {
      color: #506174;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    h1 {
      margin: 6px 0 8px;
      font-size: clamp(28px, 7vw, 42px);
      line-height: 1.02;
      letter-spacing: 0;
    }
    .timestamp {
      margin: 0 0 18px;
      color: #506174;
      font-size: 13px;
    }
    .alert {
      border-left: 6px solid ${color};
      background: #f8fafc;
      padding: 16px;
      margin: 18px 0;
    }
    .risk {
      color: ${color};
      font-weight: 900;
    }
    h2 {
      margin: 22px 0 10px;
      font-size: 16px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    p { margin: 0 0 10px; }
    .numbers {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .metric {
      border: 1px solid #d8e0e8;
      border-radius: 8px;
      padding: 11px 12px;
      background: #fbfcfd;
    }
    .label {
      color: #627386;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .value {
      margin-top: 4px;
      font-size: 18px;
      font-weight: 850;
    }
    ul {
      margin: 0;
      padding-left: 20px;
    }
    li { margin: 6px 0; }
    .advisory {
      display: grid;
      gap: 8px;
    }
    .advisory div {
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
    }
    .advisory strong { display: block; }
    .fineprint {
      color: #506174;
      font-size: 12px;
      border-top: 1px solid #d8e0e8;
      padding-top: 14px;
      margin-top: 20px;
    }
    @media (max-width: 560px) {
      .page { padding: 22px 18px; }
      .numbers { grid-template-columns: 1fr; }
    }
    @media print {
      body { background: #fff; }
      .page { width: 100%; min-height: auto; padding: 18mm; }
    }
  </style>
</head>
<body>
  <main class="page">
    <div class="eyebrow">Smoke Horizon</div>
    <h1>Smoke Horizon Forecast Alert</h1>
    <p class="timestamp">Generated: ${escapeHtml(data.generatedAt)} | Forecast step: ${escapeHtml(data.selectedTime)}</p>

    <section class="alert">
      <p><strong class="risk">${escapeHtml(data.riskLevel)}</strong> crop-smoke impact is forecast for Delhi-NCR.</p>
      <p>Smoke arrival: <strong>${escapeHtml(data.expectedArrival)}</strong>. Peak AQI may reach <strong>${escapeHtml(data.peakAqi)}</strong>, with peak PM2.5 near <strong>${escapeHtml(formatNumber(data.peakPm25, 1))} ug/m3</strong>. Crop-smoke contribution is estimated at <strong>${escapeHtml(data.contributionPct)}%</strong>.</p>
      <p>Peak risk window: <strong>${escapeHtml(data.peakRiskWindow)}</strong>. Main source region: Punjab/Haryana crop residue fires.</p>
    </section>

    <h2>Key Numbers</h2>
    <div class="numbers">
      <div class="metric"><div class="label">Risk Level</div><div class="value">${escapeHtml(data.riskLevel)}</div></div>
      <div class="metric"><div class="label">Estimated Arrival</div><div class="value">${escapeHtml(data.expectedArrival)}</div></div>
      <div class="metric"><div class="label">Peak AQI</div><div class="value">${escapeHtml(data.peakAqi)}</div></div>
      <div class="metric"><div class="label">Peak PM2.5</div><div class="value">${escapeHtml(formatNumber(data.peakPm25, 1))} ug/m3</div></div>
      <div class="metric"><div class="label">Urban Baseline PM2.5</div><div class="value">${escapeHtml(formatNumber(data.baselinePm25, 1))} ug/m3</div></div>
      <div class="metric"><div class="label">Crop Smoke PM2.5</div><div class="value">${escapeHtml(formatNumber(data.smokePm25, 1))} ug/m3</div></div>
      <div class="metric"><div class="label">Crop Smoke Contribution</div><div class="value">${escapeHtml(data.contributionPct)}%</div></div>
      <div class="metric"><div class="label">Forecast Confidence</div><div class="value">${escapeHtml(data.confidenceScore)}%</div></div>
    </div>

    <h2>Safety Actions</h2>
    <ul>${actions}</ul>
    <p style="margin-top:10px;">Recommended audience: <strong>${escapeHtml(data.recommendedAudience)}</strong>.</p>

    <h2>Institution Advisory</h2>
    <div class="advisory">
      <div><strong>Schools</strong> Monitor AQI before sports, assemblies, or outdoor classes; shift activities indoors during higher-risk hours.</div>
      <div><strong>RWAs / housing societies</strong> Share arrival and peak-window timing; advise residents to close windows before smoke arrives.</div>
      <div><strong>Offices</strong> Reduce outdoor tasks during the peak window and support sensitive staff with flexible timing where possible.</div>
      <div><strong>Outdoor workers</strong> Use N95 masks, take indoor breaks, hydrate, and avoid heavy exertion when air quality worsens.</div>
    </div>

    <h2>Source Attribution</h2>
    <p>This forecast uses satellite fire detections, wind forecast, humidity, boundary layer conditions, cloud-gap confidence, and Delhi baseline PM2.5.</p>

    <p class="fineprint">This is an early-warning forecast, not a medical diagnosis or official government advisory. Use it alongside local AQI updates and public health guidance.</p>
  </main>
</body>
</html>`;
}

function downloadHtml(html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = REPORT_FILENAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ForecastReportButton({
  forecast,
  currentData,
  expectedArrival,
  meta,
  fires,
}) {
  const [status, setStatus] = useState("");

  const reportData = useMemo(
    () => getReportData({ forecast, currentData, expectedArrival, meta, fires }),
    [forecast, currentData, expectedArrival, meta, fires]
  );

  const handleDownload = () => {
    const html = buildReportHtml(reportData);
    downloadHtml(html);
    setStatus("Report downloaded.");
    window.setTimeout(() => setStatus(""), 2400);
  };

  return (
    <div className="glass-card share-report-card">
      <h2>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--blue)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Forecast Report
        </span>
      </h2>

      <div className="share-report-summary">
        <div>
          <span>Risk</span>
          <strong style={{ color: riskColor(reportData.riskLevel) }}>
            {reportData.riskLevel}
          </strong>
        </div>
        <div>
          <span>Peak AQI</span>
          <strong>{reportData.peakAqi}</strong>
        </div>
        <div>
          <span>Smoke</span>
          <strong>{reportData.contributionPct}%</strong>
        </div>
      </div>

      <button className="action-btn" onClick={handleDownload}>
        Download Report
      </button>

      {status && <div className="share-report-status mono">{status}</div>}
    </div>
  );
}
