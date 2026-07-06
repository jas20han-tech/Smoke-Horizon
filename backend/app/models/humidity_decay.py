"""
humidity_decay.py — Hourly smoke mass retention factor.

Improved over v1:
  - Three-regime humidity response (dry / moist / saturated)
  - Rain washout uses Below-Cloud Scavenging Coefficient (Λ_bc)
    parameterised from literature (Croft et al. 2009):
    Λ = 3.4e-4 * R^0.79  (s⁻¹, R in mm/h) → converted to hourly fraction
  - Hygroscopic growth above 85% RH increases effective particle size,
    raising deposition velocity (Petters & Kreidenweis 2007)
"""


import math


def get_hourly_decay_factor(relative_humidity: float, precipitation: float) -> float:
    """
    Compute hourly smoke mass retention factor (fraction remaining after 1 hour).

    Components:
    1. Dry deposition / hygroscopic settling (RH-dependent)
    2. Below-cloud scavenging by rain (precipitation-dependent)

    Returns value in [0.05, 0.98].
    """
    # ── 1. Dry deposition ──────────────────────────────────────
    # Dry deposition velocity of PM2.5 is ~0.1-0.3 cm/s over flat terrain.
    # At high RH, hygroscopic growth increases effective radius and deposition.
    if relative_humidity >= 90:
        # Saturated: strong hygroscopic growth → ~8-10% loss/hr
        dry_loss = 0.09 + 0.02 * (relative_humidity - 90.0) / 10.0
    elif relative_humidity >= 75:
        # Moist: moderate hygroscopic swelling → 4-8% loss/hr
        dry_loss = 0.04 + 0.05 * (relative_humidity - 75.0) / 15.0
    else:
        # Dry/normal: 2.5% base deposition
        dry_loss = 0.025

    # ── 2. Below-cloud scavenging (rain washout) ───────────────
    # Λ_bc (s⁻¹) = 3.4×10⁻⁴ × R^0.79  (Croft et al. 2009)
    # Hourly loss fraction = 1 - exp(-Λ × 3600)
    if precipitation > 0.0:
        lambda_bc = 3.4e-4 * (precipitation ** 0.79)
        rain_loss = 1.0 - math.exp(-lambda_bc * 3600.0)
        rain_loss = min(0.92, rain_loss)   # physical maximum
    else:
        rain_loss = 0.0

    # ── Combined retention ─────────────────────────────────────
    total_loss = min(0.95, dry_loss + rain_loss)
    return float(round(1.0 - total_loss, 4))
