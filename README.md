# AgriShield Parametric

> **AI-Assisted Crop-Risk and Parametric Insurance Prototype**  
> *Module 1: Production-Style Scalable Monorepo Architecture*

---

## 1. Project Purpose

**AgriShield Parametric** is an innovative platform engineered to safeguard agricultural producers through AI-assisted crop-stress evaluation and automated parametric insurance. 

Unlike traditional indemnity insurance—which relies on prolonged field damage assessments—parametric insurance executes automatic payouts based on predefined, objective indices (such as severe drought, rainfall anomalies, or verified vegetation stress via satellite NDVI data).

### Planned End-to-End Workflow:
```
Farmer
  │
  ▼
Farmer Registration
  │
  ▼
Farm Registration
  │
  ▼
Farm Verification (Cadastral / Administrative)
  │
  ▼
Farm Boundary / Polygon (Geospatial Mapping)
  │
  ▼
Weather Monitoring (Precipitation, Temperature, Soil Moisture)
  │
  ▼
Satellite / NDVI Monitoring (Vegetation Health Index)
  │
  ▼
AI Crop-Stress Risk Assessment
  │
  ▼
SHAP Explanation (Transparent Factor Attribution)
  │
  ▼
Parametric Rule Engine (Index vs. Policy Thresholds)
  │
  ▼
Claim Generation
  │
  ▼
Simulated Payout Execution
  │
  ▼
Notification (SMS / Webhook)
  │
  ▼
Dashboard Analytics
```

> **Module 1 Scope**: This phase strictly sets up the **production-style scalable monorepo foundation**. No business logic (farmer/farm registration, maps, weather, NDVI, ML models, claims, payouts, notifications) is implemented yet.

---

## 2. High-Level Architecture

```
                    ┌─────────────────────────┐
                    │    React Frontend       │
                    │   (Vite + TypeScript)   │
                    └───────────┬─────────────┘
                                │
                      REST / JSON (HTTP)
                                │
                                ▼
                    ┌─────────────────────────┐
                    │   Node.js Backend API   │
                    │  (Express + TypeScript) │
                    └───────┬──────────┬──────┘
                            │          │
             Prisma / SQL   │          │  REST / JSON (HTTP)
                            ▼          ▼
                 ┌───────────────┐  ┌────────────────────────┐
                 │  PostgreSQL   │  │   Python ML Service    │
                 │   Database    │  │   (FastAPI + Pydantic) │
                 └───────────────┘  └────────────────────────┘
```

---

## 3. Monorepo Folder Structure

```
agriShield/
├── frontend/                     # Web Application (React, Vite, TS, Tailwind CSS)
│   ├── public/                   # Static browser assets
│   ├── src/
│   │   ├── assets/               # Local icons and SVGs
│   │   ├── components/           # Reusable UI components (Navbar, StatusCard, etc.)
│   │   ├── context/              # Global state context
│   │   ├── hooks/                # Custom React hooks (e.g. useHealthCheck)
│   │   ├── layouts/              # Main layout wrappers
│   │   ├── pages/                # Routed views (HomePage, HealthDashboardPage)
│   │   ├── routes/               # Client-side router definition (AppRoutes)
│   │   ├── services/             # Axios API client & backend service bridges
│   │   ├── types/                # TypeScript interface definitions
│   │   ├── utils/                # Constants, helpers, and formatters
│   │   ├── App.tsx               # Root component
│   │   ├── main.tsx              # React DOM entry point
│   │   └── index.css             # Tailwind CSS directives
│   ├── index.html                # Vite HTML shell
│   ├── package.json              # Frontend dependencies
│   ├── postcss.config.js         # PostCSS configuration
│   ├── tailwind.config.js        # Tailwind CSS design system
│   ├── tsconfig.json             # TypeScript configuration
│   └── vite.config.ts            # Vite bundler configuration
│
├── backend/                      # Core REST API (Node.js, Express, TypeScript, Prisma)
│   ├── prisma/
│   │   └── schema.prisma         # Prisma ORM PostgreSQL schema foundation
│   ├── src/
│   │   ├── config/               # Environment (Zod-validated), Winston logger, Prisma client
│   │   ├── controllers/          # Thin HTTP controllers
│   │   ├── middleware/           # Central error handling, 404, request logger, auth placeholder
│   │   ├── repositories/         # Isolated database access layer (Prisma raw SQL ping)
│   │   ├── routes/               # Versioned routes (/api/v1/health)
│   │   ├── services/             # Business logic layer
│   │   ├── types/                # API and domain type definitions
│   │   ├── utils/                # Standardized envelopes (ApiResponse, AppError)
│   │   ├── validators/           # Zod schema validation
│   │   ├── app.ts                # Express application configuration
│   │   └── server.ts             # Server entry point with graceful shutdown
│   ├── tests/                    # Backend automated tests
│   ├── package.json              # Backend dependencies
│   └── tsconfig.json             # TypeScript configuration
│
├── ml-service/                   # Analytical Service (Python, FastAPI, Pydantic)
│   ├── app/
│   │   ├── api/                  # API routes (v1 health and future ML endpoints)
│   │   ├── models/               # ML model wrappers & inference contracts (future)
│   │   ├── schemas/              # Pydantic data schemas
│   │   ├── services/             # Business & analytical logic
│   │   ├── utils/                # Configuration and structured logger
│   │   └── main.py               # FastAPI application entry point
│   ├── tests/                    # Pytest test suites
│   ├── requirements.txt          # Python dependencies
│   └── README.md                 # ML service documentation
│
├── docs/                         # System documentation and architectural guides
│   └── architecture.md
├── docker/                       # Container configuration
│   └── postgres/
│       └── init.sql              # Clean PostgreSQL initialization script
├── .env.example                  # Environment configuration blueprint
├── .gitignore                    # Git ignore file for all ecosystems
├── docker-compose.yml            # Docker Compose configuration for PostgreSQL
└── README.md                     # Root project documentation
```

