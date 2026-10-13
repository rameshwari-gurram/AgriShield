"""
AgriShield Parametric - Module 8
Unit Tests for Stage 8.2-E: Model Training, Grouped Cross-Validation & Calibration
"""

import math
import os
import shutil
import tempfile
import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import HistGradientBoostingClassifier

from app.services.synthetic_dataset_generator import (
    FEATURE_NAMES,
    SyntheticDatasetGenerator,
    build_default_scenario_catalog,
)
from app.services.model_training_service import (
    FoldMetrics,
    ModelHyperparameters,
    load_model_artifacts,
    run_grouped_cross_validation,
    save_model_artifacts,
    train_and_calibrate_final_model,
    verify_shap_compatibility,
)


@pytest.fixture(scope="module")
def sample_dataset():
    """Generates a controlled 10-scenario x 10-episode dataset for rapid testing."""
    catalog = build_default_scenario_catalog(n_scenarios=10, seed=42)
    generator = SyntheticDatasetGenerator(scenario_catalog=catalog)
    df_features, df_metadata = generator.generate_dataset(
        n_scenarios=10, episodes_per_scenario=10, random_seed=42
    )
    return df_features, df_metadata


# =============================================================================
# TESTS 1-4: FEATURE CONTRACT & NATIVE NAN HANDLING
# =============================================================================

def test_exact_17_feature_contract(sample_dataset):
    """Test 1: Model service enforces exactly 17 features in locked contract order."""
    df_features, df_metadata = sample_dataset
    assert list(df_features.columns) == FEATURE_NAMES
    assert len(df_features.columns) == 17

    # Test error on altered feature order
    shuffled_cols = list(reversed(FEATURE_NAMES))
    df_shuffled = df_features[shuffled_cols]
    with pytest.raises(ValueError, match="Feature contract violation"):
        run_grouped_cross_validation(df_shuffled, df_metadata, n_splits=3)


def test_no_metadata_enters_training(sample_dataset):
    """Test 2: Prohibited metadata columns are rejected if present in feature matrix."""
    df_features, df_metadata = sample_dataset
    df_bad = df_features.copy()
    df_bad["scenario_id"] = df_metadata["scenario_id"]

    with pytest.raises(ValueError, match="Feature contract violation"):
        run_grouped_cross_validation(df_bad, df_metadata, n_splits=3)


def test_no_target_enters_training(sample_dataset):
    """Test 3: Target column is strictly prohibited from feature matrix."""
    df_features, df_metadata = sample_dataset
    df_bad = df_features.copy()
    df_bad["target_severe_water_stress"] = df_metadata["target_severe_water_stress"]

    with pytest.raises(ValueError, match="Feature contract violation"):
        run_grouped_cross_validation(df_bad, df_metadata, n_splits=3)


def test_native_nan_support_works(sample_dataset):
    """Test 4: HistGradientBoostingClassifier natively handles NaNs without imputation."""
    df_features, df_metadata = sample_dataset
    # Confirm dataset has NaNs in ndvi_latest and ndvi_trend_30d
    assert df_features["ndvi_latest"].isna().any(), "Dataset must contain NaNs to test native support"
    assert df_features["ndvi_trend_30d"].isna().any(), "Dataset must contain NaNs to test native support"

    hyperparams = ModelHyperparameters(max_iter=10, random_state=42)
    base_model, calib_model, _ = train_and_calibrate_final_model(
        df_features, df_metadata, hyperparams=hyperparams, n_splits=3
    )

    # Predict directly on features containing NaNs
    preds = base_model.predict(df_features)
    probs = base_model.predict_proba(df_features)
    cal_probs = calib_model.predict_proba(df_features)

    assert len(preds) == len(df_features)
    assert not np.isnan(probs).any(), "Probabilities should never be NaN"
    assert not np.isnan(cal_probs).any(), "Calibrated probabilities should never be NaN"


# =============================================================================
# TESTS 5-8: GROUPED CROSS-VALIDATION & OUT-OF-FOLD INVARIANTS
# =============================================================================

def test_group_overlap_assertion():
    """Test 5: System detects and halts on any scenario leakage between train and val."""
    df_feat = pd.DataFrame(np.random.randn(20, 17), columns=FEATURE_NAMES)
    # Intentional duplicate scenario mapping
    df_meta = pd.DataFrame({
        "scenario_id": [1] * 20,  # All rows share single scenario -> cannot split into 2 groups
        "target_severe_water_stress": [0, 1] * 10,
    })

    with pytest.raises(ValueError):
        # StratifiedGroupKFold cannot split 1 group into 2 folds
        run_grouped_cross_validation(df_feat, df_meta, n_splits=2)


