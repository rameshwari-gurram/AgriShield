import time
import importlib.metadata
from typing import Dict
from app.schemas.health import HealthResponse, ReadinessResponse, DependencyStatus
from app.utils.config import settings
from app.utils.logger import logger

START_TIME = time.time()


class HealthService:
    @staticmethod
    def _check_dependency(package_name: str) -> DependencyStatus:
        try:
            version = importlib.metadata.version(package_name)
            return DependencyStatus(available=True, version=version)
        except importlib.metadata.PackageNotFoundError:
            return DependencyStatus(available=False, version=None)
        except Exception as e:
            logger.warning(f"Error checking package {package_name}: {e}")
            return DependencyStatus(available=False, version=None)

    @classmethod
    def get_health(cls) -> HealthResponse:
        uptime = round(time.time() - START_TIME, 2)

        # Inspect core ML dependency packages
        monitored_packages = ["numpy", "pandas", "scikit-learn", "shap"]
        dependencies: Dict[str, DependencyStatus] = {}

        for pkg in monitored_packages:
            dependencies[pkg] = cls._check_dependency(pkg)

        return HealthResponse(
            status="healthy",
            service=settings.APP_NAME,
            version="1.0.0",
            environment=settings.ENVIRONMENT,
            uptime_seconds=uptime,
            dependencies=dependencies,
        )

    @staticmethod
    def get_readiness() -> ReadinessResponse:
        return ReadinessResponse(
            ready=True,
            service=settings.APP_NAME,
        )


health_service = HealthService()
