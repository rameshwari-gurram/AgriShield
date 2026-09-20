from fastapi import APIRouter
from app.api.v1.health import router as health_router

api_v1_router = APIRouter(prefix="/api/v1")

# Mount endpoints
api_v1_router.include_router(health_router)

# Future ML endpoints will be mounted here:
# api_v1_router.include_router(crop_risk_router)
# api_v1_router.include_router(shap_router)
# api_v1_router.include_router(ndvi_router)
