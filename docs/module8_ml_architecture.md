# Module 8: Machine Learning Risk Prediction & Explainability

## Stage 8.1: ML Architecture & Data Contract Specification

---

## 1. Module 8 Objective

The objective of **Module 8** is to augment AgriShield's parametric crop insurance platform with **predictive, multi-factor crop risk assessment and explainable machine learning (ML)** capabilities.

While Module 6 provides deterministic, rule-based parametric evaluations against statutory weather thresholds (e.g., IMD rainfall bands), Module 8 evaluates the non-linear, interacting effects of:
- **Agronomic Farm Profile** (Crop species, crop age, farm acreage, location)
- **Multi-Day Weather Telemetry** (Cumulative rainfall, dry spells, temperature extremes, wind dynamics)
- **Earth Observation Remote Sensing** (Sentinel-2 NDVI vegetation health indices, recent vegetation trends)

Module 8 produces a continuous **risk score** ($[0.0, 1.0]$), a categorized **risk class** (`LOW`, `MEDIUM`, `HIGH`), and **local feature attributions via SHAP (SHapley Additive exPlanations)** to ensure complete algorithmic transparency for farmers, underwriters, and claims auditors.

---

## 2. Existing Data Sources

AgriShield's existing relational database (PostgreSQL 16 with PostGIS) and external provider integrations supply the foundational telemetry for Module 8 feature extraction.

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│     Module 3 & 4        │     │        Module 5         │     │        Module 7         │
│     Farm & Boundary     │     │    Weather Telemetry    │     │   Satellite & NDVI      │
├─────────────────────────┤     ├─────────────────────────┤     ├─────────────────────────┤
│ • cropName              │     │ • temperatureC          │     │ • meanNdvi              │
│ • cropVariety           │     │ • humidityPercent       │     │ • minNdvi               │
│ • sowingDate            │     │ • rainfallMm            │     │ • maxNdvi               │
│ • expectedHarvestDate   │     │ • windSpeedKmh          │     │ • validPixelPercentage  │
│ • farmArea & Unit       │     │ • windGustKmh           │     │ • cloudCoverage         │
│ • state & district      │     │ • weatherCode           │     │ • observedAt            │
│ • centroid Lat / Lon    │     │ • observedAt (hourly)   │     │ • S2MSI2A / Sentinel-2  │
└────────────┬────────────┘     └────────────┬────────────┘     └────────────┬────────────┘
             │                               │                               │
             └───────────────────────┬───────┴───────────────────────────────┘
                                     ↓
                      ┌─────────────────────────────┐
                      │    Feature Engineering      │
                      │       (Node.js / Express)   │
                      └──────────────┬──────────────┘
                                     ↓
                      ┌─────────────────────────────┐
                      │    ML Microservice API      │
                      │    (Python 3.11 / FastAPI)  │
                      └─────────────────────────────┘
