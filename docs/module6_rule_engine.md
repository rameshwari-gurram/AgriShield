# Module 6 — Climate Risk Rule Engine

> **Core Principle**:  
> "The Rule Engine evaluates meteorological measurements against configured risk criteria to produce explainable rule evaluation results. It does not calculate overall farm risk levels, does not write to the database, and does not expose REST endpoints."

---

## 1. Responsibilities & Architecture

The **Climate Risk Rule Engine** (`backend/src/services/climateRiskRuleEngine.service.ts`) is a pure, deterministic domain service responsible for:
1. Evaluating physical weather measurements (`WeatherAggregationResult`) against active risk rules (`RiskRule[]`).
2. Mapping rules to their respective physical measurements.
3. Enforcing completeness constraints before evaluating rainfall rules.
4. Implementing mutually exclusive severity classifications across ordered threshold bands.
5. Generating transparent, human-readable explanations for every evaluated rule.

```text
WeatherAggregationResult (Stage 2) ──┐
                                     ├──► ClimateRiskRuleEngine ──► RuleEvaluationResult[]
Active RiskRule[] (Stage 1) ─────────┘
```

The service is completely isolated from I/O:
* Does **not** query PostgreSQL or use Prisma.
* Does **not** persist `RiskAssessment` or `RiskEvent` records (deferred to Stage 4).
* Does **not** calculate overall farm `RiskLevel` (e.g. `LOW`, `MODERATE`, `HIGH`) (deferred to Stage 4).
* Does **not** expose REST endpoints or modify the frontend.

---

## 2. Input Contracts

### A. `WeatherAggregationResult` (from Stage 2)
Provides standardized physical measurements:
* `totalRainfall24h` (mm)
* `maximumRolling3hRainfall` (mm)
* `maximumTemperatureC` (°C)
* `maximumWindSpeedKmh` (km/h)
* `maximumWindGustKmh` (km/h)
* `complete24hWindow` (boolean)
* `complete3hWindow` (boolean)

### B. `RiskRuleEvaluationInput` (from Stage 1)
Active rule definitions containing:
* `code`, `name`, `description`
* `hazardType` (`HEAVY_RAINFALL`, `INTENSE_RAINFALL`, `HIGH_TEMPERATURE`, `STRONG_WIND`)
* `measurement` (`RAINFALL`, `TEMPERATURE`, `WIND_SPEED`, `WIND_GUST`)
* `threshold`, `thresholdUnit`, `observationWindow`
* `severity` (`LOW`, `MODERATE`, `HIGH`, `VERY_HIGH`)
* `sourceType` (`OFFICIAL_REFERENCE`, `PROJECT_INDICATOR`), `sourceReference`

---

## 3. Explicit Measurement Mapping

The engine explicitly maps rule criteria to aggregated measurements:
* **`RAINFALL` + `24_HOURS`** $\to$ `weather.totalRainfall24h`
* **`RAINFALL` + `3_HOURS`** $\to$ `weather.maximumRolling3hRainfall`
* **`TEMPERATURE`** $\to$ `weather.maximumTemperatureC`
* **`WIND_SPEED`** $\to$ `weather.maximumWindSpeedKmh`
* **`WIND_GUST`** $\to$ `weather.maximumWindGustKmh`

No fuzzy string matching or ambiguous heuristics are permitted.

---

## 4. Completeness & Insufficient Data Handling

The engine strictly verifies observation window coverage before evaluating rainfall rules:
* **24-Hour Rainfall Rules**:
  * If `weather.complete24hWindow === false`, rules are marked:
    * `status = 'INSUFFICIENT_DATA'`
    * `triggered = false`
    * `explanation = "The 24-hour rainfall rule could not be evaluated because the available weather records do not form a complete 24-hour observation window."`
* **3-Hour Rolling Rainfall Rules**:
  * If `weather.complete3hWindow === false`, rules are marked:
    * `status = 'INSUFFICIENT_DATA'`
    * `triggered = false`
    * `explanation = "The 3-hour rainfall rule could not be evaluated because the available weather records do not form a complete 3-hour continuous observation window."`

Incomplete observations are clearly distinguished from `NOT_TRIGGERED` (where evidence was complete but the threshold was not met).

---

## 5. Mutually Exclusive Threshold-Band Classification

When multiple rules share the same:
$$\text{hazardType} + \text{measurement} + \text{observationWindow}$$
the rules form an ordered classification hierarchy. The engine selects **only the highest satisfied threshold** as `TRIGGERED`. Lower satisfied thresholds are not simultaneously triggered.

### Concrete Example: 24-Hour Rainfall
Configured thresholds:
* `HEAVY_RAINFALL_24H`: $\ge 64.5\text{ mm}$
* `VERY_HEAVY_RAINFALL_24H`: $\ge 115.6\text{ mm}$
* `EXTREME_RAINFALL_24H`: $\ge 204.5\text{ mm}$

Suppose observed 24h rainfall is **$130.0\text{ mm}$**:
1. $130.0 \ge 204.5$ $\to$ No
2. $130.0 \ge 115.6$ $\to$ **Yes (Highest Satisfied)**
3. $130.0 \ge 64.5$ $\to$ Satisfied, but superseded

**Evaluation Result**:
* `VERY_HEAVY_RAINFALL_24H` $\to$ **`TRIGGERED = true`**  
  *Explanation: "24-hour rainfall was 130.00 MM, which met the configured threshold of 115.60 MM."*
* `EXTREME_RAINFALL_24H` $\to$ **`TRIGGERED = false`**  
  *Explanation: "24-hour rainfall was 130.00 MM, which did not meet the configured threshold of 204.50 MM."*
* `HEAVY_RAINFALL_24H` $\to$ **`TRIGGERED = false`**  
  *Explanation: "24-hour rainfall was 130.00 MM, but this threshold (64.50 MM) was superseded by higher classification (Very Heavy Rainfall - 24 Hour >= 115.60 MM)."*

The same selection logic applies to 3-hour rainfall intensity bands:
* $20.0 \text{ to } <30.0\text{ mm}$ $\to$ `INTENSE_RAINFALL_3H`
* $30.0 \text{ to } <50.0\text{ mm}$ $\to$ `VERY_INTENSE_RAINFALL_3H`
* $50.0 \text{ to } <100.0\text{ mm}$ $\to$ `EXTREMELY_INTENSE_RAINFALL_3H`
* $\ge 100.0\text{ mm}$ $\to$ `EXCEPTIONALLY_HEAVY_RAINFALL_3H`

---

## 6. Official Reference vs. Project Indicator Distinction

* **`OFFICIAL_REFERENCE`**: Preserves citations from the India Meteorological Department (IMD) for all 7 standard rainfall rules.
* **`PROJECT_INDICATOR`**: Used for experimental or empirical project rules (e.g. custom test thresholds for temperature or wind).
* The engine preserves `sourceType` and `sourceReference` verbatim on all `RuleEvaluationResult` records.

---

## 7. Decoupling from Stage 4 (Assessment & Persistence)

* **No Farm-Level Risk Calculation**: Computing overall farm risk (`LOW`, `MODERATE`, `HIGH`) requires weighting multiple hazards, crop stages, and business rules. This logic belongs in Stage 4.
* **No Database Writes**: The engine returns an array of pure in-memory `RuleEvaluationResult` objects. Persistence to `risk_assessments` and `risk_events` tables will occur in Stage 4.
