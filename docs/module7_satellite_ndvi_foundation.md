# Module 7 Stage 7.1: Satellite Data & NDVI Foundation

## 1. Executive Summary & Objective

Module 7 Stage 7.1 establishes the database schema foundation, mathematical calculation utilities, validation rules, and provider abstraction architecture for satellite observations and the Normalized Difference Vegetation Index (NDVI) in AgriShield.

## 2. Satellite Source: Copernicus Sentinel-2

AgriShield integrates optical multispectral imagery from the European Space Agency (ESA) Copernicus Sentinel-2 constellation:
- **Constellation:** Sentinel-2A and Sentinel-2B (5-day combined revisit frequency at the equator, 2–3 days at mid-latitudes).
- **Sensor:** MultiSpectral Instrument (MSI).
- **Processing Level:** Level-2A (Bottom-of-Atmosphere / BOA surface reflectance with atmospheric correction).
- **Key Spectral Bands for Vegetation Indexing:**
  - **B04 (Red):** Central wavelength ~665 nm (10 m spatial resolution). Captures chlorophyll absorption in healthy photosynthetic vegetation.
  - **B08 (Near-Infrared / NIR):** Central wavelength ~842 nm (10 m spatial resolution). Captures high reflectance from leaf cell structure (mesophyll).

## 3. NDVI Mathematical Formulation

The Normalized Difference Vegetation Index (NDVI) is mathematically defined as:

$$\text{NDVI} = \frac{\text{B08 (NIR)} - \text{B04 (Red)}}{\text{B08 (NIR)} + \text{B04 (Red)}}$$

### Invariants & Validation Constraints
- **Mathematical Range:** Strictly normalized between **$-1.0$ and $+1.0$**.
- **Dense Healthy Crop Canopy:** $\text{NDVI} \approx 0.6 \text{ to } 0.9$.
- **Sparse / Stressed Vegetation:** $\text{NDVI} \approx 0.2 \text{ to } 0.5$.
- **Bare Soil:** $\text{NDVI} \approx 0.1 \text{ to } 0.2$.
- **Water Bodies / Heavy Clouds:** Negative NDVI values (typically $\le 0.0$).
- **Zero Denominator:** If $\text{NIR} + \text{Red} = 0$, division by zero is mathematically undefined. AgriShield strictly detects zero denominators and rejects the calculation with a `400 Bad Request` rather than producing `NaN` or `Infinity`.
- **No Silent Clamping:** Invalid values outside $[-1.0, 1.0]$ are **never** silently clamped to boundaries; they are strictly validated and rejected according to project standards.

## 4. Authoritative Spatial Input: FarmBoundary

- The authoritative spatial input for satellite observation processing is the existing `FarmBoundary` model (`geometry(Polygon, 4326)`).
- The polygon boundary represents the exact legal and agronomic footprint of the insured parcel.
- In Stage 7.1, the boundary polygon is converted to GeoJSON and supplied directly to the satellite provider abstraction to define the spatial clipping region (AOI) for pixel sampling and zonal aggregation.

## 5. Satellite Provider Abstraction Architecture

AgriShield decouples domain services and database models from vendor-specific response payloads using the `ISatelliteProvider` contract:

```typescript
export interface ISatelliteProvider {
  readonly providerName: string;
  fetchNdviObservations(
    boundary: GeoJSONPolygon,
    dateRange: { from: Date; to: Date }
  ): Promise<NormalizedNdviObservationDTO[]>;
}
```

### Architectural Principles:
1. **Vendor Independence:** The rest of the application interacts strictly with `NormalizedNdviObservationDTO` and `NormalizedSatelliteObservationDTO`. Copernicus-specific payload keys (`outputs`, `bands`, `sampleCount`, `stDev`) are isolated within provider normalization layers and never leaked to services, repositories, or API callers.
2. **Planned Provider:** Copernicus Data Space Ecosystem (CDSE) / Sentinel Hub Statistical API.
3. **No Fabricated Satellite Data:** In accordance with parametric insurance integrity principles, satellite data is **never fabricated or faked**. In Stage 7.1, the Copernicus provider acts as an authenticated boundary stub that validates polygon geometries and query dates, documenting the exact integration boundary for live Stage 7.2 network dispatch.
4. **Backend-Only Credentials:** Copernicus client ID, client secret, and token endpoints are configured exclusively in backend environment variables (`COPERNICUS_CLIENT_ID`, `COPERNICUS_CLIENT_SECRET`, `COPERNICUS_AUTH_URL`, `COPERNICUS_BASE_URL`). Credentials are never exposed to frontend code or bundle distributions.

