"""
AgriShield Parametric - Module 8
FastAPI Router for ML Risk Prediction & SHAP Explainability API
"""

from fastapi import APIRouter, HTTPException, status
from app.schemas.prediction import PredictionRequest, PredictionResponse
from app.services.inference_service import inference_service
from app.utils.logger import logger

router = APIRouter(tags=["Inference"])


@router.post(
    "/predict",
    response_model=PredictionResponse,
    status_code=status.HTTP_200_OK,
    summary="Predict Crop-Water Stress Risk & Explain Attribution",
    description=(
        "Executes ML inference on the locked 17-feature contract (v1.1). "
        "Returns the predicted risk class, Platt-calibrated posterior probability, "
        "raw base-model decision margin, and full 17-feature SHAP TreeExplainer attributions. "
        "Preserves native missing value routing for optical Sentinel-2 indicators (ndvi_latest, ndvi_trend_30d). "
        "Explanations strictly explain raw decision margins and do not constitute causal physical proofs."
    ),
    responses={
        200: {
            "description": "Successful inference and SHAP explanation",
            "model": PredictionResponse,
        },
        422: {
            "description": "Validation error: missing feature, extra feature, or invalid numerical range",
        },
        503: {
            "description": "Service unavailable: model artifacts not initialized or missing from disk",
        },
        500: {
            "description": "Internal server error: unexpected failure during model execution",
        },
    },
)
async def predict_risk(request: PredictionRequest) -> PredictionResponse:
    """Endpoint for crop-water stress risk prediction and SHAP explanation."""
    if not inference_service.is_ready():
        logger.error("Inference requested but InferenceService is not ready/initialized.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model artifacts unavailable or model service not initialized.",
        )

    try:
        response = inference_service.predict_and_explain(request)
        return response
    except ValueError as ve:
        logger.warning(f"Feature contract validation failure during inference: {ve}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    except Exception as e:
        logger.error(f"Unexpected internal inference error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal ML inference service failure.",
        )
