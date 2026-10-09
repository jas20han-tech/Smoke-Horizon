# Smoke Horizon — Presentation Story & Plan

## 1. The One Sentence
Smoke Horizon transforms reactive air quality reporting into a 48-hour proactive defense by tracking crop fires from space and modeling atmospheric plume transport into Delhi-NCR.

## 2. SCQA
- **Situation:** Every autumn, agricultural stubble burning across Punjab and Haryana releases dense smoke that drifts southeast, pushing Delhi PM2.5 past 400 µg/m³.
- **Complication:** Existing air quality applications only report current monitor measurements after people have already inhaled the smoke, offering zero advance warning and no fire source attribution.
- **Question:** Can we forecast downwind smoke plumes 48 hours in advance using real-time satellite fire detections and physics-based atmospheric transport?
- **Answer:** Smoke Horizon couples NASA FIRMS thermal detections with a Lagrangian puff transport model, diurnal emission weighting, and boundary layer compression to forecast localized PM2.5 impact across Delhi-NCR.

## 3. Title List (Claims in Order)
1. Downwind smoke forecasting for Delhi
2. Delhi inhales toxic smoke before alarms trigger
3. Stubble fires drive 40% of peak Delhi PM2.5
4. Standard monitors report pollution after exposure
5. The atmospheric transport engine
6. Three pipeline stages link satellites to receivers
7. Lagrangian puff tracking models plume dispersion
8. Shallow boundary layers triple surface smoke
9. Vulnerability weights scale personal health risk
10. Real-time warning requires disciplined modeling choices
11. Sub-second runtimes keep forecasts interactive
12. Ground-truth validation is the next priority

## 4. Per-Slide Plan

| # | Layout | Title | Focal Element | Evidence on the slide that proves the title |
|---|---|---|---|---|
| 1 | `cover` | Downwind smoke forecasting for Delhi | Title & subtitle in stone editorial theme | Subtitle: Predicting agricultural fire transport across Delhi-NCR up to 48 hours in advance |
| 2 | `statement` | Delhi inhales toxic smoke before alarms trigger | Inverted dark statement | Autumn harvest smoke triggers public health emergencies before ground monitors register peaks |
| 3 | `big_number` | Stubble fires drive 40% of peak Delhi PM2.5 | 40% hero metric in accent | 40% peak contribution, 20M population affected, 300 km transit corridor from Punjab |
| 4 | `table` | Standard monitors report pollution after exposure | Highlighted Smoke Horizon column | 48 h lead time vs 0 h for standard apps; per-fire source tracking vs none; user-pin personalization vs city average |
| 5 | `section` | The atmospheric transport engine | Section 02 dark inversion | Transition into physical modeling pipeline and advection mathematics |
| 6 | `split` | Three pipeline stages link satellites to receivers | 3-layer architecture stack | Satellite Ingestion → Lagrangian Transport → Health Exposure |
| 7 | `process` | Lagrangian puff tracking models plume dispersion | 4-step ribbon with circle nodes | Satellite detection (18–25 fires) → Diurnal curve (peak 13:00 IST) → IDW wind advection (5 stations) → Scavenging sinks |
| 8 | `chart` | Shallow boundary layers triple surface smoke | Highlighted 150m bar (3.0x factor) | Column chart: 150 m inversion gives 3.0x concentration factor; 250 m gives 2.3x; 1000 m gives 1.0x baseline |
| 9 | `columns` | Vulnerability weights scale personal health risk | 3 column metrics (1.55x, 1.80x, 12 h) | Children & elderly 1.55x multiplier; asthma & COPD 1.80x multiplier; 12 h alert cooldown window |
| 10 | `statement` | Real-time warning requires disciplined modeling choices | Inverted dark statement | Trading heavy multi-hour CFD cluster runs for sub-second Lagrangian parcels enables instant public warnings |
| 11 | `metrics` | Sub-second runtimes keep forecasts interactive | 3 metric cards (48 h, <1 s, 25 fps) | 48-hour forecast horizon; <1 second single-core CPU compute; 25 fps timeline animation playback |
| 12 | `closing` | Ground-truth validation is the next priority | 3 numbered action steps | Historical CPCB monitor calibration; background cron task automation; multi-city receptor expansion |

## 5. Open Data
No open data placeholders required. All metrics (40% peak stubble contribution, 20M population, 300 km transit corridor, 48 h forecast, 5 weather stations, 150 m to 1000 m boundary layer heights, 1.55x and 1.80x multipliers, 12 h cooldown, <1 s compute, 25 fps animation) derive directly from project implementation code and published environmental literature.

