import logging
import multiprocessing
import os
import sys
from pathlib import Path

from pdf2docx import Converter


logging.basicConfig(
    level=logging.INFO,
    format="[WORKER] %(levelname)s: %(message)s",
)

logger = logging.getLogger(__name__)


def run_conversion(
    input_path: Path,
    output_path: Path,
    requested_workers: int,
):
    """Run isolated pdf2docx multiprocessing."""

    if not input_path.is_file():
        raise FileNotFoundError(
            f"PDF tidak ditemukan: {input_path}"
        )

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    available_cpus = os.cpu_count() or 1

    worker_count = max(
        1,
        min(requested_workers, available_cpus),
    )

    logger.info(
        "Available CPUs: %s",
        available_cpus,
    )

    logger.info(
        "Active workers: %s",
        worker_count,
    )

    converter = Converter(
        str(input_path)
    )

    try:
        settings = converter.default_settings.copy()

        settings["multi_processing"] = True
        settings["cpu_count"] = worker_count

        # The current working directory is unique
        # for every conversion job.
        vectors = [
            (
                index,
                worker_count,
                0,
                None,
                str(input_path),
                converter.password,
                settings,
                f"pages-{index}.json",
            )
            for index in range(worker_count)
        ]

        logger.info(
            "Starting page parsing."
        )

        # Explicitly limit the process pool.
        with multiprocessing.Pool(
            processes=worker_count
        ) as pool:

            pool.map(
                Converter._parse_pages_per_cpu,
                vectors,
                1,
            )

        logger.info(
            "Page parsing completed."
        )

        # Restore each parsed page segment.
        for index in range(worker_count):

            json_file = Path(
                f"pages-{index}.json"
            )

            if not json_file.is_file():
                raise RuntimeError(
                    f"Parsing result missing: {json_file}"
                )

            converter.deserialize(
                str(json_file)
            )

            json_file.unlink()

        logger.info(
            "Creating DOCX document."
        )

        converter.make_docx(
            str(output_path),
            **settings,
        )

        if not output_path.is_file():
            raise RuntimeError(
                "DOCX output was not generated."
            )

        logger.info(
            "Conversion completed successfully."
        )

    finally:
        converter.close()


def main():

    if len(sys.argv) != 4:
        print(
            "Usage: pdf2docx_worker.py "
            "input.pdf output.docx worker_count",
            file=sys.stderr,
        )

        sys.exit(2)

    input_path = Path(
        sys.argv[1]
    ).resolve()

    output_path = Path(
        sys.argv[2]
    ).resolve()

    worker_count = int(
        sys.argv[3]
    )

    try:
        run_conversion(
            input_path,
            output_path,
            worker_count,
        )

    except Exception:
        logger.exception(
            "PDF to DOCX worker failed."
        )

        sys.exit(1)


if __name__ == "__main__":
    main()