## 6. Database Foundation & Prisma Schema

### 6.1 `satellite_observations` Table
Stores granule/scene metadata for satellite passes over the farm parcel:
- `id` (`UUID`, Primary Key)
- `farmId` (`UUID`, Foreign Key $\to$ `farms.id`, `ON DELETE CASCADE`)
- `observedAt` (`TIMESTAMPTZ(6)`)
- `provider` (`VARCHAR(50)`, e.g., `"Copernicus Data Space Ecosystem"`)
- `satellite` (`VARCHAR(50)`, e.g., `"Sentinel-2A"`, `"Sentinel-2B"`)
- `productType` (`VARCHAR(50)`, e.g., `"S2MSI2A"`)
- `productId` (`VARCHAR(150)`, e.g., Sentinel-2 tile/granule scene identifier)
- `cloudCoverage` (`DECIMAL(5, 2)`, nullable, range $0.00\%$ to $100.00\%$ or `NULL` if cloud data is absent; prevents fabricating 0.0%)
- `sourceReference` (`TEXT`, optional attribution metadata)
- `createdAt` (`TIMESTAMP(3)`, default `NOW()`)

**Constraints & Indexes:**
- Unique Constraint: `(farmId, productId)` prevents duplicate ingestion of the same satellite scene.
- Unique Constraint: `(farmId, observedAt)` guarantees deterministic one-observation-per-overpass semantics for each farm parcel.
- Index: `(farmId, observedAt DESC)` for accelerated time-series retrieval.
- Index: `(productId)` for granule-based lookup.

### 6.2 `ndvi_observations` Table
Stores zonal aggregate NDVI metrics calculated over the farm boundary for a given satellite pass:
- `id` (`UUID`, Primary Key)
- `farmId` (`UUID`, Foreign Key $\to$ `farms.id`, `ON DELETE CASCADE`)
- `satelliteObservationId` (`UUID`, Unique Foreign Key $\to$ `satellite_observations.id`, `ON DELETE CASCADE`)
- `observedAt` (`TIMESTAMPTZ(6)`)
- `meanNdvi` (`DECIMAL(5, 4)`, range $-1.0000$ to $+1.0000$, 4 decimal precision)
- `minNdvi` (`DECIMAL(5, 4)`, range $-1.0000$ to $+1.0000$, 4 decimal precision)
- `maxNdvi` (`DECIMAL(5, 4)`, range $-1.0000$ to $+1.0000$, 4 decimal precision)
- `validPixelPercentage` (`DECIMAL(5, 2)`, range $0.00\%$ to $100.00\%$)
- `createdAt` (`TIMESTAMP(3)`, default `NOW()`)

**Constraints & Indexes:**
- Unique Constraint: `(satelliteObservationId)` ensures strict 1-to-1 linkage between an overpass observation and its NDVI calculation.
- Unique Constraint: `(farmId, observedAt)` prevents duplicate NDVI readings for the same farm at the same timestamp.
- Index: `(farmId, observedAt DESC)` for fast historical charting queries.

## 7. Verification Results Summary