```

### Verified Available Fields:
1. **Farm (`farms` & `farm_boundaries` tables):**
   - `id`: UUID (Primary key)
   - `cropName`: VarChar(100) (e.g., Soybean, Cotton, Wheat, Rice)
   - `cropVariety`: VarChar(100) (Optional / Nullable)
   - `sowingDate`: Date (Mandatory sowing timestamp)
   - `expectedHarvestDate`: Date (Optional harvest timestamp)
   - `farmArea`: Decimal(10, 2)
   - `farmAreaUnit`: Enum (`ACRE`, `HECTARE`, `GUNTHA`, `BIGHA`)
   - `state`: VarChar(100)
   - `district`: VarChar(100)
   - `centroidLatitude`: Decimal(9, 6) (WGS84 EPSG:4326)
   - `centroidLongitude`: Decimal(9, 6) (WGS84 EPSG:4326)
   - `calculatedAreaHectares`: Decimal(10, 4) (Authoritative spatial polygon area)
   - *Not Available:* Soil chemical type, fertilizer inputs, irrigation system type (rainfed/drip), elevation, historical farm-level yields.

2. **Weather Records (`weather_records` table):**
   - `observedAt`: Timestamptz(6) (Hourly UTC interval)
   - `temperatureC`: Decimal(5, 2) (°C)
   - `humidityPercent`: Decimal(5, 2) (Relative humidity %)
   - `rainfallMm`: Decimal(7, 2) (Precipitation mm)
   - `windSpeedKmh`: Decimal(6, 2) (Sustained wind speed km/h)
   - `windGustKmh`: Decimal(6, 2) (Peak wind gust km/h)
   - `weatherCode`: Integer (WMO standard weather code)
   - `source`: VarChar(50) (e.g., "Open-Meteo")

3. **Satellite Remote Sensing (`satellite_observations` & `ndvi_observations` tables):**
   - `observedAt`: Timestamptz(6) (Daily aggregation interval UTC)
   - `meanNdvi`: Decimal(5, 4) (Mean NDVI across valid parcel pixels, $[-1.0000, 1.0000]$)
   - `minNdvi`: Decimal(5, 4) (Minimum pixel NDVI within parcel)
   - `maxNdvi`: Decimal(5, 4) (Maximum pixel NDVI within parcel)
   - `validPixelPercentage`: Decimal(5, 2) ($[0.00, 100.00]\%$)
   - `cloudCoverage`: Decimal(5, 2) (Nullable scene cloud cover %)
   - `provider`: VarChar(50) ("Copernicus Data Space Ecosystem")
   - `satellite`: VarChar(50) ("Sentinel-2")
   - `productType`: VarChar(50) ("S2MSI2A")
   - `productId`: VarChar(150) (Deterministic aggregation ID or granule ID)

---

## 3. Module 6 vs. Module 8 Responsibilities

A foundational design requirement of AgriShield is maintaining strict separation between **deterministic contractual rule evaluation** and **statistical predictive ML scoring**:

| Dimension | Module 6: Climate Risk Rule Engine | Module 8: Machine Learning Risk Engine |
| :--- | :--- | :--- |
| **Paradigm** | Deterministic, symbolic, rule-based | Statistical, inductive, machine learning |
| **Contractual Role** | Official parametric insurance trigger evaluation | Predictive crop stress & loss likelihood estimation |
| **Input Focus** | Acute weather threshold breaches (24h/3h) | Multi-factor agronomic, weather, and NDVI interaction |
| **Output Type** | Discrete status (`TRIGGERED`, `NOT_TRIGGERED`) & Categorical `RiskLevel` | Continuous probability score $[0.0, 1.0]$ & `RiskClass` |
| **Provenance** | Statutory (e.g., IMD rainfall guidelines) | Statistical training weights & feature interactions |
| **Explainability** | Direct threshold comparison (e.g., $130\text{mm} \ge 115.6\text{mm}$) | Local Shapley attribution values (SHAP) |
| **Payout Eligibility** | Can directly drive legal claim settlement | Informational / Underwriting decision support only |

> [!IMPORTANT]
> Module 8 does **NOT** replace Module 6. Both systems operate in parallel. Module 6 remains the authoritative parametric claim trigger, while Module 8 provides forward-looking risk advisory and underwriting risk scoring.

---

## 4. ML Service Architecture & Call Flow

AgriShield adopts an asynchronous, decoupled microservice pattern:

```text
React Frontend (Vite)
       ↓  (HTTPS REST)
Express Gateway / Backend (Node.js / TypeScript)
       ├── 1. Fetches Farm + Boundary + Weather + Satellite records from PostgreSQL
       ├── 2. Executes Feature Engineering Service (deterministic window aggregations)
       ├── 3. Validates Feature Vector Schema via Zod
       ↓  (Internal HTTP POST /predict)
