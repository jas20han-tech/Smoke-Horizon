import { useRef, useEffect, useState } from "react";

/**
 * DataSources — "Research & Data Sources" section.
 *
 * Quiet, utility-first treatment: small type scale, mono font,
 * minimal motion (one soft fade-in on mount, nothing more).
 * Its job is credibility, not spectacle.
 *
 * Lazy-loaded via LazySection wrapper.
 */

/* ── Data ─────────────────────────────────────────────────── */

const SOURCES = [
  {
    id: "firms",
    category: "Fire Detection",
    name: "NASA FIRMS",
    fullName: "Fire Information for Resource Management System",
    provider: "NASA / LANCE",
    products: ["VIIRS VNP14IMG (375 m)", "MODIS MOD14/MYD14 (1 km)"],
    provides: "Near real-time thermal anomaly detections with lat/lon centroid, acquisition time, confidence flag, and Fire Radiative Power (MW).",
    role: "Primary source for active crop-residue fire locations across Punjab and Haryana. FRP is used as the emission-strength weight in the transport model.",
    latency: "≤ 3 h from satellite overpass",
    coverage: "Global · 12-hr repeat cycle",
    url: "https://firms.modaps.eosdis.nasa.gov/",
    accent: "amber",
  },
  {
    id: "openmeteo",
    category: "Atmospheric Variables",
    name: "Open-Meteo",
    fullName: "Open-Meteo Forecast & Historical Weather API",
    provider: "Open-Meteo / ECMWF ERA5",
    products: [
      "Wind speed & direction (10 m AGL)",
      "Boundary layer height",
      "Relative humidity",
      "Precipitation probability",
    ],
    provides: "Hourly atmospheric state variables at a 15 km grid, derived from ECMWF ERA5 reanalysis and NWP model output.",
    role: "Drives the particle transport step. Boundary layer height controls vertical dilution; humidity and precipitation are applied as washout decay coefficients.",
    latency: "Hourly updates · 7-day forecast horizon",
    coverage: "Global · 15 km grid",
    url: "https://open-meteo.com/",
    accent: "blue",
  },
  {
    id: "modis-aod",
    category: "Aerosol Optical Depth",
    name: "MODIS/VIIRS AOD",
    fullName: "MODIS Aerosol Optical Depth — MOD04/MYD04 · VIIRS AERDB",
    provider: "NASA LAADS DAAC",
    products: ["MOD04_L2 (Terra, 10 km)", "MYD04_L2 (Aqua, 10 km)", "VIIRS AERDB_L2"],
    provides: "Column-integrated aerosol optical depth at 550 nm, providing a vertically integrated proxy for smoke column burden.",
    role: "Used to detect spatial drift bias between modelled plume position and observed aerosol column. When cloud cover obscures fire detection, MOD35/MYD35 cloud-mask flags are raised and forecast confidence is downgraded.",
    latency: "Daily composites · ~6 h after overpass",
    coverage: "Global · 10 km nadir",
    url: "https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/MOD04_L2",
    accent: "amber",
  },
  {
    id: "cpcb",
    category: "Ground-Truth PM2.5",
    name: "CPCB Station Network",
    fullName: "Central Pollution Control Board — Continuous Ambient Air Quality Monitoring",
    provider: "Ministry of Environment, Forest and Climate Change, India",
    products: ["CAAQMS PM2.5 (µg/m³)", "AQI composite index"],
    provides: "Hourly ground-level PM2.5 readings from continuous ambient air quality monitoring stations across the Delhi-NCR grid.",
    role: "Establishes the urban PM2.5 baseline that smoke contributions are added on top of. Also used for post-hoc validation of forecast accuracy during stubble-burn events.",
    latency: "Hourly · near real-time",
    coverage: "Delhi-NCR · ~35 stations",
    url: "https://cpcb.nic.in/",
    accent: "blue",
  },
];

const PAPERS = [
  {
    id: "p1",
    type: "Research Paper",
    title: "Crop residue burning in South Asia: a review of the scale, consequences, and solutions with a focus on reducing reactive nitrogen losses",
    authors: "Shyamsundar et al.",
    journal: "Ambio",
    year: "2019",
    doi: "10.1007/s13280-019-01143-w",
    url: "https://doi.org/10.1007/s13280-019-01143-w",
    note: "Quantifies the spatial and temporal scale of stubble burning across Indo-Gangetic Plain states.",
  },
  {
    id: "p2",
    type: "Research Paper",
    title: "Smoke transport and air quality impacts of agricultural fires in northwestern India",
    authors: "Cusworth et al.",
    journal: "Atmos. Chem. Phys.",
    year: "2018",
    doi: "10.5194/acp-18-5297-2018",
    url: "https://doi.org/10.5194/acp-18-5297-2018",
    note: "Directly models smoke transport from Punjab/Haryana fires to Delhi-NCR using MODIS fire data.",
  },
  {
    id: "p3",
    type: "Methodology Reference",
    title: "VIIRS Active Fire Detection and Characterization",
    authors: "Schroeder & Giglio",
    journal: "Remote Sensing of Environment",
    year: "2016",
    doi: "10.1016/j.rse.2016.02.016",
    url: "https://doi.org/10.1016/j.rse.2016.02.016",
    note: "Describes the VIIRS VNP14IMG algorithm used to generate FRP and fire detection confidence values.",
  },
];

