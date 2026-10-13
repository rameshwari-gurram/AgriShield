"""
AgriShield Parametric - Module 8
Simplified Educational Agronomic Water-Balance Simulator

Scope Statement:
Simplified educational agronomic water-balance simulator inspired by common crop-water
concepts. It is not a validated FAO-56 implementation. It is designed to generate
physically plausible synthetic patterns for machine learning prototype training,
not operational irrigation scheduling or crop yield forecasting.
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple
import numpy as np


@dataclass(frozen=True)
class SoilParameters:
    """Default loam soil physical water-retention parameters."""
    theta_fc: float = 0.28   # Field Capacity (m^3 / m^3)
    theta_wp: float = 0.14   # Wilting Point (m^3 / m^3)
    awc_mm_per_m: float = 140.0  # Available Water Capacity: 1000 * (theta_fc - theta_wp)


@dataclass(frozen=True)
class CropParameters:
    """Agronomic crop and root-zone parameters."""
    root_depth_m: float = 1.0        # Effective rooting depth Zr (m)
    depletion_fraction_p: float = 0.50  # Depletion fraction without stress (RAW = p * TAW)
    crop_coefficient_kc: float = 1.0    # Single crop coefficient Kc


@dataclass(frozen=True)
class DailyWaterBalanceState:
    """Detailed outputs for a single simulated calendar day."""
    day_index: int
    dr_start: float      # Dr[t-1]: Root-zone depletion at start of day (mm)
    taw: float           # Total Available Water (mm)
    raw: float           # Readily Available Water (mm)
    ks: float            # Water stress coefficient [0.0, 1.0]
    etc: float           # Potential crop evapotranspiration (mm)
    eta: float           # Actual crop evapotranspiration (mm)
    rainfall: float      # Gross daily precipitation P (mm)
    runoff: float        # Surface runoff RO (mm)
    peff: float          # Effective rainfall P_eff (mm)
    d_tentative: float   # Dr[t-1] - P_eff + ETa (mm)
    deep_percolation: float  # Water lost to deep drainage DP (mm)
    dr_end: float        # Dr[t]: Root-zone depletion at closing of day (mm)


@dataclass(frozen=True)
class SimulationSummary:
    """30-day aggregated simulation output and target label."""
    daily_records: Tuple[DailyWaterBalanceState, ...]
    total_etc: float
    total_eta: float
    deficit_30: float
    consecutive_dry_days_max: int
    t_max_30d: float
    target_severe_water_stress: int


class AgronomicWaterBalanceSimulator:
    """
    Daily single-layer soil-water bucket simulator.

    Ordering Convention (Pre-ET Stress Convention):
    Rainfall occurring on day t does NOT reduce the stress used to calculate
    that same day's Ks and ETa. Rainfall infiltrates and affects the depletion
    state for subsequent days (Dr[t] onwards).

    Order of execution for day t:
    1. Start with previous depletion Dr[t-1]
    2. Calculate stress Ks using Dr[t-1]
    3. Calculate actual evapotranspiration ETa = min(Ks * ETc, max(0, TAW - Dr[t-1]))
    4. Process rainfall: RO = 0 if P <= 5 else 0.2 * (P - 5); P_eff = P - RO
    5. Update depletion: D_tentative = Dr[t-1] - P_eff + ETa
       DP = max(0, -D_tentative); Dr[t] = max(0, min(TAW, D_tentative))
    """

    def __init__(
        self,
        soil: SoilParameters = SoilParameters(),
        crop: CropParameters = CropParameters()
    ):
        self.soil = soil
        self.crop = crop

        # Derived soil-water capacities
        self.taw = float(self.soil.awc_mm_per_m * self.crop.root_depth_m)
        self.raw = float(self.crop.depletion_fraction_p * self.taw)

    def calculate_ks(self, dr_prev: float) -> float:
        """
        Calculate water stress coefficient Ks based on closing depletion of prior day.

        Ks = 1.0                           if Dr[t-1] <= RAW
        Ks = (TAW - Dr[t-1]) / (TAW - RAW) if RAW < Dr[t-1] <= TAW
        Ks = 0.0                           if Dr[t-1] > TAW
        """
        if dr_prev <= self.raw:
            return 1.0
        elif dr_prev <= self.taw:
            denom = self.taw - self.raw
            if denom <= 0.0:
                return 0.0
            return float((self.taw - dr_prev) / denom)
        else:
            return 0.0

    def calculate_eta(self, ks: float, etc: float, dr_prev: float) -> float:
        """
        Calculate actual evapotranspiration ETa.
        Cannot exceed Ks * ETc, nor the available water remaining in root zone.
        """
        available_water = max(0.0, self.taw - dr_prev)
        return float(min(ks * etc, available_water))

    @staticmethod
    def calculate_runoff_and_effective_rain(rainfall: float) -> Tuple[float, float]:
        """
        Calculate runoff and effective rainfall.
        If P <= 5.0 mm: RO = 0.0, P_eff = P
        If P > 5.0 mm: RO = 0.2 * (P - 5.0), P_eff = P - RO
        """
        p = max(0.0, float(rainfall))
        if p <= 5.0:
            ro = 0.0
        else:
            ro = 0.2 * (p - 5.0)
        peff = max(0.0, p - ro)
        return ro, peff

    def step(
        self,
        dr_prev: float,
        et0: float,
        rainfall: float,
        day_index: int = 0
    ) -> DailyWaterBalanceState:
        """
        Execute a single daily time step following the strict Pre-ET Stress order.
        """
        # Physical clamp for prior depletion input
        dr_prev_clamped = max(0.0, float(dr_prev))

        # Potential crop ET
        etc = max(0.0, float(self.crop.crop_coefficient_kc * et0))

        # Step 2: Stress before rainfall
        ks = self.calculate_ks(dr_prev_clamped)

        # Step 3: Actual ET
        eta = self.calculate_eta(ks, etc, dr_prev_clamped)

        # Step 4: Process rainfall
        ro, peff = self.calculate_runoff_and_effective_rain(rainfall)

        # Step 5: Update depletion
        d_tentative = dr_prev_clamped - peff + eta
        dp = max(0.0, -d_tentative)
        dr_end = max(0.0, min(self.taw, d_tentative))

        return DailyWaterBalanceState(
            day_index=day_index,
            dr_start=dr_prev_clamped,
            taw=self.taw,
            raw=self.raw,
            ks=ks,
            etc=etc,
            eta=eta,
            rainfall=max(0.0, float(rainfall)),
            runoff=ro,
            peff=peff,
            d_tentative=d_tentative,
            deep_percolation=dp,
            dr_end=dr_end
        )

    def simulate_30_days(
        self,
        daily_rainfall: List[float],
        daily_et0: List[float],
        initial_dr: float = 0.0,
        daily_t_max: Optional[List[float]] = None
    ) -> SimulationSummary:
        """
        Run a complete 30-day discrete water balance simulation.

        Args:
            daily_rainfall: 30 daily gross rainfall sums (mm)
            daily_et0: 30 daily reference evapotranspiration values (mm)
            initial_dr: Initial root-zone depletion at start of day 1 (mm)
            daily_t_max: Optional 30 daily maximum temperatures (°C)
        """
        if len(daily_rainfall) != 30 or len(daily_et0) != 30:
            raise ValueError(
                f"Expected exactly 30 daily values, got rainfall={len(daily_rainfall)}, et0={len(daily_et0)}"
            )

        daily_states: List[DailyWaterBalanceState] = []
        current_dr = float(initial_dr)

        for day in range(30):
            state = self.step(
                dr_prev=current_dr,
                et0=daily_et0[day],
                rainfall=daily_rainfall[day],
                day_index=day + 1
            )
            daily_states.append(state)
            current_dr = state.dr_end

        total_etc = sum(s.etc for s in daily_states)
        total_eta = sum(s.eta for s in daily_states)

        # Deficit calculation with division-by-zero safeguard
        if total_etc <= 0.0:
            deficit_30 = 0.0
        else:
            deficit_30 = float(1.0 - (total_eta / total_etc))

        # Consecutive Dry Days (daily rainfall < 1.0 mm)
        max_cdd = 0
        current_cdd = 0
        for s in daily_states:
            if s.rainfall < 1.0:
                current_cdd += 1
                if current_cdd > max_cdd:
                    max_cdd = current_cdd
            else:
                current_cdd = 0

        # Maximum temperature across the 30 days
        if daily_t_max and len(daily_t_max) == 30:
            t_max_30d = float(max(daily_t_max))
        else:
            t_max_30d = 0.0

        # Target label logic:
        # y = 1 if Deficit_30 >= 0.40 OR (CDD_30 >= 18 AND Tmax >= 40.0°C)
        is_stress_deficit = deficit_30 >= 0.40
        is_stress_heat_dry = (max_cdd >= 18) and (t_max_30d >= 40.0)

        target = 1 if (is_stress_deficit or is_stress_heat_dry) else 0

        return SimulationSummary(
            daily_records=tuple(daily_states),
            total_etc=total_etc,
            total_eta=total_eta,
            deficit_30=deficit_30,
            consecutive_dry_days_max=max_cdd,
            t_max_30d=t_max_30d,
            target_severe_water_stress=target
        )
