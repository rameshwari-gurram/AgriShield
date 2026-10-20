"""
AgriShield Parametric - Module 8
NDVI Vegetation Forecast Inference & SHAP Explainability Service

Scope:
- Loads the trained HistGradientBoostingRegressor model and metadata
- Performs 7-day ahead NDVI forecasting across the 29-feature contract
- Computes local SHAP TreeExplainer attributions in NDVI index space
- Verifies exact additivity (predicted_ndvi = base_value + sum(shap_values))
"""

import json
import math
import os
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from app.schemas.prediction import (
    FeatureAttributionResponse,
    ModelInfo,
    NdviExplanationResult,
    NdviPredictionRequest,
    NdviPredictionResponse,
)
from app.services.ndvi_training_service import FEATURE_NAMES_NDVI
from app.services.shap_explainability_service import get_shap_module
from app.utils.logger import logger


class NdviInferenceService:
    """
    Singleton service managing NDVI forecast model lifecycle and SHAP explainability.
    """

    def __init__(self, artifacts_dir: Optional[str] = None):
        if artifacts_dir is None:
            self.artifacts_dir = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..", "artifacts")
            )
        else:
            self.artifacts_dir = artifacts_dir

        self.model: Optional[HistGradientBoostingRegressor] = None
        self.metadata: Dict[str, Any] = {}
        self.explainer: Optional[Any] = None
        self.base_expected_value: float = 0.0
        self.is_initialized: bool = False

    def initialize(self) -> None:
        """Loads model artifacts and initializes SHAP TreeExplainer."""
        model_path = os.path.join(self.artifacts_dir, "ndvi_forecast_model.joblib")
        meta_path = os.path.join(self.artifacts_dir, "ndvi_model_metadata.json")

        if not os.path.exists(model_path):
            logger.warning(
                f"NDVI forecast model artifact not found at {model_path}. Running uninitialized."
            )
            self.is_initialized = False
            return

        try:
            logger.info(f"Loading NDVI forecast model from {model_path}...")
            self.model = joblib.load(model_path)

            if os.path.exists(meta_path):
                with open(meta_path, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)

            logger.info("Initializing SHAP TreeExplainer for NDVI regressor...")
            shap = get_shap_module()
            self.explainer = shap.TreeExplainer(self.model)
            
            exp_val = self.explainer.expected_value
            if isinstance(exp_val, (list, np.ndarray)):
                self.base_expected_value = float(exp_val[0])
            else:
                self.base_expected_value = float(exp_val)

            self.is_initialized = True
            logger.info("NdviInferenceService successfully initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize NdviInferenceService: {e}")
            self.is_initialized = False
            raise

    def is_ready(self) -> bool:
        """Returns True if model and explainer are loaded."""
        if not self.is_initialized:
            try:
                self.initialize()
            except Exception:
                pass
        return self.is_initialized and self.model is not None and self.explainer is not None

    @staticmethod
    def _determine_direction(shap_val: float) -> str:
        """Human-readable description of attribution direction on forecasted NDVI."""
        if shap_val > 0.0005:
            return "increases vegetation health forecast (+)"
        elif shap_val < -0.0005:
            return "decreases vegetation health forecast (-)"
        else:
            return "neutral contribution"

    def predict_and_explain(self, request: NdviPredictionRequest) -> NdviPredictionResponse:
        """
        Executes NDVI regression inference and SHAP attribution.
        """
        if not self.is_ready():
            raise RuntimeError("NDVI model artifacts unavailable or service not initialized.")

        # 1. Translate Pydantic request to DataFrame in canonical order
        row_dict: Dict[str, Any] = {}
        for feat in FEATURE_NAMES_NDVI:
            val = getattr(request, feat)
            if val is None or (isinstance(val, float) and math.isnan(val)):
                row_dict[feat] = np.nan
            else:
                row_dict[feat] = np.float32(val)

        df_input = pd.DataFrame([row_dict])[FEATURE_NAMES_NDVI]

        # 2. Model Prediction
        predicted_ndvi_raw = float(self.model.predict(df_input)[0])
        predicted_ndvi = round(predicted_ndvi_raw, 4)
        current_ndvi = round(request.NDVI, 4)
        delta_ndvi = round(predicted_ndvi - current_ndvi, 4)

        # 3. SHAP TreeExplainer Attributions
        shap_explanation = self.explainer(df_input)
        shap_vals = shap_explanation.values[0]  # shape: (29,)

        attributions: List[FeatureAttributionResponse] = []
        for i, feat_name in enumerate(FEATURE_NAMES_NDVI):
            s_val = float(shap_vals[i])
            f_val = row_dict[feat_name]
            feature_val_resp = float(f_val) if not np.isnan(f_val) else None

            attributions.append(
                FeatureAttributionResponse(
                    feature_name=feat_name,
                    feature_value=feature_val_resp,
                    shap_value=round(s_val, 5),
                    direction=self._determine_direction(s_val),
                    contribution_magnitude=round(abs(s_val), 5),
                )
            )

        # 4. Additivity Audit
        reconstructed = float(self.base_expected_value + np.sum(shap_vals))
        additivity_error = float(abs(predicted_ndvi_raw - reconstructed))

        model_name = self.metadata.get("model_name", "AgriVision-NDVI-Forecast-HGB")
        model_version = self.metadata.get("model_version", "1.0.0")

        return NdviPredictionResponse(
            predicted_ndvi=predicted_ndvi,
            current_ndvi=current_ndvi,
            predicted_delta=delta_ndvi,
            forecast_horizon="7_days",
            target_variable="NDVI_next_week",
            baseline_persistence_ndvi=current_ndvi,
            explanation=NdviExplanationResult(
                base_value=round(self.base_expected_value, 5),
                reconstructed_prediction=round(reconstructed, 5),
                additivity_error=round(additivity_error, 7),
                attributions=attributions,
            ),
            model=ModelInfo(
                model_name=model_name,
                model_version=model_version,
                feature_contract_version="v1.0-ndvi-29",
                feature_count=len(FEATURE_NAMES_NDVI),
            ),
            disclaimer=(
                "Advisory 7-day vegetation condition forecast generated by HistGradientBoostingRegressor "
                "trained on the verified IEEE AgriVision Maharashtra dataset (2017-2025). Explanations represent "
                "local Shapley feature attributions and do not imply physical causal mechanisms or official parametric "
                "claim determinations."
            ),
        )


ndvi_inference_service = NdviInferenceService()
