"""
AgriShield Parametric - Module 8
Unit Tests for Stage 8.2-G: Production Inference & Explainability API (POST /predict)
"""

import math
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.inference_service import inference_service
from app.services.synthetic_dataset_generator import FEATURE_NAMES

client = TestClient(app)


@pytest.fixture
def valid_payload():
    """Returns a valid 17-feature JSON payload strictly matching Contract v1.1."""
    return {
        "precipitation_sum_30d": 120.5,
        "precipitation_sum_14d": 45.2,
        "precipitation_std_30d": 8.4,
        "consecutive_dry_days_max": 12,
        "temp_max_30d": 41.2,
        "temp_mean_30d": 32.1,
        "temp_amplitude_mean_30d": 11.5,
        "heat_wave_hours_30d": 48,
        "relative_humidity_mean_30d": 55.0,
        "vpd_mean_30d": 2.35,
        "wind_speed_mean_30d": 12.4,
        "wind_gust_max_30d": 75.0,
        "ndvi_latest": 0.42,
        "ndvi_trend_30d": -0.003,
        "calculated_area_ha": 2.5,
        "is_ndvi_available": 1,
        "is_ndvi_trend_available": 1,
    }


# =============================================================================
# TESTS 1-9: SUCCESSFUL INFERENCE & RESPONSE SCHEMA INTEGRITY
# =============================================================================

def test_predict_success(valid_payload):
    """Test 1: POST /predict returns HTTP 200 OK."""
    response = client.post("/predict", json=valid_payload)
    assert response.status_code == 200


def test_prohibited_endpoints_rejected(valid_payload):
    """Test: Prohibited prediction endpoints and aliases return 404 or 405."""
    # /api/v1/predict alias was explicitly removed to preserve strictly POST /predict
    resp_alias = client.post("/api/v1/predict", json=valid_payload)
    assert resp_alias.status_code == 404

    # Prohibited endpoints
    resp_explain = client.post("/explain", json=valid_payload)
    assert resp_explain.status_code == 404

    resp_get_predict = client.get("/predict")
    assert resp_get_predict.status_code == 405

    resp_risk = client.get("/risk")
    assert resp_risk.status_code == 404

    resp_shap = client.get("/shap")
    assert resp_shap.status_code == 404


def test_response_schema_structure(valid_payload):
    """Test 2: Response contains prediction, explanation, model, and disclaimer."""
    response = client.post("/predict", json=valid_payload)
    assert response.status_code == 200
    data = response.json()

    assert "prediction" in data
    assert "explanation" in data
    assert "model" in data
    assert "disclaimer" in data

    assert data["model"]["feature_count"] == 17
    assert data["model"]["feature_contract_version"] == "v1.1"


def test_predicted_class_deterministic(valid_payload):
    """Test 3: Predicted class is an integer in {0, 1} matching probability threshold."""
    response = client.post("/predict", json=valid_payload)
    data = response.json()
    pred_class = data["prediction"]["predicted_class"]
    prob = data["prediction"]["calibrated_probability"]

    assert pred_class in [0, 1]
    expected_class = 1 if prob >= 0.5 else 0
    assert pred_class == expected_class


def test_calibrated_probability_range(valid_payload):
    """Test 4: Calibrated probability is bounded in [0.0, 1.0]."""
    response = client.post("/predict", json=valid_payload)
    prob = response.json()["prediction"]["calibrated_probability"]
    assert 0.0 <= prob <= 1.0


def test_raw_decision_margin_finite(valid_payload):
    """Test 5: Raw decision margin is a finite float."""
    response = client.post("/predict", json=valid_payload)
    margin = response.json()["prediction"]["raw_decision_margin"]
    assert isinstance(margin, float)
    assert math.isfinite(margin)


def test_shap_explanation_structure(valid_payload):
    """Test 6: Explanation section contains base_value, reconstructed_margin, attributions."""
    response = client.post("/predict", json=valid_payload)
    exp = response.json()["explanation"]
    assert "base_value" in exp
    assert "reconstructed_margin" in exp
    assert "additivity_error" in exp
    assert "attributions" in exp
    assert isinstance(exp["attributions"], list)


