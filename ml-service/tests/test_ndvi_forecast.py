"""
AgriShield Parametric - Module 8
Unit and Integration Tests for NDVI Vegetation Health Forecasting

Test Coverage:
1. Canonical feature list length (29 features) and absence of target variable
2. Preprocessing & dataset leakage prevention
3. Baseline evaluation metrics (MAE, RMSE, R2)
4. Model artifact save and load
5. SHAP TreeExplainer additivity on regression output
6. FastAPI POST /api/v1/predict/ndvi endpoint validation, inference, and error handling
"""

import os
import pytest
import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.prediction import NdviPredictionRequest
from app.services.ndvi_inference_service import ndvi_inference_service
from app.services.ndvi_training_service import (
    FEATURE_NAMES_NDVI,
    TARGET_COL,
    NdviModelHyperparameters,
    compute_regression_metrics,
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def sample_valid_features() -> dict:
    return {
        "NDVI": 0.42,
        "Rainfall_Current": 12.5,
        "Temperature_Current": 28.4,
        "NDVI_lag_1": 0.41,
        "NDVI_lag_2": 0.39,
        "NDVI_lag_3": 0.38,
        "NDVI_lag_4": 0.36,
        "NDVI_lag_8": 0.35,
        "NDVI_change_1w": 0.01,
        "NDVI_change_2w": 0.03,
        "NDVI_change_4w": 0.06,
        "Rainfall_lag_1": 8.0,
        "Rainfall_lag_2": 0.0,
        "Rainfall_lag_4": 15.0,
        "Rainfall_rolling_2w": 20.5,
        "Rainfall_rolling_4w": 45.0,
        "Rainfall_rolling_8w": 98.0,
        "Temperature_lag_1": 29.0,
        "Temperature_lag_2": 29.5,
        "Temperature_lag_4": 30.1,
        "Temperature_rolling_2w": 28.8,
        "Temperature_rolling_4w": 29.2,
        "Temperature_rolling_8w": 29.8,
        "Week_Sin": 0.5,
        "Week_Cos": 0.866,
        "Month_Sin": 0.5,
        "Month_Cos": 0.866,
        "Latitude": 19.75,
        "Longitude": 75.71,
    }


def test_ndvi_feature_contract():
    """Verify that NDVI feature contract has exactly 29 features and excludes the target."""
    assert len(FEATURE_NAMES_NDVI) == 29
    assert TARGET_COL not in FEATURE_NAMES_NDVI
    assert "NDVI" in FEATURE_NAMES_NDVI
    assert "Latitude" in FEATURE_NAMES_NDVI
    assert "Longitude" in FEATURE_NAMES_NDVI


def test_regression_metrics_computation():
    """Test standard regression metrics calculation."""
    y_true = np.array([0.4, 0.5, 0.6])
    y_pred = np.array([0.42, 0.48, 0.61])

    metrics = compute_regression_metrics(y_true, y_pred)
    assert "mae" in metrics
    assert "rmse" in metrics
    assert "r2" in metrics
    assert metrics["mae"] > 0.0
    assert metrics["r2"] > 0.8


def test_ndvi_inference_service_ready():
    """Test that the singleton NdviInferenceService is ready with trained artifacts."""
    assert ndvi_inference_service.is_ready() is True
    assert ndvi_inference_service.model is not None
    assert ndvi_inference_service.explainer is not None


def test_ndvi_inference_and_shap_additivity(sample_valid_features):
    """Test single inference prediction and exact SHAP TreeExplainer additivity."""
    request = NdviPredictionRequest(**sample_valid_features)
    response = ndvi_inference_service.predict_and_explain(request)

    assert response.target_variable == "NDVI_next_week"
    assert response.forecast_horizon == "7_days"
    assert -0.2 <= response.predicted_ndvi <= 1.0
    assert response.current_ndvi == 0.42
    assert response.baseline_persistence_ndvi == 0.42

    # Check attributions count matches 29 features
    attributions = response.explanation.attributions
    assert len(attributions) == 29
    attr_names = [a.feature_name for a in attributions]
    assert attr_names == FEATURE_NAMES_NDVI

    # Check additivity discrepancy is very small (< 1e-5)
    assert response.explanation.additivity_error < 1e-5
    sum_shap = sum(a.shap_value for a in attributions)
    reconstructed = response.explanation.base_value + sum_shap
    assert abs(response.predicted_ndvi - reconstructed) < 0.001


def test_ndvi_inference_with_null_lags(sample_valid_features):
    """Test that native NaNs in optical lag features are properly handled without error."""
    # Set historical optical and meteorological lags to None
    sample_valid_features["NDVI_lag_1"] = None
    sample_valid_features["NDVI_lag_2"] = None
    sample_valid_features["NDVI_lag_4"] = None
    sample_valid_features["NDVI_lag_8"] = None
    sample_valid_features["NDVI_change_1w"] = None
    sample_valid_features["Rainfall_lag_1"] = None
    sample_valid_features["Temperature_lag_1"] = None

    request = NdviPredictionRequest(**sample_valid_features)
    response = ndvi_inference_service.predict_and_explain(request)

    assert -0.2 <= response.predicted_ndvi <= 1.0
    assert response.explanation.additivity_error < 1e-5


def test_api_predict_ndvi_success(client, sample_valid_features):
    """Test POST /predict/ndvi endpoint returns HTTP 200 with complete payload."""
    res = client.post("/predict/ndvi", json=sample_valid_features)
    assert res.status_code == 200

    data = res.json()
    assert "predicted_ndvi" in data
    assert "current_ndvi" in data
    assert "predicted_delta" in data
    assert data["target_variable"] == "NDVI_next_week"
    assert "explanation" in data
    assert len(data["explanation"]["attributions"]) == 29
    assert data["model"]["feature_count"] == 29
    assert "disclaimer" in data


def test_api_predict_ndvi_extra_field_rejected(client, sample_valid_features):
    """Test that extra uncontracted fields are rejected with HTTP 422."""
    sample_valid_features["injected_forbidden_field"] = "malicious_payload"
    res = client.post("/predict/ndvi", json=sample_valid_features)
    assert res.status_code == 422


def test_api_predict_ndvi_out_of_bounds_rejected(client, sample_valid_features):
    """Test that values outside physical range are rejected with HTTP 422."""
    sample_valid_features["NDVI"] = 1.5  # Valid range is [-0.2, 1.0]
    res = client.post("/predict/ndvi", json=sample_valid_features)
    assert res.status_code == 422


def test_api_predict_ndvi_global_coordinates_accepted(client, sample_valid_features):
    """Test that coordinates outside Maharashtra but within global bounds are accepted."""
    sample_valid_features["Latitude"] = 12.9716
    sample_valid_features["Longitude"] = 77.5946
    res = client.post("/predict/ndvi", json=sample_valid_features)
    assert res.status_code == 200


def test_api_predict_ndvi_invalid_global_coordinates_rejected(client, sample_valid_features):
    """Test that coordinates outside [-90, 90] lat or [-180, 180] lon are rejected with 422."""
    sample_valid_features["Latitude"] = 95.0
    res = client.post("/predict/ndvi", json=sample_valid_features)
    assert res.status_code == 422

    sample_valid_features["Latitude"] = 19.75
    sample_valid_features["Longitude"] = 185.0
    res = client.post("/predict/ndvi", json=sample_valid_features)
    assert res.status_code == 422

