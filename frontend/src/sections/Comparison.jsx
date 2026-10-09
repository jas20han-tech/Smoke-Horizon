/**
 * Comparison - Reactive AQI apps vs Smoke Horizon predictive model.
 * Lazy-loaded via LazySection wrapper.
 */
const ROWS = [
  { label: "Advance warning", reactive: "None: reports current ground state", predictive: "6-36 hours ahead" },
  { label: "Data source", reactive: "Ground station PM2.5 sensors", predictive: "Satellite fire + wind physics" },
  { label: "Scope", reactive: "Local sensor grid only", predictive: "Source-to-receptor transport" },
  { label: "Actionable lead time", reactive: "0 hours", predictive: "Half a day to a day+" },
  { label: "Cause identified", reactive: "No", predictive: "Yes: down to individual farm clusters" },
];

export default function Comparison() {
  return (
    <div className="section-comparison">
      <div className="section-label mono">DIFFERENTIATION</div>
      <h2 className="section-heading">Predictive vs reactive air quality</h2>

      <div className="compare-table">
        <div className="compare-header">
          <span />
          <span className="compare-col-label reactive">Reactive AQI apps</span>
          <span className="compare-col-label predictive">Smoke Horizon</span>
        </div>

        {ROWS.map((row) => (
          <div key={row.label} className="compare-row">
            <span className="compare-label">{row.label}</span>
            <span className="compare-cell reactive">{row.reactive}</span>
            <span className="compare-cell predictive">{row.predictive}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
