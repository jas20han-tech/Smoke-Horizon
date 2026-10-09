import { useRef, useEffect, useState } from "react";

/**
 * HowItWorks - 4-step sequential pipeline with scroll-triggered reveals.
 *
 * Each step fades + slides in when it enters the viewport, staggered.
 * An SVG connector line draws itself in as the section scrolls into view,
 * linking the four pipeline nodes left-to-right.
 *
 * Lazy-loaded via LazySection wrapper (no eager import needed here).
 * Respects prefers-reduced-motion - skips all animation if set.
 */

const PIPELINE = [
  {
    num: "01",
    tag: "SATELLITE DETECTION",
    title: "Fire detection via NASA FIRMS",
    body: "NASA FIRMS ingests VIIRS (375 m) and MODIS (1 km) thermal anomaly data every 3-12 hours. Each hotspot returns a lat/lon centroid, acquisition time, and Fire Radiative Power (FRP) in megawatts - a direct proxy for combustion intensity. The system filters for crop-residue burn signatures across Punjab and Haryana based on seasonal patterns and spatial clusters.",
    source: "NASA FIRMS · VIIRS/MODIS · 375 m-1 km resolution",
    accent: "amber",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2c1 2 2 3.5 2 5.5 0 2.5-1.5 4.5-4 4.5s-4-2-4-4.5c0-2 1-3.5 2-5.5z" />
        <path d="M17.5 12c1.5 1.5 2.5 3 2.5 5 0 3.5-3 6.5-6.5 6.5-3.5 0-6.5-3-6.5-6.5 0-2 1-3.5 2.5-5" />
      </svg>
    ),
  },
  {
    num: "02",
    tag: "ATMOSPHERIC MODELING",
    title: "Wind field and dispersion parameters",
    body: "Open-Meteo provides hourly wind speed, wind direction, boundary layer height (BLH), relative humidity, and precipitation probability across a 15 km grid covering the transport corridor. BLH governs vertical mixing - a shallow layer traps smoke close to the surface and increases ground-level PM2.5. Humidity and precipitation act as washout coefficients that reduce modeled concentrations.",
    source: "Open-Meteo ERA5 · Hourly · 15 km grid · 18-member ensemble",
    accent: "blue",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
      </svg>
    ),
  },
  {
    num: "03",
    tag: "TRANSPORT SIMULATION",
    title: "Plume trajectory to Delhi-NCR",
    body: "A Lagrangian particle transport model advances each fire-sourced particle along the wind field at each timestep. FRP-weighted emission mass, BLH-based dilution, and humidity decay are applied at each step. The resulting ensemble of particle positions over 0-36 hours produces a time-resolved smoke concentration field - expressed as an incremental PM2.5 contribution over the CPCB baseline at the Delhi receptor.",
    source: "Custom Lagrangian model · 36-hr horizon · Hourly particle positions",
    accent: "blue",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    num: "04",
    tag: "GROUND-TRUTH CALIBRATION",
    title: "AOD and CPCB PM2.5 validation",
    body: "MODIS aerosol optical depth (AOD, products MOD04/MYD04) provides a column-integrated smoke proxy that can be compared against modeled plume positions to detect drift bias. CPCB ground-station PM2.5 readings establish the urban baseline; when satellite pass confidence is degraded by cloud cover, a cloud-mask flag (MYD35/MOD35) is raised and forecast uncertainty bounds are widened.",
    source: "MODIS MOD04/MYD04 AOD · CPCB PM2.5 network · MOD35 cloud mask",
    accent: "amber",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    ),
  },
];

/** Single step card, reveals on scroll */
function PipelineStep({ step, index, isVisible }) {
  return (
    <div
      className={`hiw-step hiw-step--${isVisible ? "visible" : "hidden"}`}
      style={{ transitionDelay: `${index * 120}ms` }}
    >
      {/* Node - appears on the connector line */}
      <div className={`hiw-node hiw-node--${step.accent}`} aria-hidden="true">
        <span className="hiw-node-icon">{step.icon}</span>
      </div>

      {/* Card body */}
      <div className="hiw-card">
        <div className="hiw-card-top">
          <span className={`hiw-num mono hiw-num--${step.accent}`}>{step.num}</span>
          <span className="hiw-tag mono">{step.tag}</span>
        </div>

        <h3 className="hiw-title">{step.title}</h3>
        <p className="hiw-body">{step.body}</p>

        <div className="hiw-source mono">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {step.source}
        </div>
      </div>
    </div>
  );
}