def test_attribution_feature_count_and_order(valid_payload):
    """Test 7 & 8: Exactly 17 feature attributions returned in locked contract order."""
    response = client.post("/predict", json=valid_payload)
    attributions = response.json()["explanation"]["attributions"]

    assert len(attributions) == 17
    returned_names = [a["feature_name"] for a in attributions]
    assert returned_names == FEATURE_NAMES

    for attr in attributions:
        assert attr["direction"] in [
            "pushes model toward class 1",
            "pushes model toward class 0",
            "no contribution",
        ]
        assert attr["contribution_magnitude"] >= 0.0


def test_shap_additivity_preserved(valid_payload):
    """Test 9: SHAP additivity error is below numerical tolerance 1e-7."""
    response = client.post("/predict", json=valid_payload)
    exp = response.json()["explanation"]
    assert exp["additivity_error"] < 1e-7


# =============================================================================
# TESTS 10-12: NATIVE MISSING VALUE (NaN) TRANSPORT & ROUTING
# =============================================================================

def test_missing_ndvi_latest(valid_payload):
    """Test 10: Missing ndvi_latest (null) with indicator=0 executes cleanly."""
    payload = valid_payload.copy()
    payload["ndvi_latest"] = None
    payload["is_ndvi_available"] = 0

    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Verify ndvi_latest value is serialized as null
    attr_map = {a["feature_name"]: a for a in data["explanation"]["attributions"]}
    assert attr_map["ndvi_latest"]["feature_value"] is None
    assert math.isfinite(attr_map["ndvi_latest"]["shap_value"])
    assert data["explanation"]["additivity_error"] < 1e-7


def test_missing_ndvi_trend(valid_payload):
    """Test 11: Missing ndvi_trend_30d (null) with indicator=0 executes cleanly."""
    payload = valid_payload.copy()
    payload["ndvi_trend_30d"] = None
    payload["is_ndvi_trend_available"] = 0

    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()

    attr_map = {a["feature_name"]: a for a in data["explanation"]["attributions"]}
    assert attr_map["ndvi_trend_30d"]["feature_value"] is None
    assert math.isfinite(attr_map["ndvi_trend_30d"]["shap_value"])
    assert data["explanation"]["additivity_error"] < 1e-7


def test_both_ndvi_features_missing(valid_payload):
    """Test 12: Both optical NDVI features simultaneously null executes cleanly."""
    payload = valid_payload.copy()
    payload["ndvi_latest"] = None
    payload["ndvi_trend_30d"] = None
    payload["is_ndvi_available"] = 0
    payload["is_ndvi_trend_available"] = 0

    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["explanation"]["additivity_error"] < 1e-7
    assert 0.0 <= data["prediction"]["calibrated_probability"] <= 1.0


# =============================================================================
# TESTS 13-18: VALIDATION RULES & HTTP 422 ERROR HANDLING
# =============================================================================

def test_missing_feature_rejected(valid_payload):
    """Test 14: Omitting a required feature produces HTTP 422."""
    payload = valid_payload.copy()
    del payload["precipitation_sum_30d"]

    response = client.post("/predict", json=payload)
    assert response.status_code == 422


def test_extra_feature_rejected(valid_payload):
    """Test 13 & 15: Supplying extra/prohibited columns (extra='forbid') produces HTTP 422."""
    payload = valid_payload.copy()
    payload["scenario_id"] = 1

    response = client.post("/predict", json=payload)
    assert response.status_code == 422


def test_target_column_rejected(valid_payload):
    """Test: Supplying target column in request produces HTTP 422."""
    payload = valid_payload.copy()
    payload["target_severe_water_stress"] = 1

    response = client.post("/predict", json=payload)
    assert response.status_code == 422


def test_invalid_availability_indicator(valid_payload):
    """Test 16: is_ndvi_available not in {0, 1} produces HTTP 422."""
    payload = valid_payload.copy()
    payload["is_ndvi_available"] = 2

    response = client.post("/predict", json=payload)
    assert response.status_code == 422