FastAPI ML Microservice (Python 3.11 / Uvicorn)
       ├── 1. Validates Request Payload via Pydantic
       ├── 2. Runs Model Inference (Scikit-Learn / Gradient Boosting)
       ├── 3. Computes SHAP Explanation (TreeExplainer)
       ↓  (JSON Prediction + SHAP DTO)
Express Gateway / Backend
       ├── Translates and caches prediction result
       ↓
React Frontend (Dashboard, Risk Alert, Audit Modal)
```

### Architectural Principles:
1. **Single Entry Gateway:** The frontend never communicates directly with the Python ML service. All requests pass through the authenticated Express API gateway.
2. **Deterministic Feature Engineering:** Temporal window calculations (sums, rolling averages, trends) occur in a dedicated backend feature engineering service before dispatch to the ML container, ensuring reproducibility across training and inference.
3. **Stateless ML Container:** The Python service loads trained model weights and pre-fitted explainers at startup and operates purely as a stateless inference worker.

---

## 5. Machine Learning Feature Contract

The proposed feature vector consists of **15 core features** derived from verified database telemetry:

| Feature Identifier | Category | Source Table | Data Type | Physical Unit | Expected Range | Nullable? |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| `crop_type` | Agronomic | `farms.cropName` | Categorical (String) | N/A | Soybean, Cotton, Wheat, Rice, etc. | No |
| `crop_age_days` | Agronomic | `farms.sowingDate` | Integer | Days | $[0, 365]$ | No |
| `farm_area_hectares` | Agronomic | `farm_boundaries` | Float | Hectares (ha) | $[0.01, 1000.0]$ | No |
| `rainfall_24h_sum` | Weather (Acute) | `weather_records` | Float | Millimeters (mm) | $[0.0, 500.0]$ | No |
| `rainfall_7d_sum` | Weather (Short) | `weather_records` | Float | Millimeters (mm) | $[0.0, 1000.0]$ | No |
| `rainfall_14d_sum` | Weather (Medium) | `weather_records` | Float | Millimeters (mm) | $[0.0, 1500.0]$ | No |
| `dry_days_count_14d` | Weather (Drought) | `weather_records` | Integer | Days | $[0, 14]$ | No |
| `temperature_max_24h` | Weather (Heat) | `weather_records` | Float | Celsius (°C) | $[-10.0, 55.0]$ | No |
| `temperature_mean_7d` | Weather (Heat) | `weather_records` | Float | Celsius (°C) | $[-5.0, 50.0]$ | No |
| `humidity_mean_7d` | Weather (Moisture) | `weather_records` | Float | Percentage (%) | $[0.0, 100.0]$ | No |
| `wind_gust_max_24h` | Weather (Wind) | `weather_records` | Float | km/h | $[0.0, 180.0]$ | No |
| `ndvi_latest_mean` | Remote Sensing | `ndvi_observations` | Float | Ratio | $[-1.0000, 1.0000]$ | No |
| `ndvi_trend_14d` | Remote Sensing | `ndvi_observations` | Float | Delta Ratio | $[-1.0000, 1.0000]$ | Yes (Default: 0.0) |
| `valid_pixel_pct_latest`| Remote Sensing | `ndvi_observations` | Float | Percentage (%) | $[0.00, 100.00]$ | No |
| `days_since_last_ndvi` | Remote Sensing | `ndvi_observations` | Integer | Days | $[0, 60]$ | No |

---

## 6. Derived Feature Definitions & Formulas

All derived features must be computed deterministically using standard mathematical formulations:

### 1. `crop_age_days`
* **Formula:** $\text{crop\_age\_days} = \lfloor (\text{assessment\_date} - \text{sowing\_date}) / 86400000 \rfloor$
* **Source:** `farms.sowingDate` vs UTC assessment timestamp.
* **Constraints:** Must be $\ge 0$. If negative (sowing date in future), reject with `400 Bad Request`.

### 2. `farm_area_hectares`
* **Formula:** If `farm_boundaries.calculatedAreaHectares` is present, use it directly. Otherwise, convert `farms.farmArea` using authoritative conversion constants:
  - $\text{ACRE} \times 0.404686$
  - $\text{HECTARE} \times 1.0$
  - $\text{GUNTHA} \times 0.010117$
  - $\text{BIGHA} \times 0.25$ (standardized)

### 3. `rainfall_24h_sum`, `rainfall_7d_sum`, `rainfall_14d_sum`
* **Formula:** $\sum_{t \in W} \text{rainfallMm}_t$
* **Windows:**
  - $W_{24h} = (T - 24\text{h}, T]$
  - $W_{7d} = (T - 7\text{d}, T]$
  - $W_{14d} = (T - 14\text{d}, T]$
* **Invariant:** Sum of precipitation, **never** an average. Missing hours must not be fabricated.

### 4. `dry_days_count_14d`
* **Formula:** Count of 24-hour daily calendar intervals in $(T - 14\text{d}, T]$ where $\sum_{h=0}^{23} \text{rainfallMm}_h < 1.0\text{ mm}$.
* **Significance:** Standard meteorological metric for agricultural dry spells and early drought onset.

### 5. `temperature_max_24h` & `temperature_mean_7d`
* **Formulas:**
  - $\text{temperature\_max\_24h} = \max_{t \in W_{24h}} \text{temperatureC}_t$
  - $\text{temperature\_mean\_7d} = \frac{1}{|W_{7d}|} \sum_{t \in W_{7d}} \text{temperatureC}_t$

### 6. `ndvi_latest_mean` & `ndvi_trend_14d`
* **Formulas:**
  - $\text{ndvi\_latest\_mean} = \text{meanNdvi of newest observation}$
  - $\text{ndvi\_trend\_14d} = \text{ndvi\_latest\_mean} - \text{ndvi\_previous\_mean}$
* **Time Constraint:** `ndvi_previous_mean` is the newest valid observation occurring prior to the latest observation within a $[5, 20]$ day lookback window.
* **Interpretation:** Negative trend ($\Delta < -0.10$) indicates rapid canopy loss, crop desiccation, or pest damage. Positive trend indicates vegetative growth.

---

## 7. Missing Data & Imputation Policy

Missing telemetry is an inevitable operational reality in satellite and weather observation. AgriShield enforces a strict, explicit policy:

| Telemetry Condition | Status | Handling Policy |
| :--- | :--- | :--- |
| **No Weather Records** | Fatal | Reject inference with `422 Unprocessable Entity` (`INSUFFICIENT_WEATHER_DATA`). Never synthesize 0°C or 0mm. |
| **Incomplete 7-Day Weather** | Tolerated if $\ge 70\%$ | If $> 70\%$ of hourly records are present, aggregate available hours and scale sum proportionally; if $< 70\%$, reject. |
| **No Satellite Observations** | Tolerated with Fallback | Use crop-stage median baseline for `ndvi_latest_mean` (e.g. 0.45) and set `days_since_last_ndvi = 30`, `ndvi_trend_14d = 0.0`. Set boolean indicator `ndvi_imputed = true`. |
| **Single Satellite Observation** | Normal | `ndvi_latest_mean` is populated from the single observation; `ndvi_trend_14d` defaults to `0.0`. Set indicator `ndvi_trend_imputed = true`. |
| **Null Cloud Coverage** | Normal | Permitted in database; not an input feature. Quality is guarded by `valid_pixel_pct_latest`. |
| **Zero Denominator / NaN** | Fatal | Reject data at database ingestion layer (as enforced in Module 7). |
| **Future Sowing Date** | Fatal | Reject with `400 Bad Request`. |

> [!CAUTION]
> Under no circumstances may missing weather or satellite observations be silently zero-filled without logging and flag attribution. Silent zero-filling corrupts model inferences and biases SHAP explanations.

---

## 8. Time Window Strategy

The selected time windows reflect physical and agronomic processes:
- **24 Hours ($W_{24h}$):** Captures acute shock events — cloudbursts, severe thunderstorms, extreme heat spikes, or gale gusts.
- **7 Days ($W_{7d}$):** Captures short-term cumulative stress — sustained heatwaves, waterlogging, or persistent cloudy overcast suppressing photosynthesis.
- **14 Days ($W_{14d}$):** Aligns directly with Sentinel-2 orbital revisit dynamics (2–3 observations per fortnight) and agricultural dry spell criteria.
- **30 Days ($W_{30d}$):** Provides seasonal moisture deficit context for persistent drought identification.

---

## 9. Training Target / Ground Truth Label Status

> [!IMPORTANT]
> **No verified real-world supervised ML target currently exists in the repository.**

An exhaustive audit of the database schema (`backend/prisma/schema.prisma`) and documentation confirms that AgriShield currently has:
- No historical insurance claim records
- No verified ground damage assessments
- No measured crop yield loss records
- No historical payout settlement logs

### Future Training Target Strategies:
To train an initial model in Module 8.2/8.3, one of three strategies must be adopted:
1. **Strategy A (Public Agronomic Benchmark Dataset):** Utilize external open-access agronomic datasets (e.g., CGIAR crop stress datasets, NASA Harvest crop yield benchmarks).
2. **Strategy B (Synthetic Agronomic Domain Simulation):** Generate a transparently labeled, physiologically realistic synthetic dataset based on agronomic crop water balance models (e.g., FAO-56 Penman-Monteith water stress coefficients).
3. **Strategy C (Semi-Supervised / Anomaly Scoring):** Train unsupervised anomaly detection (e.g., Isolation Forest) against historical weather and NDVI baselines.

*For Module 8.1, the target variable is formally specified as:*
`target_crop_loss`: Binary label ($0 = \text{Normal Yield / Minimal Loss}$, $1 = \text{Severe Crop Stress / Loss} > 30\%$).

---

## 10. ML Output Contract

The FastAPI ML service exposes `POST /predict` returning a typed Pydantic / JSON schema:

```json
{
  "success": true,
  "data": {
    "riskScore": 0.7425,
    "riskClass": "HIGH",
    "confidence": 0.88,
    "predictionTimestamp": "2026-10-01T02:45:00.000Z",
    "modelMetadata": {
      "modelName": "agrishield-crop-risk-predictor",
      "modelVersion": "1.0.0",
      "algorithm": "XGBoostClassifier",
      "featureSchemaVersion": "v1.0"
    },
    "shapExplanation": [
      {
        "feature": "rainfall_14d_sum",
        "featureValue": 12.4,
        "contribution": 0.285,
        "direction": "increases_risk",
        "description": "Severe 14-day rainfall deficit (12.4mm) strongly increases crop risk"
      },
      {
        "feature": "ndvi_latest_mean",
        "featureValue": 0.2812,
        "contribution": 0.194,
        "direction": "increases_risk",
        "description": "Low vegetation index (NDVI 0.28) indicates diminished canopy health"
      },
      {
        "feature": "crop_age_days",
        "featureValue": 65,
        "contribution": -0.052,
        "direction": "decreases_risk",
        "description": "Crop is in vegetative/flowering stage with established root structure"
      }
    ]
  }
}
```

---

## 11. Risk Classification Methodology

The continuous risk score $\hat{y} \in [0.0, 1.0]$ maps to categorical risk tiers:
- **`LOW` Risk:** Normal vegetative development and favorable moisture.
- **`MEDIUM` Risk:** Moderate environmental stress; monitor closely.
- **`HIGH` Risk:** Critical moisture deficit, excessive waterlogging, or severe vegetation decline.

> [!NOTE]
> Final threshold boundaries (e.g., $0.35$ and $0.70$) must **not** be chosen arbitrarily. In Stage 8.3, thresholds will be calibrated using ROC-AUC operating characteristic curves, Precision-Recall tradeoffs, and expected payout cost curves.

---

## 12. Explainability Contract (SHAP)

To prevent "black-box" model opacity in insurance risk estimation, Module 8 mandates feature attribution for every prediction using **SHAP (SHapley Additive exPlanations)** based on cooperative game theory:

$$\hat{y}(x) = \phi_0 + \sum_{j=1}^{M} \phi_j(x)$$

Where:
- $\phi_0$ is the base expected model score across the reference dataset.
- $\phi_j(x)$ is the Shapley contribution of feature $j$ to the prediction for instance $x$.

### Contract Invariants:
1. **Additivity Check:** $\sum_{j=1}^{M} \phi_j(x) = \hat{y}(x) - \phi_0$ must hold within numerical tolerance ($10^{-5}$).
2. **Top-$K$ Feature Reporting:** The API extracts and sorts features by $|\phi_j|$, returning the top 5 most impactful drivers.
3. **Semantic Direction:**
   - $\phi_j > 0 \implies$ `"increases_risk"`
   - $\phi_j < 0 \implies$ `"decreases_risk"`
4. **Attribution Caveat:** SHAP values represent statistical feature importance inside the mathematical model; they do **not** constitute biological proof of in-situ crop damage.

---

## 13. Model Versioning & Provenance

To satisfy insurance audit and compliance requirements, model artifacts must carry immutable metadata:

```json
{
  "modelName": "agrishield-crop-risk-predictor",
  "modelVersion": "1.0.0",
  "trainedAt": "2026-10-01T00:00:00Z",
  "algorithm": "XGBoostClassifier",
  "hyperparameters": {
    "n_estimators": 100,
    "max_depth": 4,
    "learning_rate": 0.05
  },
  "metrics": {
    "accuracy": 0.892,
    "f1Score": 0.875,
    "rocAuc": 0.941
  },
  "trainingDatasetVersion": "synthetic-crop-risk-v1.0",
  "featureSchemaVersion": "v1.0"
}
```

---

## 14. Roadmap: Module 8 Stages

- **Stage 8.1 (Current):** ML Architecture & Data Contract Specification.
- **Stage 8.2:** Backend Feature Engineering Service (Node.js/Express) & FastAPI Python ML Service Scaffold.
- **Stage 8.3:** Benchmark Dataset Preparation, Model Training (XGBoost / Random Forest), and Evaluation.
- **Stage 8.4:** SHAP TreeExplainer Integration & Local Explanations.
- **Stage 8.5:** Backend REST API Integration (`/api/v1/farms/:farmId/ml-risk`).
- **Stage 8.6:** Frontend UI Presentation (Risk score gauges, SHAP waterfall/bar charts, audit breakdown).

---

## 15. Operational & Legal Limitations

> [!CAUTION]
> The following limitations are foundational and must be preserved across all AgriShield presentations, APIs, and reports:

1. **Prototype Limitation:** AgriShield is an academic/engineering prototype and research demonstration. It is **not** a licensed financial or insurance underwriting system.
2. **Earth Observation Limitation:** Satellite NDVI is an optical proxy for chlorophyll absorption and green biomass density. It is **not** a direct physical measurement of crop yield, plant disease, or legal damage.
3. **Weather Observation Limitation:** Weather records are numerical model/reanalysis estimates derived from coordinate centroids via Open-Meteo. They do not represent ground-truth measurements from calibrated meteorological stations installed on individual farm parcels.
4. **Boundary Map Limitation:** Farm boundaries are user-drawn geospatial polygons stored in PostGIS for satellite pixel masking. They do **not** constitute legal proof of land title, cadastral ownership, or government revenue boundaries.
5. **Machine Learning Limitation:** An ML prediction is a statistical likelihood based on learned feature associations. It must **never** be interpreted as automatic entitlement to financial compensation or insurance payout.
