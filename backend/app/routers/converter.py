from pathlib import Path
import shutil
import logging

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.services.conversion_service import (
    convert_document as run_conversion
)

router = APIRouter(
    prefix="/api",
    tags=["Converter"]
)

logger = logging.getLogger(__name__)

# Folder penyimpanan sementara
TEMP_DIR = Path(__file__).resolve().parents[2] / "temp"

# Batas ukuran file: 15 MB
MAX_FILE_SIZE = 15 * 1024 * 1024

# Daftar konversi yang didukung
SUPPORTED_CONVERSIONS = {
    ("docx", "pdf"),
    ("pdf", "docx"),
    ("md", "html"),
    ("html", "md"),
    ("htm", "md"),
    ("csv", "xlsx"),
    ("xlsx", "csv")
}

# MIME type hasil konversi
MIME_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "html": "text/html",
    "md": "text/markdown",
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}


@router.post("/convert")
def convert_file(
    file: UploadFile = File(...),
    target_format: str = Form(...)
):
    """
    Upload and convert document into the selected format.
    """

    # Validasi nama file
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Nama file tidak ditemukan."
        )

    safe_filename = Path(
        file.filename.replace("\\", "/")
    ).name

    source_format = Path(safe_filename).suffix.lower().lstrip(".")
    target_format = target_format.lower().strip().lstrip(".")

    if source_format == "htm":
        source_format = "html"

    # Validasi format konversi
    if (source_format, target_format) not in SUPPORTED_CONVERSIONS:
        raise HTTPException(
            status_code=400,
            detail="Format konversi tidak didukung."
        )

    # Membuat folder unik untuk setiap proses
    import uuid

    job_id = str(uuid.uuid4())
    job_dir = TEMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    input_path = job_dir / safe_filename

    try:
        # Menyimpan file upload sementara
        file_size = 0

        with input_path.open("wb") as buffer:
            while True:
                chunk = file.file.read(1024 * 1024)

                if not chunk:
                    break

                file_size += len(chunk)

                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="Ukuran file maksimal 15 MB."
                    )

                buffer.write(chunk)

        if file_size == 0:
            raise HTTPException(
                status_code=400,
                detail="File yang diunggah kosong."
            )

        # Menjalankan proses konversi
        output_path = run_conversion(
            input_path=input_path,
            target_format=target_format,
            output_dir=job_dir
        )

        logger.info(
            "Conversion successful: %s -> %s",
            source_format,
            target_format
        )

        # Mengirim file hasil konversi
        return FileResponse(
            path=str(output_path),
            filename=output_path.name,
            media_type=MIME_TYPES[target_format],
            background=BackgroundTask(
                shutil.rmtree,
                job_dir,
                ignore_errors=True
            )
        )

    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise

    except Exception as error:
        logger.exception("Document conversion failed")
        shutil.rmtree(job_dir, ignore_errors=True)

        raise HTTPException(
            status_code=500,
            detail=f"Proses konversi gagal: {str(error)}"
        )