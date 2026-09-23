# Module 6 Stage 5A: Climate Risk REST API Specification

> **AgriShield Parametric — Farm-Level Climate Risk Assessment REST API**  
> **Status:** Completed & Verified  
> **Base URL:** `/api/v1`

---

## 1. Architectural Overview

The Climate Risk REST API layer serves as a lightweight HTTP gateway exposing the farm-level climate risk assessment engine and persistence layer implemented in Stages 1–4. 

The REST layer adheres strictly to a clean, decoupled architecture:

```text
HTTP Request
  ↓
Zod Parameter / Query Validation
  ↓
RiskAssessmentController (Thin HTTP Dispatcher)
  ↓
RiskAssessmentService (Domain Orchestration)
  ↓
WeatherAggregationService + ClimateRiskRuleEngine (IMD Rainfall Rules)
  ↓
RiskRepository (Prisma Transaction with PostgreSQL)
  ↓
Standardized ApiResponse Envelope
```

> [!IMPORTANT]
> **Zero Business Logic in Controller**:  
> The controllers and routes contain no threshold calculations, no rolling window aggregations, no severity rankings, and no overall-risk mapping logic. All business rules are executed exclusively by `RiskAssessmentService`, `WeatherAggregationService`, and `ClimateRiskRuleEngine`.

---

## 2. Important Disclaimers & Limitations

> [!CAUTION]
> **Parametric Prototype Disclaimer**:  
> A climate risk assessment is **NOT** an insurance claim approval, insurance policy eligibility check, legal land ownership verification, or payout authorization. It represents a deterministic physical evaluation of meteorological indices against scientifically documented thresholds (such as IMD guidelines).

> [!WARNING]
> **Interpretation of Insufficient Data**:  
> When weather observation coverage is incomplete (fewer than 24 hours of consecutive data), rules requiring full windows cannot be evaluated (`status = INSUFFICIENT_DATA`, `observedValue = null`). While an overall risk level of `LOW` may be persisted due to zero triggered rules, **`LOW` with insufficient data must NOT be interpreted as confirmed low climate risk**. Clients and user interfaces must inspect `hasInsufficientDataCoverage: true` and clearly present the data limitation to the user.

---

## 3. Endpoints Specification

### 3.1 Trigger Farm Risk Assessment

* **Route:** `POST /api/v1/farms/:farmId/risk-assessments`
* **Description:** Initiates and persists a deterministic, end-to-end climate risk assessment for the specified farm parcel using its latest available weather observation time as the reference anchor.
* **Path Parameters:**
  * `farmId` (*string, required*): Valid UUID of the farm.
* **Request Body:** None. The client does not supply observed values, thresholds, or risk levels.
* **Success Status Code:** `201 Created`
* **Response Body (`ApiResponse<RiskAssessmentResponseDTO>`):**

```json
{
  "success": true,
  "message": "Risk assessment completed successfully",
  "data": {
    "id": "c297c9b7-2934-4a49-987e-5d0270aceecb",
    "farmId": "fcb576b0-6ac3-48ee-b9ee-3c3a9545e992",
    "assessedAt": "2026-09-23T12:00:00.000Z",
    "overallRisk": "HIGH",
    "assessmentVersion": "1.0.0",
    "ruleCount": 7,
    "triggeredRuleCount": 1,
    "weatherRecordCount": 24,
    "hasInsufficientDataCoverage": false,
    "summary": "Risk assessment identified 1 triggered hazard rule(s) resulting in overall HIGH risk.",
    "events": [
      {
        "id": "e4a773fa-85fa-4c40-9eb4-862d667c2934",
        "assessmentId": "c297c9b7-2934-4a49-987e-5d0270aceecb",
        "riskRuleId": "73bfd722-e1a5-4927-8a6c-fbe3969d7110",
        "ruleCode": "VERY_HEAVY_RAINFALL_24H",
        "ruleName": "Very Heavy Rainfall - 24 Hour",
        "hazardType": "HEAVY_RAINFALL",
        "measurement": "RAINFALL",
        "observedValue": 130.0,
        "thresholdValue": 115.6,
        "unit": "MM",
        "severity": "VERY_HIGH",
        "triggered": true,
        "status": "TRIGGERED",
        "explanation": "24-hour cumulative rainfall (130.00 mm) falls within very heavy rainfall threshold [115.6 - 204.4 mm).",
        "sourceType": "OFFICIAL_REFERENCE",
        "sourceReference": "India Meteorological Department rainfall classification: 115.6 mm or more and below 204.5 mm is very heavy rainfall.",
        "observationWindow": "24_HOURS",
        "observedAt": "2026-09-23T12:00:00.000Z",
        "createdAt": "2026-09-23T12:05:00.000Z"
      }
    ],
    "createdAt": "2026-09-23T12:05:00.000Z"
  },
  "timestamp": "2026-09-23T12:05:00.012Z",
  "correlationId": "req-1790151377751-a4pgp"
}
```

