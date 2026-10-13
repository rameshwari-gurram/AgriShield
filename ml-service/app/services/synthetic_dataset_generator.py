"""
AgriShield Parametric - Module 8
Synthetic Dataset Generator & Quality Audit Service

Generates physically plausible, group-safe, reproducible synthetic training
datasets for the Module 8 ML Risk Prediction model using the validated
AgronomicWaterBalanceSimulator and the 17-feature data contract.
"""

from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple
import math
import numpy as np
import pandas as pd

from app.services.agronomic_simulator import (
    AgronomicWaterBalanceSimulator,
    SoilParameters,
    CropParameters,
)

FEATURE_NAMES = [
    "precipitation_sum_30d",
    "precipitation_sum_14d",
    "precipitation_std_30d",
    "consecutive_dry_days_max",
    "temp_max_30d",
    "temp_mean_30d",
    "temp_amplitude_mean_30d",
    "heat_wave_hours_30d",
    "relative_humidity_mean_30d",
    "vpd_mean_30d",
    "wind_speed_mean_30d",
    "wind_gust_max_30d",
    "ndvi_latest",
    "ndvi_trend_30d",
    "calculated_area_ha",
    "is_ndvi_available",
    "is_ndvi_trend_available",
]


@dataclass(frozen=True)
class ScenarioConfig:
    """
    Defines the baseline biophysical and agro-climatic generating regime
    for a scenario group. All temporal episodes under this scenario share
    these underlying characteristics.
    """
    scenario_id: int
    climate_regime: str           # "Arid", "Semi-Arid", "Sub-Humid", "Humid-Tropical"
    soil_awc_mm_per_m: float      # Available water capacity (mm/m)
    root_depth_m: float           # Effective root depth Zr (m)
    crop_kc: float                # Single crop coefficient Kc
    depletion_p: float            # Depletion fraction p
    temp_baseline_c: float        # Mean seasonal base temperature (°C)
    temp_diurnal_amp_c: float     # Mean daily diurnal temperature range (°C)
    rain_prob_daily: float        # Daily probability of storm event [0.0 - 1.0]
    rain_mean_intensity_mm: float # Mean storm rainfall depth (mm)
    cloud_prob: float             # Probability of cloud cover during optical satellite pass [0.0 - 1.0]
    base_ndvi: float              # Baseline healthy vegetation index [0.2 - 0.8]
    farm_area_ha: float           # Representative farm parcel area in hectares
    wind_mean_kmh: float = 12.0   # Baseline representative wind speed (km/h)


