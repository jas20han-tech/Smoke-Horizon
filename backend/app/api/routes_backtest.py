from fastapi import APIRouter
import json
import os

router = APIRouter(prefix="/api/backtest", tags=["backtest"])

BACKTEST_RESULTS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "backtest_results.json",
)


@router.get("/")
def get_backtest_results():
    """
    Historical backtest: transport model predictions vs CPCB ITO ground truth.
    15-day evaluation window (Oct 15-29, 2025) using real Open-Meteo weather
    and simulated FIRMS fire coordinates calibrated to NW India stubble region.
    """
    if os.path.exists(BACKTEST_RESULTS_PATH):
        with open(BACKTEST_RESULTS_PATH, "r") as f:
            results = json.load(f)
        metrics = results.get("metrics", {})
        return {
            "metrics": {
                "mean_absolute_error": metrics.get("mae", 0),
                "r_squared": metrics.get("r_squared", 0),
                "correlation": metrics.get("correlation", 0),
                "bias": metrics.get("bias", 0),
                "smoke_mae": metrics.get("smoke_mae", 0),
                "smoke_r_squared": metrics.get("smoke_r_squared", 0),
                "total_backtest_days": metrics.get("total_backtest_days", 0),
                "evaluation_period": metrics.get("evaluation_period", ""),
                "model_status": metrics.get("model_status", ""),
            },
            "data": results.get("data", []),
        }

    return {
        "metrics": {
            "mean_absolute_error": 0,
            "r_squared": 0,
            "total_backtest_days": 0,
            "evaluation_period": "N/A",
            "model_status": "No backtest results available. Run: python -m app.backtest_engine",
        },
        "data": [],
    }
