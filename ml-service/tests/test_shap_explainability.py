"""
AgriShield Parametric - Module 8
Unit Tests for Stage 8.2-F: SHAP Explainability Service & Attribution Validation
"""

import math
import os
import joblib
import numpy as np
import pandas as pd
import pytest
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier

from app.services.synthetic_dataset_generator import FEATURE_NAMES
from app.services.shap_explainability_service import (
    BatchExplanation,
    FeatureAttribution,
    SampleExplanation,
    ShapExplainabilityService,
)


@pytest.fixture(scope="module")
def artifacts_dir():
    """Returns absolute path to ml-service artifacts directory."""
    dir_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "artifacts"))
    assert os.path.exists(dir_path), f"Artifacts directory missing at {dir_path}"
    return dir_path


@pytest.fixture(scope="module")
def service(artifacts_dir):
    """Initializes ShapExplainabilityService from persisted artifacts."""
    return ShapExplainabilityService(artifacts_dir=artifacts_dir)


@pytest.fixture
def valid_sample_df():
    """Generates a clean valid 1-row DataFrame strictly matching the 17-feature contract."""
    data = {
        "precipitation_sum_30d": [120.5],
        "precipitation_sum_14d": [45.2],
        "precipitation_std_30d": [8.4],
        "consecutive_dry_days_max": [12],
        "temp_max_30d": [41.2],
        "temp_mean_30d": [32.1],
        "temp_amplitude_mean_30d": [11.5],
        "heat_wave_hours_30d": [48],
        "relative_humidity_mean_30d": [55.0],
        "vpd_mean_30d": [2.35],
        "wind_speed_mean_30d": [12.4],
        "wind_gust_max_30d": [75.0],
        "ndvi_latest": [0.42],
        "ndvi_trend_30d": [-0.003],
        "calculated_area_ha": [2.5],
        "is_ndvi_available": [1],
        "is_ndvi_trend_available": [1],
    }
    return pd.DataFrame(data, columns=FEATURE_NAMES)


# =============================================================================
# TESTS 1-4: INITIALIZATION, CONTRACT & SHAPE
# =============================================================================

def test_explainer_initialization(service):
    """Test 1: Explainer initializes cleanly from loaded base model."""
    assert service.explainer is not None
    assert isinstance(service.base_model, HistGradientBoostingClassifier)
    assert service.feature_names == FEATURE_NAMES


def test_exact_17_feature_contract(service, valid_sample_df):
    """Test 2: Service strictly accepts 17 features matching locked contract order."""
    exp = service.explain(valid_sample_df)
    assert exp.feature_count == 17
    assert len(exp.sample_explanations[0].attributions) == 17


def test_correct_shap_shape(service, valid_sample_df):
    """Test 3: Explanations produce expected (N, 17) SHAP matrix."""
    batch_df = pd.concat([valid_sample_df] * 5, ignore_index=True)
    exp = service.explain(batch_df)
    shap_mat = np.array(exp.shap_matrix)
    assert shap_mat.shape == (5, 17)


def test_feature_ordering_alignment(service, valid_sample_df):
    """Test 4: Each SHAP attribution row strictly aligns with locked FEATURE_NAMES."""
    exp = service.explain(valid_sample_df)
    attributions = exp.sample_explanations[0].attributions
    extracted_names = [a.feature_name for a in attributions]
    assert extracted_names == FEATURE_NAMES


# =============================================================================
# TESTS 5-7: ADDITIVITY & NATIVE NAN HANDLING
# =============================================================================

def test_additivity_validation(service, valid_sample_df):
    """Test 5: base_value + sum(shap_values) == decision_function(X) within strict tolerance."""
    exp = service.explain(valid_sample_df, tolerance=1e-7)
    sample_exp = exp.sample_explanations[0]

    reconstructed = sample_exp.reconstructed_margin
    actual = sample_exp.raw_decision_margin
    error = sample_exp.additivity_error

    assert error < 1e-7, f"Additivity error {error:.2e} exceeded tolerance 1e-7"
    assert math.isclose(reconstructed, actual, abs_tol=1e-7)
    assert exp.additivity_fail_count == 0


def test_native_nan_support_single_nan(service, valid_sample_df):
    """Test 6: Native NaN in ndvi_latest or ndvi_trend_30d computes valid finite SHAP values."""
    df_nan = valid_sample_df.copy()
    df_nan.loc[0, "ndvi_trend_30d"] = np.nan
    df_nan.loc[0, "is_ndvi_trend_available"] = 0

    exp = service.explain(df_nan, tolerance=1e-7)
    sample_exp = exp.sample_explanations[0]

    assert math.isnan(valid_sample_df.loc[0, "ndvi_trend_30d"]) is False
    assert sample_exp.attributions[13].feature_value is None
    assert math.isfinite(sample_exp.attributions[13].shap_value)
    assert sample_exp.additivity_error < 1e-7


