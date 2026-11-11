from io import BytesIO
from pathlib import Path
import logging
import shutil
import subprocess
import sys
import tempfile
import threading

import markdown
import pandas as pd
import pymupdf

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

from markdownify import markdownify
from pdf2docx import Converter


logger = logging.getLogger(__name__)


# ============================================================
# CONFIGURATION
# ============================================================

LIBREOFFICE_PROFILE_DIR = (
    Path(tempfile.gettempdir()) / "slamdoc_libreoffice_profile"
)

LIBREOFFICE_LOCK = threading.Lock()

# Limit heavy PDF conversions to one job per API process.
PDF_CONVERSION_LOCK = threading.BoundedSemaphore(1)

# Based on SlamDoc benchmark results.
PDF2DOCX_MULTIPROCESSING_MIN_PAGES = 14
PDF2DOCX_WORKER_COUNT = 2
PDF2DOCX_WORKER_TIMEOUT_SECONDS = 600

PRESERVE_LAYOUT_DPI = 160


# ============================================================
# DOCX TO PDF
# ============================================================

def docx_to_pdf(input_path: Path, output_path: Path):
    """Convert DOCX to PDF using LibreOffice."""

    soffice = shutil.which("soffice")

    if not soffice:
        possible_path = Path(
            r"C:\Program Files\LibreOffice\program\soffice.exe"
        )

        if possible_path.exists():
            soffice = str(possible_path)

    if not soffice:
        raise RuntimeError(
            "LibreOffice belum terinstal atau tidak ditemukan."
        )

    try:
        with LIBREOFFICE_LOCK:
            subprocess.run(
                [
                    soffice,
                    f"-env:UserInstallation={LIBREOFFICE_PROFILE_DIR.as_uri()}",
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(output_path.parent),
                    str(input_path),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=120,
            )

    except subprocess.CalledProcessError as error:

        logger.error(
            "LibreOffice failed (exit %s). stdout: %s | stderr: %s",
            error.returncode,
            error.stdout,
            error.stderr,
        )

        raise RuntimeError(
            "LibreOffice gagal mengonversi file. "
            "Pastikan file DOCX valid."
        ) from error

    except subprocess.TimeoutExpired as error:

        raise RuntimeError(
            "Konversi melebihi batas waktu 120 detik."
        ) from error

    generated_file = (
        output_path.parent / f"{input_path.stem}.pdf"
    )

    if not generated_file.exists():
        raise RuntimeError(
            "Gagal menghasilkan file PDF."
        )


# ============================================================
# PDF PAGE COUNT
# ============================================================

def _get_pdf_page_count(input_path: Path) -> int:

    pdf = pymupdf.open(str(input_path))

    try:
        return len(pdf)

    finally:
        pdf.close()


# ============================================================
# PDF TO DOCX - SINGLE PROCESS
# ============================================================

def _pdf_to_docx_single_process(
    input_path: Path,
    output_path: Path
):

    converter = Converter(str(input_path))

    try:
        converter.convert(str(output_path))

    finally:
        converter.close()


# ============================================================
# PDF TO DOCX - MULTIPROCESSING
# ============================================================

def _pdf_to_docx_multiprocess(
    input_path: Path,
    output_path: Path
):
    """
    Run pdf2docx in an isolated child process.

    Each conversion receives its own temporary working directory
    to prevent collisions between pages-0.json, pages-1.json,
    and other temporary files created by pdf2docx.
    """

    worker_script = Path(__file__).with_name(
        "pdf2docx_worker.py"
    )

    if not worker_script.is_file():
        raise RuntimeError(
            "Worker PDF ke Word tidak ditemukan."
        )

    with tempfile.TemporaryDirectory(
        prefix="slamdoc_pdf2docx_"
    ) as temp_dir:

        command = [
            sys.executable,
            str(worker_script),
            str(input_path.resolve()),
            str(output_path.resolve()),
            str(PDF2DOCX_WORKER_COUNT),
        ]

        try:

            result = subprocess.run(
                command,
                cwd=temp_dir,
                capture_output=True,
                text=True,
                timeout=PDF2DOCX_WORKER_TIMEOUT_SECONDS,
                check=False,
            )

        except subprocess.TimeoutExpired as error:

            raise RuntimeError(
                "Konversi PDF ke Word melewati "
                "batas waktu 600 detik."
            ) from error

        if result.stdout:
            logger.info(
                "pdf2docx worker output:\n%s",
                result.stdout[-8000:]
            )

        if result.stderr:
            logger.warning(
                "pdf2docx worker stderr:\n%s",
                result.stderr[-4000:]
            )

        if result.returncode != 0:

            detail = (
                result.stderr
                or result.stdout
                or "Unknown worker error"
            )[-2000:]

            logger.error(
                "pdf2docx worker exited with %s: %s",
                result.returncode,
                detail,
            )

            raise RuntimeError(
                "Konversi PDF ke Word (Editable) gagal. "
                "Periksa file PDF dan coba kembali."
            )

    if not output_path.is_file():
        raise RuntimeError(
            "Worker tidak menghasilkan file DOCX."
        )


# ============================================================
# PDF TO DOCX - PRESERVE LAYOUT
# ============================================================

def _pdf_to_docx_preserve_layout(
    input_path: Path,
    output_path: Path
):
    """
    Convert PDF pages into page-sized images inside DOCX.

    This mode preserves visual appearance.
    Text is not editable as normal Word text.

    Each PDF page receives its own Word section.
    """

    pdf = pymupdf.open(str(input_path))

    if len(pdf) == 0:
        pdf.close()

        raise RuntimeError(
            "PDF tidak memiliki halaman."
        )

    word = Document()

    normal_style = word.styles["Normal"]

    normal_style.paragraph_format.space_before = Pt(0)
    normal_style.paragraph_format.space_after = Pt(0)

    margin = Inches(0.04)
    reserved_vertical_space = Inches(0.18)

    try:

        for index, page in enumerate(pdf):

            # First page uses the default section.
            if index == 0:

                section = word.sections[0]

            else:

                section = word.add_section(
                    WD_SECTION.NEW_PAGE
                )

            # Preserve original page dimensions.
            section.page_width = Inches(
                page.rect.width / 72
            )

            section.page_height = Inches(
                page.rect.height / 72
            )

            section.top_margin = margin
            section.bottom_margin = margin
            section.left_margin = margin
            section.right_margin = margin

            section.header_distance = Inches(0)
            section.footer_distance = Inches(0)

            content_width = (
                section.page_width
                - section.left_margin
                - section.right_margin
            )

            content_height = (
                section.page_height
                - section.top_margin
                - section.bottom_margin
                - reserved_vertical_space
            )

            # Render PDF page.
            pixmap = page.get_pixmap(
                dpi=PRESERVE_LAYOUT_DPI,
                alpha=False,
            )

            image_bytes = pixmap.tobytes("png")

            # Keep image aspect ratio.
            image_ratio = (
                pixmap.width / pixmap.height
            )

            image_width = min(
                content_width,
                content_height * image_ratio,
            )

            paragraph = word.add_paragraph()

            paragraph.alignment = (
                WD_ALIGN_PARAGRAPH.CENTER
            )

            paragraph.paragraph_format.space_before = Pt(0)
            paragraph.paragraph_format.space_after = Pt(0)
            paragraph.paragraph_format.line_spacing = 1

            paragraph.add_run().add_picture(
                BytesIO(image_bytes),
                width=image_width,
            )

        word.save(output_path)

    finally:
        pdf.close()


# ============================================================
# PDF TO DOCX - MAIN DISPATCHER
# ============================================================

def pdf_to_docx(
    input_path: Path,
    output_path: Path,
    mode: str = "editable",
):
    """
    Convert PDF into DOCX.

    Modes:
    - editable
    - preserve_layout
    """

    mode = (
        mode or "editable"
    ).strip().lower()

    with PDF_CONVERSION_LOCK:

        # Preserve Layout mode.
        if mode == "preserve_layout":

            logger.info(
                "PDF conversion mode: Preserve Layout"
            )

            _pdf_to_docx_preserve_layout(
                input_path,
                output_path,
            )

            return

        # Validate mode.
        if mode != "editable":

            raise ValueError(
                "Mode PDF ke Word tidak dikenal."
            )

        page_count = _get_pdf_page_count(
            input_path
        )

        logger.info(
            "PDF has %s pages; conversion mode=editable",
            page_count,
        )

        # Automatically select conversion method.
        if page_count >= PDF2DOCX_MULTIPROCESSING_MIN_PAGES:

            logger.info(
                "Using isolated pdf2docx multiprocessing "
                "with %s workers",
                PDF2DOCX_WORKER_COUNT,
            )

            _pdf_to_docx_multiprocess(
                input_path,
                output_path,
            )

        else:

            logger.info(
                "Using single-process pdf2docx conversion"
            )

            _pdf_to_docx_single_process(
                input_path,
                output_path,
            )


# ============================================================
# MARKDOWN TO HTML
# ============================================================

def md_to_html(
    input_path: Path,
    output_path: Path
):
    """Convert Markdown to HTML."""

    content = input_path.read_text(encoding="utf-8-sig")

    html_content = markdown.markdown(
        content,
        extensions=[
            "extra",
            "tables",
            "fenced_code",
        ],
    )

    full_html = f"""<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Converted Document</title>
</head>
<body>
    {html_content}
</body>
</html>
"""

    output_path.write_text(
        full_html,
        encoding="utf-8",
    )


# ============================================================
# HTML TO MARKDOWN
# ============================================================

def html_to_md(
    input_path: Path,
    output_path: Path
):
    """Convert HTML to Markdown."""

    content = input_path.read_text(encoding="utf-8-sig")

    md_content = markdownify(
        content,
        heading_style="ATX"
    ).strip()

    output_path.write_text(
        md_content + "\n",
        encoding="utf-8"
    )


# ============================================================
# CSV TO XLSX
# ============================================================

def csv_to_xlsx(
    input_path: Path,
    output_path: Path
):
    """Convert CSV to XLSX."""

    try:

        data = pd.read_csv(
            input_path,
            encoding="utf-8-sig",
            sep=None,
            engine="python",
        )

    except UnicodeDecodeError:

        data = pd.read_csv(
            input_path,
            encoding="cp1252",
            sep=None,
            engine="python",
        )

    data.to_excel(
        output_path,
        index=False,
    )


# ============================================================
# XLSX TO CSV
# ============================================================

def xlsx_to_csv(
    input_path: Path,
    output_path: Path
):
    """Convert the first worksheet in XLSX to CSV."""

    data = pd.read_excel(
        input_path,
        sheet_name=0,
    )

    data.to_csv(
        output_path,
        index=False,
        encoding="utf-8-sig",
    )


# ============================================================
# MAIN CONVERSION DISPATCHER
# ============================================================

def convert_document(
    input_path: Path,
    target_format: str,
    output_dir: Path,
    pdf_mode: str = "editable",
) -> Path:
    """
    Main conversion dispatcher.

    Supported conversions:
    DOCX -> PDF
    PDF  -> DOCX
    MD   -> HTML
    HTML -> MD
    CSV  -> XLSX
    XLSX -> CSV
    """

    source_format = (
        input_path.suffix.lower().lstrip(".")
    )

    target_format = (
        target_format.lower().strip().lstrip(".")
    )

    if source_format == "htm":
        source_format = "html"

    conversions = {

        ("docx", "pdf"): docx_to_pdf,

        ("md", "html"): md_to_html,

        ("html", "md"): html_to_md,

        ("csv", "xlsx"): csv_to_xlsx,

        ("xlsx", "csv"): xlsx_to_csv,

    }

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_path = output_dir / (
        f"{input_path.stem}.{target_format}"
    )

    # PDF -> DOCX has two selectable modes.
    if (
        source_format == "pdf"
        and target_format == "docx"
    ):

        pdf_to_docx(
            input_path,
            output_path,
            mode=pdf_mode,
        )

    else:

        conversion = conversions.get(
            (source_format, target_format)
        )

        if conversion is None:

            raise ValueError(
                f"Konversi {source_format.upper()} "
                f"ke {target_format.upper()} "
                "tidak didukung."
            )

        conversion(
            input_path,
            output_path,
        )

    if not output_path.exists():

        raise RuntimeError(
            "File hasil konversi tidak ditemukan."
        )

    return output_path