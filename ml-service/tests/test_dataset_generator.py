"""
AgriShield Parametric - Module 8
Unit Tests for Synthetic Dataset Generator & Quality Audit Service
"""

import math
import numpy as np
import pandas as pd
import pytest

from app.services.synthetic_dataset_generator import (
    FEATURE_NAMES,
    ScenarioConfig,
    SyntheticDatasetGenerator,
    build_default_scenario_catalog,
)


@pytest.fixture
def generator():
    """Default generator initialized with 10 scenarios for fast testing."""
    catalog = build_default_scenario_catalog(n_scenarios=10, seed=42)
    return SyntheticDatasetGenerator(scenario_catalog=catalog)


# =============================================================================
# SCHEMA & FEATURE CONTRACT TESTS
# =============================================================================

def test_feature_contract_names_and_count(generator):
    """Test 1: Exactly 17 features with exact names and order."""
    df_features, _ = generator.generate_dataset(n_scenarios=2, episodes_per_scenario=2, random_seed=42)
    assert len(df_features.columns) == 17
    assert list(df_features.columns) == FEATURE_NAMES


def test_feature_data_types(generator):
    """Test 2: Proper dtypes (float32 for continuous, int32 for discrete/binary)."""
    df_features, _ = generator.generate_dataset(n_scenarios=2, episodes_per_scenario=2, random_seed=42)

    int_cols = ["consecutive_dry_days_max", "heat_wave_hours_30d", "is_ndvi_available", "is_ndvi_trend_available"]
    for col in int_cols:
        assert df_features[col].dtype == np.int32, f"Column {col} expected int32, got {df_features[col].dtype}"

    float_cols = [c for c in FEATURE_NAMES if c not in int_cols]
    for col in float_cols:
        assert df_features[col].dtype == np.float32, f"Column {col} expected float32, got {df_features[col].dtype}"


def test_valid_ranges(generator):
    """Test 3: Numerical ranges strictly respect physical and definition boundaries."""
    df_features, _ = generator.generate_dataset(n_scenarios=5, episodes_per_scenario=4, random_seed=42)

    assert (df_features["precipitation_sum_30d"] >= 0.0).all()
    assert (df_features["precipitation_sum_14d"] >= 0.0).all()
    assert (df_features["precipitation_std_30d"] >= 0.0).all()
    assert df_features["consecutive_dry_days_max"].between(0, 30).all()
    assert df_features["heat_wave_hours_30d"].between(0, 720).all()
    assert df_features["relative_humidity_mean_30d"].between(0.0, 100.0).all()
    assert (df_features["vpd_mean_30d"] >= 0.0).all()
    assert (df_features["wind_speed_mean_30d"] >= 0.0).all()
    assert (df_features["wind_gust_max_30d"] >= 0.0).all()
    assert (df_features["calculated_area_ha"] > 0.0).all()
    assert df_features["is_ndvi_available"].isin([0, 1]).all()
    assert df_features["is_ndvi_trend_available"].isin([0, 1]).all()

    # Valid NDVI values must be in [-0.2, 1.0] when not NaN
    valid_ndvi = df_features["ndvi_latest"].dropna()
    assert (valid_ndvi >= -0.2).all() and (valid_ndvi <= 1.0).all()


# =============================================================================
# NDVI CONTRACT & MISSINGNESS TESTS
# =============================================================================

def test_ndvi_missingness_indicators(generator):
    """Test 4: Strict bijection between indicator values and NaN status."""
    df_features, _ = generator.generate_dataset(n_scenarios=10, episodes_per_scenario=5, random_seed=42)

    # is_ndvi_available == 0 <=> ndvi_latest is NaN
    assert (df_features[df_features["is_ndvi_available"] == 0]["ndvi_latest"].isna()).all()
    assert (df_features[df_features["is_ndvi_available"] == 1]["ndvi_latest"].notna()).all()

    # is_ndvi_trend_available == 0 <=> ndvi_trend_30d is NaN
    assert (df_features[df_features["is_ndvi_trend_available"] == 0]["ndvi_trend_30d"].isna()).all()
    assert (df_features[df_features["is_ndvi_trend_available"] == 1]["ndvi_trend_30d"].notna()).all()