---

## 4. Frontend Architecture

- **Stack**: React 18+, TypeScript, Vite, Tailwind CSS, React Router, Axios.
- **Role**: Responsive user interface for farmers, field officers, and administrators.
- **Key Modules in Module 1**:
  - `src/services/api.ts`: Pre-configured Axios instance with unified base URLs, timeouts, and error interceptors.
  - `src/services/healthService.ts`: Service call to query the Node.js API health status.
  - `src/hooks/useHealthCheck.ts`: Custom hook managing polling, connection latency, and service status state.
  - `src/pages/HomePage.tsx`: Landing view detailing AgriShield Parametric.
  - `src/pages/HealthDashboardPage.tsx`: Live diagnostic dashboard reporting the status of all three sub-systems (Frontend, Backend API, PostgreSQL, and ML Service).

---

## 5. Backend Architecture (Clean Architecture)

- **Stack**: Node.js, Express, TypeScript, Prisma ORM, Winston, Zod, Helmet.
- **Clean Architecture Layers**:
  - **Controllers**: Thin controllers strictly responsible for accepting HTTP requests, unpacking parameters, invoking services, and returning structured `ApiResponse` envelopes.
  - **Services**: Pure business logic layer. Completely decoupled from Express `req`/`res` objects. Orchestrates data operations and external microservice requests.
  - **Repositories**: Isolated data access layer interfacing with Prisma ORM. Shields domain logic from ORM-specific syntax or database changes.
  - **Validators**: Declarative Zod schemas ensuring request payloads match constraints prior to reaching controllers.
  - **Middleware**: Production security headers (`helmet`), CORS whitelisting, Winston HTTP request logging, 404 handler, and central error management (`AppError`).

---

## 6. ML Service Architecture

- **Stack**: Python 3.11+, FastAPI, Pydantic v2, Uvicorn.
- **Future analytical dependencies included**: `scikit-learn`, `shap`, `pandas`, `numpy`, `geopandas`, `rasterio`.
- **Role**: Specialized service for high-performance computing, geospatial array operations, satellite imagery analysis, crop risk classification, and SHAP explainability.
- **Key Modules in Module 1**:
  - `app/api/v1/health.py`: REST health probes reporting status, Python runtime, and host metrics.
  - `app/schemas/health.py`: Strict Pydantic models for response serialization.
  - `app/models/base_model.py`: Abstract architectural contract for future crop-risk and SHAP models.

---

## 7. Database Architecture

- **Engine**: PostgreSQL 16 (running locally or containerized via Docker).
- **ORM**: Prisma ORM with native TypeScript type generation.
- **Pristine Baseline**: `prisma/schema.prisma` is cleanly initialized with datasource and generator definitions without arbitrary dummy models.
- **Health Check Mechanism**: The repository verifies database liveliness through an instantaneous raw SQL query (`SELECT 1`), ensuring verification without requiring existing database tables.

---

## 8. Future Communication Between Services

```
[ User Action on Frontend ]
            │
            ▼ (1) HTTPS REST Call (e.g. POST /api/v1/farms/:id/assess-risk)
   [ Node.js Backend API ]
      │             │
      │ (2) Read    │ (3) HTTP POST /api/v1/models/crop-risk/predict
      │ Farm Data   │     Payload: { farmCoordinates, cropType, dateRange }
      ▼             ▼
[ PostgreSQL ]  [ Python ML Service ]
                    │
                    │ (4) Ingests Sentinel/NDVI bands & Weather metrics
                    │ (5) Generates prediction + SHAP feature importance
                    ▼
                Returns: { riskScore: 0.82, triggerBreached: true, shapValues: {...} }
      ▲             │
      │             │ (6) HTTP Response back to Node.js
      └─────────────┘
(7) Evaluates policy contract
(8) If trigger == true, creates Claim & simulated Payout in PostgreSQL
(9) Returns comprehensive assessment to Frontend for user display
```

---

## 9. Getting Started

### Prerequisites
- Node.js >= 18 (Tested on v24.x)
- Python >= 3.10 (Tested on 3.11.x)
- Docker & Docker Compose (Optional for local PostgreSQL)

### 1. Database Setup (Docker)
```bash
docker-compose up -d postgres
```

### 2. Backend Setup
```bash
cd backend
cp .env.example .env
npm install
npm run dev
# Server running at http://localhost:5000
# Health check: http://localhost:5000/api/v1/health
```

### 3. ML Service Setup
```bash
cd ml-service
cp .env.example .env
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# ML Service running at http://localhost:8000
# Health check: http://localhost:8000/api/v1/health
```

### 4. Frontend Setup
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
# Vite dev server running at http://localhost:5173
```