def test_both_ndvi_nan_values_simultaneously(service, valid_sample_df):
    """Test 7: Both optical NDVI features simultaneously NaN operates without failure."""
    df_both_nan = valid_sample_df.copy()
    df_both_nan.loc[0, "ndvi_latest"] = np.nan
    df_both_nan.loc[0, "ndvi_trend_30d"] = np.nan
    df_both_nan.loc[0, "is_ndvi_available"] = 0
    df_both_nan.loc[0, "is_ndvi_trend_available"] = 0

    exp = service.explain(df_both_nan, tolerance=1e-7)
    sample_exp = exp.sample_explanations[0]

    assert sample_exp.attributions[12].feature_value is None
    assert sample_exp.attributions[13].feature_value is None
    assert math.isfinite(sample_exp.attributions[12].shap_value)
    assert math.isfinite(sample_exp.attributions[13].shap_value)
    assert sample_exp.additivity_error < 1e-7


# =============================================================================
# TESTS 8-12: DIRECTION, BASE VALUE & FINITENESS
# =============================================================================

def test_positive_shap_direction(service):
    """Test 8: Positive SHAP contribution is labeled 'pushes model toward class 1'."""
    direction = service._determine_direction(0.45)
    assert direction == "pushes model toward class 1"


def test_negative_shap_direction(service):
    """Test 9: Negative SHAP contribution is labeled 'pushes model toward class 0'."""
    direction = service._determine_direction(-0.32)
    assert direction == "pushes model toward class 0"


def test_zero_contribution_direction(service):
    """Test 10: Zero SHAP contribution is labeled 'no contribution'."""
    direction = service._determine_direction(0.0)
    assert direction == "no contribution"


def test_finite_shap_values(service, valid_sample_df):
    """Test 11: All generated SHAP values are finite floats."""
    exp = service.explain(valid_sample_df)
    for attr in exp.sample_explanations[0].attributions:
        assert math.isfinite(attr.shap_value)
        assert math.isfinite(attr.contribution_magnitude)
        assert attr.contribution_magnitude >= 0.0


def test_base_value_availability(service, valid_sample_df):
    """Test 12: Base value is finite and represents expected raw decision margin."""
    exp = service.explain(valid_sample_df)
    assert math.isfinite(exp.base_value)
    assert isinstance(exp.base_value, float)


# =============================================================================
# TESTS 13-17: CONTRACT REJECTIONS, RELOAD & REPRODUCIBILITY
# =============================================================================

def test_invalid_feature_count_rejection(service, valid_sample_df):
    """Test 13: Passing input with fewer or more than 17 features raises ValueError."""
    # 16 features
    df_missing_col = valid_sample_df.drop(columns=["wind_gust_max_30d"])
    with pytest.raises(ValueError, match="Feature count mismatch"):
        service.explain(df_missing_col)

    # 18 features
    df_extra_col = valid_sample_df.copy()
    df_extra_col["scenario_id"] = 1
    with pytest.raises(ValueError, match="Feature count mismatch"):
        service.explain(df_extra_col)


def test_invalid_feature_ordering_rejection(service, valid_sample_df):
    """Test 14: Shuffled feature column ordering raises explicit ValueError."""
    shuffled_cols = list(reversed(FEATURE_NAMES))
    df_shuffled = valid_sample_df[shuffled_cols]
    with pytest.raises(ValueError, match="Feature contract violation"):
        service.explain(df_shuffled)


def test_model_artifact_reload_and_explainer(artifacts_dir):
    """Test 15: ShapExplainabilityService loads cleanly from persisted disk artifacts."""
    reloaded_service = ShapExplainabilityService(artifacts_dir=artifacts_dir)
    assert reloaded_service.base_model is not None
    assert reloaded_service.explainer is not None


def test_explanation_determinism(service, valid_sample_df):
    """Test 16: Repeated explanation calls on the same sample produce bitwise identical SHAP values."""
    exp1 = service.explain(valid_sample_df)
    exp2 = service.explain(valid_sample_df)

    mat1 = np.array(exp1.shap_matrix)
    mat2 = np.array(exp2.shap_matrix)
    np.testing.assert_array_equal(mat1, mat2)


def test_calibrated_model_rejection(artifacts_dir):
    """Test 17: Passing CalibratedClassifierCV directly to service raises TypeError."""
    calib_model = joblib.load(os.path.join(artifacts_dir, "calibrated_model.joblib"))
    with pytest.raises(TypeError, match="Architectural violation"):
        ShapExplainabilityService(base_model=calib_model)
