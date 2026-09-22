# Module 6 — Climate Risk Database & Rule Configuration

## Overview

Module 6 introduces the climate risk evaluation domain for AgriShield Parametric. Stage 1 establishes the database schema, relational integrity, historical snapshot capabilities, and initial configuration of scientifically documented meteorological rules.

---

## Database Models & Architecture

### 1. `RiskRule` (`risk_rules`)
Configurable reference rules for evaluating agricultural weather risks.

* **Purpose**: Defines the criteria under which an observation is considered hazardous (e.g. 24-hour heavy rainfall or 3-hour intense cloudburst events).
* **Key Fields**:
  * `code`: Unique alphanumeric identifier (e.g., `HEAVY_RAINFALL_24H`).
  * `name` & `description`: Descriptive metadata for display and documentation.
  * `hazardType`: Categorical classification (`HEAVY_RAINFALL`, `INTENSE_RAINFALL`, `HIGH_TEMPERATURE`, `STRONG_WIND`).
  * `measurement`: Physical metric inspected (`RAINFALL`, `TEMPERATURE`, `WIND_SPEED`, `WIND_GUST`).
  * `threshold`: Numeric trigger level as `Decimal(10, 2)`.
  * `thresholdUnit`: Unit of measurement (`MM`, etc.).
  * `observationWindow`: Observation aggregation duration (`24_HOURS`, `3_HOURS`).
  * `severity`: Severity classification (`LOW`, `MODERATE`, `HIGH`, `VERY_HIGH`).
  * `sourceType`: Origin authority classification (`OFFICIAL_REFERENCE`, `PROJECT_INDICATOR`).
  * `sourceReference`: Specific citation of the scientific or agency publication defining the threshold.
  * `isActive`: Boolean flag allowing deactivation without breaking historical records.
* **Integrity**: Deletion is restricted (`onDelete: Restrict`) if referenced by any historical `RiskEvent`. Rules are deactivated using `isActive = false` rather than deleted.

---

### 2. `RiskAssessment` (`risk_assessments`)
Represents an execution run of risk evaluation for a specific farm.

* **Purpose**: Tracks overall risk status for a farm at a specific evaluation point in time, summarizing triggered rule counts and inputs evaluated.
* **Key Fields**:
  * `farmId`: Foreign key to `farms(id)`.
  * `assessedAt`: Timestamp of evaluation (`TIMESTAMPTZ(6)`).
  * `overallRisk`: Overall aggregated risk level (`LOW`, `MODERATE`, `HIGH`).
  * `assessmentVersion`: Algorithm/rule engine version (default `1.0.0`).
  * `ruleCount`: Total rules evaluated during the assessment.
  * `triggeredRuleCount`: Number of rules that were triggered.
  * `weatherRecordCount`: Number of weather observations analyzed.
* **Multi-Assessment Support**: A farm can have multiple assessment runs over time (e.g. daily, hourly, or on-demand). Assessments are indexed on `(farmId, assessedAt DESC)`.
* **Cascade Behavior**: Cascades on farm deletion (`onDelete: Cascade`), as assessments have no domain meaning once their farm is deleted.

---

### 3. `RiskEvent` (`risk_events`)
Detailed granular evaluation result for a specific rule during an assessment run.

* **Purpose**: Records whether a specific rule was triggered, storing the exact observed value and historical snapshot of the threshold.
* **Snapshot Immutability Requirement**:
  * Historical assessments must remain reproducible, explainable, and auditable even if a `RiskRule` definition is later updated, recalibrated, or deactivated.
  * `RiskEvent` explicitly stores `observedValue`, `thresholdValue`, `unit`, `severity`, and `explanation` directly as columns.
  * Historical queries do not rely solely on the current state of `RiskRule` to explain what happened in the past.
* **Cascade Behavior**: Cascades on assessment deletion (`onDelete: Cascade`).

---

## Source Types (`RiskSourceType`)

* **`OFFICIAL_REFERENCE`**:
  Directly derived from peer-reviewed scientific publications, national meteorological agencies (such as the India Meteorological Department - IMD), or established agricultural standards.
* **`PROJECT_INDICATOR`**:
  Project-configured heuristics or empirical indicators calibrated for specific regional contexts where universal official agency standards are unavailable or require local baseline normalization.

---

## Initial Configured Risk Rules (IMD Rainfall Classifications)

The database seed (`prisma/seed.ts` via `seedRiskRules()`) populates 7 scientifically documented rainfall rules derived from official India Meteorological Department standards:

### 24-Hour Cumulative Rainfall
1. **`HEAVY_RAINFALL_24H`**: Threshold $\ge 64.5\text{ mm}$, Window: `24_HOURS`, Severity: `HIGH`, Source: `OFFICIAL_REFERENCE`.
2. **`VERY_HEAVY_RAINFALL_24H`**: Threshold $\ge 115.6\text{ mm}$, Window: `24_HOURS`, Severity: `VERY_HIGH`, Source: `OFFICIAL_REFERENCE`.
3. **`EXTREME_RAINFALL_24H`**: Threshold $\ge 204.5\text{ mm}$, Window: `24_HOURS`, Severity: `VERY_HIGH`, Source: `OFFICIAL_REFERENCE`.

### 3-Hour Short-Duration Rainfall Intensity
4. **`INTENSE_RAINFALL_3H`**: Threshold $\ge 20.0\text{ mm}$, Window: `3_HOURS`, Severity: `HIGH`, Source: `OFFICIAL_REFERENCE`.
5. **`VERY_INTENSE_RAINFALL_3H`**: Threshold $\ge 30.0\text{ mm}$, Window: `3_HOURS`, Severity: `VERY_HIGH`, Source: `OFFICIAL_REFERENCE`.
6. **`EXTREMELY_INTENSE_RAINFALL_3H`**: Threshold $\ge 50.0\text{ mm}$, Window: `3_HOURS`, Severity: `VERY_HIGH`, Source: `OFFICIAL_REFERENCE`.
7. **`EXCEPTIONALLY_HEAVY_RAINFALL_3H`**: Threshold $\ge 100.0\text{ mm}$, Window: `3_HOURS`, Severity: `VERY_HIGH`, Source: `OFFICIAL_REFERENCE`.

---

## Intentionally Excluded / Deferred Rules

1. **Temperature Rules (Heat Wave)**:
   * Official IMD heat wave classification requires departure from normal maximum temperature ($\ge 4.5^\circ\text{C}$ to $6.4^\circ\text{C}$) or absolute thresholds based on historical climatological normals for specific terrain (plains, hills, coastal).
   * Because historical climatological normal baselines are not yet stored in AgriShield, temperature rules are intentionally not configured in Stage 1.
2. **Wind Rules (Crop Lodging)**:
   * Wind damage thresholds vary dramatically depending on crop type, crop height, growth stage (e.g. vegetative vs. grain-filling in maize or sugarcane), and soil moisture.
   * Wind rules will be configured later with `sourceType = PROJECT_INDICATOR` after rule engine evaluation logic is reviewed.