def test_ndvi_missing_rate_not_extreme(generator):
    """Test 5: Dataset contains both valid and missing NDVI (neither 0% nor 100% missing)."""
    df_features, _ = generator.generate_dataset(n_scenarios=10, episodes_per_scenario=10, random_seed=42)
    missing_rate = df_features["ndvi_latest"].isna().mean()
    assert 0.05 <= missing_rate <= 0.85, f"Expected realistic missing rate, got {missing_rate:.2%}"


def test_ndvi_30d_restriction(generator):
    """Test 6: NDVI observations strictly generated within the 30-day window [0, 30]."""
    scenario = generator.catalog[0]
    rng = np.random.default_rng(42)
    daily_rain = np.zeros(30, dtype=np.float32)
    latest, trend, is_av, is_trend_av = generator.generate_ndvi_series(scenario, daily_rain, rng)
    if is_av == 1:
        assert not math.isnan(latest)
        assert -0.2 <= latest <= 1.0
    else:
        assert math.isnan(latest)


def test_ndvi_pass_threshold_logic(generator):
    """Test 7: NDVI trend requires strictly >= 2 valid passes; latest requires >= 1 valid pass."""
    rng = np.random.default_rng(123)

    found_0_pass = False
    found_1_pass = False
    found_2_plus_pass = False

    for scenario in generator.catalog:
        for _ in range(30):
            daily_rain = rng.uniform(0.0, 15.0, size=30).astype(np.float32)
            latest, trend, is_av, is_trend_av = generator.generate_ndvi_series(scenario, daily_rain, rng)
            if is_av == 0:
                found_0_pass = True
                assert math.isnan(latest)
                assert is_trend_av == 0
                assert math.isnan(trend)
            elif is_av == 1 and is_trend_av == 0:
                found_1_pass = True
                assert not math.isnan(latest)
                assert math.isnan(trend)
            elif is_av == 1 and is_trend_av == 1:
                found_2_plus_pass = True
                assert not math.isnan(latest)
                assert not math.isnan(trend)

    assert found_0_pass, "Expected at least one episode with 0 valid passes (overcast)"
    assert found_1_pass, "Expected at least one episode with exactly 1 valid pass"
    assert found_2_plus_pass, "Expected at least one episode with >= 2 valid passes"


# =============================================================================
# TARGET & LEAKAGE AUDIT TESTS
# =============================================================================

def test_target_label_definition(generator):
    """Test 7: Target label matches Deficit_30 >= 0.40 OR (CDD >= 18 AND Tmax >= 40°C)."""
    _, df_metadata = generator.generate_dataset(n_scenarios=5, episodes_per_scenario=5, random_seed=42)

    for _, row in df_metadata.iterrows():
        y = row["target_severe_water_stress"]
        deficit = row["deficit_30"]
        if deficit >= 0.40:
            assert y == 1, f"Row with deficit {deficit:.4f} should have target=1"


def test_no_target_leakage_in_features(generator):
    """Test 8: Prohibited target-defining columns are NOT in the feature matrix."""
    df_features, _ = generator.generate_dataset(n_scenarios=2, episodes_per_scenario=2, random_seed=42)
    prohibited = ["deficit_30", "total_etc_mm", "total_eta_mm", "closing_dr_mm", "target_severe_water_stress"]
    for col in prohibited:
        assert col not in df_features.columns, f"Target-leakage column {col} found in features!"


def test_no_future_observation_leakage(generator):
    """Test 9: Feature computation strictly uses 720 hourly records (30d x 24h) without future data."""
    scenario = generator.catalog[0]
    rng = np.random.default_rng(42)
    weather_dict = generator.generate_hourly_weather(scenario, rng)
    for col_name, arr in weather_dict.items():
        assert len(arr) == 720, f"Expected exactly 720 hours for {col_name}, got {len(arr)}"


# =============================================================================
# SCENARIO GROUPING & REPRODUCIBILITY TESTS
# =============================================================================

