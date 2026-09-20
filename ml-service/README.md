# AgriShield ML Service

FastAPI-powered microservice dedicated to crop-risk modeling, geospatial NDVI satellite computation, and SHAP explainability.

## Module 1 Status
- Standard microservice architecture established.
- Dynamic health endpoints at `/api/v1/health` and `/api/v1/health/ready`.
- Pydantic v2 schemas and centralized settings configuration.
- No business logic or machine learning models implemented in this phase.

## Local Setup

1. Create a virtual environment:
   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # Linux/macOS:
   # source .venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the development server:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

4. Verify health endpoint:
   ```bash
   curl http://localhost:8000/api/v1/health
   ```