def test_indicator_mismatch_rejected(valid_payload):
    """Test: is_ndvi_available=1 with null value produces HTTP 422."""
    payload = valid_payload.copy()
    payload["ndvi_latest"] = None
    payload["is_ndvi_available"] = 1

    response = client.post("/predict", json=payload)
    assert response.status_code == 422


def test_invalid_ndvi_range_rejected(valid_payload):
    """Test 17: ndvi_latest out of [-0.2, 1.0] produces HTTP 422."""
    # Test below locked minimum (-0.2)
    payload_low = valid_payload.copy()
    payload_low["ndvi_latest"] = -0.3
    response_low = client.post("/predict", json=payload_low)
    assert response_low.status_code == 422

    # Test above maximum (1.0)
    payload_high = valid_payload.copy()
    payload_high["ndvi_latest"] = 1.45
    response_high = client.post("/predict", json=payload_high)
    assert response_high.status_code == 422


def test_valid_ndvi_boundary_values_accepted(valid_payload):
    """Test: ndvi_latest boundary values -0.2 and 1.0 are accepted when is_ndvi_available=1."""
    # Test exactly at lower boundary (-0.2)
    payload_min = valid_payload.copy()
    payload_min["ndvi_latest"] = -0.2
    payload_min["is_ndvi_available"] = 1
    resp_min = client.post("/predict", json=payload_min)
    assert resp_min.status_code == 200
    assert resp_min.json()["prediction"]["predicted_class"] in [0, 1]

    # Test exactly at upper boundary (1.0)
    payload_max = valid_payload.copy()
    payload_max["ndvi_latest"] = 1.0
    payload_max["is_ndvi_available"] = 1
    resp_max = client.post("/predict", json=payload_max)
    assert resp_max.status_code == 200
    assert resp_max.json()["prediction"]["predicted_class"] in [0, 1]


def test_invalid_area_rejected(valid_payload):
    """Test 18: calculated_area_ha <= 0 produces HTTP 422."""
    payload = valid_payload.copy()
    payload["calculated_area_ha"] = -0.5

    response = client.post("/predict", json=payload)
    assert response.status_code == 422


def test_rainfall_invariance_violation_rejected(valid_payload):
    """Test: precipitation_sum_14d > precipitation_sum_30d produces HTTP 422."""
    payload = valid_payload.copy()
    payload["precipitation_sum_30d"] = 10.0
    payload["precipitation_sum_14d"] = 25.0

    response = client.post("/predict", json=payload)
    assert response.status_code == 422


# =============================================================================
# TESTS 19-20: SERVICE READINESS & DETERMINISM
# =============================================================================

def test_service_unready_returns_503(valid_payload, monkeypatch):
    """Test 19: If inference_service is not ready, POST /predict returns HTTP 503."""
    monkeypatch.setattr(inference_service, "is_ready", lambda: False)

    response = client.post("/predict", json=valid_payload)
    assert response.status_code == 503
    assert "Model artifacts unavailable" in response.json()["detail"]


def test_prediction_determinism(valid_payload):
    """Test: Repeated identical requests produce identical predictions and SHAP values."""
    res1 = client.post("/predict", json=valid_payload).json()
    res2 = client.post("/predict", json=valid_payload).json()

    assert res1["prediction"] == res2["prediction"]
    assert res1["explanation"]["base_value"] == res2["explanation"]["base_value"]
    assert res1["explanation"]["reconstructed_margin"] == res2["explanation"]["reconstructed_margin"]
    assert res1["explanation"]["attributions"] == res2["explanation"]["attributions"]


def test_health_endpoints_remain_passing():
    """Test 20: Existing GET / and GET /api/v1/health endpoints continue to pass."""
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert "predict" in res_root.json()

    res_health = client.get("/api/v1/health")
    assert res_health.status_code == 200

    res_ready = client.get("/api/v1/health/ready")
    assert res_ready.status_code == 200
    assert res_ready.json()["ready"] is True