/** SVG connector line that draws itself in via stroke-dashoffset animation */
function PipelineConnector({ progress }) {
  // Horizontal path connecting 4 nodes at y=28 (node center)
  // 4 nodes evenly spaced at 12.5%, 37.5%, 62.5%, 87.5% of width
  const d = "M 60 28 L 375 28 M 375 28 L 690 28 M 690 28 L 1005 28";
  const totalLen = 945; // approximate path length
  const drawn = totalLen * Math.min(1, Math.max(0, progress));

  return (
    <svg
      className="hiw-connector"
      viewBox="0 0 1065 56"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Track (faint) */}
      <path
        d={d}
        stroke="var(--border-flat)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Animated drawn portion */}
      <path
        d={d}
        stroke="var(--token-blue)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={totalLen}
        strokeDashoffset={totalLen - drawn}
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }}
      />
      {/* Node circles on the line */}
      {[60, 375, 690, 1005].map((cx, i) => (
        <circle
          key={cx}
          cx={cx}
          cy={28}
          r={6}
          fill="var(--bg-panel)"
          stroke={drawn >= (i / 3) * totalLen ? "var(--token-blue)" : "var(--border-flat)"}
          strokeWidth="1.5"
          style={{ transition: "stroke 0.3s ease" }}
        />
      ))}
    </svg>
  );
}

export default function HowItWorks() {
  const sectionRef = useRef(null);
  const [visibleSteps, setVisibleSteps] = useState([false, false, false, false]);
  const [connectorProgress, setConnectorProgress] = useState(0);
  const stepRefs = useRef([]);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Connector scroll-progress observer - watches the whole section */
  useEffect(() => {
    if (prefersReduced) {
      setConnectorProgress(1);
      setVisibleSteps([true, true, true, true]);
      return;
    }

    const el = sectionRef.current;
    if (!el) return;

    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const winH = window.innerHeight;
      // 0 when top of section hits bottom of viewport, 1 when bottom of section hits top
      const raw = (winH - rect.top) / (rect.height + winH);
      setConnectorProgress(Math.min(1, Math.max(0, raw * 2.2)));
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // seed on mount
    return () => window.removeEventListener("scroll", onScroll);
  }, [prefersReduced]);

  /* Per-step IntersectionObserver for staggered reveals */
  useEffect(() => {
    if (prefersReduced) return;

    const observers = stepRefs.current.map((el, i) => {
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisibleSteps((prev) => {
              const next = [...prev];
              next[i] = true;
              return next;
            });
            obs.disconnect();
          }
        },
        { rootMargin: "0px 0px -80px 0px" }
      );
      obs.observe(el);
      return obs;
    });

    return () => observers.forEach((o) => o && o.disconnect());
  }, [prefersReduced]);

  return (
    <div className="hiw-section" ref={sectionRef} id="how-it-works">
      {/* Section header */}
      <div className="hiw-header">
        <span className="section-label mono">METHODOLOGY</span>
        <h2 className="hiw-heading">
          From satellite detection to forecast: four steps
        </h2>
        <p className="hiw-intro">
          Each stage is a distinct scientific operation. The output of each feeds
          directly into the next; nothing here is decorative.
        </p>
      </div>

      {/* Connector SVG - sits above the step grid, below the nodes */}
      <div className="hiw-connector-wrap" aria-hidden="true">
        <PipelineConnector progress={connectorProgress} />
      </div>

      {/* Steps grid */}
      <div className="hiw-grid">
        {PIPELINE.map((step, i) => (
          <div
            key={step.num}
            ref={(el) => (stepRefs.current[i] = el)}
          >
            <PipelineStep
              step={step}
              index={i}
              isVisible={prefersReduced ? true : visibleSteps[i]}
            />
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="hiw-footnote mono">
        All data pipelines run server-side. Frontend receives pre-computed
        particle positions and PM2.5 increments; no raw satellite data is
        transferred to the client.
      </p>
    </div>
  );
}
