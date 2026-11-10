
from pathlib import Path
import shutil
import subprocess

import pandas as pd
import markdown
from markdownify import markdownify
from pdf2docx import Converter


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

    subprocess.run(
        [
            soffice,
            "--headless",
            "--convert-to", "pdf",
            "--outdir", str(output_path.parent),
            str(input_path)
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=120
    )

    generated_file = output_path.parent / f"{input_path.stem}.pdf"

    if not generated_file.exists():
        raise RuntimeError("Gagal menghasilkan file PDF.")


def pdf_to_docx(input_path: Path, output_path: Path):
    """Convert PDF to DOCX."""

    converter = Converter(str(input_path))

    try:
        converter.convert(str(output_path))
    finally:
        converter.close()


def md_to_html(input_path: Path, output_path: Path):
    """Convert Markdown to HTML."""

    content = input_path.read_text(encoding="utf-8")

    html_content = markdown.markdown(
        content,
        extensions=["extra", "tables", "fenced_code"]
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

    output_path.write_text(full_html, encoding="utf-8")


def html_to_md(input_path: Path, output_path: Path):
    """Convert HTML to Markdown."""

    content = input_path.read_text(encoding="utf-8")

    md_content = markdownify(
        content,
        heading_style="ATX"
    )

    output_path.write_text(md_content, encoding="utf-8")


def csv_to_xlsx(input_path: Path, output_path: Path):
    """Convert CSV to XLSX."""

    try:
        data = pd.read_csv(
            input_path,
            encoding="utf-8-sig",
            sep=None,
            engine="python"
        )
    except UnicodeDecodeError:
        data = pd.read_csv(
            input_path,
            encoding="cp1252",
            sep=None,
            engine="python"
        )

    data.to_excel(output_path, index=False)


def xlsx_to_csv(input_path: Path, output_path: Path):
    """Convert XLSX to CSV."""

    data = pd.read_excel(
        input_path,
        sheet_name=0
    )

    data.to_csv(
        output_path,
        index=False,
        encoding="utf-8-sig"
    )


def convert_document(
    input_path: Path,
    target_format: str,
    output_dir: Path
) -> Path:
    """Main conversion dispatcher."""

    source_format = input_path.suffix.lower().lstrip(".")
    target_format = target_format.lower().strip().lstrip(".")

    if source_format == "htm":
        source_format = "html"

    conversions = {
        ("docx", "pdf"): docx_to_pdf,
        ("pdf", "docx"): pdf_to_docx,
        ("md", "html"): md_to_html,
        ("html", "md"): html_to_md,
        ("csv", "xlsx"): csv_to_xlsx,
        ("xlsx", "csv"): xlsx_to_csv
    }

    conversion = conversions.get(
        (source_format, target_format)
    )

    if conversion is None:
        raise ValueError(
            f"Konversi {source_format.upper()} "
            f"ke {target_format.upper()} tidak didukung."
        )

    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / (
        f"{input_path.stem}.{target_format}"
    )

    conversion(input_path, output_path)

    if not output_path.exists():
        raise RuntimeError("File hasil konversi tidak ditemukan.")

    return output_path