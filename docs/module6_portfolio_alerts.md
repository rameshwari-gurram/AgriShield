# Module 6: Portfolio Risk Summary & Alert Aggregation

## 1. Overview & Architectural Role

The **Portfolio Risk Summary** API provides macro-level climate risk metrics across the active farm portfolio:

```http
GET /api/v1/risk-assessments/portfolio-summary
```

- **Access**: Public / Standard API v1 (Unauthenticated, matching existing v1 routes)

### Architectural Choice: Option A (Executive Macro KPI Overview)
- **Role**: Stage 6 establishes a dedicated server-side macro aggregation endpoint for executive KPI monitoring.
- **Stage 5B-3 Coexistence**: This endpoint does **NOT** replace or eliminate the Stage 5B-3 per-farm latest assessment requests on `FarmListPage.tsx`. The per-farm status resolution via `Promise.allSettled()` remains active to render individual parcel badges and support client-side risk filtering.

---

## 2. Farm Population & Metric Formulas

### Target Population
Metrics are evaluated strictly over active agricultural parcels:
```prisma
FarmStatus.ACTIVE
```
Farms marked `INACTIVE` or `HARVESTED` are excluded from portfolio risk aggregation.

### Metric Definitions
1. `totalFarms`: Total count of farms with `status = FarmStatus.ACTIVE`.
2. `assessedFarms`: Count of active farms having at least one persisted `RiskAssessment`.
3. `unassessedFarms`: Count of active farms with zero persisted assessments (`totalFarms - assessedFarms`).
4. `highRiskCount`: Active farms whose latest assessment has `overallRisk === 'HIGH'`.
5. `moderateRiskCount`: Active farms whose latest assessment has `overallRisk === 'MODERATE'`.
6. `lowRiskCount`: Active farms whose latest assessment has `overallRisk === 'LOW'` and `hasInsufficientDataCoverage === false`.
7. `lowRiskUnconfirmedCount`: Active farms whose latest assessment has `overallRisk === 'LOW'` and `hasInsufficientDataCoverage === true` (due to incomplete weather observation window).

### Mathematical Invariants
Every valid portfolio summary response must satisfy:
$$\text{assessedFarms} = \text{highRiskCount} + \text{moderateRiskCount} + \text{lowRiskCount} + \text{lowRiskUnconfirmedCount}$$
$$\text{totalFarms} = \text{assessedFarms} + \text{unassessedFarms}$$

### Server-Side Aggregation Architecture
The portfolio risk summary is computed via server-side aggregation across two dedicated database operations:
1. **Active Farm Count**: An indexed count query (`farmRepo.count({ status: FarmStatus.ACTIVE })`) retrieving the active monitoring scope.
2. **Latest Assessment Retrieval**: A deterministic query (`riskRepo.getLatestAssessmentsForActiveFarms()`) utilizing PostgreSQL `DISTINCT ON` to retrieve the latest assessment for each active farm.

The service layer then aggregates the counts into risk categories and asserts mathematical invariants before returning the response. It does not claim single-query, O(1), or sub-millisecond execution.

---

## 3. Latest Assessment Determinism

When a farm has multiple historical assessments, only the single latest assessment contributes to the portfolio metrics. Selection is deterministically resolved using a multi-column tie-breaker:

```sql
SELECT DISTINCT ON (a.farm_id)
  a.id,
  a.farm_id,
  a.overall_risk,
  a.weather_record_count,
  a.assessed_at,
  a.created_at
FROM risk_assessments a
JOIN farms f ON a.farm_id = f.id
WHERE f.status::text = 'ACTIVE'
ORDER BY
  a.farm_id,
  a.assessed_at DESC,
  a.created_at DESC,
  a.id DESC;
```

- **Primary Sort**: `assessed_at DESC` (newest meteorological observation reference time).
- **Secondary Tie-Breaker**: `created_at DESC` (newest database record creation).
- **Tertiary Tie-Breaker**: `id DESC` (lexicographical UUID order to eliminate non-determinism).

---

## 4. Route Precedence (CRITICAL)

In Express route configuration (`backend/src/routes/riskAssessment.routes.ts`), the static route:

```typescript
assessmentRouter.get('/portfolio-summary', ...);
```

is registered **strictly prior** to the parameterized dynamic route:

```typescript
assessmentRouter.get('/:assessmentId', ...);
```

This prevents the UUID validator on `/:assessmentId` from intercepting `/portfolio-summary` and rejecting it with a 400 Bad Request error.

---

## 5. Scope & System Boundaries

- **No Risk Engine Changes**: Reuses existing `ClimateRiskRuleEngine` and `calculateOverallRisk` without modification.
- **No Machine Learning**: ML services, SHAP explanation models, and predictive algorithms remain out of scope.
- **No Satellite Raster Processing**: Sentinel/Landsat NDVI calculations remain out of scope.
- **No Underwriting or Claims**: Risk metrics indicate meteorological hazard levels only. They do not constitute insurance policy approvals, claim creation, or payout authorizations.
- **No Land Ownership Verification**: Farm boundaries serve purely as spatial weather query bounds, not cadastral legal deeds.
