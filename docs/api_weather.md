# AgriShield Parametric - Module 5 Weather API Specification

## 1. Overview & Disclaimer

This document defines the REST API endpoints for Module 5 (Weather Data Integration).

> **Weather Data Disclaimer & Traceability:**
> Stores the centroid coordinates used for the weather query, preserving query-location traceability.
> Model-derived weather data for the farm centroid coordinates. Not an on-site physical weather-station measurement.
> Weather observations are attributed to **Open-Meteo**.

---

## 2. Endpoints Summary

| Method | Endpoint | Description | Provider Calls |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/farms/:farmId/weather/sync` | Synchronize weather (initial 24h backfill or subsequent current observation) | Open-Meteo Current (+ Hourly on 1st sync) |
| `GET` | `/api/v1/farms/:farmId/weather/latest` | Retrieve newest persisted observation for farm | **None** (PostgreSQL-only) |
| `GET` | `/api/v1/farms/:farmId/weather` | Query historical weather observations for farm within time window | **None** (PostgreSQL-only) |

---

## 3. Endpoint Specifications

### 3.1 Synchronize Weather Data
- **Route**: `POST /api/v1/farms/:farmId/weather/sync`
- **Purpose**: Fetches real-time weather from Open-Meteo using the farm boundary centroid coordinates and persists the observations into PostgreSQL.
  - **First synchronization (`existingCount === 0`)**: Fetches current weather and preceding 24 hours of hourly observations. Atomically persists all observations within a Prisma `$transaction`. Returns `isInitialBackfill: true` and the count of unique synced records.
  - **Subsequent synchronization (`existingCount > 0`)**: Fetches only the current weather observation, performs an idempotent upsert, and returns `isInitialBackfill: false` and `recordsSynced: 1`.
- **Path Parameters**:
  - `farmId` (`string`, required, UUID): The unique identifier of the farm.
- **Request Body**: None.
- **Response Format** (`HTTP 200 OK`):
```json
{
  "success": true,
  "message": "Weather data synchronized successfully",
  "data": {
    "synced": true,
    "isInitialBackfill": true,
    "recordsSynced": 25,
    "source": "Open-Meteo",
    "record": {
      "id": "c1f728fa-9b4e-4f1b-8012-a89b88cf2351",
      "farmId": "ed0322af-5c8c-4061-b292-9497a1f8b920",
      "observedAt": "2026-09-22T10:00:00.000Z",
      "latitude": 18.5204,
      "longitude": 73.8567,
      "temperatureC": 29.8,
      "humidityPercent": 58.0,
      "rainfallMm": 0.0,
      "windSpeedKmh": 11.5,
      "windGustKmh": 16.0,
      "weatherCode": 0,
      "weatherDescription": "Clear sky",
      "source": "Open-Meteo",
      "createdAt": "2026-09-22T10:00:05.123Z"
    }
  },
  "timestamp": "2026-09-22T10:00:05.150Z",
  "correlationId": "req-1790065417408-13ni4"
}
```
- **Error Responses**:
  - `HTTP 400 Bad Request`: Invalid `farmId` UUID format.
  - `HTTP 404 Not Found`: Farm does not exist or farm has no registered boundary.
  - `HTTP 429 Too Many Requests`: Open-Meteo rate limit exceeded.
  - `HTTP 502 Bad Gateway`: Open-Meteo returned invalid/unexpected payload format.
  - `HTTP 503 Service Unavailable`: Open-Meteo service unreachable or network timeout.

---

### 3.2 Retrieve Latest Weather Observation
- **Route**: `GET /api/v1/farms/:farmId/weather/latest`
- **Purpose**: Reads PostgreSQL for the newest persisted weather record for the farm parcel.
- **Provider Call Isolation**: **Zero external provider calls.** This endpoint reads purely from PostgreSQL.
- **Path Parameters**:
  - `farmId` (`string`, required, UUID): The unique identifier of the farm.
- **Response Format** (`HTTP 200 OK`):
```json
{
  "success": true,
  "message": "Latest weather retrieved successfully",
  "data": {
    "id": "c1f728fa-9b4e-4f1b-8012-a89b88cf2351",
    "farmId": "ed0322af-5c8c-4061-b292-9497a1f8b920",
    "observedAt": "2026-09-22T11:00:00.000Z",
    "latitude": 18.5204,
    "longitude": 73.8567,
    "temperatureC": 31.5,
    "humidityPercent": 52.0,
    "rainfallMm": 0.0,
    "windSpeedKmh": 14.0,
    "windGustKmh": 20.0,
    "weatherCode": 1,
    "weatherDescription": "Mainly clear",
    "source": "Open-Meteo",
    "createdAt": "2026-09-22T11:00:02.456Z"
  },
  "timestamp": "2026-09-22T11:00:03.000Z"
}
```
- **Error Responses**:
  - `HTTP 400 Bad Request`: Invalid `farmId` UUID format.
  - `HTTP 404 Not Found`: Farm does not exist OR no weather records have been synchronized yet.

---

### 3.3 Query Historical Weather Observations
- **Route**: `GET /api/v1/farms/:farmId/weather?from=...&to=...&limit=...`
- **Purpose**: Reads PostgreSQL for historical weather observations recorded for the farm within the specified time window.
- **Provider Call Isolation**: **Zero external provider calls.** This endpoint reads purely from PostgreSQL.
- **Sorting**: Strictly ordered chronologically ascending (`observedAt ASC`) for time-series charts.
- **Path Parameters**:
  - `farmId` (`string`, required, UUID): The unique identifier of the farm.
- **Query Parameters**:
  - `from` (`string`, required, ISO-8601): Start timestamp of the window (e.g. `2026-09-21T00:00:00Z` or `2026-09-21`).
  - `to` (`string`, required, ISO-8601): End timestamp of the window (e.g. `2026-09-22T23:59:59Z`). Must be `>= from`.
  - `limit` (`integer`, optional, default 100): Maximum records to retrieve.
- **Response Format** (`HTTP 200 OK`):
```json
{
  "success": true,
  "message": "Historical weather retrieved successfully",
  "data": [
    {
      "id": "52063812-4c91-4e4f-b67e-2cf0b62e49c1",
      "farmId": "ed0322af-5c8c-4061-b292-9497a1f8b920",
      "observedAt": "2026-09-21T10:00:00.000Z",
      "latitude": 18.5204,
      "longitude": 73.8567,
      "temperatureC": 24.0,
      "humidityPercent": 70.0,
      "rainfallMm": 2.5,
      "windSpeedKmh": 10.0,
      "windGustKmh": 15.0,
      "weatherCode": 0,
      "weatherDescription": "Clear sky",
      "source": "Open-Meteo",
      "createdAt": "2026-09-22T10:00:05.123Z"
    }
  ],
  "timestamp": "2026-09-22T11:05:00.000Z"
}
```
- **Error Responses**:
  - `HTTP 400 Bad Request`:
    - Missing `from` or `to` parameter
    - Invalid ISO-8601 date string for `from` or `to`
    - Date range inverted (`from > to`)
    - Invalid `farmId` UUID format
  - `HTTP 404 Not Found`: Farm does not exist.
