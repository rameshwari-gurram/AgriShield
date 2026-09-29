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

- **Satellite Unit Tests:** 69/69 passed (NDVI formulas, zero denominator, range checks, non-clamping, cloud/pixel percentage bounds, nullable cloud coverage, DTO normalization, provider abstraction).
- **Copernicus Auth & HTTP Unit Tests:** 49/49 passed (OAuth2 client credentials, token caching, early refresh, 401 single retry, 429 rate limit, timeout, provider error mapping, credential security).
- **Database Integration Tests:** 56/56 passed (Live PostgreSQL + PostGIS, foreign key cascades, uniqueness constraints, 4-decimal precision, null cloud coverage persistence and DTO formatting, transaction rollback, service orchestration).
- **Module 5 & 6 Regression Tests:** 100% unaffected and passing (Weather provider/service/integration/aggregation, Risk database, Risk rule engine, Risk assessment, Risk API, Risk Stage 6).

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

