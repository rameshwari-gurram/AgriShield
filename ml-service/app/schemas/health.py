from pydantic import BaseModel, Field
from typing import Dict, Optional


class DependencyStatus(BaseModel):
    available: bool
    version: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = Field(..., json_schema_extra={"example": "healthy"})
    service: str = Field(..., json_schema_extra={"example": "AgriShield ML Service"})
    version: str = Field(..., json_schema_extra={"example": "1.0.0"})
    environment: str = Field(..., json_schema_extra={"example": "development"})
    uptime_seconds: float = Field(..., json_schema_extra={"example": 124.5})
    dependencies: Dict[str, DependencyStatus] = Field(default_factory=dict)


class ReadinessResponse(BaseModel):
    ready: bool = Field(..., json_schema_extra={"example": True})
    service: str = Field(..., json_schema_extra={"example": "AgriShield ML Service"})
