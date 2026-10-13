"""
AgriShield Parametric - Module 8
Production Inference & Explainability Service

Scope Statement:
Orchestrates end-to-end inference combining the trained HistGradientBoostingClassifier,
group-safe Platt probability calibration, and SHAP TreeExplainer.
Reuses persisted artifacts without retraining.
Preserves strict separation between raw decision margins and calibrated probabilities.
"""

import json
import math
import os
from typing import Any, Dict, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier

from app.schemas.prediction import (
    ExplanationResult,
    FeatureAttributionResponse,
    ModelInfo,
    PredictionRequest,
    PredictionResponse,
    PredictionResult,
)
from app.services.shap_explainability_service import ShapExplainabilityService
from app.services.synthetic_dataset_generator import FEATURE_NAMES
from app.utils.logger import logger


class InferenceService:
    """
    Singleton service managing model artifact lifecycle and inference orchestration.
    """

    def __init__(self, artifacts_dir: Optional[str] = None):
        if artifacts_dir is None:
            self.artifacts_dir = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..", "artifacts")
            )
        else:
            self.artifacts_dir = artifacts_dir

        self.base_model: Optional[HistGradientBoostingClassifier] = None
        self.calibrated_model: Optional[CalibratedClassifierCV] = None
        self.metadata: Dict[str, Any] = {}
        self.shap_service: Optional[ShapExplainabilityService] = None
        self.is_initialized: bool = False

    def initialize(self) -> None:
        """Loads model artifacts and initializes SHAP explainability layer."""
        base_path = os.path.join(self.artifacts_dir, "base_model.joblib")
        calib_path = os.path.join(self.artifacts_dir, "calibrated_model.joblib")
        meta_path = os.path.join(self.artifacts_dir, "model_metadata.json")

        if not os.path.exists(base_path) or not os.path.exists(calib_path):
            logger.warning(
                f"Model artifacts not found in {self.artifacts_dir}. Service running in uninitialized state."
            )
            self.is_initialized = False
            return

        try:
            logger.info(f"Loading base model from {base_path}...")
            self.base_model = joblib.load(base_path)

            logger.info(f"Loading calibrated model from {calib_path}...")
            self.calibrated_model = joblib.load(calib_path)

            if os.path.exists(meta_path):
                with open(meta_path, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)

            logger.info("Initializing SHAP explainability service...")
            self.shap_service = ShapExplainabilityService(
                base_model=self.base_model,
                calibrated_model=self.calibrated_model
            )
            self.is_initialized = True
            logger.info("InferenceService successfully initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize InferenceService: {e}")
            self.is_initialized = False
            raise

    def is_ready(self) -> bool:
        """Returns True if all required artifacts and services are loaded."""
        if not self.is_initialized:
            try:
                self.initialize()
            except Exception:
                pass
        return (
            self.is_initialized
            and self.base_model is not None
            and self.calibrated_model is not None
            and self.shap_service is not None
        )

    def predict_and_explain(self, request: PredictionRequest) -> PredictionResponse:
        """
        Executes complete inference and explanation pipeline.

        Steps:
        1. Construct (1, 17) DataFrame matching locked contract order with native NaNs.
        2. Compute calibrated probability via calibrated_model.predict_proba(X).
        3. Compute raw decision margin via base_model.decision_function(X).
        4. Determine predicted class (1 if probability >= 0.5 else 0).
        5. Generate SHAP TreeExplainer attributions for all 17 features.
        6. Return complete structured response with technical disclaimer.
        """
        if not self.is_ready():
            raise RuntimeError("Model artifacts unavailable or model service not initialized.")

        # 1. Translate Pydantic request to locked contract DataFrame
        # Convert null/None to native np.nan
        ndvi_latest_val = np.nan if (request.ndvi_latest is None or math.isnan(request.ndvi_latest)) else np.float32(request.ndvi_latest)
        ndvi_trend_val = np.nan if (request.ndvi_trend_30d is None or math.isnan(request.ndvi_trend_30d)) else np.float32(request.ndvi_trend_30d)

        row_data = {
            "precipitation_sum_30d": np.float32(request.precipitation_sum_30d),
            "precipitation_sum_14d": np.float32(request.precipitation_sum_14d),
            "precipitation_std_30d": np.float32(request.precipitation_std_30d),
            "consecutive_dry_days_max": np.int32(request.consecutive_dry_days_max),
            "temp_max_30d": np.float32(request.temp_max_30d),
            "temp_mean_30d": np.float32(request.temp_mean_30d),
            "temp_amplitude_mean_30d": np.float32(request.temp_amplitude_mean_30d),
            "heat_wave_hours_30d": np.int32(request.heat_wave_hours_30d),
            "relative_humidity_mean_30d": np.float32(request.relative_humidity_mean_30d),
            "vpd_mean_30d": np.float32(request.vpd_mean_30d),
            "wind_speed_mean_30d": np.float32(request.wind_speed_mean_30d),
            "wind_gust_max_30d": np.float32(request.wind_gust_max_30d),
            "ndvi_latest": ndvi_latest_val,
            "ndvi_trend_30d": ndvi_trend_val,
            "calculated_area_ha": np.float32(request.calculated_area_ha),
            "is_ndvi_available": np.int32(request.is_ndvi_available),
            "is_ndvi_trend_available": np.int32(request.is_ndvi_trend_available),
        }
        df_input = pd.DataFrame([row_data])[FEATURE_NAMES]

        # 2. Base Model Decision Margin
        raw_margin = float(self.base_model.decision_function(df_input)[0])

        # 3. Calibrated Model Probability
        cal_prob = float(self.calibrated_model.predict_proba(df_input)[0, 1])

        # 4. Predicted Class (threshold = 0.5 on calibrated probability)
        predicted_class = int(cal_prob >= 0.5)

        # 5. SHAP TreeExplainer Attribution
        sample_exp = self.shap_service.explain_single(df_input, tolerance=1e-7)

        attributions_response = [
            FeatureAttributionResponse(
                feature_name=attr.feature_name,
                feature_value=attr.feature_value,
                shap_value=round(attr.shap_value, 5),
                direction=attr.direction,
                contribution_magnitude=round(attr.contribution_magnitude, 5),
            )
            for attr in sample_exp.attributions
        ]

        # 6. Model Metadata Package
        model_name = self.metadata.get("model_name", "AgriShield-Risk-HGB-Prototype")
        model_version = self.metadata.get("model_version", "1.0.0")
        contract_version = self.metadata.get("feature_contract_version", "v1.1")

        return PredictionResponse(
            prediction=PredictionResult(
                predicted_class=predicted_class,
                calibrated_probability=round(cal_prob, 5),
                raw_decision_margin=round(raw_margin, 5),
            ),
            explanation=ExplanationResult(
                base_value=round(sample_exp.base_value, 5),
                reconstructed_margin=round(sample_exp.reconstructed_margin, 5),
                additivity_error=sample_exp.additivity_error,
                attributions=attributions_response,
            ),
            model=ModelInfo(
                model_name=model_name,
                model_version=model_version,
                feature_contract_version=contract_version,
                feature_count=17,
            ),
            disclaimer=(
                "This prediction and SHAP explanation are generated by a prototype machine learning model "
                "trained on parameterized synthetic agronomic simulation data. They do not constitute validated "
                "real-world insurance claim determinations, payout guarantees, or actuarial risk assessments."
            ),
        )


inference_service = InferenceService()
