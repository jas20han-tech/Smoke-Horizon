/**
 * Dashboard - CTA section that bridges to the live telemetry board.
 * Lazy-loaded via LazySection wrapper.
 */
export default function Dashboard() {
  return (
    <div className="section-dashboard" id="dashboard">
      <div className="section-label mono">LIVE INSTRUMENT</div>
      <h2 className="section-heading">Access the telemetry board</h2>
      <p className="section-body">
        The full forecast dashboard gives you a live map of active fire hotspots,
        an 18-hour smoke transport timeline, wind vector overlays, PM2.5 diagnostics,
        and a sandbox to simulate custom fire scenarios.
      </p>

      <div className="dashboard-cta-row">
        <button
          className="cta-btn cta-primary"
          onClick={() => {
            // Signal App.jsx to switch to dashboard view
            window.dispatchEvent(new CustomEvent("sh:open-dashboard"));
          }}
        >
          Open Live Dashboard →
        </button>
      </div>

      <div className="dashboard-feature-chips">
        {[
          "Live fire map",
          "18h timeline scrubber",
          "Wind vector overlay",
          "PM2.5 / AQI diagnostics",
          "Custom fire sandbox",
          "Historical backtesting",
        ].map((f) => (
          <span key={f} className="feature-chip mono">
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}
