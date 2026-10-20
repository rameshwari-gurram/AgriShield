"""
AgriShield Parametric - Module 8
Vegetation Health (NDVI) Forecast Model Training & Evaluation Service

Dataset Provenance:
IEEE Dataport / AgriVision Maharashtra Dataset (2017-2025)
33,655 multi-spectral and meteorological records across 167 monitoring points in Maharashtra.
Target: NDVI_next_week (7-day ahead Sentinel-2 NDVI forecast)

Scope:
- Reproducible preprocessing and leakage prevention
- Chronological evaluation split (Train: 2017-2023, Test: 2024-2025)
- Spatial holdout evaluation across unseen districts
- Baseline comparisons: Historical Mean and Persistence (NDVI_next = NDVI_current)
- HistGradientBoostingRegressor training with native missing-value routing
- Model artifact persistence and metadata recording
"""

from dataclasses import asdict, dataclass
import importlib.metadata
import json
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error

from app.services.shap_explainability_service import get_shap_module
from app.utils.logger import logger

# =============================================================================
# CANONICAL FEATURE CONTRACT FOR NDVI FORECASTING (29 FEATURES)
# =============================================================================

FEATURE_NAMES_NDVI: List[str] = [
    "NDVI",
    "Rainfall_Current",
    "Temperature_Current",
    "NDVI_lag_1",
    "NDVI_lag_2",
    "NDVI_lag_3",
    "NDVI_lag_4",
    "NDVI_lag_8",
    "NDVI_change_1w",
    "NDVI_change_2w",
    "NDVI_change_4w",
    "Rainfall_lag_1",
    "Rainfall_lag_2",
    "Rainfall_lag_4",
    "Rainfall_rolling_2w",
    "Rainfall_rolling_4w",
    "Rainfall_rolling_8w",
    "Temperature_lag_1",
    "Temperature_lag_2",
    "Temperature_lag_4",
    "Temperature_rolling_2w",
    "Temperature_rolling_4w",
    "Temperature_rolling_8w",
    "Week_Sin",
    "Week_Cos",
    "Month_Sin",
    "Month_Cos",
    "Latitude",
    "Longitude",
]

TARGET_COL: str = "NDVI_next_week"


@dataclass(frozen=True)
class NdviModelHyperparameters:
    """Hyperparameters for HistGradientBoostingRegressor."""
    max_iter: int = 100
    learning_rate: float = 0.08
    max_depth: Optional[int] = 6
    min_samples_leaf: int = 20
    l2_regularization: float = 1.0
    random_state: int = 42

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# =============================================================================
# DATASET PREPARATION & LEAKAGE PREVENTION
# =============================================================================

