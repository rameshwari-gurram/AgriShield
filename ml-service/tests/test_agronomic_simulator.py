"""
AgriShield Parametric - Module 8
Unit Tests for Simplified Educational Agronomic Water-Balance Simulator
"""

import math
import pytest
from app.services.agronomic_simulator import (
    AgronomicWaterBalanceSimulator,
    SoilParameters,
    CropParameters,
    DailyWaterBalanceState,
    SimulationSummary,
)


@pytest.fixture
def default_simulator():
    """Default loam simulator: TAW = 140 mm, RAW = 70 mm."""
    return AgronomicWaterBalanceSimulator(
        soil=SoilParameters(theta_fc=0.28, theta_wp=0.14, awc_mm_per_m=140.0),
        crop=CropParameters(root_depth_m=1.0, depletion_fraction_p=0.50, crop_coefficient_kc=1.0),
    )


# =============================================================================
# PHYSICAL INVARIANT TESTS (Section 6)
# =============================================================================

def test_zero_rainfall(default_simulator):
    """Test 1: With P = 0, runoff = 0 and depletion does not decrease due to rain."""
    state = default_simulator.step(dr_prev=30.0, et0=4.0, rainfall=0.0)
    assert state.rainfall == 0.0
    assert state.runoff == 0.0
    assert state.peff == 0.0
    # Since rainfall is 0 and ETa > 0, Dr must increase from 30.0 to 30.0 + ETa
    assert state.dr_end == 30.0 + state.eta


def test_moderate_rainfall_no_runoff(default_simulator):
    """Test 2: For 0 < P <= 5 mm, runoff must equal exactly 0 and Peff == P."""
    test_rainfalls = [0.1, 1.0, 2.5, 4.9, 5.0]
    for p in test_rainfalls:
        ro, peff = default_simulator.calculate_runoff_and_effective_rain(p)
        assert ro == 0.0, f"Runoff must be 0 for rainfall {p} <= 5.0 mm"
        assert peff == p, f"Effective rainfall must equal gross rainfall for {p} <= 5.0 mm"


def test_heavy_rainfall_runoff(default_simulator):
    """Test 3: For P > 5 mm, verify RO = 0.2 * (P - 5) and Peff = P - RO."""
    test_rainfalls = [5.1, 10.0, 25.0, 50.0, 100.0]
    for p in test_rainfalls:
        ro, peff = default_simulator.calculate_runoff_and_effective_rain(p)
        expected_ro = 0.2 * (p - 5.0)
        expected_peff = p - expected_ro
        assert math.isclose(ro, expected_ro, rel_tol=1e-6), f"Mismatch in runoff for P={p}"
        assert math.isclose(peff, expected_peff, rel_tol=1e-6), f"Mismatch in Peff for P={p}"
        assert ro > 0.0


def test_depletion_lower_bound(default_simulator):
    """Test 4 & 12: Depletion lower bound Dr >= 0 across all states."""
    # Saturated by torrential rain
    state = default_simulator.step(dr_prev=5.0, et0=2.0, rainfall=100.0)
    assert state.dr_end >= 0.0
    assert state.dr_end == 0.0  # Fully refilled to Field Capacity
    assert state.deep_percolation > 0.0  # Excess percolates beyond root zone


def test_depletion_upper_bound(default_simulator):
    """Test 5: Depletion upper bound Dr <= TAW across all states."""
    # When starting at or above TAW, Dr remains strictly clamped to TAW
    state_at_taw = default_simulator.step(dr_prev=default_simulator.taw, et0=10.0, rainfall=0.0)
    assert state_at_taw.dr_end <= default_simulator.taw
    assert state_at_taw.dr_end == default_simulator.taw

    # When starting above TAW (extreme desiccation), Dr remains clamped to TAW
    state_above_taw = default_simulator.step(dr_prev=default_simulator.taw + 20.0, et0=10.0, rainfall=0.0)
    assert state_above_taw.dr_end <= default_simulator.taw
    assert state_above_taw.dr_end == default_simulator.taw


def test_no_negative_effective_rainfall(default_simulator):
    """Test 6: Verify Peff >= 0 for all rainfall values including negative or zero."""
    for p in [-10.0, 0.0, 0.001, 5.0, 50.0, 500.0]:
        ro, peff = default_simulator.calculate_runoff_and_effective_rain(p)
        assert peff >= 0.0, f"Peff was negative ({peff}) for P={p}"
        assert ro >= 0.0, f"Runoff was negative ({ro}) for P={p}"