- **Satellite Unit Tests (`satelliteNdvi.unit.test.ts`):** 69/69 passed (NDVI formulas, zero denominator, range checks, non-clamping, cloud/pixel percentage bounds, nullable cloud coverage, DTO normalization, provider abstraction).
- **Copernicus Auth & HTTP Unit Tests (`copernicusAuthHttp.unit.test.ts`):** 49/49 passed (OAuth2 client credentials, token caching, early refresh, 401 single retry, 429 rate limit, timeout, provider error mapping, credential security).
- **Copernicus Statistical API Unit Tests (`copernicusStatisticalApi.unit.test.ts`):** 44/44 passed (Evalscript v3, B04/B08/dataMask, spatial request generation, 10m resolution, daily intervals, WGS84 CRS, zero-data filtering, no band-mean approximations, range enforcement, 401 retry, secret masking, maxCloudCoverage config, product ID preservation).
- **NDVI Processor Unit Tests (`ndviProcessor.unit.test.ts`):** 88/88 passed (pure calculation engine, valid pixel masking, division by zero, non-finite values, no synthetic fallbacks).
- **Satellite Sync Integration Tests (`satelliteSync.integration.test.ts`):** 36/36 passed (Live PostgreSQL + PostGIS, first sync, repeat sync idempotency, 1:1 NDVI relationship, NO_DATA skip policy and metrics, multi-observation persistence, atomic transaction rollback).
- **Satellite REST API Integration Tests (`satellite.api.integration.test.ts`):** 46/46 passed (Express + Live PostgreSQL + PostGIS, sync endpoint, idempotency, NO_DATA skipping, latest endpoint, historical time-series endpoint, limit, range validation, 400/404 error mapping).
- **Satellite & NDVI Database Integration Tests (`satelliteNdvi.integration.test.ts`):** 66/66 passed (Live PostgreSQL + PostGIS, foreign key cascades, uniqueness constraints, 4-decimal precision, null cloud coverage persistence and DTO formatting, transaction rollback, service orchestration, Copernicus provider live DB persistence & idempotency).
- **Total Satellite Test Suite (`npm run test:satellite`):** 398/398 passed across all 7 test suites.
- **Repository Regression Tests:** 100% unaffected and passing across Modules 1–6 (739 tests across Farmers, Farms, Boundaries, Weather Provider/Service/Integration/API/Aggregation, Risk DB/Rule Engine/Assessment/API/Stage 6). Total repository tests: 1,137 passed.

---

## 8. Stage 7.2-A: Copernicus Data Space Authentication & HTTP Client

### 8.1 Scope & Boundaries
> [!IMPORTANT]
> **Stage 7.2-A establishes authentication and HTTP transport only.**
> Real Sentinel-2 Statistical API data retrieval, evalscript generation, and polygon zonal processing are scheduled for **Stage 7.2-B**.

### 8.2 Architectural Layers
```
CopernicusAuthService
        ↓
CopernicusHttpClient
        ↓
CopernicusSatelliteProvider
```
- **Separation of Concerns:** `CopernicusSatelliteProvider` delegates all token management and transport resilience to `CopernicusHttpClient` and `CopernicusAuthService`, eliminating duplicated authentication logic.

### 8.3 Official Endpoints & Configuration
- **OAuth2 Token Endpoint:**
  `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token` (`COPERNICUS_AUTH_URL`)
- **Sentinel Hub API Base URL:**
  `https://sh.dataspace.copernicus.eu` (`COPERNICUS_BASE_URL`)
- **Future Statistical API (Stage 7.2-B):**
  `https://sh.dataspace.copernicus.eu/statistics/v1`
- **Request Timeout:**
  Configured via `SATELLITE_REQUEST_TIMEOUT_MS` (default: 15,000 ms).

### 8.4 Authentication Service (`CopernicusAuthService`)
- **Grant Type:** RFC 6749 OAuth2 `client_credentials`.
- **Payload Format:** `application/x-www-form-urlencoded` containing `grant_type`, `client_id`, and `client_secret`.
- **Token Caching:** Access tokens are cached strictly in memory alongside their expiration epoch (`expiresAt = Date.now() + expiresIn * 1000`).
- **Reuse:** Sequential API requests reuse the cached token, avoiding redundant token generation.
- **Early-Expiry Safety Margin:** Enforces a configurable 60-second safety window (`safetyMarginMs = 60,000`). If a token expires within 60 seconds, a proactive refresh is triggered before dispatching API calls.
- **Invalidation:** `clearCachedToken()` purges the token upon persistent authentication errors.
- **Persistence Invariant:** Tokens are **never** persisted to PostgreSQL or stored on the filesystem.

### 8.5 Reusable HTTP Client (`CopernicusHttpClient`)
- **Bearer Token Injection:** Automatically attaches `Authorization: Bearer <token>` to all outgoing requests.
- **401 Unauthorized Single Retry:**
  1. If an authenticated request receives HTTP 401, the cached token is immediately invalidated.
  2. A fresh token is requested from `CopernicusAuthService`.
  3. The original request is retried **exactly once** with `_retry: true`.
  4. If the retry fails with 401, execution halts and returns a clean `AppError 401 Unauthorized` without infinite looping.
- **429 Rate Limit Handling:**
  - Detects HTTP 429 without executing uncontrolled retries.
  - Preserves and surfaces the `Retry-After` header value in error details.
  - Maps to `AppError.tooManyRequests(429)`.
