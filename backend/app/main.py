from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import health, formats, converter

app = FastAPI(
    title="SlamDoc API",
    description="REST API Document Converter",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(formats.router)
app.include_router(converter.router)

@app.get("/")
def root():
    return {
        "message": "Welcome to SlamDoc API",
        "status": "running"
    }