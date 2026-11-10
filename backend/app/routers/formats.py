from fastapi import APIRouter

router = APIRouter(
    prefix="/api",
    tags=["Formats"]
)

@router.get("/formats")
def get_formats():
    return {
        "status": "success",
        "formats": [
            {"source": "DOCX", "target": "PDF"},
            {"source": "PDF", "target": "DOCX"},
            {"source": "MD", "target": "HTML"},
            {"source": "HTML", "target": "MD"},
            {"source": "CSV", "target": "XLSX"},
            {"source": "XLSX", "target": "CSV"}
        ]
    }