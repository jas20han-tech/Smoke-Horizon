"""
routes_alerts.py — SMS AQI/PM2.5 forecast alert subscriptions via Twilio.

Key design principle:
  Alerts fire on FORECASTED values, never on current live readings.
  Smoke Horizon's core value is advance warning; an alert that triggers
  only when the air is already bad is no better than any AQI app.

Alert deduplication:
  We suppress re-alerts for 12 hours after the last send.
  This prevents spamming users during a sustained smoke event while
  still re-alerting if conditions worsen the next day.
"""

import datetime
import re
import logging

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, validator
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import AlertSubscription
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

# ── Pydantic schemas ──────────────────────────────────────────

class AlertSubscriptionCreate(BaseModel):
    name: str
    phone_number: str          # E.164: +91XXXXXXXXXX
    location: str = "Delhi-NCR"
    metric: str = "AQI"        # "AQI" or "PM2.5"
    threshold: float
    forecast_window_hours: int = 24  # 18, 24, or 36

    @validator("phone_number")
    def validate_phone(cls, v):
        # Must start with + and contain 7–15 digits
        cleaned = re.sub(r"\s|-", "", v)
        if not re.match(r"^\+\d{7,15}$", cleaned):
            raise ValueError(
                "Phone number must include country code in E.164 format, e.g. +919876543210"
            )
        return cleaned

    @validator("metric")
    def validate_metric(cls, v):
        if v not in ("AQI", "PM2.5"):
            raise ValueError("metric must be 'AQI' or 'PM2.5'")
        return v

    @validator("threshold")
    def validate_threshold(cls, v):
        if v <= 0:
            raise ValueError("threshold must be a positive number")
        return v

    @validator("forecast_window_hours")
    def validate_window(cls, v):
        if v not in (18, 24, 36):
            raise ValueError("forecast_window_hours must be 18, 24, or 36")
        return v


class AlertSubscriptionOut(BaseModel):
    id: int
    name: str
    phone_number: str
    location: str
    metric: str
    threshold: float
    forecast_window_hours: int
    is_active: bool
    last_alert_sent_at: datetime.datetime | None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ForecastCheckPayload(BaseModel):
    """
    Payload sent from the frontend (or a cron job) containing the
    current forecast timeline so we can check it against subscriptions.
    Each item in timeline must have: time (ISO), aqi (int), final_pm25 (float).
    """
    timeline: list[dict]


# ── Helper: build the SMS message ────────────────────────────

def build_sms_message(
    sub: AlertSubscription,
    forecasted_value: float,
    hours_ahead: int,
) -> str:
    """Plain-text SMS — no markdown, keep under 160 chars where possible."""
    metric_label = "AQI" if sub.metric == "AQI" else "PM2.5"
    value_str     = str(int(forecasted_value)) if sub.metric == "AQI" else f"{forecasted_value:.1f}"
    threshold_str = str(int(sub.threshold))    if sub.metric == "AQI" else f"{sub.threshold:.1f}"

    return (
        f"SMOKE HORIZON ALERT - {sub.location}\n"
        f"Hi {sub.name}, forecasted {metric_label} may reach {value_str} "
        f"in {hours_ahead}h (threshold: {threshold_str}). "
        f"Elevated smoke from Punjab/Haryana fires. "
        f"Reduce outdoor exposure & keep windows closed. "
        f"Reply STOP to unsubscribe."
    )


# ── Helper: send SMS via Twilio ───────────────────────────────

def send_sms_alert(to_number: str, message: str) -> dict:
    """
    Send an SMS via Twilio.
    Returns {"success": True, "sid": "..."} or {"success": False, "error": "..."}.

    Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM in .env.
    No opt-in required for SMS — works immediately with any verified number.
    """
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        logger.warning("Twilio credentials not configured — SMS skipped")
        return {"success": False, "error": "Twilio credentials not configured"}

    if not settings.TWILIO_SMS_FROM:
        logger.warning("TWILIO_SMS_FROM not set — SMS skipped")
        return {"success": False, "error": "TWILIO_SMS_FROM not configured. Add your Twilio phone number to .env"}

    try:
        from twilio.rest import Client
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

        msg = client.messages.create(
            from_=settings.TWILIO_SMS_FROM,
            to=to_number,
            body=message,
        )
        logger.info(f"SMS sent to {to_number} | SID: {msg.sid}")
        return {"success": True, "sid": msg.sid}

    except Exception as e:
        logger.error(f"Twilio SMS failed for {to_number}: {e}")
        return {"success": False, "error": str(e)}


# ── Helper: check forecast against a subscription ─────────────

DEDUP_WINDOW_HOURS = 12  # suppress re-alerts for this long


def should_alert(sub: AlertSubscription) -> bool:
    """Return True if enough time has passed since the last alert."""
    if not sub.last_alert_sent_at:
        return True
    age = datetime.datetime.utcnow() - sub.last_alert_sent_at
    return age.total_seconds() > DEDUP_WINDOW_HOURS * 3600