---

### 3.2 Get Latest Farm Assessment

* **Route:** `GET /api/v1/farms/:farmId/risk-assessments/latest`
* **Description:** Retrieves the single most recent persisted climate risk assessment for a farm parcel without re-triggering weather synchronization or rule evaluation.
* **Path Parameters:**
  * `farmId` (*string, required*): Valid UUID of the farm.
* **Success Status Code:** `200 OK`
* **Error Cases:**
  * `400 Bad Request`: `farmId` is not a valid UUID.
  * `404 Not Found`: Farm does not exist, or the farm exists but has no persisted risk assessments (`"No risk assessments found for farm '<farmId>'"`).

---

### 3.3 Get Farm Assessment History

* **Route:** `GET /api/v1/farms/:farmId/risk-assessments`
* **Description:** Retrieves historical assessments for a farm parcel ordered chronologically descending (`assessedAt DESC`, newest first).
* **Path Parameters:**
  * `farmId` (*string, required*): Valid UUID of the farm.
* **Query Parameters:**
  * `limit` (*integer, optional*): Maximum number of assessments to return.
    * Minimum: `1`
    * Maximum: `100`
    * Default: All available records up to repository defaults.
* **Success Status Code:** `200 OK`
* **Error Cases:**
  * `400 Bad Request`: `farmId` is not a valid UUID, or `limit` is not an integer between 1 and 100.
  * `404 Not Found`: Farm does not exist.

---

### 3.4 Get Assessment By ID

* **Route:** `GET /api/v1/risk-assessments/:assessmentId`
* **Description:** Retrieves a specific climate risk assessment by its unique UUID, including all child `riskEvents` populated with their respective `riskRule` definitions.
* **Path Parameters:**
  * `assessmentId` (*string, required*): Valid UUID of the risk assessment.
* **Success Status Code:** `200 OK`
* **Error Cases:**
  * `400 Bad Request`: `assessmentId` is not a valid UUID.
  * `404 Not Found`: No risk assessment exists with the provided UUID (`"Risk assessment with ID '<assessmentId>' not found"`).

---

## 4. Request Validation & Error Handling

Validation is handled upfront via Zod middleware before entering controllers:

| Target | Validation Rule | Invalid Value Error Code | Error Response Structure |
| :--- | :--- | :--- | :--- |
| `:farmId` | Valid UUID format | `400 Bad Request` | `{ success: false, message: "Validation failed", data: { errors: [...] } }` |
| `:assessmentId` | Valid UUID format | `400 Bad Request` | `{ success: false, message: "Validation failed", data: { errors: [...] } }` |
| `?limit` | Integer $\in [1, 100]$ | `400 Bad Request` | `{ success: false, message: "Validation failed", data: { errors: [...] } }` |

Operational exceptions thrown by services (e.g. `AppError.notFound`) are intercepted by `errorMiddleware` and returned with standardized payload:
```json
{
  "success": false,
  "message": "Resource not found",
  "data": null,
  "timestamp": "2026-09-23T12:00:00.000Z",
  "correlationId": "req-1790151377246-4mrys"
}
```

---

## 5. Traceability & Correlation IDs

* **Correlation IDs**: The application leverages `requestLogger` middleware which automatically extracts `X-Correlation-ID` from incoming HTTP request headers or generates a unique ID (`req-<timestamp>-<random>`). The correlation ID is attached to `req.correlationId` and echoed in all `ApiResponse` JSON responses and Winston log entries.
* **Rule Provenance**: Every `RiskEventResponseDTO` returned across all endpoints strictly preserves:
  * `sourceType`: `OFFICIAL_REFERENCE` or `PROJECT_INDICATOR`
  * `sourceReference`: Scientific or institutional source citation (e.g., IMD standard guidelines)
  * `observationWindow`: The evaluated aggregation time window (e.g., `24_HOURS`, `3_HOURS`)
  * `assessmentVersion`: Explicit version string (`"1.0.0"`)