def build_default_scenario_catalog(n_scenarios: int = 50, seed: int = 42) -> List[ScenarioConfig]:
    """
    Constructs a catalog of diverse, physically plausible agro-climatic scenarios
    distributed across 4 primary Indian agro-ecological zones:
    - Arid (e.g. Western Rajasthan, Kutch)
    - Semi-Arid (e.g. Marathwada, Rayalaseema, Vidarbha)
    - Sub-Humid (e.g. Indo-Gangetic Plains, MP)
    - Humid-Tropical (e.g. Konkan, Coastal Odisha, Bengal)
    """
    rng = np.random.default_rng(seed)
    regimes = ["Arid", "Semi-Arid", "Sub-Humid", "Humid-Tropical"]
    catalog: List[ScenarioConfig] = []

    for sid in range(1, n_scenarios + 1):
        # Distribute across regimes cyclically with realistic randomized parameters
        regime = regimes[(sid - 1) % len(regimes)]

        if regime == "Arid":
            temp_base = float(rng.uniform(32.0, 39.0))
            diurnal = float(rng.uniform(12.0, 16.0))
            rain_p = float(rng.uniform(0.04, 0.12))
            rain_int = float(rng.uniform(6.0, 15.0))
            cloud_p = float(rng.uniform(0.10, 0.25))
            base_ndvi = float(rng.uniform(0.20, 0.40))
            soil_awc = float(rng.uniform(100.0, 130.0))  # Sandier/lighter soils
            root_z = float(rng.uniform(0.7, 1.2))
            area = float(rng.uniform(1.5, 8.0))
        elif regime == "Semi-Arid":
            temp_base = float(rng.uniform(28.0, 35.0))
            diurnal = float(rng.uniform(10.0, 14.0))
            rain_p = float(rng.uniform(0.12, 0.25))
            rain_int = float(rng.uniform(10.0, 22.0))
            cloud_p = float(rng.uniform(0.20, 0.45))
            base_ndvi = float(rng.uniform(0.35, 0.60))
            soil_awc = float(rng.uniform(120.0, 150.0))  # Medium loam / black soil
            root_z = float(rng.uniform(0.6, 1.0))
            area = float(rng.uniform(0.8, 4.5))
        elif regime == "Sub-Humid":
            temp_base = float(rng.uniform(25.0, 32.0))
            diurnal = float(rng.uniform(8.0, 12.0))
            rain_p = float(rng.uniform(0.25, 0.42))
            rain_int = float(rng.uniform(14.0, 30.0))
            cloud_p = float(rng.uniform(0.35, 0.65))
            base_ndvi = float(rng.uniform(0.50, 0.75))
            soil_awc = float(rng.uniform(130.0, 160.0))  # Alluvial / silt loam
            root_z = float(rng.uniform(0.8, 1.1))
            area = float(rng.uniform(0.5, 3.0))
        else:  # Humid-Tropical
            temp_base = float(rng.uniform(26.0, 31.0))
            diurnal = float(rng.uniform(5.0, 9.0))
            rain_p = float(rng.uniform(0.40, 0.65))
            rain_int = float(rng.uniform(20.0, 45.0))
            cloud_p = float(rng.uniform(0.55, 0.85))  # High monsoon optical cloud cover
            base_ndvi = float(rng.uniform(0.60, 0.85))
            soil_awc = float(rng.uniform(140.0, 180.0))  # Deep clayey / deltaic
            root_z = float(rng.uniform(0.5, 0.9))
            area = float(rng.uniform(0.4, 2.5))

        cfg = ScenarioConfig(
            scenario_id=sid,
            climate_regime=regime,
            soil_awc_mm_per_m=round(soil_awc, 1),
            root_depth_m=round(root_z, 2),
            crop_kc=round(float(rng.uniform(0.85, 1.15)), 2),
            depletion_p=round(float(rng.uniform(0.45, 0.55)), 2),
            temp_baseline_c=round(temp_base, 1),
            temp_diurnal_amp_c=round(diurnal, 1),
            rain_prob_daily=round(rain_p, 3),
            rain_mean_intensity_mm=round(rain_int, 1),
            cloud_prob=round(cloud_p, 2),
            base_ndvi=round(base_ndvi, 2),
            farm_area_ha=round(area, 2),
            wind_mean_kmh=round(float(rng.uniform(6.0, 22.0)), 1),
        )
        catalog.append(cfg)

    return catalog


