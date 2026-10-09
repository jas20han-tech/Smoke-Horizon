/**
 * Hero - loads eagerly (above the fold). No LazySection wrapper.
 * Pulls live forecast data from App context via props if provided,
 * or renders standalone with static copy.
 */
export default function Hero() {
  return (
    <div className="section-hero">
      <div className="hero-eyebrow mono">
        <span className="hero-dot" />
        LIVE · CROP RESIDUE SMOKE FORECAST · DELHI-NCR
      </div>

      <h1 className="hero-headline">
        Delhi's smog has<br />
        <em>a known origin.</em>
      </h1>

      <p className="hero-sub">
        Smoke Horizon tracks stubble-burning fires across Punjab &amp; Haryana via
        NASA satellite thermal scans, then resolves downwind drift paths against
        live wind fields, forecasting smoke arrival 18-36 hours in advance.
      </p>

      <div className="hero-cta-row">
        <a href="#dashboard" className="cta-btn cta-primary">
          Open Telemetry Dashboard →
        </a>
        <a href="#how-it-works" className="cta-btn cta-secondary">
          How it works
        </a>
      </div>

      {/* Ambient particle canvas placeholder - fills background */}
      <div className="hero-ambient" aria-hidden="true">
        <div className="ambient-orb orb-1" />
        <div className="ambient-orb orb-2" />
      </div>
    </div>
  );
}
