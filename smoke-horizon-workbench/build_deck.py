"""
build_deck.py
Builds the official presentation deck for Smoke Horizon using pptx_kit.py.
Theme: stone (editorial/technical)
Density: talk (live presentation)
"""

import os
import sys

# Ensure ppt-design scripts directory is on sys.path
SCRIPT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".agents", "skills", "ppt-design", "scripts"))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import pptx_kit as kit


def draw_pipeline_diagram(slide, left: float, top: float, width: float, height: float):
    """Draw a 3-layer architecture diagram using kit.layer_stack."""
    deck = getattr(slide, "_deck", getattr(kit.Deck, "_active_deck", None))
    layers = [
        ("INGESTION", "Satellite & Weather Feeds", "Thermal anomalies and multi-station wind vectors"),
        ("TRANSPORT", "Lagrangian Dispersion", "Puff advection with humidity and rain scavenging"),
        ("RECEPTORS", "Health Exposure Scoring", "Personalized vulnerability curves at user coordinates"),
    ]
    kit.layer_stack(deck, slide, left, top, width, height, layers, arrows=True, highlight=1)


def build_presentation(output_path: str = "smoke-horizon.pptx"):
    deck = kit.Deck(theme="stone", density="talk", short_name="Smoke Horizon")

    # Slide 1: Cover
    kit.cover(
        deck,
        title="Downwind smoke forecasting for Delhi",
        subtitle="Predicting agricultural fire transport across Delhi-NCR up to 48 hours in advance",
        meta="Smoke Horizon · Atmospheric Transport Architecture · 2026",
        italic="Downwind",
        notes="Good morning. Today I am presenting Smoke Horizon, a predictive air quality system designed for the Delhi capital region during the annual autumn stubble burning season.",
    )

    # Slide 2: Statement (The problem)
    kit.statement(
        deck,
        text_content="Delhi inhales toxic smoke before alarms trigger",
        eyebrow="THE CORE PROBLEM",
        attribution="Central Pollution Control Board station telemetry",
        italic="before alarms",
        notes="Conventional air quality applications operate as digital thermometers rather than weather radars. By the time an AQI monitor registers severe pollution, millions of residents have already inhaled hazardous PM2.5.",
    )

    # Slide 3: Big Number (Seasonal severity)
    kit.big_number(
        deck,
        eyebrow="SEASONAL SEVERITY",
        title="Stubble fires drive 40% of peak Delhi PM2.5",
        value="40%",
        label="Peak harvest fire contribution to capital region PM2.5",
        points=[
            ("20M residents", "Breathe hazardous air during autumn harvest weeks."),
            ("300 km transit", "Plumes reach Delhi from Punjab within 18 hours."),
            ("400+ peak AQI", "Emergency spikes trigger school closures and alerts."),
        ],
        notes="Agricultural fires in Punjab and Haryana contribute up to forty percent of Delhi's particulate load during peak harvest weeks. The smoke travels three hundred kilometers along prevailing northwest wind vectors directly into the urban basin.",
    )

    # Slide 4: Table (Comparison)
    kit.table(
        deck,
        eyebrow="SYSTEM COMPARISON",
        title="Standard monitors report pollution after exposure",
        columns_spec=["Capability", "Standard AQI apps", "SAFAR bulletins", "Smoke Horizon"],
        rows=[
            ["Lead time", "0 hours (current)", "24 hours", "48 hours"],
            ["Origin tracking", "None", "Regional estimate", "Per-fire tracking"],
            ["Personalization", "City-wide average", "10 km grid", "User coordinate"],
            ["Update cadence", "Hourly station feed", "Daily report", "On demand (<1 s)"],
        ],
        highlight=3,
        note="Comparison based on public Delhi-NCR air quality monitoring interfaces.",
        notes="Most consumer air apps only report current conditions. SAFAR publishes daily bulletins at ten kilometer resolution without a public API. Smoke Horizon provides forty-eight hours of lead time, source attribution, and sub-second calculation.",
    )

    # Slide 5: Section (Act 2)
    kit.section(
        deck,
        number=2,
        title="The atmospheric transport engine",
        notes="In this next section, we examine the physics and engineering pipeline that turns raw thermal satellite detections into ground-level particulate predictions.",
    )

    # Slide 6: Split (Architecture)
    kit.split(
        deck,
        eyebrow="ARCHITECTURE",
        title="Three pipeline stages link satellites to receivers",
        text_content=[
            ("Data ingestion", "Combines FIRMS fire feeds with regional weather stations."),
            ("Transport physics", "Advects smoke parcels with scavenging decay."),
            ("Exposure scoring", "Calculates PM2.5 risk at user coordinates."),
        ],
        visual=draw_pipeline_diagram,
        ratio="5/7",
        side="right",
        notes="The architecture decouples satellite ingestion, meteorology, physics simulation, and health exposure calculation into three deterministic stages. Each stage validates inputs with Pydantic before simulation.",
    )

    # Slide 7: Process (Lagrangian puff transport)
    kit.process(
        deck,
        eyebrow="DISPERSION MODEL",
        title="Lagrangian puff tracking models plume dispersion",
        steps=[
            {
                "heading": "Fire detection",
                "body": "Thermal sensors log fire coordinates and radiative power output.",
                "metric": "18–25 active fires",
            },
            {
                "heading": "Diurnal scaling",
                "body": "Emissions peak between 11:00 and 15:00 IST based on field patterns.",
                "metric": "Peak at 13:00 IST",
            },
            {
                "heading": "Puff advection",
                "body": "Wind vectors interpolate drift across five regional observation stations.",
                "metric": "5 weather stations",
            },
            {
                "heading": "Scavenging sinks",
                "body": "Hygroscopic settling and precipitation wash out particulate mass in transit.",
                "metric": "Croft scavenging",
            },
        ],
        active=2,
        notes="Rather than running heavy computational fluid dynamics across a static grid, our Lagrangian puff model tracks individual parcels of smoke. Each parcel adjusts its mass based on diurnal burning rhythms and relative humidity.",
    )

    # Slide 8: Chart (Boundary layer inversion)
    kit.chart(
        deck,
        eyebrow="ATMOSPHERIC TRAPPING",
        title="Shallow boundary layers triple surface smoke",
        kind="column",
        categories=["150 m", "250 m", "500 m", "750 m", "1000 m"],
        series=[("Concentration factor", [3.0, 2.3, 1.6, 1.2, 1.0])],
        highlight=0,
        number_format="0.0",
        unit="x",
        takeaway="Nocturnal temperature inversions compress smoke into a shallow layer, multiplying ground-level particulate concentrations threefold during Delhi winter nights.",
        notes="Boundary layer height determines the vertical volume available for smoke dilution. When autumn night temperatures drop, the mixing height shrinks below three hundred meters, trapping smoke near ground level.",
    )

    # Slide 9: Columns (Health exposure & sensitivity)
    kit.columns(
        deck,
        eyebrow="PUBLIC HEALTH",
        title="Vulnerability weights scale personal health risk",
        items=[
            {
                "label": "PEDIATRIC & ELDERLY",
                "metric": "1.55x",
                "heading": "Sensitive ages",
                "body": "Faster ventilation rates per weight increase total inhaled smoke dose.",
            },
            {
                "label": "RESPIRATORY CASES",
                "metric": "1.80x",
                "heading": "Asthma and COPD",
                "body": "Lower exposure thresholds trigger earlier medical health warnings.",
            },
            {
                "label": "NOTIFICATION SYSTEM",
                "metric": "12 h",
                "heading": "Alert cooldown",
                "body": "Twilio SMS prevents alert fatigue while tracking diurnal peaks.",
            },
        ],
        notes="Air quality impacts individuals differently. Smoke Horizon computes exposure scores tailored to user vulnerability, alerting high-risk individuals hours before smoke plumes arrive.",
    )

    # Slide 10: Statement (Engineering trade-offs)
    kit.statement(
        deck,
        text_content="Real-time warning requires disciplined modeling choices",
        eyebrow="ENGINEERING TRADE-OFFS",
        attribution="Smoke Horizon Architecture Decision Record",
        italic="disciplined modeling",
        notes="Full three-dimensional chemical transport models like WRF-Chem take hours on compute clusters. A two-dimensional Lagrangian approximation runs in milliseconds on standard hardware, delivering usable advance warnings to residents.",
    )

    # Slide 11: Metrics (Performance)
    kit.metrics(
        deck,
        eyebrow="PERFORMANCE",
        title="Sub-second runtimes keep forecasts interactive",
        items=[
            ("48 h", "Forecast horizon", "Hourly smoke trajectory projections across the northwest corridor."),
            ("<1 s", "Compute latency", "Full multi-fire Lagrangian dispersion computes on a single CPU core."),
            ("25 fps", "Canvas animation", "Smooth client interpolation renders hundreds of drifting smoke particles."),
        ],
        takeaway="Sub-second execution enables on-demand scenario testing without cluster infrastructure.",
        notes="Because the core transport calculation executes in under one second on a standard CPU, users can scrub through forty-eight hours of wind and fire permutations without server lag.",
    )

    # Slide 12: Closing (Roadmap & validation)
    kit.closing(
        deck,
        title="Ground-truth validation is the next priority",
        actions=[
            "Calibrate dispersion models with historical CPCB monitors.",
            "Automate forecast execution with a background task scheduler.",
            "Expand receptor nodes to five neighboring urban centers.",
        ],
        contact="Smoke Horizon · github.com/coolj/smoke-horizon",
        notes="The next phase focuses on quantitative comparison against ground-truth monitors, moving from literature-based calibration to empirical verification across North India.",
    )

    out_file = os.path.abspath(output_path)
    deck.save(out_file)
    print(f"Presentation saved successfully: {out_file}")
    return out_file


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "smoke-horizon.pptx")
    build_presentation(out)