def test_scenario_grouping_integrity(generator):
    """Test 10: Temporal episodes correctly grouped by scenario_id."""
    df_features, df_metadata = generator.generate_dataset(n_scenarios=4, episodes_per_scenario=5, random_seed=42)
    assert len(df_features) == 20
    assert len(df_metadata) == 20
    assert df_metadata["scenario_id"].nunique() == 4
    counts = df_metadata["scenario_id"].value_counts()
    assert (counts == 5).all(), "Every scenario must have exactly 5 episodes"


def test_reproducibility_same_seed(generator):
    """Test 11: Identical seed produces bitwise identical features and metadata."""
    df_feat_1, df_meta_1 = generator.generate_dataset(n_scenarios=3, episodes_per_scenario=3, random_seed=123)
    df_feat_2, df_meta_2 = generator.generate_dataset(n_scenarios=3, episodes_per_scenario=3, random_seed=123)

    pd.testing.assert_frame_equal(df_feat_1, df_feat_2)
    pd.testing.assert_frame_equal(df_meta_1, df_meta_2)


def test_reproducibility_different_seed(generator):
    """Test 12: Different seeds produce distinct synthetic datasets."""
    df_feat_1, _ = generator.generate_dataset(n_scenarios=3, episodes_per_scenario=3, random_seed=100)
    df_feat_2, _ = generator.generate_dataset(n_scenarios=3, episodes_per_scenario=3, random_seed=200)

    assert not df_feat_1["temp_mean_30d"].equals(df_feat_2["temp_mean_30d"])


# =============================================================================
# PHYSICAL BOUNDS & INVARIANT CHECKS
# =============================================================================

def test_rainfall_14d_lte_30d(generator):
    """Test 13: 14-day rainfall sum is strictly <= 30-day rainfall sum."""
    df_features, _ = generator.generate_dataset(n_scenarios=5, episodes_per_scenario=4, random_seed=42)
    diff = df_features["precipitation_sum_30d"] - df_features["precipitation_sum_14d"]
    assert (diff >= -1e-4).all(), "14-day rainfall exceeded 30-day rainfall!"


def test_heat_wave_hours_bounds(generator):
    """Test 14: heat_wave_hours_30d is bounded within [0, 720]."""
    df_features, _ = generator.generate_dataset(n_scenarios=5, episodes_per_scenario=4, random_seed=42)
    assert (df_features["heat_wave_hours_30d"] >= 0).all()
    assert (df_features["heat_wave_hours_30d"] <= 720).all()


def test_consecutive_dry_days_bounds(generator):
    """Test 15: consecutive_dry_days_max is bounded within [0, 30]."""
    df_features, _ = generator.generate_dataset(n_scenarios=5, episodes_per_scenario=4, random_seed=42)
    assert (df_features["consecutive_dry_days_max"] >= 0).all()
    assert (df_features["consecutive_dry_days_max"] <= 30).all()


def test_vpd_non_negativity(generator):
    """Test 16: vpd_mean_30d is strictly non-negative."""
    df_features, _ = generator.generate_dataset(n_scenarios=5, episodes_per_scenario=4, random_seed=42)
    assert (df_features["vpd_mean_30d"] >= 0.0).all()


def test_wind_gust_gte_mean_wind(generator):
    """Test 17: wind_gust_max_30d >= wind_speed_mean_30d."""
    df_features, _ = generator.generate_dataset(n_scenarios=5, episodes_per_scenario=4, random_seed=42)
    diff = df_features["wind_gust_max_30d"] - df_features["wind_speed_mean_30d"]
    assert (diff >= -1e-4).all(), "Max wind gust was lower than mean wind speed!"


def test_audit_function(generator):
    """Test 18: audit_dataset runs cleanly and reports zero range violations."""
    df_features, df_metadata = generator.generate_dataset(n_scenarios=5, episodes_per_scenario=4, random_seed=42)
    audit = generator.audit_dataset(df_features, df_metadata)

    assert audit["total_rows"] == 20
    assert len(audit["range_violations"]) == 0
    assert len(audit["consistency_errors"]) == 0
    assert len(audit["target_leakage_suspects"]) == 0
    assert "class_balance" in audit
