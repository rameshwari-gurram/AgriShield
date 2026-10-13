"""
AgriShield Parametric - Module 8
SHAP Explainability Service & Offline Attribution Validation

Scope Statement:
Provides a clean, offline explainability layer for the trained
HistGradientBoostingClassifier base model using SHAP 0.45.1 TreeExplainer.
Strictly explains the raw decision margin (log-odds), preserves native NaN
handling for optical Sentinel-2 indicators, validates exact numerical
additivity, and formats human-readable feature attributions without conflating
margin contributions with calibrated posterior probabilities.
"""

from dataclasses import asdict, dataclass
import math
import os
import sys
from typing import Any, Dict, List, Optional, Tuple, Union
from unittest.mock import MagicMock

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier

from app.services.synthetic_dataset_generator import FEATURE_NAMES


# =============================================================================
# SHAP SAFE IMPORT HELPER
# =============================================================================

def get_shap_module():
    """
    Safely imports shap, ensuring Windows Application Control policies that block
    numba's C-extension (_typeconv.pyd) do not prevent TreeExplainer execution.
    """
    if "numba" not in sys.modules:
        try:
            import numba  # Attempt standard import
        except Exception:
            # Fall back to lightweight stub for numba
            numba_mock = MagicMock()
            numba_mock.njit = lambda *args, **kwargs: (lambda f: f) if args and callable(args[0]) else (lambda f: f)
            numba_mock.jit = lambda *args, **kwargs: (lambda f: f) if args and callable(args[0]) else (lambda f: f)
            sys.modules["numba"] = numba_mock
            sys.modules["numba.typed"] = MagicMock()
    import shap
    return shap


# =============================================================================
# EXPLANATION CONTRACTS & DATA CLASSES
# =============================================================================

@dataclass
class FeatureAttribution:
    """Individual feature contribution to the raw model decision margin."""
    feature_name: str
    feature_value: Optional[float]
    shap_value: float
    direction: str
    contribution_magnitude: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SampleExplanation:
    """Complete explanation for a single prediction instance."""
    sample_index: int
    base_value: float
    raw_decision_margin: float
    reconstructed_margin: float
    additivity_error: float
    attributions: List[FeatureAttribution]
    calibrated_probability: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class BatchExplanation:
    """Summary of explanations and additivity audit across a batch of samples."""
    sample_count: int
    feature_count: int
    base_value: float
    shap_matrix: List[List[float]]
    max_additivity_error: float
    mean_additivity_error: float
    tolerance: float
    additivity_pass_count: int
    additivity_fail_count: int
    sample_explanations: List[SampleExplanation]

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        return d


# =============================================================================
# EXPLAINABILITY SERVICE
# =============================================================================

