# AgriShield Module 9: Parametric Insurance & Automated Claims Lifecycle

## Live Demonstration Runbook & Operational Verification Guide

---

## 1. Executive Summary & Demonstration Objective

This runbook guides engineers, product managers, and insurance auditors through executing the end-to-end **Parametric Policy Underwriting and Automated Claims Lifecycle** in AgriShield.

By following this procedure, you will verify:
1. Geospatial boundary prerequisite verification during parametric underwriting.
2. Two-stage policy issuance (`PENDING` $\to$ `ACTIVE`).
3. Deterministic weather telemetry ingestion triggering statutory Module 6 risk rules.
4. Objective claim evaluation creating `PENDING` claims without touching policy balances.
5. Multi-stage claim approval and atomic transactional settlement (`APPROVED` $\to$ `PAID`).
6. Dynamic remaining-coverage capping preventing balance overruns.
7. Automatic policy exhaustion transition (`ACTIVE` $\to$ `EXHAUSTED`).
8. Presentation in the farmer web UI ([FarmDetailPage.tsx](file:///E:/AgriShield/frontend/src/pages/farms/FarmDetailPage.tsx)).

---

## 2. Prerequisites & Environment Verification

### 2.1 Software Requirements
- **Node.js:** v20.x or v22.x LTS (current environment: v24.12.0)
- **Docker & Docker Compose:** Docker daemon running with PostgreSQL 16 container
- **Database Extension:** PostGIS 3.4+ active on PostgreSQL

### 2.2 Safe Database Readiness Probe
Verify that the PostgreSQL database container (`agrishield_postgres`) is online, healthy, and accepting connections without modifying any records:

```powershell
# From the repository root (E:\AgriShield):
docker ps --filter "name=agrishield_postgres" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Expected output:
```
NAMES                 STATUS                    PORTS
agrishield_postgres   Up (healthy)              0.0.0.0:5432->5432/tcp
```

Verify database connectivity and applied migrations:
```powershell
npx --prefix backend prisma migrate status
```

Expected output:
```
Database schema is up to date!
```

> [!CAUTION]
> **Database Safety Notice:**  
> Never run `npx prisma migrate reset` or `prisma db push --force-reset`. A reset destroys registered farmers, farm boundaries, and telemetry records. Use only the safe read-only commands detailed in this runbook.

---

## 3. Automated End-to-End Demonstration (Recommended)

AgriShield provides an automated, idempotent lifecycle demonstration script ([demoParametricLifecycle.ts](file:///E:/AgriShield/backend/scripts/demoParametricLifecycle.ts)) that executes all stages against live PostgreSQL.

### 3.1 Running the Live Demonstration
Execute the following npm script from the repository root:

```powershell
npm --prefix backend run demo:parametric
```

### 3.2 Expected Step-by-Step Output Trace
The script executes 10 verified lifecycle checkpoints:

```
🚀 Starting AgriShield Parametric Insurance Demonstration...
================================================================================
Target Farm Location: Indapur, Pune, Maharashtra (Centroid: [75.0255, 18.1155])
Producer: Anand Shinde (Demo Farmer)
Sum Insured: ₹100,000.00 | Premium: ₹5,000.00 | Crop: Sugarcane
================================================================================

Step 1: Onboarded Farmer (ID: <uuid>, Ref: AGRI-FMR-DEMO-STAGE96)
Step 2: Onboarded Farm Parcel (ID: <uuid>, Ref: FRM-DEMO-INDAPUR-01)
Step 3: Mapped PostGIS Farm Boundary (Calculated Area: 1.17 ha, Centroid: [75.0255, 18.1155])
Step 4: Created Parametric Policy Quote (Status: PENDING, Sum Insured: ₹100,000.00, Balance: ₹0.00)
Step 5: Activated Policy via Issue Endpoint (Status: ACTIVE, Window: Active Coverage)
Step 6: Ingested 24 Hourly Weather Observations (Total Rainfall: 130.00 mm, 3h Cloudburst: 110.00 mm)
Step 7: Executed Module 6 Climate Risk Assessment (Evaluated 7 IMD Rules)
        Breached Events:
        - VERY_HEAVY_RAINFALL_24H (Severity: VERY_HIGH, Observed: 130.00 mm, Threshold: 115.50 mm)
        - EXCEPTIONALLY_HEAVY_RAINFALL_3H (Severity: HIGH, Observed: 110.00 mm, Threshold: 80.00 mm)
Step 8: Evaluated Claim 1 (Rule: VERY_HEAVY_RAINFALL_24H, Payout: ₹80,000.00, Status: PENDING)
        Approved Claim 1 (Status: APPROVED)
        Settled Claim 1 with reference SIM-PAYOUT-DEMO-001 (Status: PAID)
        -> Policy Balance Atomically Incremented to: ₹80,000.00 / ₹100,000.00 (Status: ACTIVE)
Step 9: Evaluated Claim 2 (Rule: EXCEPTIONALLY_HEAVY_RAINFALL_3H)
        Base Calculation: ₹50,000.00 (50% of sum insured)
        Remaining Coverage Cap Applied: Dynamically capped to ₹20,000.00!
        Approved Claim 2 (Status: APPROVED)
        Settled Claim 2 with reference SIM-PAYOUT-DEMO-002 (Status: PAID)
        -> Policy Balance Atomically Incremented to: ₹100,000.00 / ₹100,000.00
Step 10: Policy Transitioned Automatically to EXHAUSTED (Capacity reached: ₹100,000.00)
         Verified Conservation Invariant: Policy Balance strictly equals sum of settled claims.

================================================================================
✅ Demonstration Completed Successfully!
Demo records have been PRESERVED in PostgreSQL.
View the live presentation in the web browser at:
http://localhost:5173/farms/<farmId>
================================================================================
```

---

## 4. Web UI Presentation Walkthrough (Farmer Portal)

Once the demonstration script has populated PostgreSQL, you can inspect the full presentation layer in the frontend application.

### 4.1 Launch Local Servers
Open two terminal windows:

**Terminal 1 — Backend API Service:**
```powershell
npm --prefix backend run dev
```
*Listens on `http://localhost:5000`*

**Terminal 2 — Frontend Application:**
```powershell
npm --prefix frontend run dev
```
*Listens on `http://localhost:5173`*

### 4.2 Navigating to the Farm Detail Page
1. Open your browser and navigate to `http://localhost:5173/farms`.
2. Locate the demo farm: **Indapur Sugarcane Parcel A** (or navigate directly to `http://localhost:5173/farms/<farmId>`).
3. Scroll down the farm detail page to inspect each integrated module:
   - **Parcel Boundary Card (Module 4):** Displays interactive polygon perimeter, calculated geodesic area ($1.17\text{ ha}$), and centroid ($75.0255^\circ\text{ E}, 18.1155^\circ\text{ N}$).
   - **Weather Telemetry (Module 5):** 24-hour precipitation accumulation graph showing the $130\text{ mm}$ cloudburst event.
   - **Climate Risk Assessment (Module 6):** Authoritative rule evaluations displaying the triggered `VERY_HEAVY_RAINFALL_24H` event.
   - **Advisory ML Assessment (Module 8):** Crop health risk prediction and SHAP local feature attributions, clearly labeled as non-adjudicating advisory intelligence.
   - **Parametric Policy & Claims Section (Module 9):**
     - **PolicyCard:** Shows `EXHAUSTED` badge, Sum Insured ($₹100,000$), Remaining Coverage ($₹0$), and Cumulative Paid ($₹100,000$).
     - **ClaimHistoryTable:** Displays two settled claims (`PAID` status) with simulated references (`SIM-PAYOUT-DEMO-001`, `SIM-PAYOUT-DEMO-002`).
     - **ClaimAuditModal:** Click the **Audit** button on any claim row to view the full provenance breakdown: triggering rule, observed value ($130.00\text{ mm}$), statutory threshold ($115.50\text{ mm}$), assessment UUID, and immutable JSON record.

---

## 5. Step-by-Step API Execution via REST Endpoints

If you prefer to invoke the REST endpoints manually using `curl` or Postman, use this verified sequence.

### Step 1: Obtain Authenticated JWT Token
```bash
# Mint a 7-day token for the test farmer (or use test login)
TOKEN="<JWT_TOKEN_FOR_FARMER>"
```

### Step 2: Underwrite and Create Policy Quote
```bash
curl -X POST http://localhost:5000/api/v1/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "farmId": "<FARM_UUID>",
    "farmerId": "<FARMER_UUID>",
    "cropName": "Sugarcane",
    "sumInsured": 100000.00,
    "premiumAmount": 5000.00,
    "coveredHazards": ["HEAVY_RAINFALL", "INTENSE_RAINFALL"],
    "startDate": "2026-10-01T00:00:00.000Z",
    "endDate": "2026-10-31T23:59:59.000Z"
  }'
```
*Expected: HTTP 201 Created with `status: "PENDING"`, `policyNumber: "POL-..."`.*

### Step 3: Issue and Activate Policy
```bash
curl -X POST http://localhost:5000/api/v1/policies/<POLICY_UUID>/issue \
  -H "Authorization: Bearer $TOKEN"
```
*Expected: HTTP 200 OK with `status: "ACTIVE"`.*

### Step 4: Evaluate Prospective Claim
```bash
curl -X POST http://localhost:5000/api/v1/claims/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "policyId": "<POLICY_UUID>",
    "assessmentId": "<ASSESSMENT_UUID>",
    "riskEventId": "<RISK_EVENT_UUID>",
    "payoutConfig": {
      "severityMultipliers": {
        "VERY_HIGH": 0.80,
        "HIGH": 0.50
      }
    }
  }'
```
*Expected: HTTP 201 Created with `status: "PENDING"`, `payoutAmount: 80000.00`.*

### Step 5: Approve Claim
```bash
curl -X POST http://localhost:5000/api/v1/claims/<CLAIM_UUID>/approve \
  -H "Authorization: Bearer $TOKEN"
```
*Expected: HTTP 200 OK with `status: "APPROVED"`.*

### Step 6: Settle Claim in Transaction
```bash
curl -X POST http://localhost:5000/api/v1/claims/<CLAIM_UUID>/settle \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "simulatedPayoutReference": "SIM-PAYOUT-LIVE-001"
  }'
```
*Expected: HTTP 200 OK with `status: "PAID"`, `payoutReference: "SIM-PAYOUT-LIVE-001"`. The parent policy's `cumulativePaidAmount` increments atomically to $80,000.00$.*

---

## 6. Remote Sensing (Sentinel-2 NDVI) Demonstration

You can demonstrate that Module 7 optical satellite data is synchronized for the farm parcel using Copernicus Sentinel-2 Level-2A imagery:

```bash
# Query historical NDVI observations for the parcel
curl -X GET "http://localhost:5000/api/v1/farms/<FARM_UUID>/satellite" \
  -H "Authorization: Bearer $TOKEN"
```

Expected Response:
```json
{
  "success": true,
  "data": [
    {
      "observedAt": "2026-09-24T00:00:00.000Z",
      "meanNdvi": 0.6543,
      "minNdvi": 0.2104,
      "maxNdvi": 0.8521,
      "validPixelPercentage": 99.50
    }
  ]
}
```

> [!NOTE]
> **Agronomic Clarification:**  
> Explain to evaluators that NDVI observations reflect vegetation vigor and crop canopy health. In AgriShield's current architecture, **NDVI does not trigger insurance claims**. Claims are governed strictly by statutory weather rules (Module 6) to ensure regulatory compliance with IMD parametric insurance guidelines.

---

## 7. Safe Cleanup Procedure

The demonstration script is designed to leave records in the database so the frontend UI can be inspected. When you wish to clean up the demo farmer and policy records:

```powershell
npx --prefix backend tsx scripts/demoParametricLifecycle.ts --cleanup-only
```

Expected output:
```
🧹 Cleaned up existing demo records for AGRI-FMR-DEMO-STAGE96 in PostgreSQL.
```

This performs a scoped, leaf-to-root deletion of **only** the demo farmer (`AGRI-FMR-DEMO-STAGE96`), leaving all other test data, seeds, and real farm records untouched.

---

## 8. Troubleshooting & Common Operational Errors

| Symptom | Cause | Resolution |
| :--- | :--- | :--- |
| **HTTP 401 Unauthorized** | Missing or expired JWT in `Authorization` header. | Mint a fresh token signed with `JWT_SECRET` containing `{ id: farmerId }`. |
| **HTTP 403 Forbidden** | Caller authenticated as Farmer B attempting to access Farm A or Policy A (BOLA/IDOR protection). | Verify the authenticated token's `farmerId` matches the owner of the target farm parcel. |
| **HTTP 400: Lacks established boundary** | Attempting to create a policy on a farm that has no PostGIS boundary. | Create the farm boundary first via `POST /api/v1/farms/:farmId/boundary`. A validated polygon is required. |
| **HTTP 400: Overlapping policy detected** | Farm already has an active policy whose date window intersects `[startDate, endDate]`. | Choose non-overlapping dates or wait until the existing policy is `EXHAUSTED` or `CANCELLED`. |
| **HTTP 400: Payout increment exceeds remaining coverage** | Attempting to settle a claim when policy coverage is already exhausted. | Verified behavior: the system strictly prevents over-disbursements. Check remaining coverage via `GET /policies/:id`. |
| **HTTP 400: Simulated payout reference must start with 'SIM-'** | Supplied a payout reference without the required prefix. | Ensure reference begins with `SIM-` (e.g., `SIM-PAYOUT-DEMO-001`). |
| **HTTP 409 Conflict: Claim already exists** | Re-evaluating the same `(policyId, riskEventId)` pair. | Verified behavior: compound unique constraint `@@unique([policyId, riskEventId])` prevents duplicate claims. |
| **Database Connection Refused (port 5432)** | Docker container `agrishield_postgres` is stopped. | Run `docker-compose up -d postgres` and verify status with `docker ps`. |