def test_oof_predictions_coverage(sample_dataset):
    """Test 6 & 8: Every sample receives exactly one out-of-fold prediction and count matches N."""
    df_features, df_metadata = sample_dataset
    N = len(df_features)

    fold_metrics, pooled_metrics, oof_probs, oof_preds = run_grouped_cross_validation(
        df_features, df_metadata, n_splits=5, random_state=42
    )

    assert len(oof_probs) == N
    assert len(oof_preds) == N
    assert not np.isnan(oof_probs).any(), "Every sample must have a finite OOF probability"
    assert (oof_preds >= 0).all(), "Every sample must have an assigned binary prediction"
    assert pooled_metrics["total_rows"] == N


def test_every_scenario_in_exactly_one_val_fold(sample_dataset):
    """Test 7: Each scenario appears in the validation set of exactly one fold."""
    df_features, df_metadata = sample_dataset
    fold_metrics, _, _, _ = run_grouped_cross_validation(
        df_features, df_metadata, n_splits=5, random_state=42
    )

    total_val_scenarios = sum(m.val_scenarios for m in fold_metrics)
    unique_scenarios = df_metadata["scenario_id"].nunique()
    assert total_val_scenarios == unique_scenarios, "Scenario validated in multiple folds or omitted!"


# =============================================================================
# TESTS 9-10: PERSISTENCE & RELOAD
# =============================================================================

def test_model_persistence_and_reload(sample_dataset):
    """Test 9 & 10: Model artifacts persist cleanly with joblib and reloaded model accepts contract."""
    df_features, df_metadata = sample_dataset
    hyperparams = ModelHyperparameters(max_iter=15, random_state=42)

    base_model, calib_model, calib_audit = train_and_calibrate_final_model(
        df_features, df_metadata, hyperparams=hyperparams, n_splits=3
    )

    with tempfile.TemporaryDirectory() as tmp_dir:
        # Save artifacts
        saved = save_model_artifacts(
            save_dir=tmp_dir,
            base_model=base_model,
            calibrated_model=calib_model,
            hyperparams=hyperparams,
            calibration_audit=calib_audit,
            pooled_oof_metrics={"accuracy": 0.95},
        )

        assert os.path.exists(saved["base_model_path"])
        assert os.path.exists(saved["calibrated_model_path"])
        assert os.path.exists(saved["metadata_path"])

        # Reload artifacts
        loaded_base, loaded_calib, metadata = load_model_artifacts(tmp_dir)

        # Verify predictions match exactly
        orig_preds = base_model.predict(df_features)
        loaded_preds = loaded_base.predict(df_features)
        np.testing.assert_array_equal(orig_preds, loaded_preds)

        orig_cal_probs = calib_model.predict_proba(df_features)
        loaded_cal_probs = loaded_calib.predict_proba(df_features)
        np.testing.assert_allclose(orig_cal_probs, loaded_cal_probs, rtol=1e-5)

        assert metadata["feature_names"] == FEATURE_NAMES
        assert metadata["feature_count"] == 17


# =============================================================================
# TESTS 11-12: SHAP SMOKE TEST & REPRODUCIBILITY
# =============================================================================

def test_shap_smoke_test(sample_dataset):
    """Test 11: SHAP TreeExplainer verifies (n_samples, 17) shape and log-odds additivity."""
    df_features, df_metadata = sample_dataset
    hyperparams = ModelHyperparameters(max_iter=15, random_state=42)
    base_model, _, _ = train_and_calibrate_final_model(
        df_features, df_metadata, hyperparams=hyperparams, n_splits=3
    )

    X_test = df_features.head(10).to_numpy()
    audit = verify_shap_compatibility(base_model, X_test)

    assert audit["feature_count"] == 17
    assert audit["sample_count"] == 10
    assert audit["additivity_verified"] is True
    assert audit["max_additivity_error"] < 1e-7


def test_training_reproducibility(sample_dataset):
    """Test 12: Identical random_state produces bitwise identical models and predictions."""
    df_features, df_metadata = sample_dataset
    hyperparams = ModelHyperparameters(max_iter=20, random_state=42)

    base_1, cal_1, _ = train_and_calibrate_final_model(
        df_features, df_metadata, hyperparams=hyperparams, n_splits=3, random_state=42
    )
    base_2, cal_2, _ = train_and_calibrate_final_model(
        df_features, df_metadata, hyperparams=hyperparams, n_splits=3, random_state=42
    )

    probs_1 = base_1.predict_proba(df_features)
    probs_2 = base_2.predict_proba(df_features)
    np.testing.assert_array_equal(probs_1, probs_2)

    cal_probs_1 = cal_1.predict_proba(df_features)
    cal_probs_2 = cal_2.predict_proba(df_features)
    np.testing.assert_array_equal(cal_probs_1, cal_probs_2)
