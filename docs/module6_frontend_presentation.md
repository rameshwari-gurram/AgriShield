# Module 6: Climate Risk Frontend Presentation & Portfolio Dashboard

## 1. Overview & Architectural Boundaries

The frontend presentation layer for Module 6 provides visualization, monitoring, and technical provenance inspection for climate-risk assessments.

### Invariant Rules
1. **Unilateral Calculation Authority:** The backend is the **sole source of truth** for all climate-risk determinations. The frontend **never** evaluates thresholds, calculates triggered status, derives overall risk, or computes rainfall metrics.
2. **Deterministic Rules Active:** The active scientific rules evaluated by the backend are IMD 24-hour and 3-hour intensity rules (`HEAVY_RAINFALL_24H` $\ge 64.5$ mm, `VERY_HEAVY_RAINFALL_24H` $\ge 115.6$ mm, `EXTREME_RAINFALL_24H` $\ge 204.5$ mm, `INTENSE_RAINFALL_3H` $\ge 20.0$ mm, `VERY_INTENSE_RAINFALL_3H` $\ge 30.0$ mm, `EXTREMELY_INTENSE_RAINFALL_3H` $\ge 50.0$ mm, `EXCEPTIONALLY_HEAVY_RAINFALL_3H` $\ge 100.0$ mm).
3. **No Fabricated Weather Data:** The frontend strictly consumes and displays actual fields present in the Stage 5A DTO without synthesizing non-existent fields (`windowStartDate`, `windowEndDate`, `totalRainfallMm`, `consecutiveDryDays`).

---

## 2. Farm Directory Portfolio Risk Visibility (`FarmListPage.tsx`)

### Data Fetching Ownership & Concurrency Architecture
- `FarmListPage` is the sole data-fetching owner for portfolio risk state across displayed parcels.
- When farms for the active page are loaded, `FarmListPage` executes `Promise.allSettled()` across the displayed parcels calling `riskAssessmentService.getLatestRiskAssessment(farmId)`.
- Concurrent resolution prevents one parcel failure (such as an unassessed 404 or network timeout) from interrupting other parcels.

### Status Mapping Matrix
The backend response is mapped into a page-level status map (`Record<string, FarmRiskStatus>`):
- `200` + `overallRisk === 'HIGH'` $\to$ `'HIGH'`
- `200` + `overallRisk === 'MODERATE'` $\to$ `'MODERATE'`
- `200` + `overallRisk === 'LOW'` and `hasInsufficientDataCoverage === false` $\to$ `'LOW'`
- `200` + `overallRisk === 'LOW'` and `hasInsufficientDataCoverage === true` $\to$ `'LOW_UNCONFIRMED'`
- `404 Not Found` $\to$ `'NO_ASSESSMENT'`
- Network / 500 / request failure $\to$ `'RISK_UNAVAILABLE'`

### Client-Side Risk Filtering
- A dedicated Risk Filter bar (`All`, `High`, `Moderate`, `Low`, `Unconfirmed`, `Unassessed`) filters displayed parcels strictly by the resolved `FarmRiskStatus`.
- No backend filtering or database queries are executed for client filtering.

---

## 3. Presentational Badge (`FarmRiskBadge.tsx`)

`FarmRiskBadge` is a **purely presentational component**:
- **Zero Network Calls:** Does not import `riskAssessmentService`, `axios`, or `fetch`.
- **Props Interface:**
  ```typescript
  export type FarmRiskStatus =
    | 'LOADING'
    | 'HIGH'
    | 'MODERATE'
    | 'LOW'
    | 'LOW_UNCONFIRMED'
    | 'NO_ASSESSMENT'
    | 'RISK_UNAVAILABLE';

  export interface FarmRiskBadgeProps {
    status: FarmRiskStatus;
    size?: 'sm' | 'md';
  }
  ```
- **Visual Styling:**
  - `HIGH`: Rose styling (`bg-rose-50 text-rose-700 border-rose-200`) with `AlertTriangle`
  - `MODERATE`: Amber styling (`bg-amber-50 text-amber-700 border-amber-200`) with `AlertCircle`
  - `LOW`: Emerald styling (`bg-emerald-50 text-emerald-700 border-emerald-200`) with `CheckCircle`
  - `LOW_UNCONFIRMED`: Amber styling with advisory tooltip indicating incomplete observation window
  - `NO_ASSESSMENT`: Slate neutral badge (`bg-slate-100 text-slate-600 border-slate-200`)
  - `RISK_UNAVAILABLE`: Dashed slate badge with warning icon
  - `LOADING`: Slate badge with animated spinner

---

## 4. Assessment Provenance View (`RiskAssessmentAuditModal.tsx`)

### Purpose
The Assessment Provenance View provides a read-only, transparent technical inspection of a persisted backend `RiskAssessmentResponseDTO`.

