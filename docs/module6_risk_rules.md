# Module 6: Active Parametric Risk Rules Catalog

## 1. Overview & Architectural Purpose

The **Active Parametric Risk Rules Catalog** exposes configured meteorological hazard thresholds directly from the PostgreSQL database to client dashboards and operational consumers via a standardized, read-only REST API endpoint:

```http
GET /api/v1/risk-rules
```

This endpoint provides complete transparency into the scientific rules evaluated by the pure `ClimateRiskRuleEngine`. It allows farmers, agronomists, and system operators to inspect active trigger criteria independently of whether a risk assessment has already been generated for any specific farm parcel.

---

## 2. API Contract Specification

### Endpoint Definition
- **Route**: `GET /api/v1/risk-rules`
- **Access**: Public / Standard API v1 (Unauthenticated, matching existing v1 routes)
- **Method**: `GET`
- **Request Body**: None
- **Query Parameters**: None (returns all active rules deterministically ordered by `code ASC`)

### Success Response (HTTP 200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "e9b2c8a1-4d3f-4e6a-9b1c-2d3e4f5a6b7c",
      "code": "EXTREME_RAINFALL_24H",
      "name": "Extremely Heavy Rainfall - 24 Hour",
      "description": "India Meteorological Department (IMD) standard classification for extremely heavy rainfall over 24 hours (>= 204.5 mm).",
      "hazardType": "HEAVY_RAINFALL",
      "measurement": "RAINFALL",
      "threshold": 204.5,
      "thresholdUnit": "MM",
      "observationWindow": "24_HOURS",
      "severity": "VERY_HIGH",
      "sourceType": "OFFICIAL_REFERENCE",
      "sourceReference": "India Meteorological Department rainfall classification: 204.5 mm or more is extremely heavy rainfall.",
      "isActive": true,
      "createdAt": "2026-09-01T00:00:00.000Z",
      "updatedAt": "2026-09-01T00:00:00.000Z"
    }
  ],
  "message": "Active parametric risk rules retrieved successfully",
  "timestamp": "2026-09-25T17:00:00.000Z"
}
```

### DTO Invariants
- **Threshold Fields**: Strictly named `threshold: number` and `thresholdUnit: string`. Never `thresholdValue` or `unit`.
- **Numeric Typing**: Prisma `Decimal` database values are converted to standard JavaScript numbers.
- **Filtering**: Only rules where `isActive = true` are returned.

---

## 3. Seeded IMD Risk Rules Baseline

The active rules currently configured and evaluated are:

### A. 24-Hour Rainfall Rules
1. `HEAVY_RAINFALL_24H`:
   - Threshold: $\ge 64.5$ mm
   - Unit: `MM`
   - Window: `24_HOURS`
   - Severity: `HIGH`
   - Reference: India Meteorological Department Standard Classification
2. `VERY_HEAVY_RAINFALL_24H`:
   - Threshold: $\ge 115.6$ mm
   - Unit: `MM`
   - Window: `24_HOURS`
   - Severity: `VERY_HIGH`
   - Reference: India Meteorological Department Standard Classification
3. `EXTREME_RAINFALL_24H`:
   - Threshold: $\ge 204.5$ mm
   - Unit: `MM`
   - Window: `24_HOURS`
   - Severity: `VERY_HIGH`
   - Reference: India Meteorological Department Standard Classification

### B. 3-Hour Short-Duration Intensity Rules
1. `INTENSE_RAINFALL_3H`:
   - Threshold: $\ge 20.0$ mm
   - Unit: `MM`
   - Window: `3_HOURS`
   - Severity: `HIGH`
   - Reference: India Meteorological Department Intensity Classification
2. `VERY_INTENSE_RAINFALL_3H`:
   - Threshold: $\ge 30.0$ mm
   - Unit: `MM`
   - Window: `3_HOURS`
   - Severity: `VERY_HIGH`
   - Reference: India Meteorological Department Intensity Classification
3. `EXTREMELY_INTENSE_RAINFALL_3H`:
   - Threshold: $\ge 50.0$ mm
   - Unit: `MM`
   - Window: `3_HOURS`
   - Severity: `VERY_HIGH`
   - Reference: India Meteorological Department Intensity Classification
4. `EXCEPTIONALLY_HEAVY_RAINFALL_3H`:
   - Threshold: $\ge 100.0$ mm
   - Unit: `MM`
   - Window: `3_HOURS`
   - Severity: `VERY_HIGH`
   - Reference: India Meteorological Department Intensity Classification

---

## 4. Scope & System Boundaries

- **No New Risk Calculations**: Exposes existing seeded database rules without modifying rule logic.
- **No Fabricated Hazard Thresholds**: Strictly excludes non-authoritative drought, flood, consecutive dry day, or arbitrary heatwave rules.
- **Parametric Indicator Disclaimer**:
  *"Parametric weather indicators based on IMD meteorological standards. Rules define climate risk evaluation criteria and do not constitute formal insurance policy certificates or claim entitlements."*
- **Absolute Scope Boundary**: Does not perform Machine Learning inference, SHAP analysis, NDVI computation, insurance policy underwriting, claims approval, or legal land title verification.