- **Timeout Management:**
  - Detects `ECONNABORTED`, HTTP 408, or network hang beyond `SATELLITE_REQUEST_TIMEOUT_MS`.
  - Maps cleanly to `AppError.serviceUnavailable(503)`.
- **Error Normalization:**
  - Standardizes HTTP 400 (`badRequest`), 401 (`unauthorized`), 403 (`forbidden`), 404 (`notFound`), 429 (`tooManyRequests`), and 5xx (`serviceUnavailable`/`badGateway`).
  - Sanitizes error outputs to ensure provider status details are preserved without exposing raw secrets.

### 8.6 Security Invariants
- **Backend-Only Credentials:** Client ID and Secret exist exclusively in backend environment variables (`COPERNICUS_CLIENT_ID`, `COPERNICUS_CLIENT_SECRET`).
- **No Frontend Exposure:** Neither credentials nor Copernicus environment keys are exposed to the frontend or Vite bundles.
- **No Secret Leakage:** Error messages, stack traces, and internal logs strictly exclude `client_secret`, `access_token`, and `Authorization` headers.
- **Environment Isolation:** Local `.env` remains gitignored, and `.env.example` contains variable placeholders only.

---

## 9. Stage 7.2-B: Sentinel-2 Statistical API Integration

### 9.1 Overview & Architecture
Stage 7.2-B operationalizes parcel-level vegetation index extraction using the official **Copernicus Data Space Ecosystem (Sentinel Hub) Statistical API v1**.

```
PostGIS FarmBoundary (EPSG:4326)
        ↓
GeoJSON Polygon [lon, lat]
        ↓
SatelliteService (orchestration & persistence)
        ↓
CopernicusSatelliteProvider (buildCopernicusStatisticalRequest)
        ↓
CopernicusHttpClient (POST /statistics/v1 with Bearer token)
        ↓
Sentinel Hub Statistical API (evalscript v3 execution across S2 L2A archive)
        ↓
Statistical Aggregation Response (NDVI mean, min, max, dataMask counts)
        ↓
normalizeStatisticalResponse (DTO conversion, validation & sanitization)
        ↓
PostgreSQL Storage (satellite_observations + ndvi_observations)
```

### 9.2 Official Endpoints & Spatial Invariants
- **API Endpoint:** `POST /statistics/v1` on `https://sh.dataspace.copernicus.eu`
- **CRS:** `http://www.opengis.net/def/crs/EPSG/0/4326` (WGS84)
- **Coordinate Order:** `[longitude, latitude]` preserved from authoritative PostGIS `FarmBoundary`.
- **Spatial Resolution:** `resx: 10`, `resy: 10` matching native 10m ground resolution of Sentinel-2 MSI visible and NIR bands.
- **Aggregation Interval:** `P1D` (daily aggregation window per satellite pass).
- **Mosaicking Order:** `leastRecent` in `dataFilter`.

### 9.3 Evalscript V3 Implementation (`SENTINEL2_NDVI_EVALSCRIPT`)
The Statistical API evaluates an on-the-fly JavaScript Evalscript v3 over Sentinel-2 MSI Level-2A surface reflectance:
```javascript
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "dataMask"] }],
    output: [
      { id: "data", bands: 1 },
      { id: "dataMask", bands: 1 }
    ]
  };
}

function evaluatePixel(samples) {
  var b04 = samples.B04;
  var b08 = samples.B08;
  var mask = samples.dataMask;

  // 1. Exclude if pixel is outside farm boundary or sensor no-data
  if (mask === 0) {
    return { data: [0], dataMask: [0] };
  }

  // 2. Division by zero protection
  var denom = b08 + b04;
  if (denom === 0 || isNaN(denom)) {
    return { data: [0], dataMask: [0] };
  }

  var ndvi = (b08 - b04) / denom;

  // 3. Mathematical bounds [-1.0, 1.0] and finiteness
  if (isNaN(ndvi) || !isFinite(ndvi) || ndvi < -1.0 || ndvi > 1.0) {
    return { data: [0], dataMask: [0] };
  }

  return { data: [ndvi], dataMask: [1] };
}
```
**Key Invariants:**
- **Zero-Denominator Defense:** When $B08 + B04 = 0$ or undefined, the pixel is masked out (`dataMask = 0`) to prevent division by zero or NaN pollution.
- **Parcel Clipping:** Pixels outside the polygon footprint or flagged invalid by MSI sensors have `dataMask = 0` and are automatically excluded from zonal statistical calculations.
- **Bounds Checking:** Pixel NDVI values strictly within $[-1.0, 1.0]$ are included; non-finite values are filtered.

