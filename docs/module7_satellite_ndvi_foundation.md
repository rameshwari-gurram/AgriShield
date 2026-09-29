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

- **Unit Tests:** 69/69 passed (NDVI formulas, zero denominator, range checks, non-clamping, cloud/pixel percentage bounds, nullable cloud coverage, DTO normalization, provider abstraction).
- **Database Integration Tests:** 56/56 passed (Live PostgreSQL + PostGIS, foreign key cascades, uniqueness constraints, 4-decimal precision, null cloud coverage persistence and DTO formatting, transaction rollback, service orchestration).
- **Module 6 Regression Tests:** 100% unaffected and passing (Weather integration, Risk rule engine, Risk assessment, Portfolio alerts).