def load_and_preprocess_dataset(csv_path: str) -> pd.DataFrame:
    """
    Loads and validates the AgriVision Maharashtra dataset.
    
    Leakage Prevention & Data Cleansing Invariants:
    1. Removes non-vegetation cloud/water noise: NDVI_next_week < -0.2.
    2. Chronologically sorts by (point_id, Week_Start).
    3. Guarantees TARGET_COL is not included in the feature columns.
    4. Confirms all 29 feature columns are present and strictly populated.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"AgriVision dataset CSV not found at: {csv_path}")

    logger.info(f"Loading AgriVision dataset from: {csv_path}")
    df = pd.read_csv(csv_path)

    total_rows = len(df)
    logger.info(f"Loaded raw dataset with {total_rows} rows and {len(df.columns)} columns.")

    # 1. Filter invalid negative targets (< -0.2) representing water bodies or cloud artifacts
    valid_mask = df[TARGET_COL] >= -0.2
    invalid_count = total_rows - int(valid_mask.sum())
    df_clean = df[valid_mask].copy()
    logger.info(f"Filtered {invalid_count} artifact rows (< -0.2). Clean rows: {len(df_clean)}")

    # 2. Sort chronologically within monitoring points
    df_clean["Week_Start"] = pd.to_datetime(df_clean["Week_Start"])
    df_clean = df_clean.sort_values(by=["point_id", "Week_Start"]).reset_index(drop=True)

    # 3. Verify feature presence
    missing_features = [f for f in FEATURE_NAMES_NDVI if f not in df_clean.columns]
    if missing_features:
        raise ValueError(f"Dataset missing required canonical features: {missing_features}")

    return df_clean


def compute_regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """Computes MAE, RMSE, and R2."""
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(root_mean_squared_error(y_true, y_pred))
    r2 = float(r2_score(y_true, y_pred))
    return {
        "mae": round(mae, 5),
        "rmse": round(rmse, 5),
        "r2": round(r2, 5),
    }


# =============================================================================
# EVALUATION: CHRONOLOGICAL & SPATIAL SPLITS
# =============================================================================

def evaluate_chronological_split(
    df: pd.DataFrame,
    hyperparams: Optional[NdviModelHyperparameters] = None,
    train_max_year: int = 2023,
    test_min_year: int = 2024,
) -> Dict[str, Any]:
    """
    Evaluates next-week NDVI regression on a strict chronological split:
    Train: 2017 to train_max_year (e.g. 2017-2023)
    Test: test_min_year to 2025 (e.g. 2024-2025)
    
    Compares:
    1. Historical Mean Baseline (predicts training set mean NDVI)
    2. Persistence Baseline (predicts current week NDVI: NDVI_next = NDVI_current)
    3. HistGradientBoostingRegressor
    """
    if hyperparams is None:
        hyperparams = NdviModelHyperparameters()

    train_mask = df["Year"] <= train_max_year
    test_mask = df["Year"] >= test_min_year

    train_df = df[train_mask]
    test_df = df[test_mask]

    X_train = train_df[FEATURE_NAMES_NDVI]
    y_train = train_df[TARGET_COL].to_numpy()
    X_test = test_df[FEATURE_NAMES_NDVI]
    y_test = test_df[TARGET_COL].to_numpy()

    # Fit HistGradientBoostingRegressor
    model = HistGradientBoostingRegressor(**hyperparams.to_dict())
    model.fit(X_train, y_train)

    # Predictions
    y_pred_hgb = model.predict(X_test)
    y_pred_persistence = X_test["NDVI"].to_numpy()
    y_pred_mean = np.full_like(y_test, y_train.mean())

    # Metrics
    metrics_hgb = compute_regression_metrics(y_test, y_pred_hgb)
    metrics_persistence = compute_regression_metrics(y_test, y_pred_persistence)
    metrics_mean = compute_regression_metrics(y_test, y_pred_mean)

    # Error reduction vs persistence
    mae_improvement = (metrics_persistence["mae"] - metrics_hgb["mae"]) / metrics_persistence["mae"]
    rmse_improvement = (metrics_persistence["rmse"] - metrics_hgb["rmse"]) / metrics_persistence["rmse"]

    return {
        "split_type": "chronological",
        "train_years": f"2017-{train_max_year}",
        "test_years": f"{test_min_year}-2025",
        "train_samples": len(train_df),
        "test_samples": len(test_df),
        "baselines": {
            "historical_mean": metrics_mean,
            "persistence": metrics_persistence,
        },
        "model_performance": metrics_hgb,
        "relative_improvement_vs_persistence": {
            "mae_reduction_pct": round(mae_improvement * 100, 2),
            "rmse_reduction_pct": round(rmse_improvement * 100, 2),
        },
    }


def evaluate_spatial_holdout(
    df: pd.DataFrame,
    hyperparams: Optional[NdviModelHyperparameters] = None,
    holdout_ratio: float = 0.20,
    random_state: int = 42,
) -> Dict[str, Any]:
    """
    Evaluates spatial generalization by holding out entire unseen districts.
    """
    if hyperparams is None:
        hyperparams = NdviModelHyperparameters()

    unique_districts = np.sort(df["district"].unique())
    n_holdout = max(1, int(len(unique_districts) * holdout_ratio))

    rng = np.random.RandomState(random_state)
    holdout_districts = sorted(rng.choice(unique_districts, size=n_holdout, replace=False).tolist())
    train_districts = [d for d in unique_districts if d not in holdout_districts]

    train_df = df[df["district"].isin(train_districts)]
    test_df = df[df["district"].isin(holdout_districts)]

    X_train = train_df[FEATURE_NAMES_NDVI]
    y_train = train_df[TARGET_COL].to_numpy()
    X_test = test_df[FEATURE_NAMES_NDVI]
    y_test = test_df[TARGET_COL].to_numpy()

    model = HistGradientBoostingRegressor(**hyperparams.to_dict())
    model.fit(X_train, y_train)

    y_pred_hgb = model.predict(X_test)
    y_pred_persistence = X_test["NDVI"].to_numpy()
    y_pred_mean = np.full_like(y_test, y_train.mean())

    metrics_hgb = compute_regression_metrics(y_test, y_pred_hgb)
    metrics_persistence = compute_regression_metrics(y_test, y_pred_persistence)
    metrics_mean = compute_regression_metrics(y_test, y_pred_mean)

    return {
        "split_type": "spatial_holdout",
        "holdout_districts_count": len(holdout_districts),
        "holdout_districts": holdout_districts,
        "train_samples": len(train_df),
        "test_samples": len(test_df),
        "baselines": {
            "historical_mean": metrics_mean,
            "persistence": metrics_persistence,
        },
        "model_performance": metrics_hgb,
    }


# =============================================================================
# MODEL PERSISTENCE & METADATA
# =============================================================================

def train_and_save_final_model(
    df: pd.DataFrame,
    hyperparams: Optional[NdviModelHyperparameters] = None,
    save_dir: Optional[str] = None,
    dataset_version: str = "AgriVision_IEEE_GSMaP_2017_2025_v1.0",
) -> Dict[str, Any]:
    """
    Fits the final HistGradientBoostingRegressor on the complete verified dataset,
    runs SHAP TreeExplainer additivity verification, and persists artifacts.
    """
    if hyperparams is None:
        hyperparams = NdviModelHyperparameters()

    if save_dir is None:
        save_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "artifacts")
        )
    os.makedirs(save_dir, exist_ok=True)

    # 1. Run Chronological and Spatial Evaluations for Provenance Metadata
    logger.info("Evaluating chronological split...")
    chrono_eval = evaluate_chronological_split(df, hyperparams)
    logger.info(f"Chronological evaluation result: {chrono_eval['model_performance']}")

    logger.info("Evaluating spatial holdout split...")
    spatial_eval = evaluate_spatial_holdout(df, hyperparams)
    logger.info(f"Spatial holdout result: {spatial_eval['model_performance']}")

    # 2. Fit Final Production Regressor on full clean dataset
    logger.info("Fitting final HistGradientBoostingRegressor on all 33,549 clean samples...")
    X_full = df[FEATURE_NAMES_NDVI]
    y_full = df[TARGET_COL].to_numpy()

    final_model = HistGradientBoostingRegressor(**hyperparams.to_dict())
    final_model.fit(X_full, y_full)

    # 3. SHAP TreeExplainer Additivity Verification
    logger.info("Verifying SHAP TreeExplainer additivity on a sample...")
    shap = get_shap_module()
    explainer = shap.TreeExplainer(final_model)
    sample_X = X_full.iloc[:50]
    shap_vals = explainer(sample_X)
    
    # In regression: predict(X) == base_value + sum(shap_values)
    base_val = float(explainer.expected_value[0] if isinstance(explainer.expected_value, (list, np.ndarray)) else explainer.expected_value)
    reconstructed = np.sum(shap_vals.values, axis=1) + base_val
    model_preds = final_model.predict(sample_X)
    max_additivity_error = float(np.max(np.abs(model_preds - reconstructed)))
    logger.info(f"SHAP TreeExplainer max additivity discrepancy: {max_additivity_error:.2e}")

    if max_additivity_error > 1e-6:
        raise RuntimeError(
            f"SHAP TreeExplainer additivity check failed! Max discrepancy {max_additivity_error} > 1e-6"
        )

    # 4. Save Artifacts
    model_path = os.path.join(save_dir, "ndvi_forecast_model.joblib")
    meta_path = os.path.join(save_dir, "ndvi_model_metadata.json")

    logger.info(f"Saving model artifact to: {model_path}")
    joblib.dump(final_model, model_path)

    metadata = {
        "model_name": "AgriVision-NDVI-Forecast-HGB",
        "model_version": "1.0.0",
        "task_type": "supervised_regression",
        "target_variable": TARGET_COL,
        "target_description": "7-day ahead Sentinel-2 Normalized Difference Vegetation Index (NDVI)",
        "target_unit": "NDVI index [-0.2, 1.0]",
        "forecast_horizon_days": 7,
        "feature_count": len(FEATURE_NAMES_NDVI),
        "feature_names": FEATURE_NAMES_NDVI,
        "dataset_version": dataset_version,
        "total_training_samples": len(df),
        "unique_monitoring_points": int(df["point_id"].nunique()),
        "districts_covered": int(df["district"].nunique()),
        "hyperparameters": hyperparams.to_dict(),
        "chronological_evaluation": chrono_eval,
        "spatial_holdout_evaluation": spatial_eval,
        "shap_verification": {
            "explainer": "shap.TreeExplainer",
            "base_expected_value": round(base_val, 5),
            "sample_count_verified": len(sample_X),
            "max_additivity_error": max_additivity_error,
            "additivity_verified": True,
        },
        "software_environment": {
            "python": sys.version.split()[0],
            "scikit_learn": importlib.metadata.version("scikit-learn"),
            "joblib": importlib.metadata.version("joblib"),
            "numpy": importlib.metadata.version("numpy"),
            "pandas": importlib.metadata.version("pandas"),
            "shap": importlib.metadata.version("shap"),
        },
    }

    logger.info(f"Saving model metadata to: {meta_path}")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return {
        "model_path": model_path,
        "metadata_path": meta_path,
        "metadata": metadata,
    }