def test_dry_conditions_bounded(default_simulator):
    """Test 7: Under sustained zero rainfall, Dr increases monotonically and remains strictly bounded by TAW."""
    dr = 0.0
    daily_drs = []
    for day in range(60):
        state = default_simulator.step(dr_prev=dr, et0=5.0, rainfall=0.0, day_index=day+1)
        daily_drs.append(state.dr_end)
        dr = state.dr_end

    # Verify bounded within [0, TAW]
    for val in daily_drs:
        assert 0.0 <= val <= default_simulator.taw

    # Verify monotonic increase under zero rainfall and positive ET demand
    for i in range(1, len(daily_drs)):
        assert daily_drs[i] >= daily_drs[i - 1], "Depletion must increase or remain constant under zero rain"

    # Verify depletion increases significantly into the severe stress zone (> RAW = 70 mm)
    assert daily_drs[-1] > default_simulator.raw
    assert daily_drs[-1] <= default_simulator.taw


def test_fully_wet_condition(default_simulator):
    """Test 8: When Dr[t-1] <= RAW, verify Ks = 1.0."""
    raw = default_simulator.raw
    for dr in [0.0, 10.0, raw / 2.0, raw - 0.01, raw]:
        ks = default_simulator.calculate_ks(dr)
        assert ks == 1.0, f"Ks must be 1.0 when Dr={dr} <= RAW={raw}"


def test_stress_condition(default_simulator):
    """Test 9: When RAW < Dr[t-1] <= TAW, verify 0 <= Ks <= 1.0 and strictly decreasing."""
    raw = default_simulator.raw
    taw = default_simulator.taw
    prev_ks = 1.0
    for dr in [raw + 0.1, (raw + taw) / 2.0, taw - 0.1, taw]:
        ks = default_simulator.calculate_ks(dr)
        assert 0.0 <= ks <= 1.0, f"Ks out of bounds [0, 1] for Dr={dr}"
        assert ks <= prev_ks, "Ks must decrease as depletion increases"
        prev_ks = ks


def test_severe_depletion(default_simulator):
    """Test 10: When Dr[t-1] > TAW, verify Ks = 0.0."""
    taw = default_simulator.taw
    for dr in [taw + 0.01, taw + 10.0, taw + 100.0]:
        ks = default_simulator.calculate_ks(dr)
        assert ks == 0.0, f"Ks must be 0.0 when Dr={dr} > TAW={taw}"


def test_eta_upper_bound(default_simulator):
    """Test 11: ETa <= Ks * ETc and ETa <= max(0, TAW - Dr[t-1])."""
    # Case A: Normal unstressed
    state_a = default_simulator.step(dr_prev=20.0, et0=5.0, rainfall=0.0)
    assert state_a.eta <= state_a.ks * state_a.etc
    assert state_a.eta <= default_simulator.taw - 20.0

    # Case B: Close to wilting point (Dr = 138, TAW = 140 -> only 2 mm available)
    state_b = default_simulator.step(dr_prev=138.0, et0=5.0, rainfall=0.0)
    assert state_b.eta <= 2.0  # Cannot extract more than the 2 mm available water
    assert state_b.eta <= state_b.ks * state_b.etc


def test_extreme_rainfall(default_simulator):
    """Test 13: Extreme rainfall does not violate bounds."""
    state = default_simulator.step(dr_prev=100.0, et0=4.0, rainfall=500.0)
    assert state.dr_end >= 0.0
    assert state.dr_end <= default_simulator.taw
    assert state.runoff > 0.0
    assert state.peff > 0.0
    assert state.deep_percolation > 0.0
    # Mass balance: dr_prev - peff + eta + DP = dr_end
    # 100.0 - 401.0 + eta + DP = 0
    assert math.isclose(state.dr_start - state.peff + state.eta + state.deep_percolation, state.dr_end, abs_tol=1e-5)


# =============================================================================
# NUMERICAL SANITY TESTS (Section 7)
# =============================================================================

def test_deterministic_hand_calculated_example_1(default_simulator):
    """
    Test 14: Hand-checkable numerical sanity test 1 (No rain).
    Given:
      TAW = 140 mm
      RAW = 70 mm
      Dr[t-1] = 35 mm
      ETc = 5 mm (ET0=5, Kc=1)
      P = 0 mm
    Expected:
      Ks = 1.0 (since 35 <= 70)
      ETa = 5.0 mm
      RO = 0.0 mm
      P_eff = 0.0 mm
      D_tentative = 35 - 0 + 5 = 40 mm
      DP = 0.0 mm
      Dr[t] = 40 mm
    """
    state = default_simulator.step(dr_prev=35.0, et0=5.0, rainfall=0.0)
    assert state.taw == 140.0
    assert state.raw == 70.0
    assert state.dr_start == 35.0
    assert state.ks == 1.0
    assert state.eta == 5.0
    assert state.runoff == 0.0
    assert state.peff == 0.0
    assert state.d_tentative == 40.0
    assert state.deep_percolation == 0.0
    assert state.dr_end == 40.0


