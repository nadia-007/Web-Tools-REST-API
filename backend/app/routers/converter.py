from pathlib import Path
import shutil
import logging
import uuid

from fastapi import (
    APIRouter,
    UploadFile,
    File,
    Form,
    HTTPException,
)

from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.services.conversion_service import (
    convert_document as run_conversion
)


router = APIRouter(
    prefix="/api",
    tags=["Converter"],
)

logger = logging.getLogger(__name__)


# ============================================================
# CONFIGURATION
# ============================================================

TEMP_DIR = (
    Path(__file__).resolve().parents[2] / "temp"
)

MAX_FILE_SIZE = 15 * 1024 * 1024


SUPPORTED_CONVERSIONS = {
    ("docx", "pdf"),
    ("pdf", "docx"),
    ("md", "html"),
    ("html", "md"),
    ("htm", "md"),
    ("csv", "xlsx"),
    ("xlsx", "csv"),
}


SUPPORTED_PDF_MODES = {
    "editable",
    "preserve_layout",
}


MIME_TYPES = {
    "pdf": "application/pdf",

    "docx": (
        "application/vnd.openxmlformats-officedocument."
        "wordprocessingml.document"
    ),

    "html": "text/html",

    "md": "text/markdown",

    "csv": "text/csv",

    "xlsx": (
        "application/vnd.openxmlformats-officedocument."
        "spreadsheetml.sheet"
    ),
}


# ============================================================
# CONVERSION ENDPOINT
# ============================================================

@router.post("/convert")
def convert_file(
    file: UploadFile = File(...),

    target_format: str = Form(...),

    pdf_mode: str = Form("editable"),
):
    """
    Upload and convert documents.

    PDF -> DOCX:
        editable
        preserve_layout

    Other conversions remain unchanged.
    """

    # --------------------------------------------------------
    # Validate filename
    # --------------------------------------------------------

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Nama file tidak ditemukan.",
        )

    safe_filename = Path(
        file.filename.replace("\\", "/")
    ).name

    source_format = (
        Path(safe_filename)
        .suffix.lower()
        .lstrip(".")
    )

    target_format = (
        target_format.lower()
        .strip()
        .lstrip(".")
    )

    pdf_mode = (
        pdf_mode.lower()
        .strip()
    )

    if source_format == "htm":
        source_format = "html"

    # --------------------------------------------------------
    # Validate conversion format
    # --------------------------------------------------------

    if (
        source_format,
        target_format,
    ) not in SUPPORTED_CONVERSIONS:

        raise HTTPException(
            status_code=400,
            detail="Format konversi tidak didukung.",
        )

    # --------------------------------------------------------
    # Validate PDF conversion mode
    # --------------------------------------------------------

    if (
        source_format == "pdf"
        and target_format == "docx"
        and pdf_mode not in SUPPORTED_PDF_MODES
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "Mode PDF ke Word tidak valid. "
                "Gunakan editable atau preserve_layout."
            ),
        )

    # --------------------------------------------------------
    # Create unique job directory
    # --------------------------------------------------------

    job_id = str(uuid.uuid4())

    job_dir = TEMP_DIR / job_id

    job_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    # Avoid using user-provided filenames on disk.
    input_path = job_dir / (
        f"input.{source_format}"
    )

    try:

        # ----------------------------------------------------
        # Save uploaded file
        # ----------------------------------------------------

        file_size = 0

        with input_path.open("wb") as buffer:

            while True:

                chunk = file.file.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                file_size += len(chunk)

                if file_size > MAX_FILE_SIZE:

                    raise HTTPException(
                        status_code=413,
                        detail=(
                            "Ukuran file maksimal 15 MB."
                        ),
                    )

                buffer.write(chunk)

        if file_size == 0:

            raise HTTPException(
                status_code=400,
                detail="File yang diunggah kosong.",
            )

        # ----------------------------------------------------
        # Execute conversion
        # ----------------------------------------------------

        output_path = run_conversion(
            input_path=input_path,
            target_format=target_format,
            output_dir=job_dir,
            pdf_mode=pdf_mode,
        )

        logger.info(
            "Conversion successful: %s -> %s | mode=%s",
            source_format,
            target_format,
            pdf_mode if source_format == "pdf" else "default",
        )

        # ----------------------------------------------------
        # Return converted file
        # ----------------------------------------------------

        download_filename = (
            f"{Path(safe_filename).stem}.{target_format}"
        )

        return FileResponse(
            path=str(output_path),

            filename=download_filename,

            media_type=MIME_TYPES[target_format],

            background=BackgroundTask(
                shutil.rmtree,
                job_dir,
                ignore_errors=True,
            ),
        )

    except HTTPException:

        shutil.rmtree(
            job_dir,
            ignore_errors=True,
        )

        raise

    except Exception:

        logger.exception(
            "Document conversion failed."
        )

        shutil.rmtree(
            job_dir,
            ignore_errors=True,
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Proses konversi gagal. "
                "Periksa format dan kondisi file."
            ),
        )