### 9.4 Statistical Response Normalization (`normalizeStatisticalResponse`)
Converts Copernicus Statistical API JSON responses into strongly-typed `NormalizedNdviObservationDTO[]`:
1. **Decoupling:** Provider-specific structures (`data`, `interval`, `outputs`, `dataMask`, `bands`, `stDev`) are completely encapsulated within `CopernicusSatelliteProvider`.
2. **Zero-Data Filtering & Missing Stats Handling:** Intervals with `sampleCount === 0` (e.g. non-overpass dates or heavy sensor dropout) or missing/malformed NDVI statistics are skipped cleanly without fabricating synthetic data.
3. **No Unsafe Band-Mean Approximations:** AgriShield strictly rejects approximating mean NDVI from separate band means:
   $$\mathbb{E}\left[\frac{\text{B08} - \text{B04}}{\text{B08} + \text{B04}}\right] \ne \frac{\mathbb{E}[\text{B08}] - \mathbb{E}[\text{B04}]}{\mathbb{E}[\text{B08}] + \mathbb{E}[\text{B04}]}$$
   The expectation of a quotient is not mathematically equivalent to the quotient of expectations. If the per-pixel evalscript NDVI output is unavailable, the observation is treated strictly as unusable/no-data.
4. **Valid Pixel Percentage:** Computed deterministically:
   $$\text{validPixelPercentage} = \frac{\text{sampleCount}}{\text{sampleCount} + \text{noDataCount}} \times 100$$
5. **Observation / Aggregation Identifier Semantics:**
   - Real Copernicus product identifiers (e.g. from catalog metadata) are preserved when supplied.
   - Because the Statistical API aggregates over daily intervals (P1D) rather than returning individual Sentinel-2 scene granule identifiers, AgriShield assigns an explicit aggregation identifier `STAT_AGG_S2L2A_<UTC_TIMESTAMP>` (e.g., `STAT_AGG_S2L2A_20260908T053641Z`) to guarantee database idempotency on `(farmId, productId)` without misleadingly masquerading as an actual physical Sentinel-2 scene tile.
6. **Nullable Cloud Coverage:** Since the Statistical API zonal aggregate does not return scene-wide cloud coverage percentages, `cloudCoverage` is normalized strictly to `null` to avoid fabricating false $0.0\%$ cloud measurements.
7. **Cloud Filtering Architecture:**
   - Scene-level filtering via `maxCloudCoverage` is intentionally omitted by default because 10,000 km² tile cloudiness would discard cloud-free observations over small farm parcels.
   - Pixel-level validity is evaluated directly at parcel scale via the `dataMask` band in the evalscript.
   - When scene-level pre-filtering is explicitly needed, the official Sentinel Hub `maxCloudCoverage` parameter in `dataFilter` is supported.

### 9.5 Security, Safety & Resilience
- **Zero Secrets Leakage:** Client secret, access token, and Authorization headers are masked and never present in error messages, API responses, or logs.
- **Automated Mocked Tests:** All unit and integration test suites run against mocked HTTP clients and live PostgreSQL/PostGIS, remaining 100% green without requiring live Copernicus credentials.
- **Safe Manual Verification:** Provided `backend/scripts/verifyCopernicusLive.ts` (`npm run verify:copernicus`) enables developers to test against the live Copernicus Data Space Ecosystem securely when credentials are provided in `.env`.

---

## 10. Stage 7.2-C: B04/B08 & NDVI Processing Engine

### 10.1 Pure Processing Layer (`NdviProcessorService`)
Stage 7.2-C provides a deterministic, pure calculation engine that decouples spectral evaluation from network transport and database storage:
- **Location:** `backend/src/services/ndviProcessor.service.ts`
- **Responsibilities:**
  - Evaluates B04 (Red) and B08 (NIR) band reflectance arrays.
  - Applies pixel-level data masking via Sentinel-2 `dataMask`.
  - Calculates farm-scale aggregate statistics: `meanNdvi`, `minNdvi`, `maxNdvi`, and `validPixelPercentage`.
  - Enforces mathematical boundaries $[-1.0, 1.0]$ and detects division by zero ($B08 + B04 = 0$).
  - Distinguishes usable observations (`status: "VALID"`) from non-usable observations (`status: "NO_DATA"`).
  - Strictly rejects fabricating synthetic approximations from separate band means.

