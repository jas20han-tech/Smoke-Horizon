import { useMemo, useState } from "react";
import {
  calculateSourceAttribution,
  getMockFires,
} from "../utils/sourceAttribution";

const REPORT_WIDTH = 900;
const REPORT_HEIGHT = 1180;

function riskColor(level) {
  if (level === "Severe") return "#E04848";
  if (level === "High") return "#E8743B";
  if (level === "Moderate" || level === "Medium") return "#D4913A";
  return "#2DB87A";
}

function getSafetyActions(level) {
  if (level === "Severe" || level === "High") {
    return [
      "Keep outdoor activities and sports indoors.",
      "Use N95 masks for essential outdoor movement.",
      "Close windows and run air purifiers in occupied rooms.",
      "Check on children, elderly people, and respiratory-risk groups.",
    ];
  }

  if (level === "Moderate" || level === "Medium") {
    return [
      "Reduce prolonged outdoor exertion.",
      "Keep classroom and office ventilation plans ready.",
      "Monitor PM2.5 updates near the expected arrival window.",
      "Sensitive groups should carry masks and inhalers if prescribed.",
    ];
  }

  return [
    "Normal outdoor activity can continue.",
    "Keep monitoring if wind direction or fire activity changes.",
    "No special respiratory precautions are currently required.",
  ];
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatForecastTime(value) {
  if (!value) return "Current forecast step";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Current forecast step";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function wrapSvgText(text, x, y, maxChars, lineHeight, options = {}) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);

  return lines
    .map((part, index) => {
      const attrs = [
        `x="${x}"`,
        `y="${y + index * lineHeight}"`,
        `font-size="${options.size || 25}"`,
        `fill="${options.fill || "#EAE8E2"}"`,
        `font-family="${options.family || "Inter, Arial, sans-serif"}"`,
        `font-weight="${options.weight || 500}"`,
      ].join(" ");
      return `<text ${attrs}>${escapeXml(part)}</text>`;
    })
    .join("");
}

function reportMetric(label, value, x, y, width, color = "#EAE8E2") {
  return `
    <rect x="${x}" y="${y}" width="${width}" height="126" rx="8" fill="#141B22" stroke="#263340"/>
    <text x="${x + 24}" y="${y + 42}" font-size="18" fill="#8FA3B1" font-family="JetBrains Mono, monospace" letter-spacing="1.8">${escapeXml(label.toUpperCase())}</text>
    ${wrapSvgText(value, x + 24, y + 84, 18, 30, { size: 29, fill: color, weight: 800, family: "JetBrains Mono, monospace" })}
  `;
}

function buildReportSvg({ currentData, peakAqi, expectedArrival, attribution, safetyActions }) {
  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const color = riskColor(currentData.risk_level);
  const smokeValue = `${attribution.stubblePct}% stubble / ${attribution.otherPct}% urban`;
  const actions = safetyActions
    .map((action, index) => {
      const y = 785 + index * 78;
      return `
        <circle cx="92" cy="${y - 8}" r="12" fill="${color}22" stroke="${color}"/>
        <text x="88" y="${y - 2}" font-size="15" fill="${color}" font-family="JetBrains Mono, monospace" font-weight="800">${index + 1}</text>
        ${wrapSvgText(action, 124, y, 46, 28, { size: 23, fill: "#EAE8E2", weight: 600 })}
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${REPORT_WIDTH}" height="${REPORT_HEIGHT}" viewBox="0 0 ${REPORT_WIDTH} ${REPORT_HEIGHT}">
      <rect width="900" height="1180" fill="#090C10"/>
      <rect x="34" y="34" width="832" height="1112" rx="18" fill="#0F1419" stroke="#1E2933" stroke-width="2"/>
      <rect x="34" y="34" width="832" height="228" rx="18" fill="${color}12"/>
      <path d="M34 246 H866" stroke="#1E2933" stroke-width="2"/>

      <text x="68" y="95" font-size="26" fill="#4A8FBF" font-family="JetBrains Mono, monospace" font-weight="800" letter-spacing="2">SMOKE HORIZON</text>
      <text x="68" y="145" font-size="46" fill="#EAE8E2" font-family="Space Grotesk, Arial, sans-serif" font-weight="800">Forecast Alert Report</text>
      <text x="68" y="188" font-size="23" fill="#8FA3B1" font-family="Inter, Arial, sans-serif">Delhi-NCR crop smoke early warning snapshot</text>
      <text x="68" y="224" font-size="19" fill="#576470" font-family="JetBrains Mono, monospace">Forecast: ${escapeXml(formatForecastTime(currentData.time))}  |  Generated: ${escapeXml(generatedAt)}</text>

      <rect x="648" y="82" width="156" height="74" rx="8" fill="${color}22" stroke="${color}88"/>
      <circle cx="684" cy="119" r="9" fill="${color}"/>
      <text x="706" y="127" font-size="28" fill="${color}" font-family="JetBrains Mono, monospace" font-weight="900">${escapeXml(currentData.risk_level)}</text>

      ${reportMetric("Arrival", expectedArrival, 68, 308, 356, color)}
      ${reportMetric("Peak AQI", String(peakAqi), 476, 308, 356, peakAqi > 200 ? "#E8743B" : peakAqi > 100 ? "#D4913A" : "#2DB87A")}
      ${reportMetric("Smoke PM2.5", `${currentData.smoke_pm25.toFixed(0)} ug/m3`, 68, 462, 356, "#E8743B")}
      ${reportMetric("Contribution", smokeValue, 476, 462, 356, "#4A8FBF")}

      <text x="68" y="650" font-size="21" fill="#8FA3B1" font-family="JetBrains Mono, monospace" letter-spacing="1.8">SOURCE CONTRIBUTION</text>
      <rect x="68" y="678" width="764" height="32" rx="6" fill="#1E2933"/>
      <rect x="68" y="678" width="${Math.max(8, attribution.stubblePct * 7.64)}" height="32" rx="6" fill="#E8743B"/>
      <text x="68" y="738" font-size="22" fill="#E8743B" font-family="JetBrains Mono, monospace" font-weight="800">${attribution.stubblePct}% crop smoke</text>
      <text x="610" y="738" font-size="22" fill="#4A8FBF" font-family="JetBrains Mono, monospace" font-weight="800">${attribution.otherPct}% other sources</text>

      <text x="68" y="790" font-size="21" fill="#8FA3B1" font-family="JetBrains Mono, monospace" letter-spacing="1.8">SAFETY ACTIONS</text>
      ${actions}

      <rect x="68" y="1052" width="764" height="1" fill="#1E2933"/>
      ${wrapSvgText("Research-grade forecast for planning use by schools, RWAs, offices, and demos. Not an official regulatory bulletin.", 68, 1090, 82, 25, { size: 19, fill: "#576470", weight: 500 })}
    </svg>
  `;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function svgToPngBlob(svg) {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = REPORT_WIDTH;
    canvas.height = REPORT_HEIGHT;
    const context = canvas.getContext("2d");
    context.fillStyle = "#090C10";
    context.fillRect(0, 0, REPORT_WIDTH, REPORT_HEIGHT);
    context.drawImage(image, 0, 0);

    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function openPrintableReport(svg) {
  const reportWindow = window.open("", "_blank", "width=920,height=1180");
  if (!reportWindow) {
    downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), "smoke-horizon-forecast-report.svg");
    return;
  }

  reportWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Smoke Horizon Forecast Report</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { box-sizing: border-box; }
          body { margin: 0; background: #090C10; display: grid; place-items: center; min-height: 100vh; }
          svg { width: 100%; max-width: 210mm; height: auto; display: block; }
          @media print {
            body { background: #090C10; }
            svg { width: 210mm; max-width: none; }
          }
        </style>
      </head>
      <body>${svg}</body>
    </html>
  `);
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
}

export default function ShareForecastReport({ currentData, timeline, expectedArrival, fires }) {
  const [status, setStatus] = useState("");

  const peakAqi = useMemo(() => {
    if (!timeline || timeline.length === 0) return currentData.aqi;
    return Math.max(...timeline.map((step) => Number(step.aqi) || 0));
  }, [currentData.aqi, timeline]);

  const attribution = useMemo(() => {
    const fireData = fires && fires.length > 0 ? fires : getMockFires();
    return calculateSourceAttribution({
      totalPm25: currentData.final_pm25 ?? 100,
      smokePm25: currentData.smoke_pm25 ?? 0,
      baselinePm25: currentData.baseline_pm25 ?? 100,
      windDirection: currentData.wind_direction ?? 315,
      windSpeed: currentData.wind_speed ?? 10,
      fires: fireData,
      forecastDate: currentData.time ? new Date(currentData.time) : new Date(),
    });
  }, [currentData, fires]);

  const safetyActions = useMemo(
    () => getSafetyActions(currentData.risk_level),
    [currentData.risk_level]
  );

  const reportSvg = useMemo(
    () => buildReportSvg({ currentData, peakAqi, expectedArrival, attribution, safetyActions }),
    [currentData, peakAqi, expectedArrival, attribution, safetyActions]
  );

  const handleShareImage = async () => {
    setStatus("Preparing report...");
    try {
      const pngBlob = await svgToPngBlob(reportSvg);
      const file = new File([pngBlob], "smoke-horizon-forecast-report.png", {
        type: "image/png",
      });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Smoke Horizon Forecast Report",
          text: `${currentData.risk_level} smoke risk. Arrival: ${expectedArrival}. Peak AQI: ${peakAqi}.`,
          files: [file],
        });
        setStatus("Report shared.");
      } else {
        downloadBlob(pngBlob, "smoke-horizon-forecast-report.png");
        setStatus("PNG report downloaded.");
      }
    } catch {
      downloadBlob(new Blob([reportSvg], { type: "image/svg+xml;charset=utf-8" }), "smoke-horizon-forecast-report.svg");
      setStatus("SVG report downloaded.");
    }
  };

  return (
    <div className="glass-card share-report-card">
      <h2>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Shareable Alert Report
        </span>
      </h2>

      <div className="share-report-summary">
        <div>
          <span>Risk</span>
          <strong style={{ color: riskColor(currentData.risk_level) }}>{currentData.risk_level}</strong>
        </div>
        <div>
          <span>Peak AQI</span>
          <strong>{peakAqi}</strong>
        </div>
        <div>
          <span>Crop smoke</span>
          <strong>{attribution.stubblePct}%</strong>
        </div>
      </div>

      <div className="share-report-actions">
        <button className="action-btn" onClick={handleShareImage}>
          Download / Share forecast
        </button>
        <button className="action-btn secondary" onClick={() => openPrintableReport(reportSvg)}>
          PDF
        </button>
      </div>

      {status && <div className="share-report-status mono">{status}</div>}
    </div>
  );
}