## 6. Review Log

### Round 1 Review (Pass 1 Contact Sheet & Pass 2 Per-Slide Inspection)
- **Contact Sheet Assessment**:
  - *Same deck?* Yes. Consistent `#F1EEE8` background, `#1F2523` dark slides, Georgia display serif, Calibri body, uniform margins (0.75" left/right, 0.6" top), content top fixed at 2.25", and synchronized footers.
  - *Rhythm:* Pacing verified. Dark slides at #1, #2, #5, #10, #12. Longest light run is 4 slides (#6-#9), satisfying the rule (inverted slide at least every 6 slides). No layout repeats consecutively.
  - *Squint test:* High visual hierarchy. Every slide presents one clear focal point in deep green `#2F5D50` accent or hero typography.
  - *Density:* Content well-balanced across 12-column grid.
- **Slide 01**: Title wrapped "Delhi-NCR" across line breaks with "NCR" stranded alone on line 3.
  - *Fix:* Rewrote title to `Downwind smoke forecasting for Delhi` and subtitle to `Predicting agricultural fire transport across Delhi-NCR up to 48 hours in advance`. Wraps into two balanced lines: `Downwind smoke` / `forecasting for Delhi`.
- **Slide 02**: Statement wrapped "apps react" onto a short third line.
  - *Fix:* Rewrote text to `Delhi inhales toxic smoke before alarms trigger` with `italic="before alarms"`. Wraps into two balanced lines with zero orphans.
- **Slide 06**: Left-hand narrative wrapped "stations." alone on line 2 under "Data ingestion".
  - *Fix:* Replaced body with `Combines FIRMS fire feeds with regional weather stations.` (two balanced lines).
- **Slide 07**: Step 03 body wrapped "stations." alone on line 4.
  - *Fix:* Replaced body with `Wind vectors interpolate drift across five regional observation stations.` (three balanced lines, zero orphans).
- **Slide 08**: Column chart displayed integer labels (`3`, `2`, `2`, `1`, `1`) due to default `#,##0` format.
  - *Fix:* Specified `number_format="0.0"` and `unit="x"` in `kit.chart`. Labels now render as `3.0x`, `2.3x`, `1.6x`, `1.2x`, `1.0x`.
- **Slide 09**: Columns body copy had orphan words on line 3 for item 1 ("dose.") and item 2 ("notifications.").
  - *Fix:* Tightened item 1 to `Faster ventilation rates per weight increase total inhaled smoke dose.` and item 2 to `Lower exposure thresholds trigger earlier medical health warnings.`. All 3 columns now have identical 2-line body heights and aligned bottoms.
- **Slide 11**: Takeaway block wrapped "for any coordinate." onto line 2.
  - *Fix:* Rewrote takeaway to `Sub-second execution enables on-demand scenario testing without cluster infrastructure.` (fits on 1 clean line).
- **Slide 12 (Copy Lint)**: Banned slop term `rigorous` flagged in speaker notes.
  - *Fix:* Replaced with `quantitative comparison against ground-truth monitors`.

### Round 2 Review (Post-Fix Verification)
- **Re-render inspection**: Generated new `contact.png` and individual slide PNGs.
- **Pass 1 (Contact Sheet)**: All typographic and alignment anomalies resolved. Zero orphan line wraps. Visual rhythm is tight and purposeful.
- **Pass 2 (Per-Slide Check)**:
  - Slide 01: Two balanced lines for display title, crisp metadata.
  - Slide 02: Centered 2-line statement with italic emphasis.
  - Slide 03: 40% hero metric in accent green with 3 hairline-divided evidence blocks.
  - Slide 04: Native open-styled comparison table with soft green highlighted column.
  - Slide 05: Minimalist Act 2 section divider.
  - Slide 06: 3-panel architecture diagram with active Transport tier and balanced narrative.
  - Slide 07: 4-step horizontal process ribbon with active node and metrics.
  - Slide 08: 150m inversion bar highlighted at `3.0x`, exact decimals shown.
  - Slide 09: 3-pillar public health cards with aligned tops, metrics, and bottoms.
  - Slide 10: Disciplined engineering trade-off statement in inverted dark.
  - Slide 11: 3 performance metrics with single-line takeaway and 2pt accent rule.
  - Slide 12: Clear 3-step validation roadmap with project repository contact.
- **Linters**: Both `linter.py` (design) and `copy_lint.py` (writing) report **0 Errors, 0 Warnings, 0 Info**.
- **Conclusion**: Presentation ready for delivery.
