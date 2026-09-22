# Module 6 — Weather Aggregation Service

> **Core Principle**:  
> "Weather aggregation produces measurements only. Risk classification is performed in a later rule-engine stage."

---

## 1. Overview and Purpose

The **Weather Aggregation Service** (`backend/src/services/weatherAggregation.service.ts`) bridges raw meteorological time-series stored in PostgreSQL (`WeatherRecord`) and the upcoming parametric rule engine.

Its sole responsibility is to evaluate physical time-series observations over a defined observation window and compute standardized, deterministic meteorological aggregates:
* Total 24-hour cumulative rainfall
* Maximum rolling 3-hour rainfall
* Maximum instantaneous temperature
* Maximum sustained wind speed
* Maximum instantaneous wind gust
* Hourly completeness indicators for both 24-hour and 3-hour windows

The service is strictly decoupled from risk logic: it does **not** evaluate thresholds, does **not** classify risks (`LOW`, `MODERATE`, `HIGH`), does **not** reference `RiskRule`, and does **not** write to `RiskAssessment` or `RiskEvent`.

---

## 2. 24-Hour Rainfall Calculation

* **Physical Meaning**: Each `WeatherRecord.rainfallMm` represents precipitation accumulated over the preceding 1-hour interval $(t - 1\text{h}, t]$.
* **Window Definition**: For an aggregation ending at timestamp $T_{\text{end}}$, the 24-hour physical window spans:
  $$(T_{\text{end}} - 24\text{ hours}, T_{\text{end}}]$$
* **Boundary Semantics**:
  * Records strictly with $t \in (T_{\text{end}} - 24\text{h}, T_{\text{end}}]$ contribute to the total.
  * A record at exactly $T_{\text{end}} - 24\text{h}$ reflects precipitation for $(T_{\text{end}} - 25\text{h}, T_{\text{end}} - 24\text{h}]$ and is excluded to avoid double-counting beyond a 24-hour duration.
* **Summation**: Rainfall is **summed**, never averaged:
  $$\text{totalRainfall24h} = \sum_{i=1}^{N} \text{rainfallMm}_i$$
* **Precision**: Rounded to 2 decimal places using deterministic arithmetic.

---

## 3. Rolling 3-Hour Rainfall Calculation

* **Physical Meaning**: Evaluates short-duration high-intensity rainfall spikes (e.g., flash flood or cloudburst precursors).
* **Continuity Requirement**: A rolling 3-hour window requires three **strictly consecutive** hourly records:
  $$t_{k+1} - t_k = 1\text{ hour} \quad \text{and} \quad t_{k+2} - t_{k+1} = 1\text{ hour}$$
* **Maximum Search**: The service scans every valid 3-hour continuous sequence in the 24-hour dataset:
  $$\text{rolling3h}_k = \text{rainfallMm}_k + \text{rainfallMm}_{k+1} + \text{rainfallMm}_{k+2}$$
  $$\text{maximumRolling3hRainfall} = \max_k(\text{rolling3h}_k)$$
* **Window End Tracking**: Stores `threeHourWindowEnd` as the UTC timestamp of $t_{k+2}$ corresponding to the maximum rainfall sequence.

---

## 4. Completeness and Missing-Data Policy

### Missing-Data Rules
1. **Zero Interpolation Prohibited**: Missing observations are **never** interpolated or filled with zero.
2. **Missing Observations Detected**: If hourly gaps exist, the data is aggregated from the available records, but the completeness flag is explicitly set to `false`.
3. **Reproducibility**: The downstream rule engine will decide how to treat incomplete observation windows without guessing or falsifying data.

### Completeness Flags
* **`complete24hWindow`**:
  * Must contain $\ge 24$ hourly records ending at $T_{\text{end}}$.
  * Every consecutive record in the most recent 24-hour sequence must be spaced by exactly $3,600,000\text{ ms}$ (1 hour). Any missing hour sets `complete24hWindow = false`.
* **`complete3hWindow`**:
  * Set to `true` if at least one continuous 3-hour unbroken sequence exists in the dataset.
  * If fewer than 3 records exist or all sequences contain gaps, `complete3hWindow = false` and `maximumRolling3hRainfall = 0`.

---

## 5. Temperature and Wind Aggregation

* **Maximum Temperature (`maximumTemperatureC`)**:
  * Highest instantaneous hourly temperature observed across all records in the aggregation period:
    $$\text{maximumTemperatureC} = \max_i(\text{temperatureC}_i)$$
* **Maximum Wind Speed (`maximumWindSpeedKmh`)**:
  * Highest sustained 10m wind speed observed across all records in the aggregation period:
    $$\text{maximumWindSpeedKmh} = \max_i(\text{windSpeedKmh}_i)$$
* **Maximum Wind Gust (`maximumWindGustKmh`)**:
  * Highest instantaneous 10m wind gust observed across all records in the aggregation period:
    $$\text{maximumWindGustKmh} = \max_i(\text{windGustKmh}_i)$$
* **Separation**: Wind speed and wind gust are physical distinct metrics and are never substituted for each other.

---

## 6. Timestamp and Timezone Handling

* All database reads and service calculations operate strictly on **UTC timestamps**.
* Local machine timezones (`Asia/Kolkata`, local browser/node offsets) are ignored.
* Records are sorted by `observedAt ASC` internally before any windowing calculations are performed.
* Overlapping or duplicate timestamps are deduplicated deterministically.

---

## 7. Decoupling from Risk Rules

Stage 2 intentionally does **not** evaluate risk rules:
```text
Stage 2:
WeatherRecord (PostgreSQL) ──► WeatherAggregationService ──► WeatherAggregationResult

Stage 3 (Future):
WeatherAggregationResult ──┐
                          ├──► Rule Engine ──► RiskAssessment + RiskEvent
RiskRule (PostgreSQL) ────┘
```
This architectural separation guarantees that meteorological data processing can be independently verified, tested, audited, and reused across different insurance policies or environmental risk models.