---

## 11. Stage 7.2-D: Database Persistence & Idempotent Satellite Sync

### 11.1 Zero Schema Modifications Invariant
> [!IMPORTANT]
> **Stage 7.2-D required zero Prisma schema changes and zero database migrations.**
> All required tables (`satellite_observations`, `ndvi_observations`), columns, data types, indexes, and unique constraints were already established in Stage 7.1 migrations `20260927184103_add_satellite_ndvi_observations` and `20260929193810_make_satellite_cloud_coverage_nullable`.

### 11.2 Existing Database Constraints & Indexes
1. **`satellite_observations`:**
   - `@@unique([farmId, productId], name: "farm_satellite_product_unique")`
   - `@@unique([farmId, observedAt], name: "farm_satellite_observation_unique")`
   - `@@index([farmId, observedAt(sort: Desc)])`
   - `@@index([productId])`
2. **`ndvi_observations`:**
   - `@@unique([satelliteObservationId])` (enforces strict 1-to-1 linkage)
   - `@@unique([farmId, observedAt], name: "farm_ndvi_observation_unique")`
   - `@@index([farmId, observedAt(sort: Desc)])`

### 11.3 Idempotency Mechanism (`farmId + productId`)
Synchronization operations utilize the composite unique constraint `farm_satellite_product_unique: { farmId, productId }` as the authoritative upsert key:
- **First Ingestion:** Creates both the `SatelliteObservation` record and its linked `NdviObservation` record within an atomic Prisma transaction.
- **Repeat Synchronization:** Updates existing observations with fresh statistics (e.g., recomputed aggregate metrics or cloud coverage) without creating duplicate rows or altering the primary key UUID.
- **Multi-granule Overpasses:** If two distinct satellite products occur at the same timestamp (e.g., overlapping orbits or re-evaluations), `(farmId, observedAt)` provides defense-in-depth against duplicate time-series charting entries.

### 11.4 Strict 1:1 Relationship (`satelliteObservationId`)
- Every `NdviObservation` references exactly one parent `SatelliteObservation` via `satelliteObservationId`.
- The `satelliteObservationId` column carries a unique constraint (`@@unique([satelliteObservationId])`), preventing orphaned or multiply-linked NDVI calculations.
- Deleting a parent `SatelliteObservation` or `Farm` cleanly cascades via foreign key constraints (`ON DELETE CASCADE`), ensuring database referential integrity.

### 11.5 Transactional Batch Persistence (`prisma.$transaction`)
All batch operations in `SatelliteRepository.upsertMany` execute inside an interactive PostgreSQL transaction:
```typescript
await prisma.$transaction(async (tx) => {
  for (const item of observations) {
    const satelliteRecord = await tx.satelliteObservation.upsert({ ... });
    await tx.ndviObservation.upsert({
      where: { satelliteObservationId: satelliteRecord.id },
      ...
    });
  }
});
```
- **Atomicity:** If any individual upsert violates database constraints (e.g., column length, invalid foreign key), the entire transaction rolls back completely. Zero partial satellite or NDVI rows are persisted.

### 11.6 NO_DATA Handling Policy & Invariants
Database columns `meanNdvi`, `minNdvi`, `maxNdvi`, and `validPixelPercentage` are defined as `NOT NULL`. Attempting to persist null values violates database constraints.
To preserve integrity without fabricating synthetic values:
1. **Detection:** Observations with `status = "NO_DATA"`, `validPixelCount = 0`, or missing/null NDVI statistics are identified via `isNoDataObservation`.
2. **Persistence Filtering:** `SatelliteService.persistBatch` filters out NO_DATA observations before database transaction dispatch.
3. **Audit Metric:** Filtered records increment `skippedNoDataCount` in `SatelliteSyncResultDTO`:
   ```typescript
   export interface SatelliteSyncResultDTO {
     farmId: string;
     syncedCount: number;
     skippedNoDataCount: number;
     totalFetched: number;
     observations: NdviObservationResponseDTO[];
   }
   ```
4. **Single Observation Ingestion:** `SatelliteService.persistNormalizedObservation` strictly rejects single NO_DATA observations with `400 Bad Request` rather than inserting corrupt records.
5. **No Synthetic Values:** No fake zero or interpolated NDVI values are ever fabricated. Observations without valid pixels are safely omitted from database storage.

---

## 12. Stage 7.2-E: REST API Layer