### Actual Stage 5A DTO Field Mappings
- **Assessment Metadata:**
  - `id`: Assessment UUID
  - `farmId`: Associated Farm UUID
  - `assessedAt`: ISO timestamp of evaluation
  - `overallRisk`: `'LOW' | 'MODERATE' | 'HIGH'`
  - `assessmentVersion`: Version string (e.g., `'1.0.0'`)
  - `ruleCount`: Total active rules evaluated
  - `triggeredRuleCount`: Count of triggered rules
  - `weatherRecordCount`: Hourly observations examined
  - `hasInsufficientDataCoverage`: Boolean flag indicating incomplete record coverage
  - `summary`: Backend-generated narrative description
  - `createdAt`: ISO timestamp of database record creation
- **Risk Event Provenance Fields:**
  - `id`: Risk event UUID
  - `assessmentId`: Assessment UUID
  - `riskRuleId`: Rule UUID
  - `ruleCode`: Code identifier (e.g., `'VERY_HEAVY_RAINFALL_24H'`)
  - `ruleName`: Human-readable name
  - `hazardType`: Hazard category
  - `measurement`: Metric evaluated
  - `threshold`: Numeric trigger threshold
  - `thresholdUnit`: Threshold unit string (`'MM'`)
  - `observationWindow`: Window code (`'24_HOURS'`, `'3_HOURS'`)
  - `observedValue`: Observed metric or `null` (safely formatted as `'N/A'`)
  - `severity`: Rule severity level
  - `status`: `'TRIGGERED' | 'NOT_TRIGGERED' | 'INSUFFICIENT_DATA'`
  - `triggered`: Boolean trigger flag
  - `explanation`: Detailed backend explanation
  - `sourceType`: `'OFFICIAL_REFERENCE' | 'PROJECT_INDICATOR'`
  - `sourceReference`: Specific citation string provided by backend
  - `observedAt`: Observation timestamp
  - `createdAt`: Event record timestamp

### JSON Export & Download
- **Copy JSON:** Copies `JSON.stringify(assessment, null, 2)` directly to clipboard.
- **Download JSON:** Creates a client-side `Blob` and triggers a download of `risk-assessment-${assessment.id}.json`.
- Serializes **strictly** the displayed backend assessment DTO data without Axios transport metadata or client enrichments.

### Product Disclaimer
Displays the project disclaimer:
> *"Parametric weather indicator only. Not a formal insurance policy certificate or claim entitlement."*

---

## 5. Farm Detail Integration

- **`FarmRiskSection.tsx`:** Manages modal state (`provenanceAssessment`, `provenanceModalOpen`) and passes `onViewProvenance` handler down to child components.
- **`RiskAssessmentSummaryCard.tsx`:** Features a "View Provenance" action button opening the modal for the newest assessment.
- **`HistoricalAssessmentModal.tsx`:** Features a "View Provenance" action button opening the modal for the inspected historical assessment.

---

## 6. Stage 6: Macro Portfolio Metrics & Active Rules Catalog

### A. Portfolio Risk Summary Card (`PortfolioRiskSummaryCard.tsx`)
- **Macro Overview Widget:** Mounted on `FarmListPage.tsx` above the farm registry table.
- **Key Metrics Displayed:** Total Active Farms (`FarmStatus.ACTIVE`), Assessed Farms, High Risk, Moderate Risk, Low Risk (Confirmed), Low Risk (Unconfirmed due to incomplete window), and Unassessed.
- **Resilient Presentation:** Failure or loading delay of the macro summary never blocks the rendering of individual farm rows or per-farm status badges. Includes loading skeletons and retry controls.

### B. Active Parametric Rules Catalog Modal (`RiskRuleCatalogModal.tsx`)
- **Read-Only Transparency:** Triggered via "View Parametric Rules" button in `FarmListPage.tsx` header.
- **Dynamic Content:** Consumes `GET /api/v1/risk-rules` directly from backend engine. Does not hard-code rule counts.
- **Grouping:** Groups rules by observation window (`24_HOURS` vs `3_HOURS`).
- **Displays:** Rule name, code, observation window, threshold, threshold unit, severity, and official IMD source reference citations.
- **Accessibility:** Keyboard escape dismissal, backdrop click handling, `role="dialog"`, `aria-modal="true"`.
- **Mandatory Disclaimer:** Displays the standard AgriShield parametric risk indicator disclaimer.

---

## 7. Verification & Test Commands

### Run Frontend Tests
```bash
cd frontend
npm test
```
Executes:
- `tests/riskAssessment.frontend.test.tsx` (76 Stage 5B-2 presentation tests)
- `tests/riskPortfolio.frontend.test.tsx` (25 Stage 5B-3 portfolio and provenance tests)
- `tests/riskStage6.frontend.test.tsx` (28 Stage 6 summary and catalog tests)

Total: **129 tests passed**.

### Run Frontend Build & Typecheck
```bash
cd frontend
npm run typecheck
npm run build
```
Confirms clean TypeScript compilation and production bundle generation.

### Run Backend Build, Typecheck & Tests
```bash
cd backend
npm run typecheck
npm run build
npm test
npm run test:risk:stage6
```
Confirms 0 type errors, clean build, and passing Stage 6 unit and API integration tests.
