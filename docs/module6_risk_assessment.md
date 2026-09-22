# Module 6 — Stage 4: Farm-Level Climate Risk Assessment Service & Persistence

> **Core Principle**:  
> "Risk assessment evaluates meteorological aggregation against configured climate rules and atomically persists the assessment and risk events. It is a deterministic physical risk assessment for this prototype. It is NOT insurance eligibility, NOT claim approval, NOT proof of crop damage, NOT proof of land ownership, and NOT a legal insurance determination."

---

## 1. Stage 4 Purpose & Scope

Module 6 Stage 4 connects the components built in Stages 1–3 into a unified, reproducible orchestration service:
1. **Farm Validation**: Confirms the farm parcel exists.
2. **Deterministic Assessment Timestamp**: Derives the assessment context from the farm's latest available weather observation (`WeatherRecord.observedAt`), avoiding machine clock dependencies.
3. **Weather Aggregation**: Invokes `WeatherAggregationService` for the 24-hour window ending at the deterministic timestamp.
4. **Active Rule Retrieval**: Queries configured active rules (`RiskRule.isActive = true`) from PostgreSQL.
5. **Rule Engine Evaluation**: Runs `ClimateRiskRuleEngine` to produce explainable evaluation results across mutually exclusive threshold bands.
6. **Overall RiskLevel Aggregation**: Maps the highest severity among triggered rules to `RiskLevel` (`LOW`, `MODERATE`, `HIGH`).
7. **Atomic Persistence**: Atomically persists `RiskAssessment` and all associated `RiskEvent` rows in a single PostgreSQL transaction (`$transaction`).
8. **Assessment History**: Provides query capabilities for individual assessments and historical timeline views (`assessedAt DESC`).

```text
Farm
  ↓
Latest WeatherRecord.observedAt (Deterministic Reference Time)
  ↓
WeatherAggregationService (24h Rainfall, Rolling 3h, Wind, Temp, Completeness)
  ↓
Active RiskRules from PostgreSQL (isActive = true)
  ↓
ClimateRiskRuleEngine (Pure Domain Evaluation)
  ↓
Severity-to-Overall-Risk Mapping
  ↓
Prisma Transaction ($transaction)
  ├── RiskAssessment (Summary, Counts, Overall Risk)
  └── RiskEvent[] (Rule Snapshot, Observed Value, Status, Explanation)
```

---

## 2. Deterministic Reference Time

The assessment reference time represents the weather observation context being evaluated:
- When `referenceTime` is explicitly provided, it is parsed and verified as a valid UTC timestamp.
- When `referenceTime` is omitted, the service queries `WeatherRepository.findLatestByFarmId(farmId)` and selects `latestRecord.observedAt`.
- If no weather records exist for the farm, the service returns a 404 domain error (`No weather records found for farm '<farmId>'. Cannot perform risk assessment.`). It **never** creates an assessment with synthetic or fake data.
- **Arbitrary `new Date()` is strictly prohibited** as the assessment reference time, ensuring assessments are reproducible and auditable against past weather observations.

---

## 3. Severity-to-Overall-Risk Mapping

The farm-level `RiskLevel` is determined by the **highest severity among TRIGGERED rules**. The prototype's 4-tier rule severity ranks (`LOW`, `MODERATE`, `HIGH`, `VERY_HIGH`) map transparently into the 3-level database enum (`RiskLevel`):

| Highest Triggered Rule Severity | Overall Farm `RiskLevel` | Rationale |
| :--- | :--- | :--- |
| **No rules triggered** | `LOW` | No active threshold criteria were exceeded. |
| **`LOW`** | `LOW` | Minor advisory conditions. |
| **`MODERATE`** | `MODERATE` | Moderate weather stress detected. |
| **`HIGH`** | `HIGH` | Significant hazardous weather condition met (e.g. Heavy Rainfall $\ge 64.5\text{ mm}$). |
| **`VERY_HIGH`** | `HIGH` | Extreme hazardous condition met (e.g. Very Heavy $\ge 115.6\text{ mm}$ or Extreme $\ge 204.5\text{ mm}$). |

### Mixed Severities
When multiple rules trigger across distinct hazard/window groups (e.g. 24h rainfall and 3h rainfall intensity), the highest severity takes absolute precedence:
- `LOW` + `MODERATE` $\to$ `MODERATE`
- `MODERATE` + `HIGH` $\to$ `HIGH`
- `HIGH` + `VERY_HIGH` $\to$ `HIGH`
- `LOW` + `VERY_HIGH` $\to$ `HIGH`

