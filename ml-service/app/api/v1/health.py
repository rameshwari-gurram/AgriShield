from fastapi import APIRouter, status
from app.schemas.health import HealthResponse, ReadinessResponse
from app.services.health_service import health_service

router = APIRouter(prefix="/health", tags=["Health"])


@router.get(
    "",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Service Health Check",
    description="Returns uptime, environment, and status of analytical dependencies."
)
async def get_health() -> HealthResponse:
    return health_service.get_health()


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    status_code=status.HTTP_200_OK,
    summary="Readiness Probe",
    description="Used by container orchestrators to verify service readiness."
)
async def get_readiness() -> ReadinessResponse:
    return health_service.get_readiness()