def test_deterministic_hand_calculated_example_2_with_runoff(default_simulator):
    """
    Test 15: Hand-checkable numerical sanity test 2 (Rain > 5 mm with runoff).
    Given:
      TAW = 140 mm
      RAW = 70 mm
      Dr[t-1] = 35 mm
      ETc = 5 mm
      P = 25.0 mm
    Hand Calculations:
      RO = 0.2 * (25.0 - 5.0) = 4.0 mm
      P_eff = 25.0 - 4.0 = 21.0 mm
      Ks = 1.0 (since Dr[t-1] = 35 <= RAW = 70)
      ETa = min(1.0 * 5.0, 140 - 35) = 5.0 mm
      D_tentative = 35.0 - 21.0 + 5.0 = 19.0 mm
      DP = max(0, -19.0) = 0.0 mm
      Dr[t] = 19.0 mm
    """
    state = default_simulator.step(dr_prev=35.0, et0=5.0, rainfall=25.0)
    assert math.isclose(state.runoff, 4.0, abs_tol=1e-6)
    assert math.isclose(state.peff, 21.0, abs_tol=1e-6)
    assert state.ks == 1.0
    assert state.eta == 5.0
    assert math.isclose(state.d_tentative, 19.0, abs_tol=1e-6)
    assert state.deep_percolation == 0.0
    assert math.isclose(state.dr_end, 19.0, abs_tol=1e-6)


# =============================================================================
# PRE-ET STRESS CONVENTION TEST (Section 5)
# =============================================================================

def test_pre_et_stress_convention(default_simulator):
    """
    Test 16: Pre-ET stress convention.
    Rainfall occurring on day t does NOT reduce the stress used to calculate day t's Ks and ETa.
    Rainfall infiltrates and affects subsequent days (Dr[t] onwards).

    Given:
      Dr[t-1] = 105 mm (in stress zone: RAW=70, TAW=140)
      Day t Ks = (140 - 105) / (140 - 70) = 35 / 70 = 0.50
      Day t ET0 = 6.0 mm -> ETc = 6.0 mm
      Day t Rainfall P = 50.0 mm (large rainfall)
    Expected Day t:
      Ks MUST strictly equal 0.50 (NOT 1.0!)
      ETa = 0.50 * 6.0 = 3.0 mm
      RO = 0.2 * (50 - 5) = 9.0 mm; Peff = 41.0 mm
      D_tentative = 105 - 41 + 3 = 67.0 mm
      Dr[t] = 67.0 mm (which is <= RAW=70)
    Expected Day t+1:
      Starting with Dr[t] = 67.0 mm <= RAW=70
      Ks for Day t+1 MUST now be 1.0!
    """
    # Day t
    state_t = default_simulator.step(dr_prev=105.0, et0=6.0, rainfall=50.0, day_index=1)
    assert math.isclose(state_t.ks, 0.50, abs_tol=1e-6), "Day t Ks must be evaluated before day t rain"
    assert math.isclose(state_t.eta, 3.0, abs_tol=1e-6), "Day t ETa must be governed by pre-rain Ks"
    assert math.isclose(state_t.dr_end, 67.0, abs_tol=1e-6), "Depletion refilled to 67 mm"

    # Day t+1
    state_next = default_simulator.step(dr_prev=state_t.dr_end, et0=6.0, rainfall=0.0, day_index=2)
    assert state_next.ks == 1.0, "Day t+1 Ks must now reflect refilled soil moisture"
    assert state_next.eta == 6.0


# =============================================================================
# TARGET-LABEL GENERATION TESTS (Section 8)
# =============================================================================

def test_target_label_deficit_threshold(default_simulator):
    """
    Test 17: Target label logic for Deficit_30 >= 0.40.
    Simulate dry run where total_eta / total_etc deficit triggers target.
    """
    # 30 days of 0 rain and high ET0 (5 mm/day) starting empty (Dr = 140)
    rainfall_dry = [0.0] * 30
    et0_dry = [5.0] * 30

    # Starting at wilting point Dr=140 mm -> Ks=0 for all 30 days -> ETa=0, Deficit=1.0
    summary = default_simulator.simulate_30_days(rainfall_dry, et0_dry, initial_dr=140.0)
    assert summary.total_etc == 150.0
    assert summary.total_eta == 0.0
    assert summary.deficit_30 == 1.0
    assert summary.target_severe_water_stress == 1