### 12.1 Architecture & Route Hierarchy
Stage 7.2-E exposes satellite synchronization and NDVI query capabilities through RESTful HTTP endpoints conforming to AgriShield's clean architecture conventions:
```
Express Router (satellite.routes.ts)
        ↓
Validation Middlewares (validateParams, validateBody, validateQuery)
        ↓
SatelliteController (thin orchestrator)
        ↓
SatelliteService (domain business logic & boundary resolution)
        ↓
SatelliteRepository / CopernicusSatelliteProvider
        ↓
PostgreSQL 16 + PostGIS / Copernicus Data Space Ecosystem
```

Mounted within `backend/src/routes/v1/farm.routes.ts` alongside existing farm sub-resources:
- `/api/v1/farms/:farmId/boundary` $\to$ `farmBoundaryRoutes`
- `/api/v1/farms/:farmId/weather` $\to$ `weatherRoutes`
- `/api/v1/farms/:farmId/risk-assessments` $\to$ `farmRiskRoutes`
- `/api/v1/farms/:farmId/satellite` $\to$ `satelliteRoutes` (`Router({ mergeParams: true })`)

### 12.2 Endpoints Specification

#### 1. Synchronize Satellite Observations
- **HTTP Method:** `POST`
- **Route:** `/api/v1/farms/:farmId/satellite/sync`
- **Path Parameters:**
  - `farmId` (UUID v4, required): Verified via `farmIdParamForSatelliteSchema`.
- **Request Body (JSON):**
  ```json
  {
    "from": "2026-09-01T00:00:00.000Z",
    "to": "2026-09-30T00:00:00.000Z",
    "maxCloudCoverage": 80.0
  }
  ```
  - `from` (string, ISO-8601, required): Observation window start.
  - `to` (string, ISO-8601, required): Observation window end.
  - `maxCloudCoverage` (number, 0.0–100.0, optional): Scene-level cloudiness filter.
  - Validation Rules: `from <= to`, `to <= now (+ 5 min clock skew)`.
- **Response Status:** `200 OK`
- **Response Payload:** `ApiResponse.success(SatelliteSyncResultDTO)`:
  ```json
  {
    "success": true,
    "message": "Satellite data synchronized successfully",
    "data": {
      "farmId": "...",
      "syncedCount": 2,
      "skippedNoDataCount": 1,
      "totalFetched": 3,
      "observations": [ ... ]
    },
    "timestamp": "...",
    "correlationId": "..."
  }
  ```

#### 2. Get Latest NDVI Observation
- **HTTP Method:** `GET`
- **Route:** `/api/v1/farms/:farmId/satellite/latest`
- **Path Parameters:**
  - `farmId` (UUID v4, required)
- **Response Status:** `200 OK` (or `404 Not Found` if farm has no observations, matching Weather & Risk APIs).
- **Response Payload:** `ApiResponse.success(NdviObservationResponseDTO)`.

#### 3. Get Historical NDVI Observations
- **HTTP Method:** `GET`
- **Route:** `/api/v1/farms/:farmId/satellite`
- **Query Parameters:**
  - `from` (string, ISO-8601, optional)
  - `to` (string, ISO-8601, optional)
  - `limit` (positive integer, optional, default: 100)
- **Ordering:** Strictly chronologically ascending (`observedAt ASC`).
- **Response Status:** `200 OK`.
- **Response Payload:** `ApiResponse.success(NdviObservationResponseDTO[])`.

### 12.3 Error Mapping
Errors pass through `next(error)` to `backend/src/middleware/error.middleware.ts`:
- **Invalid UUID in `farmId`:** HTTP 400 (`Validation failed`).
- **Invalid date format or `from > to` or future `to`:** HTTP 400 (`Validation failed`).
- **Farm does not exist:** HTTP 404 (`Farm with ID ... not found.`).
- **Farm has no boundary:** HTTP 404 (`Farm boundary not found for farm ID ... . Satellite processing requires an authoritative spatial polygon.`).
- **Farm has no observations (on `/latest`):** HTTP 404 (`No satellite NDVI observations found for farm '...'`).
- **Malformed boundary GeoJSON:** HTTP 400 (`Malformed farm boundary GeoJSON stored for farm.`).
- **Copernicus provider failure / timeout:** Mapped cleanly to HTTP 401, 429, or 503 without secret leakage.
- **Database constraint failure:** Handled transactionally with full rollback.