/* ── Sub-components ───────────────────────────────────────── */

function AccentBar({ accent }) {
  return (
    <span
      className={`ds-accent-bar ds-accent-bar--${accent}`}
      aria-hidden="true"
    />
  );
}

function SourceRow({ src, isVisible, delay }) {
  return (
    <article
      className={`ds-source-row ds-source-row--${isVisible ? "in" : "out"}`}
      style={{ transitionDelay: `${delay}ms` }}
      aria-label={`Data source: ${src.name}`}
    >
      <AccentBar accent={src.accent} />

      <div className="ds-source-meta">
        <span className="ds-category mono">{src.category}</span>
        <div className="ds-name-row">
          <span className="ds-name">{src.name}</span>
          <a
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ds-ext-link mono"
            aria-label={`Open ${src.name} website`}
          >
            ↗
          </a>
        </div>
        <span className="ds-fullname mono">{src.fullName}</span>
      </div>

      <div className="ds-source-body">
        <p className="ds-provides">{src.provides}</p>
        <p className="ds-role">
          <span className="ds-role-label mono">Role in model —</span>
          {src.role}
        </p>
      </div>

      <div className="ds-source-chips">
        <span className="ds-chip mono">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          {src.latency}
        </span>
        <span className="ds-chip mono">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10A15.3 15.3 0 0 1 8 12a15.3 15.3 0 0 1 4-10z" />
          </svg>
          {src.coverage}
        </span>
        {src.products.map((p) => (
          <span key={p} className="ds-chip ds-chip--product mono">{p}</span>
        ))}
      </div>
    </article>
  );
}

function PaperCard({ paper, isVisible, delay }) {
  return (
    <a
      href={paper.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`ds-paper-card ds-paper-card--${isVisible ? "in" : "out"}`}
      style={{ transitionDelay: `${delay}ms` }}
      aria-label={`Open paper: ${paper.title}`}
    >
      <div className="ds-paper-top">
        <span className="ds-paper-type mono">{paper.type}</span>
        <span className="ds-paper-year mono">{paper.year}</span>
      </div>

      <p className="ds-paper-title">{paper.title}</p>

      <p className="ds-paper-authors mono">
        {paper.authors} · <em>{paper.journal}</em>
      </p>

      <p className="ds-paper-note">{paper.note}</p>

      <div className="ds-paper-doi mono">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        {paper.doi}
      </div>
    </a>
  );
}

/* ── Main export ──────────────────────────────────────────── */

export default function DataSources() {
  const sectionRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Single fade-in when section enters viewport */
  useEffect(() => {
    if (prefersReduced) { setMounted(true); return; }

    const el = sectionRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setMounted(true); obs.disconnect(); } },
      { rootMargin: "0px 0px -60px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [prefersReduced]);

  return (
    <section
      className="ds-section"
      ref={sectionRef}
      id="data-sources"
      aria-labelledby="ds-heading"
    >
      {/* ── Header ── */}
      <header className="ds-header">
        <span className="section-label mono">RESEARCH &amp; DATA SOURCES</span>
        <h2 className="ds-heading" id="ds-heading">
          What the model is built on
        </h2>
        <p className="ds-intro">
          Every variable in the forecast pipeline comes from a documented,
          publicly accessible source. The table below lists each feed, what
          it contributes, and its latency characteristics.
        </p>
      </header>

      {/* ── Source table ── */}
      <div className="ds-sources-grid" role="list">
        {SOURCES.map((src, i) => (
          <SourceRow
            key={src.id}
            src={src}
            isVisible={mounted}
            delay={prefersReduced ? 0 : i * 60}
          />
        ))}
      </div>

      {/* ── Divider ── */}
      <div className="ds-divider" aria-hidden="true" />

      {/* ── Papers ── */}
      <div className="ds-papers-header">
        <span className="section-label mono">CITED LITERATURE</span>
        <p className="ds-papers-intro">
          The transport methodology is grounded in peer-reviewed literature on
          agricultural fire emissions and smoke transport in the Indo-Gangetic Plain.
        </p>
      </div>

      <div className="ds-papers-grid">
        {PAPERS.map((paper, i) => (
          <PaperCard
            key={paper.id}
            paper={paper}
            isVisible={mounted}
            delay={prefersReduced ? 0 : 200 + i * 80}
          />
        ))}
      </div>

      {/* ── Footer note ── */}
      <p className="ds-footer-note mono">
        All external data is fetched server-side. No API keys or raw satellite
        data are transmitted to the browser. Data freshness timestamps are
        included in every forecast API response.
      </p>
    </section>
  );
}
