from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import api_v1_router
from app.utils.config import settings
from app.utils.logger import logger


from app.api.v1.predict import router as predict_router
from app.services.inference_service import inference_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.APP_NAME} in {settings.ENVIRONMENT} mode...")
    try:
        inference_service.initialize()
    except Exception as e:
        logger.error(f"Error during startup model initialization: {e}")
    yield
    logger.info(f"Shutting down {settings.APP_NAME}...")


app = FastAPI(
    title=settings.APP_NAME,
    description="AgriShield Parametric - Crop Risk & SHAP Explanation Analytical Microservice",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root status route
@app.get("/", tags=["Root"])
async def root():
    return {
        "service": settings.APP_NAME,
        "status": "active",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/v1/health",
        "predict": "/predict",
    }


# Include versioned API router
app.include_router(api_v1_router)

# Mount direct production prediction endpoint POST /predict
app.include_router(predict_router)