def check_subscription_against_forecast(
    sub: AlertSubscription,
    timeline: list[dict],
) -> tuple[bool, float, int]:
    """
    Walk the forecast timeline up to forecast_window_hours ahead.
    Returns (triggered, peak_value, hours_ahead).
    """
    now = datetime.datetime.utcnow()
    cutoff = now + datetime.timedelta(hours=sub.forecast_window_hours)

    peak_value = 0.0
    peak_hour = 0

    for i, step in enumerate(timeline):
        # Parse forecast timestamp
        try:
            t = datetime.datetime.fromisoformat(step["time"].replace("Z", "+00:00"))
            t = t.replace(tzinfo=None)  # normalise to naive UTC
        except Exception:
            continue

        if t < now or t > cutoff:
            continue

        # Pick the right metric
        value = float(step.get("aqi", 0)) if sub.metric == "AQI" \
            else float(step.get("final_pm25", 0))

        if value > peak_value:
            peak_value = value
            peak_hour = i

    hours_ahead = min(sub.forecast_window_hours, peak_hour)
    triggered = peak_value >= sub.threshold
    return triggered, peak_value, hours_ahead


# ── Routes ────────────────────────────────────────────────────

@router.post("/subscribe", response_model=AlertSubscriptionOut, status_code=201)
def subscribe(
    payload: AlertSubscriptionCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new WhatsApp alert subscription.
    Returns 409 if a subscription for this phone + metric already exists.
    """
    existing = (
        db.query(AlertSubscription)
        .filter(
            AlertSubscription.phone_number == payload.phone_number,
            AlertSubscription.metric == payload.metric,
            AlertSubscription.is_active == True,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"An active {payload.metric} alert already exists for {payload.phone_number}. "
                   f"Delete it first or update the threshold.",
        )

    sub = AlertSubscription(
        name=payload.name,
        phone_number=payload.phone_number,
        location=payload.location,
        metric=payload.metric,
        threshold=payload.threshold,
        forecast_window_hours=payload.forecast_window_hours,
        is_active=True,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    logger.info(f"New alert subscription: {sub.name} | {sub.phone_number} | {sub.metric}>{sub.threshold}")
    return sub


@router.get("/subscriptions", response_model=list[AlertSubscriptionOut])
def list_subscriptions(db: Session = Depends(get_db)):
    """Return all active subscriptions (for admin/debug view)."""
    return db.query(AlertSubscription).filter(AlertSubscription.is_active == True).all()


@router.delete("/subscribe/{subscription_id}", status_code=200)
def unsubscribe(subscription_id: int, db: Session = Depends(get_db)):
    """Soft-delete a subscription (marks is_active=False)."""
    sub = db.query(AlertSubscription).filter(AlertSubscription.id == subscription_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.is_active = False
    db.commit()
    return {"message": f"Subscription {subscription_id} deactivated"}


@router.post("/check-and-send")
def check_and_send_alerts(
    payload: ForecastCheckPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Check all active subscriptions against the provided forecast timeline
    and dispatch WhatsApp alerts for any that cross their threshold.

    This endpoint is called from the frontend after each forecast refresh,
    or can be hit by a cron job. Twilio sends happen in background tasks
    so this returns immediately.

    Returns a summary of triggered alerts.
    """
    active_subs = db.query(AlertSubscription).filter(
        AlertSubscription.is_active == True
    ).all()

    triggered_count = 0
    results = []

    for sub in active_subs:
        triggered, peak_value, hours_ahead = check_subscription_against_forecast(
            sub, payload.timeline
        )

        if not triggered:
            results.append({"id": sub.id, "name": sub.name, "status": "below_threshold"})
            continue

        if not should_alert(sub):
            results.append({"id": sub.id, "name": sub.name, "status": "deduped"})
            continue

        # Build SMS message
        message = build_sms_message(sub, peak_value, hours_ahead)

        # Mark sent time immediately to prevent race conditions
        sub.last_alert_sent_at = datetime.datetime.utcnow()
        db.commit()

        # Send SMS in background so API returns fast
        background_tasks.add_task(send_sms_alert, sub.phone_number, message)

        triggered_count += 1
        results.append({
            "id": sub.id,
            "name": sub.name,
            "status": "alert_sent",
            "peak_value": round(peak_value, 1),
            "metric": sub.metric,
            "hours_ahead": hours_ahead,
        })
        logger.info(
            f"Alert queued: {sub.name} | {sub.metric}={peak_value:.1f} "
            f"(threshold={sub.threshold}) | {hours_ahead}h ahead"
        )

    return {
        "checked": len(active_subs),
        "triggered": triggered_count,
        "results": results,
    }


@router.post("/test-send/{subscription_id}")
def test_send(subscription_id: int, db: Session = Depends(get_db)):
    """
    Send a test WhatsApp message to verify Twilio credentials and
    that the recipient has joined the sandbox.
    Does NOT update last_alert_sent_at.
    """
    sub = db.query(AlertSubscription).filter(AlertSubscription.id == subscription_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    message = (
        f"SMOKE HORIZON - Test Alert\n"
        f"Hi {sub.name}, your SMS alerts are set up correctly. "
        f"You will receive advance warnings when forecasted {sub.metric} "
        f"exceeds {int(sub.threshold) if sub.metric == 'AQI' else sub.threshold} "
        f"within {sub.forecast_window_hours} hours. "
        f"- Smoke Horizon Early Warning System"
    )

    result = send_sms_alert(sub.phone_number, message)
    if not result["success"]:
        raise HTTPException(status_code=502, detail=f"Twilio error: {result['error']}")
    return {"message": "Test alert sent", "sid": result.get("sid")}
