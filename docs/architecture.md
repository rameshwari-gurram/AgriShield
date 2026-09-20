# AgriShield Parametric - System Architecture Document

## 1. Executive Summary

AgriShield Parametric is a scalable, AI-assisted crop-risk and parametric insurance platform. This document delineates the architectural design principles, structural separation of concerns, and future communication paradigms established in **Module 1 (Foundational Architecture)**.

---

## 2. Monorepo Structural Layout

```
agriShield/
├── frontend/             # Single Page Application (React, TypeScript, Vite, Tailwind CSS)
├── backend/              # Core API & Business Gateway (Node.js, Express, TypeScript, Prisma)
├── ml-service/           # Analytical & Model Microservice (Python, FastAPI, Pydantic)
├── docs/                 # Architectural specifications, ADRs, and schema docs
├── docker/               # Container scripts, database init hooks
├── .env.example          # Unified environment variable blueprint
├── .gitignore            # Multi-ecosystem git ignore rules
├── README.md             # Developer handbook & quickstart
└── docker-compose.yml    # Local development orchestration (PostgreSQL)
```

---

## 3. Core Architectural Principles

### 3.1 Clean Architecture & Separation of Concerns (Backend)

The Node.js backend adheres to Clean Architecture and Layered Architecture principles:

```
HTTP Request
     │
     ▼
[ Routing Layer ]          (backend/src/routes/)
     │                     - Maps URLs to controllers
     │                     - Applies route-specific validation middleware
     ▼
[ Controller Layer ]       (backend/src/controllers/)
     │                     - THIN controllers
     │                     - Extracts request params, query, body
     │                     - Invokes corresponding service methods
     │                     - Formats HTTP response using ApiResponse envelopes
     ▼
[ Service Layer ]          (backend/src/services/)
     │                     - PURE business logic
     │                     - Orchestrates workflows
     │                     - Invokes repositories for data access
     │                     - Dispatches external calls (e.g., Python ML Service)
     ▼
[ Repository Layer ]       (backend/src/repositories/)
     │                     - DATA ACCESS ONLY
     │                     - Queries database via Prisma ORM
     │                     - Shields domain logic from ORM or SQL details
     ▼
[ Database Layer ]         (PostgreSQL via Prisma Client)
```

### 3.2 Cross-Cutting Concerns
- **Validation**: Isolated in `validators/` using Zod schemas. Request payloads are validated before reaching controller logic.
- **Error Handling**: Centralized in `middleware/error.middleware.ts`. All operational errors extend `AppError`. Stack traces are withheld in production environments.
- **Configuration**: Isolated in `config/env.config.ts`, validated at application startup using Zod. Zero hardcoded secrets.
- **Logging**: Structured Winston logging with correlation timestamps and log levels.
- **Security**: Hardened with Helmet headers, CORS policies, rate-limiting readiness, and JSON payload size restrictions.

---

## 4. Service Boundaries & Responsibilities

| Service | Primary Stack | Core Responsibility | Communication Inbound | Communication Outbound |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | React, TS, Vite, Tailwind | User interface, state management, dashboards, map visualizations (future) | End-user browser | REST / HTTPS to Backend |
| **Backend** | Node.js, Express, TS, Prisma | Authentication, data persistence, business workflows, parametric policy rules | REST / HTTPS from Frontend | Prisma to Postgres, HTTP to ML Service |
| **ML Service**| Python, FastAPI, Pydantic | Weather feature processing, NDVI geospatial processing, crop-risk inference, SHAP | HTTP / REST from Backend | Python data ecosystem, remote GeoTIFFs (future) |
| **Database** | PostgreSQL 16 | Relational storage for farmers, policies, claims, telemetry | TCP / 5432 from Backend | None |

---

## 5. Inter-Service Communication Flow

### Current Phase (Module 1)
- **Frontend → Backend**: Performs health probes (`GET /api/v1/health`) via Axios client.
- **Backend → PostgreSQL**: Runs raw connection heartbeat (`SELECT 1`) via Prisma Client.
- **Backend → ML Service**: Probes Python microservice health (`GET /api/v1/health`) via HTTP client.

### Future Workflow (Planned in Subsequent Modules)
1. **Farmer & Farm Registration**: Frontend sends validated geometry and farmer details to Node.js; Node.js persists to PostgreSQL via Prisma.
2. **Monitoring & Risk Assessment**: Node.js triggers risk evaluation by sending farm coordinate bounding boxes and crop timelines to the Python ML Service.
3. **ML Inference & SHAP**: Python FastAPI runs inference models, computes SHAP feature importance, and returns structured risk indices back to Node.js.
4. **Parametric Trigger & Claims**: Node.js evaluates risk indices against policy thresholds stored in PostgreSQL. If parametric criteria are breached, a claim is simulated and notification queued.

---

## 6. Scalability Strategy

- **Stateless Backend**: Express instances remain stateless; sessions are managed via JWT / tokens, allowing horizontal scaling behind reverse proxies (Nginx / AWS ALB).
- **Specialized Workloads**: CPU-intensive ML tasks and geospatial raster operations (Rasterio/GeoPandas) are isolated in Python FastAPI, ensuring heavy computations do not starve Node.js event-loop I/O.
- **Read/Write DB Optimization**: PostgreSQL connection pooling via PgBouncer and read replicas can be introduced seamlessly at the repository layer.