class SyntheticDatasetGenerator:
    """
    Orchestrates the generation of 720-hour synthetic weather episodes,
    Sentinel-2 optical NDVI passes, soil-water balance simulations,
    and 17-feature extraction vectors.
    """

    def __init__(self, scenario_catalog: Optional[List[ScenarioConfig]] = None):
        self.catalog = scenario_catalog or build_default_scenario_catalog()
        self.catalog_map = {s.scenario_id: s for s in self.catalog}

    @staticmethod
    def calculate_hourly_vpd(temperature_c: float, humidity_percent: float) -> float:
        """Tetens equation for vapor pressure deficit in kPa."""
        t = float(temperature_c)
        rh = float(humidity_percent)
        e_s = 0.61078 * math.exp((17.27 * t) / (t + 237.3))
        e_a = e_s * (rh / 100.0)
        return max(0.0, e_s - e_a)

    def generate_hourly_weather(
        self,
        scenario: ScenarioConfig,
        rng: np.random.Generator
    ) -> Dict[str, np.ndarray]:
        """
        Generates 720 consecutive hourly atmospheric records (30 days x 24 hours)
        with diurnal cycle, meteorological covariance, and realistic storm dynamics.
        """
        N_HOURS = 720
        hours_in_day = np.tile(np.arange(24), 30)

        # 1. Temperature: Daily base variation + diurnal sinusoidal wave + random noise
        # Diurnal peak at 14:00 (hour 14), minimum at 05:00 (hour 5)
        daily_temp_anomalies = rng.normal(0.0, 2.0, size=30)
        hourly_temp_base = np.repeat(scenario.temp_baseline_c + daily_temp_anomalies, 24)
        diurnal_phase = (hours_in_day - 14) * (2 * np.pi / 24)
        diurnal_variation = (scenario.temp_diurnal_amp_c / 2.0) * np.cos(diurnal_phase)
        hourly_temp = hourly_temp_base + diurnal_variation + rng.normal(0.0, 0.5, size=N_HOURS)
        hourly_temp = np.clip(hourly_temp, -10.0, 55.0)

        # 2. Rainfall: Daily storm events distributed across 2-4 convective afternoon/night hours
        hourly_rain = np.zeros(N_HOURS, dtype=np.float64)
        for day in range(30):
            if rng.random() < scenario.rain_prob_daily:
                # Daily rainfall depth from exponential/gamma distribution
                storm_depth = rng.exponential(scenario.rain_mean_intensity_mm)
                # Distribute across 3 afternoon convective hours (e.g. hours 15, 16, 17)
                start_hour = day * 24 + int(rng.integers(14, 19))
                weights = rng.dirichlet(np.ones(3))
                for k in range(3):
                    h_idx = min(N_HOURS - 1, start_hour + k)
                    hourly_rain[h_idx] += round(float(storm_depth * weights[k]), 2)

        # 3. Relative Humidity: Inversely correlated with temperature + elevated by rainfall
        # RH is higher when temp is lower, and saturates near 100% during rain
        rh_baseline = 65.0 - (scenario.temp_baseline_c - 28.0) * 2.5
        hourly_rh = rh_baseline - (hourly_temp - scenario.temp_baseline_c) * 2.0
        # Rain elevation
        has_rain = hourly_rain > 0.1
        hourly_rh[has_rain] = np.maximum(hourly_rh[has_rain], rng.uniform(85.0, 98.0, size=np.sum(has_rain)))
        hourly_rh = np.clip(hourly_rh + rng.normal(0.0, 4.0, size=N_HOURS), 5.0, 100.0)

        # 4. Wind Speed & Gust: Weibull-distributed atmospheric flow parameterized by scenario
        # Weibull(k=2) has mean = scale * Gamma(1 + 1/2) = scale * 0.8862
        weibull_scale = scenario.wind_mean_kmh / 0.8862
        hourly_wind = rng.weibull(2.0, size=N_HOURS) * (weibull_scale * 0.85) + (scenario.wind_mean_kmh * 0.15)
        hourly_wind = np.clip(hourly_wind, 0.0, 80.0)
        # Gust is strictly >= wind speed
        gust_factor = rng.uniform(1.3, 2.4, size=N_HOURS)
        hourly_gust = hourly_wind * gust_factor + (hourly_rain > 1.0) * rng.uniform(10.0, 25.0, size=N_HOURS)
        hourly_gust = np.clip(hourly_gust, hourly_wind, 140.0)

        return {
            "temperature_c": hourly_temp,
            "humidity_percent": hourly_rh,
            "rainfall_mm": hourly_rain,
            "wind_speed_kmh": hourly_wind,
            "wind_gust_kmh": hourly_gust,
        }

    def generate_ndvi_series(
        self,
        scenario: ScenarioConfig,
        daily_rainfall: np.ndarray,
        rng: np.random.Generator
    ) -> Tuple[float, float, int, int]:
        """
        Simulates Sentinel-2 optical passes every 5 days within the 30-day window
        (days 3, 8, 13, 18, 23, 28). Accounts for cloud coverage, episodic overcast spells
        (e.g. sustained monsoon cloudiness), biophysical response to cumulative moisture,
        and strict 30-day windowing.

        Returns:
            (ndvi_latest, ndvi_trend_30d, is_ndvi_available, is_ndvi_trend_available)
        """
        pass_days = [3, 8, 13, 18, 23, 28]  # Days within (T_end - 30d, T_end]
        valid_passes: List[Tuple[int, float]] = []

        # Episodic cloudiness variation (e.g. heavy monsoon overcast spell across the month)
        # Episodes with higher cumulative rain experience higher persistent cloud probability
        cum_rain_30d = float(np.sum(daily_rainfall))
        rain_cloud_boost = min(0.35, cum_rain_30d / 300.0 * 0.35)
        # Random monthly weather pattern (some months have sustained overcast, some clear)
        monthly_overcast_factor = rng.uniform(-0.15, 0.30)
        effective_cloud_prob = np.clip(
            scenario.cloud_prob + rain_cloud_boost + monthly_overcast_factor,
            0.05,
            0.95
        )

        # Progressive vegetation state influenced by cumulative water balance
        running_rain = 0.0
        current_ndvi = scenario.base_ndvi

        for day in pass_days:
            running_rain = np.sum(daily_rainfall[:day])
            # If sustained low rain (< 15mm by day 20), NDVI decays; if good rain, NDVI increases
            moisture_effect = (running_rain - 30.0) * 0.002
            current_ndvi = np.clip(current_ndvi + moisture_effect + rng.normal(0.0, 0.01), 0.10, 0.90)

            # Check optical cloud obscuration
            is_cloudy = rng.random() < effective_cloud_prob
            if not is_cloudy:
                obs_ndvi = float(np.clip(current_ndvi + rng.normal(0.0, 0.015), -0.20, 1.0))
                valid_passes.append((day, obs_ndvi))

        # 1. ndvi_latest
        if len(valid_passes) > 0:
            ndvi_latest = valid_passes[-1][1]
            is_ndvi_available = 1
        else:
            ndvi_latest = float("nan")
            is_ndvi_available = 0

        # 2. ndvi_trend_30d (strictly requires >= 2 observations within the 30-day window)
        if len(valid_passes) >= 2:
            days = np.array([p[0] for p in valid_passes], dtype=np.float64)
            vals = np.array([p[1] for p in valid_passes], dtype=np.float64)
            # Linear regression slope: ΔNDVI / day
            dt = days[-1] - days[0]
            if dt > 0:
                slope = float((vals[-1] - vals[0]) / dt)
            else:
                slope = 0.0
            ndvi_trend_30d = float(np.clip(slope, -0.05, 0.05))
            is_ndvi_trend_available = 1
        else:
            ndvi_trend_30d = float("nan")
            is_ndvi_trend_available = 0

        return ndvi_latest, ndvi_trend_30d, is_ndvi_available, is_ndvi_trend_available

    def generate_episode(
        self,
        scenario: ScenarioConfig,
        rng: np.random.Generator
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Executes a single temporal episode under a scenario:
        1. Generates 720 hours of atmospheric weather.
        2. Aggregates daily rainfall & Hargreaves-Samani ET0.
        3. Executes validated AgronomicWaterBalanceSimulator.
        4. Extracts 17-feature vector and ground-truth target label.
        """
        # 1. Weather generation (720 hours)
        weather = self.generate_hourly_weather(scenario, rng)
        h_temp = weather["temperature_c"]
        h_rh = weather["humidity_percent"]
        h_rain = weather["rainfall_mm"]
        h_wind = weather["wind_speed_kmh"]
        h_gust = weather["wind_gust_kmh"]

        # Daily aggregations for simulator
        daily_rain = np.sum(h_rain.reshape(30, 24), axis=1)
        daily_temp_max = np.max(h_temp.reshape(30, 24), axis=1)
        daily_temp_min = np.min(h_temp.reshape(30, 24), axis=1)
        daily_temp_mean = np.mean(h_temp.reshape(30, 24), axis=1)

        # Simplified daily ET0 estimation (Hargreaves-Samani temperature-based proxy)
        # ET0 = 0.0023 * (Tmean + 17.8) * sqrt(Tmax - Tmin) * Ra (approx Ra ~ 15 mm equivalent for central India)
        daily_dtr = np.maximum(0.5, daily_temp_max - daily_temp_min)
        daily_et0 = 0.0023 * (daily_temp_mean + 17.8) * np.sqrt(daily_dtr) * 14.5
        daily_et0 = np.clip(daily_et0, 1.0, 12.0)

        # 2. Agronomic simulation (Stage 8.2-C simulator)
        soil = SoilParameters(awc_mm_per_m=scenario.soil_awc_mm_per_m)
        crop = CropParameters(
            root_depth_m=scenario.root_depth_m,
            depletion_fraction_p=scenario.depletion_p,
            crop_coefficient_kc=scenario.crop_kc
        )
        sim = AgronomicWaterBalanceSimulator(soil=soil, crop=crop)
        # Initial depletion randomly set to simulate preceding dry/wet weather
        init_dr = float(rng.uniform(0.0, sim.raw * 1.2))
        summary = sim.simulate_30_days(
            daily_rainfall=list(daily_rain),
            daily_et0=list(daily_et0),
            initial_dr=init_dr,
            daily_t_max=list(daily_temp_max)
        )

        # 3. Sentinel-2 NDVI simulation
        ndvi_latest, ndvi_trend, is_ndvi_av, is_trend_av = self.generate_ndvi_series(
            scenario, daily_rain, rng
        )

        # 4. Feature Extraction (Strict 17-Feature Contract)
        precip_sum_30d = float(np.sum(h_rain))
        precip_sum_14d = float(np.sum(h_rain[384:]))  # Last 14 days = last 336 hours (720 - 336 = 384)
        precip_std_30d = float(np.std(daily_rain, ddof=1)) if len(daily_rain) > 1 else 0.0
        cdd_max = int(summary.consecutive_dry_days_max)
        temp_max_30d = float(np.max(h_temp))
        temp_mean_30d = float(np.mean(h_temp))
        temp_amp_mean_30d = float(np.mean(daily_dtr))
        heat_wave_hours_30d = int(np.sum(h_temp >= 40.0))
        rh_mean_30d = float(np.mean(h_rh))

        # Hourly VPD
        hourly_vpds = [self.calculate_hourly_vpd(h_temp[i], h_rh[i]) for i in range(720)]
        vpd_mean_30d = float(np.mean(hourly_vpds))

        wind_speed_mean_30d = float(np.mean(h_wind))
        wind_gust_max_30d = float(np.max(h_gust))

        features: Dict[str, Any] = {
            "precipitation_sum_30d": np.float32(precip_sum_30d),
            "precipitation_sum_14d": np.float32(precip_sum_14d),
            "precipitation_std_30d": np.float32(precip_std_30d),
            "consecutive_dry_days_max": np.int32(cdd_max),
            "temp_max_30d": np.float32(temp_max_30d),
            "temp_mean_30d": np.float32(temp_mean_30d),
            "temp_amplitude_mean_30d": np.float32(temp_amp_mean_30d),
            "heat_wave_hours_30d": np.int32(heat_wave_hours_30d),
            "relative_humidity_mean_30d": np.float32(rh_mean_30d),
            "vpd_mean_30d": np.float32(vpd_mean_30d),
            "wind_speed_mean_30d": np.float32(wind_speed_mean_30d),
            "wind_gust_max_30d": np.float32(wind_gust_max_30d),
            "ndvi_latest": np.float32(ndvi_latest) if not math.isnan(ndvi_latest) else np.nan,
            "ndvi_trend_30d": np.float32(ndvi_trend) if not math.isnan(ndvi_trend) else np.nan,
            "calculated_area_ha": np.float32(scenario.farm_area_ha),
            "is_ndvi_available": np.int32(is_ndvi_av),
            "is_ndvi_trend_available": np.int32(is_trend_av),
        }

        # Non-feature audit metadata
        metadata: Dict[str, Any] = {
            "scenario_id": int(scenario.scenario_id),
            "climate_regime": scenario.climate_regime,
            "deficit_30": float(summary.deficit_30),
            "total_etc_mm": float(summary.total_etc),
            "total_eta_mm": float(summary.total_eta),
            "closing_dr_mm": float(summary.daily_records[-1].dr_end),
            "target_severe_water_stress": int(summary.target_severe_water_stress),
        }

        return features, metadata

    def generate_dataset(
        self,
        n_scenarios: int = 50,
        episodes_per_scenario: int = 20,
        random_seed: int = 42
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Generates a complete dataset across parameterized scenarios and episodes.

        Args:
            n_scenarios: Number of distinct agro-climatic scenarios to simulate
            episodes_per_scenario: Number of temporal episodes per scenario
            random_seed: Seed for full determinism and reproducibility

        Returns:
            df_features: DataFrame containing strictly the 17 contract features
            df_metadata: DataFrame containing non-feature audit columns and target
        """
        rng = np.random.default_rng(random_seed)
        catalog = self.catalog[:n_scenarios]
        if len(catalog) < n_scenarios:
            catalog = build_default_scenario_catalog(n_scenarios, seed=random_seed)

        feature_rows: List[Dict[str, Any]] = []
        metadata_rows: List[Dict[str, Any]] = []

        for scenario in catalog:
            for _ in range(episodes_per_scenario):
                feat, meta = self.generate_episode(scenario, rng)
                feature_rows.append(feat)
                metadata_rows.append(meta)

        df_features = pd.DataFrame(feature_rows)[FEATURE_NAMES]
        int_cols = ["consecutive_dry_days_max", "heat_wave_hours_30d", "is_ndvi_available", "is_ndvi_trend_available"]
        float_cols = [c for c in FEATURE_NAMES if c not in int_cols]
        dtype_map = {c: np.int32 for c in int_cols}
        dtype_map.update({c: np.float32 for c in float_cols})
        df_features = df_features.astype(dtype_map)
        df_metadata = pd.DataFrame(metadata_rows)

        return df_features, df_metadata

    @staticmethod
    def audit_dataset(
        df_features: pd.DataFrame,
        df_metadata: pd.DataFrame
    ) -> Dict[str, Any]:
        """
        Executes a rigorous quality audit covering:
        - Schema correctness and feature dtypes
        - Statistical moments and ranges
        - Missing value distribution
        - Class balance and scenario prevalence
        - Target leakage checks
        - Internal physical consistency
        - Correlation matrix and feature variance
        """
        N = len(df_features)
        audit: Dict[str, Any] = {}

        # 1. Basic counts
        audit["total_rows"] = N
        audit["scenario_count"] = int(df_metadata["scenario_id"].nunique())
        audit["episodes_per_scenario"] = int(N / audit["scenario_count"]) if audit["scenario_count"] > 0 else 0

        # 2. Target distribution
        y = df_metadata["target_severe_water_stress"]
        n_pos = int(np.sum(y == 1))
        n_neg = int(np.sum(y == 0))
        prevalence = float(n_pos / N) if N > 0 else 0.0
        audit["class_balance"] = {
            "positive_count": n_pos,
            "negative_count": n_neg,
            "prevalence": prevalence,
            "prevalence_by_regime": df_metadata.groupby("climate_regime")["target_severe_water_stress"].mean().to_dict(),
        }

        # 3. Missingness audit
        missing_counts = df_features.isna().sum().to_dict()
        missing_rates = (df_features.isna().mean() * 100.0).to_dict()
        audit["missingness"] = {
            "ndvi_latest_missing_pct": float(missing_rates["ndvi_latest"]),
            "ndvi_trend_missing_pct": float(missing_rates["ndvi_trend_30d"]),
            "other_features_missing_count": {k: v for k, v in missing_counts.items() if k not in ["ndvi_latest", "ndvi_trend_30d"]},
        }

        # 4. Range and type validations
        range_violations = {}
        if not (df_features["precipitation_sum_30d"] >= 0).all(): range_violations["precip_sum_30d"] = "Negative values"
        if not (df_features["precipitation_sum_14d"] >= 0).all(): range_violations["precip_sum_14d"] = "Negative values"
        if not (df_features["precipitation_std_30d"] >= 0).all(): range_violations["precip_std_30d"] = "Negative values"
        if not df_features["consecutive_dry_days_max"].between(0, 30).all(): range_violations["cdd_max"] = "Out of [0, 30]"
        if not df_features["heat_wave_hours_30d"].between(0, 720).all(): range_violations["heat_wave_hours"] = "Out of [0, 720]"
        if not df_features["relative_humidity_mean_30d"].between(0.0, 100.0).all(): range_violations["rh_mean"] = "Out of [0, 100]"
        if not (df_features["vpd_mean_30d"] >= 0.0).all(): range_violations["vpd_mean"] = "Negative values"
        if not (df_features["wind_speed_mean_30d"] >= 0.0).all(): range_violations["wind_speed"] = "Negative values"
        if not (df_features["wind_gust_max_30d"] >= 0.0).all(): range_violations["wind_gust"] = "Negative values"
        if not (df_features["calculated_area_ha"] > 0.0).all(): range_violations["area"] = "Non-positive area"
        if not df_features["is_ndvi_available"].isin([0, 1]).all(): range_violations["is_ndvi"] = "Non-binary indicator"
        if not df_features["is_ndvi_trend_available"].isin([0, 1]).all(): range_violations["is_trend"] = "Non-binary indicator"
        audit["range_violations"] = range_violations

        # 5. Internal consistency checks
        consistency_errors = []
        # 14d rain <= 30d rain
        if not (df_features["precipitation_sum_14d"] <= df_features["precipitation_sum_30d"] + 1e-4).all():
            consistency_errors.append("precipitation_sum_14d exceeds precipitation_sum_30d")
        # is_ndvi_available == 0 <=> ndvi_latest is NaN
        ndvi_mismatch_0 = df_features[(df_features["is_ndvi_available"] == 0) & df_features["ndvi_latest"].notna()]
        ndvi_mismatch_1 = df_features[(df_features["is_ndvi_available"] == 1) & df_features["ndvi_latest"].isna()]
        if len(ndvi_mismatch_0) > 0 or len(ndvi_mismatch_1) > 0:
            consistency_errors.append(f"is_ndvi_available indicator does not match ndvi_latest NaN status ({len(ndvi_mismatch_0) + len(ndvi_mismatch_1)} rows)")
        # is_ndvi_trend_available == 0 <=> ndvi_trend_30d is NaN
        trend_mismatch_0 = df_features[(df_features["is_ndvi_trend_available"] == 0) & df_features["ndvi_trend_30d"].notna()]
        trend_mismatch_1 = df_features[(df_features["is_ndvi_trend_available"] == 1) & df_features["ndvi_trend_30d"].isna()]
        if len(trend_mismatch_0) > 0 or len(trend_mismatch_1) > 0:
            consistency_errors.append(f"is_ndvi_trend_available indicator does not match ndvi_trend_30d NaN status")
        audit["consistency_errors"] = consistency_errors

        # 6. Feature moments (Descriptive Stats)
        stats = {}
        for col in FEATURE_NAMES:
            s = df_features[col]
            stats[col] = {
                "dtype": str(s.dtype),
                "count": int(s.count()),
                "missing_count": int(s.isna().sum()),
                "min": float(s.min()) if s.count() > 0 else None,
                "max": float(s.max()) if s.count() > 0 else None,
                "mean": float(s.mean()) if s.count() > 0 else None,
                "median": float(s.median()) if s.count() > 0 else None,
                "std": float(s.std()) if s.count() > 1 else None,
            }
        audit["feature_statistics"] = stats

        # 7. Variance audit
        zero_variance_cols = [c for c, st in stats.items() if st["std"] is not None and st["std"] < 1e-6]
        audit["zero_variance_features"] = zero_variance_cols

        # 8. Correlation Matrix (Numerical features only)
        numeric_cols = [c for c in FEATURE_NAMES if c not in ["ndvi_latest", "ndvi_trend_30d"]]
        corr_matrix = df_features[numeric_cols].corr()
        # Find pairs with |corr| >= 0.85
        high_corr_pairs = []
        for i in range(len(numeric_cols)):
            for j in range(i + 1, len(numeric_cols)):
                c1, c2 = numeric_cols[i], numeric_cols[j]
                val = corr_matrix.loc[c1, c2]
                if abs(val) >= 0.85:
                    high_corr_pairs.append({"feature_1": c1, "feature_2": c2, "correlation": round(float(val), 3)})
        audit["high_correlation_pairs"] = high_corr_pairs

        # 9. Target Leakage Audit
        # Check correlations between contract features and the target label y
        leakage_candidates = []
        for col in numeric_cols:
            r = df_features[col].corr(y)
            if abs(r) >= 0.95:
                leakage_candidates.append({"feature": col, "correlation_with_target": round(float(r), 4)})
        audit["target_leakage_suspects"] = leakage_candidates

        return audit