---

## 4. Insufficient Data Handling

When weather records do not form a complete observation window (e.g., fewer than 24 consecutive hourly records for 24h rainfall):
1. **Rule Status**: The `ClimateRiskRuleEngine` sets `status = 'INSUFFICIENT_DATA'` and `triggered = false`.
2. **`RiskEvent.observedValue`**: Persisted as **`null`** in PostgreSQL (supported by the Stage 4 additive migration). Missing data is **never** converted to zero.
3. **`RiskEvent.explanation`**: Contextual explanation detailing that the observation window was incomplete.
4. **Overall Risk Limitation**:
   - If there are no triggered rules but one or more rules have `INSUFFICIENT_DATA`, the persisted enum value is `RiskLevel.LOW` (because the database schema does not have an `INSUFFICIENT_DATA` enum variant).
   - In this situation, **persisted `LOW` does NOT mean the farm is confirmed low risk**.
   - The returned DTO sets `hasInsufficientDataCoverage = true` and generates the explicit summary:  
     `"No configured rainfall threshold was triggered among evaluable rules; some rules could not be evaluated because the required weather observation window was incomplete."`

---

## 5. Mutually Exclusive Threshold Bands (130 mm & 250 mm)

The rule engine groups rules by `(hazardType, measurement, observationWindow)` and triggers **only the highest satisfied threshold band**:
- **130.0 mm / 24h Rainfall**:
  - `VERY_HEAVY_RAINFALL_24H` ($\ge 115.6\text{ mm}$) $\to$ **`TRIGGERED`** (`true`)
  - `HEAVY_RAINFALL_24H` ($\ge 64.5\text{ mm}$) $\to$ **`NOT_TRIGGERED`** (`false`, superseded)
  - `EXTREME_RAINFALL_24H` ($\ge 204.5\text{ mm}$) $\to$ **`NOT_TRIGGERED`** (`false`, below threshold)
  - Result: `triggeredRuleCount = 1`, `overallRisk = HIGH`.
- **250.0 mm / 24h Rainfall**:
  - `EXTREME_RAINFALL_24H` ($\ge 204.5\text{ mm}$) $\to$ **`TRIGGERED`** (`true`)
  - Lower bands are marked superseded.
  - Result: `triggeredRuleCount = 1`, `overallRisk = HIGH`.

---

## 6. Atomic Persistence & Transaction Rollback

All persistence operations occur inside a single atomic Prisma transaction (`this.db.$transaction`):
1. Create `RiskAssessment` row:
   - `farmId`, `assessedAt`, `overallRisk`, `assessmentVersion: "1.0.0"`, `ruleCount`, `triggeredRuleCount`, `weatherRecordCount`.
2. Create all child `RiskEvent` rows:
   - `assessmentId`, `riskRuleId`, `observedValue` (`null` if incomplete), `thresholdValue`, `unit`, `severity`, `triggered`, `explanation`, `observedAt`.
3. **Rollback Guarantee**: If any event creation fails (e.g. database constraint violation, connection drop), PostgreSQL rolls back the entire transaction. Zero orphan `RiskAssessment` records remain.

---

## 7. Assessment History & Versioning

- **Assessment Version**: Standardized to `assessmentVersion = "1.0.0"` representing the version of the evaluation rules and logic.
- **History Retrieval**: `getAssessmentsForFarm(farmId, limit?)` returns past assessments ordered by `assessedAt DESC`.
- **Single Assessment**: `getAssessmentById(assessmentId)` retrieves the assessment with fully populated child `RiskEvents` and parent `RiskRule` details.

---

## 8. Domain Boundaries & Limitations

1. **Not Insurance Eligibility**: A `HIGH` climate risk assessment does not imply insurance policy eligibility.
2. **Not Claim Approval / Payout**: A triggered risk event does not automatically trigger an insurance claim or payout. Claim processing, policy terms, deductible structures, and KYC/land title checks belong to subsequent modules.
3. **No ML / Heuristics**: The assessment is 100% deterministic and rule-based. No random forest, XGBoost, SHAP, satellite NDVI, or external black-box models are invoked in Stage 4.
4. **Scope Isolation**: No REST API routes or frontend pages were introduced in Stage 4; persistence and domain orchestration are verified through automated unit and live database integration tests.
