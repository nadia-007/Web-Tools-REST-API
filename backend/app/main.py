import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import health, formats, converter

app = FastAPI(
    title="SlamDoc API",
    description="REST API Document Converter",
    version="1.0.0"
)

# CORS Configuration
allowed_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(health.router)
app.include_router(formats.router)
app.include_router(converter.router)


@app.get("/")
def root():
    return {
        "message": "Welcome to SlamDoc API",
        "status": "running"
    }