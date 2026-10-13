"""
AgriShield Parametric - Module 8
Pydantic Schemas for ML Inference & Explainability API (Contract v1.1)
"""

import math
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PredictionRequest(BaseModel):
    """
    Locked 17-Feature Request Contract (v1.1) for ML Inference.
    Rejects extra fields, missing fields, or invalid numerical ranges.
    Preserves native missing values for optical remote sensing indicators.
    """
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "precipitation_sum_30d": 0.56,
                "precipitation_sum_14d": 0.20,
                "precipitation_std_30d": 0.15,
                "consecutive_dry_days_max": 18,
                "temp_max_30d": 42.5,
                "temp_mean_30d": 34.2,
                "temp_amplitude_mean_30d": 11.5,
                "heat_wave_hours_30d": 72,
                "relative_humidity_mean_30d": 38.0,
                "vpd_mean_30d": 2.1,
                "wind_speed_mean_30d": 18.0,
                "wind_gust_max_30d": 112.2,
                "ndvi_latest": 0.1085,
                "ndvi_trend_30d": -0.012,
                "calculated_area_ha": 2.5,
                "is_ndvi_available": 1,
                "is_ndvi_trend_available": 1,
            }
        }
    )

    precipitation_sum_30d: float = Field(
        ..., ge=0.0, description="30-day cumulative precipitation depth (mm)"
    )
    precipitation_sum_14d: float = Field(
        ..., ge=0.0, description="14-day cumulative precipitation depth (mm)"
    )
    precipitation_std_30d: float = Field(
        ..., ge=0.0, description="Standard deviation of daily precipitation events (mm)"
    )
    consecutive_dry_days_max: int = Field(
        ..., ge=0, le=30, description="Maximum consecutive rainless days (< 1.0mm) within 30-day window"
    )
    temp_max_30d: float = Field(
        ..., description="Peak maximum hourly temperature (°C)"
    )
    temp_mean_30d: float = Field(
        ..., description="Mean hourly temperature (°C)"
    )
    temp_amplitude_mean_30d: float = Field(
        ..., ge=0.0, description="Mean daily diurnal temperature range (°C)"
    )
    heat_wave_hours_30d: int = Field(
        ..., ge=0, le=720, description="Total cumulative hours with temperature >= 40.0°C"
    )
    relative_humidity_mean_30d: float = Field(
        ..., ge=0.0, le=100.0, description="Mean relative humidity (%)"
    )
    vpd_mean_30d: float = Field(
        ..., ge=0.0, description="Mean vapor pressure deficit (kPa)"
    )
    wind_speed_mean_30d: float = Field(
        ..., ge=0.0, description="Mean 10m wind speed (km/h)"
    )
    wind_gust_max_30d: float = Field(
        ..., ge=0.0, description="Peak maximum wind gust (km/h)"
    )
    ndvi_latest: Optional[float] = Field(
        default=None, description="Most recent valid Sentinel-2 optical NDVI pass [-0.2, 1.0] or null if clouded out"
    )
    ndvi_trend_30d: Optional[float] = Field(
        default=None, description="30-day OLS slope ΔNDVI/day or null if fewer than 2 valid passes"
    )
    calculated_area_ha: float = Field(
        ..., gt=0.0, description="Representative farm parcel area in hectares (> 0.0)"
    )
    is_ndvi_available: int = Field(
        ..., ge=0, le=1, description="Binary availability indicator (1 if ndvi_latest is valid, 0 if missing)"
    )
    is_ndvi_trend_available: int = Field(
        ..., ge=0, le=1, description="Binary availability indicator (1 if ndvi_trend_30d is valid, 0 if missing)"
    )

    @field_validator("ndvi_latest")
    @classmethod
    def validate_ndvi_range(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not math.isnan(v):
            if v < -0.2 or v > 1.0:
                raise ValueError(f"ndvi_latest value {v} is outside permitted range [-0.2, 1.0]")
        return v

    @model_validator(mode="after")
    def validate_ndvi_indicator_consistency(self) -> "PredictionRequest":
        # Validate ndvi_latest consistency with is_ndvi_available
        has_ndvi = self.ndvi_latest is not None and not math.isnan(self.ndvi_latest)
        if self.is_ndvi_available == 1 and not has_ndvi:
            raise ValueError("is_ndvi_available is 1 but ndvi_latest is null or NaN")
        if self.is_ndvi_available == 0 and has_ndvi:
            raise ValueError("is_ndvi_available is 0 but ndvi_latest was provided")

        # Validate ndvi_trend_30d consistency with is_ndvi_trend_available
        has_trend = self.ndvi_trend_30d is not None and not math.isnan(self.ndvi_trend_30d)
        if self.is_ndvi_trend_available == 1 and not has_trend:
            raise ValueError("is_ndvi_trend_available is 1 but ndvi_trend_30d is null or NaN")
        if self.is_ndvi_trend_available == 0 and has_trend:
            raise ValueError("is_ndvi_trend_available is 0 but ndvi_trend_30d was provided")

        # Invariant: 14-day rainfall sum cannot exceed 30-day rainfall sum
        if self.precipitation_sum_14d > self.precipitation_sum_30d + 1e-4:
            raise ValueError(
                f"precipitation_sum_14d ({self.precipitation_sum_14d}) exceeds "
                f"precipitation_sum_30d ({self.precipitation_sum_30d})"
            )

        return self


class FeatureAttributionResponse(BaseModel):
    """Individual feature contribution to the raw model decision margin."""
    feature_name: str
    feature_value: Optional[float] = None
    shap_value: float
    direction: str
    contribution_magnitude: float


class PredictionResult(BaseModel):
    """Core model prediction outcomes."""
    predicted_class: int = Field(
        ..., description="Binary risk outcome (1: severe water stress, 0: normal moisture)"
    )
    calibrated_probability: float = Field(
        ..., ge=0.0, le=1.0, description="Platt-calibrated probability of severe water stress P(y=1|X)"
    )
    raw_decision_margin: float = Field(
        ..., description="Raw decision margin from base HistGradientBoostingClassifier decision_function"
    )


class ExplanationResult(BaseModel):
    """SHAP TreeExplainer attribution breakdown in raw decision margin space."""
    base_value: float = Field(
        ..., description="Expected raw decision margin before feature contributions"
    )
    reconstructed_margin: float = Field(
        ..., description="Sum of base_value and all 17 feature SHAP contributions"
    )
    additivity_error: float = Field(
        ..., description="Absolute discrepancy between raw_decision_margin and reconstructed_margin"
    )
    attributions: List[FeatureAttributionResponse] = Field(
        ..., description="List of all 17 feature contributions in locked contract order"
    )


class ModelInfo(BaseModel):
    """Metadata regarding model and feature contract versions."""
    model_name: str
    model_version: str
    feature_contract_version: str
    feature_count: int


class PredictionResponse(BaseModel):
    """Complete response payload for POST /predict."""
    prediction: PredictionResult
    explanation: ExplanationResult
    model: ModelInfo
    disclaimer: str