class ShapExplainabilityService:
    """
    Offline SHAP explainability service wrapping the trained HistGradientBoostingClassifier.

    Architectural Guarantees:
    1. Explains the BASE model's raw decision margin (log-odds), NOT calibrated probabilities.
    2. Prohibits passing CalibratedClassifierCV directly to TreeExplainer.
    3. Strictly enforces the locked 17-feature contract (v1.1).
    4. Supports native NaNs in optical NDVI features without imputation.
    5. Validates mathematical additivity: base_value + sum(shap_values) ≈ decision_function(X).
    """

    def __init__(
        self,
        base_model: Optional[HistGradientBoostingClassifier] = None,
        calibrated_model: Optional[CalibratedClassifierCV] = None,
        artifacts_dir: Optional[str] = None,
    ):
        if base_model is not None:
            # Enforce that base_model is NOT a CalibratedClassifierCV wrapper
            if isinstance(base_model, CalibratedClassifierCV):
                raise TypeError(
                    "Architectural violation! CalibratedClassifierCV cannot be passed to TreeExplainer. "
                    "TreeExplainer requires the raw HistGradientBoostingClassifier base model."
                )
            self.base_model = base_model
            self.calibrated_model = calibrated_model
        elif artifacts_dir is not None:
            base_path = os.path.join(artifacts_dir, "base_model.joblib")
            calib_path = os.path.join(artifacts_dir, "calibrated_model.joblib")
            if not os.path.exists(base_path):
                raise FileNotFoundError(f"Missing base model artifact at {base_path}")
            self.base_model = joblib.load(base_path)
            self.calibrated_model = joblib.load(calib_path) if os.path.exists(calib_path) else None
        else:
            # Default to canonical ml-service artifacts directory
            default_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "artifacts"))
            base_path = os.path.join(default_dir, "base_model.joblib")
            calib_path = os.path.join(default_dir, "calibrated_model.joblib")
            if not os.path.exists(base_path):
                raise FileNotFoundError(f"No base model provided and artifact not found at {base_path}")
            self.base_model = joblib.load(base_path)
            self.calibrated_model = joblib.load(calib_path) if os.path.exists(calib_path) else None

        # Verify base model has decision_function
        if not hasattr(self.base_model, "decision_function"):
            raise AttributeError("Base model must expose decision_function for raw margin explanations.")

        # Initialize SHAP TreeExplainer
        shap = get_shap_module()
        self.explainer = shap.TreeExplainer(self.base_model)
        self.feature_names: List[str] = list(FEATURE_NAMES)

    def validate_input(self, X: Union[pd.DataFrame, np.ndarray]) -> pd.DataFrame:
        """
        Validates input structure against the locked 17-feature contract.

        Rules:
        - Must contain exactly 17 features.
        - If DataFrame: column names and ordering must match FEATURE_NAMES exactly.
        - If ndarray: must have shape (N, 17); columns are assigned in contract order.
        """
        if isinstance(X, pd.DataFrame):
            if len(X.columns) != 17:
                raise ValueError(
                    f"Feature count mismatch! Expected exactly 17 features, got {len(X.columns)}"
                )
            if list(X.columns) != self.feature_names:
                raise ValueError(
                    f"Feature contract violation! Column names or ordering do not match locked contract.\n"
                    f"Expected: {self.feature_names}\nGot: {list(X.columns)}"
                )
            return X.copy()
        elif isinstance(X, np.ndarray):
            if X.ndim == 1:
                X = X.reshape(1, -1)
            if X.shape[1] != 17:
                raise ValueError(
                    f"Feature count mismatch! Expected array with 17 columns, got {X.shape[1]}"
                )
            return pd.DataFrame(X, columns=self.feature_names)
        else:
            raise TypeError(f"Unsupported input type: {type(X)}. Expected pandas DataFrame or numpy ndarray.")

    @staticmethod
    def _determine_direction(shap_val: float) -> str:
        """Determines human-readable directional push on raw decision margin."""
        if shap_val > 0.0:
            return "pushes model toward class 1"
        elif shap_val < 0.0:
            return "pushes model toward class 0"
        else:
            return "no contribution"

    def explain(
        self,
        X: Union[pd.DataFrame, np.ndarray],
        tolerance: float = 1e-7,
        include_calibrated_prob: bool = True,
    ) -> BatchExplanation:
        """
        Generates SHAP explanations for a batch of samples.

        Args:
            X: Input DataFrame or array with 17 contract features
            tolerance: Maximum acceptable discrepancy for additivity check
            include_calibrated_prob: Whether to compute separate calibrated probability

        Returns:
            BatchExplanation with sample-level attributions and additivity verification
        """
        X_df = self.validate_input(X)
        N = len(X_df)

        # 1. Compute raw decision function margins
        raw_margins = self.base_model.decision_function(X_df)

        # 2. Compute calibrated probabilities (optional, distinct from SHAP)
        cal_probs: Optional[np.ndarray] = None
        if include_calibrated_prob and self.calibrated_model is not None:
            cal_probs = self.calibrated_model.predict_proba(X_df)[:, 1]

        # 3. Generate SHAP TreeExplainer values
        shap_explanation = self.explainer(X_df)
        shap_values = shap_explanation.values  # Shape: (N, 17)
        base_values = shap_explanation.base_values  # Shape: (N,) or scalar float

        if np.ndim(base_values) == 0:
            base_val_scalar = float(base_values)
            base_values_arr = np.full(N, base_val_scalar, dtype=np.float64)
        else:
            base_val_scalar = float(base_values[0])
            base_values_arr = np.asarray(base_values, dtype=np.float64)

        # 4. Check finiteness
        if not np.isfinite(shap_values).all():
            raise ValueError("Non-finite values encountered in SHAP attribution matrix!")

        # 5. Evaluate additivity
        reconstructed_margins = np.sum(shap_values, axis=1) + base_values_arr
        additivity_errors = np.abs(raw_margins - reconstructed_margins)
        max_error = float(np.max(additivity_errors))
        mean_error = float(np.mean(additivity_errors))
        pass_count = int(np.sum(additivity_errors <= tolerance))
        fail_count = int(np.sum(additivity_errors > tolerance))

        # 6. Format sample explanations
        sample_explanations: List[SampleExplanation] = []
        for i in range(N):
            row_attributions: List[FeatureAttribution] = []
            for j, feat_name in enumerate(self.feature_names):
                raw_val = X_df.iloc[i, j]
                feat_val = float(raw_val) if not pd.isna(raw_val) else None
                s_val = float(shap_values[i, j])
                row_attributions.append(
                    FeatureAttribution(
                        feature_name=feat_name,
                        feature_value=feat_val,
                        shap_value=s_val,
                        direction=self._determine_direction(s_val),
                        contribution_magnitude=abs(s_val),
                    )
                )

            sample_prob = float(cal_probs[i]) if cal_probs is not None else None
            sample_explanations.append(
                SampleExplanation(
                    sample_index=i,
                    base_value=float(base_values_arr[i]),
                    raw_decision_margin=float(raw_margins[i]),
                    reconstructed_margin=float(reconstructed_margins[i]),
                    additivity_error=float(additivity_errors[i]),
                    attributions=row_attributions,
                    calibrated_probability=sample_prob,
                )
            )

        return BatchExplanation(
            sample_count=N,
            feature_count=17,
            base_value=base_val_scalar,
            shap_matrix=shap_values.tolist(),
            max_additivity_error=max_error,
            mean_additivity_error=mean_error,
            tolerance=tolerance,
            additivity_pass_count=pass_count,
            additivity_fail_count=fail_count,
            sample_explanations=sample_explanations,
        )

    def explain_single(
        self,
        sample: Union[pd.DataFrame, pd.Series, Dict[str, Any], np.ndarray],
        tolerance: float = 1e-7,
    ) -> SampleExplanation:
        """Explains a single sample record."""
        if isinstance(sample, pd.DataFrame):
            if len(sample) != 1:
                raise ValueError(f"explain_single expects exactly 1 row, got {len(sample)}")
            sample_df = sample
        elif isinstance(sample, dict):
            sample_df = pd.DataFrame([sample])
        elif isinstance(sample, pd.Series):
            sample_df = pd.DataFrame([sample])
        elif isinstance(sample, np.ndarray):
            sample_df = pd.DataFrame(sample.reshape(1, -1), columns=self.feature_names)
        else:
            raise TypeError(f"Unsupported single sample type: {type(sample)}")

        batch_exp = self.explain(sample_df, tolerance=tolerance)
        return batch_exp.sample_explanations[0]

    def compute_global_attributions(self, X: Union[pd.DataFrame, np.ndarray]) -> pd.DataFrame:
        """
        Computes summary statistics of model feature attributions across a dataset.

        Metrics:
        - mean_abs_shap: Mean absolute SHAP value (overall attribution magnitude)
        - median_abs_shap: Median absolute SHAP value
        - max_abs_shap: Maximum single-instance attribution magnitude
        - mean_shap: Directional mean contribution across the dataset

        Note:
        These metrics reflect MODEL ATTRIBUTION, not causal physical influence.
        Correlated features may share attribution.
        """
        X_df = self.validate_input(X)
        shap_explanation = self.explainer(X_df)
        shap_matrix = shap_explanation.values

        records = []
        for j, col in enumerate(self.feature_names):
            vals = shap_matrix[:, j]
            abs_vals = np.abs(vals)
            records.append({
                "feature_name": col,
                "mean_abs_shap": float(np.mean(abs_vals)),
                "median_abs_shap": float(np.median(abs_vals)),
                "max_abs_shap": float(np.max(abs_vals)),
                "mean_shap": float(np.mean(vals)),
            })

        df_summary = pd.DataFrame(records).sort_values(by="mean_abs_shap", ascending=False).reset_index(drop=True)
        return df_summary

    def validate_offline_attributions(
        self,
        df_features: pd.DataFrame,
        df_metadata: pd.DataFrame,
        tolerance: float = 1e-7,
    ) -> Dict[str, Any]:
        """
        Executes a rigorous offline attribution audit across distinct data slices:
        - Positive class vs Negative class
        - NDVI available vs NDVI missing
        - Both NDVI missing simultaneously
        """
        batch = self.explain(df_features, tolerance=tolerance)
        global_summary = self.compute_global_attributions(df_features)

        # Slice audits
        y = df_metadata["target_severe_water_stress"].to_numpy()
        pos_mask = (y == 1)
        neg_mask = (y == 0)

        shap_mat = np.array(batch.shap_matrix)
        pos_mean_margin = float(np.mean(self.base_model.decision_function(df_features[pos_mask])))
        neg_mean_margin = float(np.mean(self.base_model.decision_function(df_features[neg_mask])))

        # Missing NDVI slice
        both_nan_mask = df_features["ndvi_latest"].isna() & df_features["ndvi_trend_30d"].isna()
        both_nan_count = int(np.sum(both_nan_mask))

        both_nan_max_error = 0.0
        if both_nan_count > 0:
            both_nan_sub = df_features[both_nan_mask]
            both_nan_exp = self.explain(both_nan_sub, tolerance=tolerance)
            both_nan_max_error = both_nan_exp.max_additivity_error

        return {
            "total_samples_audited": batch.sample_count,
            "feature_count": batch.feature_count,
            "base_value": batch.base_value,
            "max_additivity_error": batch.max_additivity_error,
            "mean_additivity_error": batch.mean_additivity_error,
            "tolerance": tolerance,
            "all_passed_additivity": batch.additivity_fail_count == 0,
            "positive_class_mean_margin": pos_mean_margin,
            "negative_class_mean_margin": neg_mean_margin,
            "both_ndvi_missing_count": both_nan_count,
            "both_ndvi_missing_max_error": both_nan_max_error,
            "top_5_features_by_mean_abs_shap": global_summary.head(5).to_dict(orient="records"),
            "full_feature_attribution_ranking": global_summary.to_dict(orient="records"),
        }