def test_target_label_boundary_cases(default_simulator):
    """
    Test 18: Exact boundary condition tests for target label generation.
    y = 1 if Deficit_30 >= 0.40 OR (CDD_30 >= 18 AND Tmax >= 40.0°C)
    """
    # Boundary 1: Zero total ETc safeguard (no division by zero)
    rainfall = [10.0] * 30
    et0_zero = [0.0] * 30
    summary_zero_et = default_simulator.simulate_30_days(rainfall, et0_zero, initial_dr=0.0)
    assert summary_zero_et.deficit_30 == 0.0
    assert summary_zero_et.target_severe_water_stress == 0

    # Boundary 2: CDD = 18 and Tmax = 40.0°C triggers target even if deficit < 0.40
    # Create 18 dry days (< 1.0 mm) followed by 12 wet days (50 mm) to keep deficit low
    rainfall_heat_dry = [0.0] * 18 + [50.0] * 12
    et0_normal = [2.0] * 30
    tmax_40 = [35.0] * 29 + [40.0]  # Exactly 40.0°C on one day

    summary_heat = default_simulator.simulate_30_days(
        rainfall_heat_dry, et0_normal, initial_dr=0.0, daily_t_max=tmax_40
    )
    assert summary_heat.consecutive_dry_days_max == 18
    assert summary_heat.t_max_30d == 40.0
    assert summary_heat.target_severe_water_stress == 1

    # Boundary 3: CDD = 17 and Tmax = 40.0°C does NOT trigger compound heat target
    rainfall_17_dry = [0.0] * 17 + [50.0] * 13
    summary_17_cdd = default_simulator.simulate_30_days(
        rainfall_17_dry, et0_normal, initial_dr=0.0, daily_t_max=tmax_40
    )
    assert summary_17_cdd.consecutive_dry_days_max == 17
    # Deficit is low because of heavy rain and starting at Dr=0
    assert summary_17_cdd.deficit_30 < 0.40
    assert summary_17_cdd.target_severe_water_stress == 0

    # Boundary 4: CDD = 18 and Tmax = 39.9°C does NOT trigger compound heat target
    tmax_39_9 = [35.0] * 29 + [39.9]
    summary_39_9 = default_simulator.simulate_30_days(
        rainfall_heat_dry, et0_normal, initial_dr=0.0, daily_t_max=tmax_39_9
    )
    assert summary_39_9.consecutive_dry_days_max == 18
    assert summary_39_9.t_max_30d == 39.9
    assert summary_39_9.target_severe_water_stress == 0


# =============================================================================
# PROPERTY & BOUNDARY TESTS (Section 9)
# =============================================================================

def test_runoff_boundary_values(default_simulator):
    """Test 19: Boundary values around P = 5.0 mm."""
    ro_5, peff_5 = default_simulator.calculate_runoff_and_effective_rain(5.0)
    assert ro_5 == 0.0
    assert peff_5 == 5.0

    ro_5_eps, peff_5_eps = default_simulator.calculate_runoff_and_effective_rain(5.0001)
    assert math.isclose(ro_5_eps, 0.2 * 0.0001, rel_tol=1e-5)
    assert math.isclose(peff_5_eps, 5.0001 - ro_5_eps, rel_tol=1e-5)


def test_ks_boundary_values(default_simulator):
    """Test 20: Boundary values for Ks around Dr = 0, RAW, TAW."""
    raw = default_simulator.raw
    taw = default_simulator.taw

    assert default_simulator.calculate_ks(0.0) == 1.0
    assert default_simulator.calculate_ks(raw) == 1.0
    assert default_simulator.calculate_ks(raw + 1e-6) < 1.0
    assert default_simulator.calculate_ks(taw - 1e-6) > 0.0
    assert default_simulator.calculate_ks(taw) == 0.0
    assert default_simulator.calculate_ks(taw + 10.0) == 0.0


# =============================================================================
# DETERMINISM TEST (Section 10)
# =============================================================================

def test_simulator_determinism(default_simulator):
    """Test 21: Identical inputs produce bitwise-identical simulation results."""
    rainfall = [0.0 if i % 3 != 0 else 15.0 for i in range(30)]
    et0 = [3.5 + 0.1 * (i % 7) for i in range(30)]
    tmax = [32.0 + 0.5 * (i % 5) for i in range(30)]

    run1 = default_simulator.simulate_30_days(rainfall, et0, initial_dr=20.0, daily_t_max=tmax)
    run2 = default_simulator.simulate_30_days(rainfall, et0, initial_dr=20.0, daily_t_max=tmax)

    assert run1.total_etc == run2.total_etc
    assert run1.total_eta == run2.total_eta
    assert run1.deficit_30 == run2.deficit_30
    assert run1.consecutive_dry_days_max == run2.consecutive_dry_days_max
    assert run1.t_max_30d == run2.t_max_30d
    assert run1.target_severe_water_stress == run2.target_severe_water_stress

    for s1, s2 in zip(run1.daily_records, run2.daily_records):
        assert s1.dr_start == s2.dr_start
        assert s1.ks == s2.ks
        assert s1.eta == s2.eta
        assert s1.peff == s2.peff
        assert s1.dr_end == s2.dr_end
        assert s1.deep_percolation == s2.deep_percolation
