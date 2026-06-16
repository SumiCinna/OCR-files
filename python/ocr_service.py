from __future__ import annotations

import io
import os
from typing import Any

import fitz
import requests
from fastapi import FastAPI, File, HTTPException, UploadFile


app = FastAPI(title="OCR Text Service")
OCR_SPACE_API_KEY = os.getenv("OCR_SPACE_API_KEY", "K84047214388957")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/extract")
async def extract(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    filename = file.filename or "upload"
    mime_type = file.content_type or "application/octet-stream"

    try:
        if filename.lower().endswith(".pdf") or mime_type == "application/pdf":
            return _extract_pdf(content, filename)

        return _extract_via_ocr_space(content, filename, mime_type)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Unable to process file: {exc}") from exc


def _extract_pdf(content: bytes, filename: str) -> dict[str, Any]:
    try:
        document = fitz.open(stream=content, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Unable to open PDF: {exc}") from exc

    pages: list[dict[str, Any]] = []
    text_parts: list[str] = []
    has_text_layer = False

    for page_index in range(document.page_count):
        page = document.load_page(page_index)
        blocks = page.get_text("dict").get("blocks", [])
        lines: list[dict[str, Any]] = []

        for block in blocks:
            if block.get("type") != 0:
                continue

            for line in block.get("lines", []):
                spans = line.get("spans", [])
                if not spans:
                    continue

                text = "".join(span.get("text", "") for span in spans).strip()
                if not text:
                    continue

                is_bold = any(_span_looks_bold(span) for span in spans)
                has_text_layer = True

                lines.append(
                    {
                        "text": text,
                        "bold": is_bold,
                        "bbox": line.get("bbox", []),
                    }
                )

        pages.append(
            {
                "page": page_index + 1,
                "lines": lines,
            }
        )

        for line in lines:
            text_parts.append(f"**{line['text']}**" if line["bold"] else line["text"])
        if page_index < document.page_count - 1:
            text_parts.append("")

    document.close()

    if not has_text_layer:
        return _extract_pdf_via_rendered_ocr(content, filename)

    pdf_text = "\n".join(text_parts).strip()

    # Some PDFs contain a broken/partial text layer. If OCR captures much more
    # text, prefer OCR so readable headings are not dropped.
    ocr_result = _extract_pdf_via_rendered_ocr(content, filename)
    if ocr_result and len(ocr_result.get("text", "")) > len(pdf_text) * 1.25:
        return ocr_result

    return {
        "success": True,
        "filename": filename,
        "text": pdf_text,
        "pages": pages,
    }


def _extract_via_ocr_space(content: bytes, filename: str, mime_type: str) -> dict[str, Any]:
    response = requests.post(
        "https://api.ocr.space/parse/image",
        data={
            "apikey": OCR_SPACE_API_KEY,
            "language": "auto",
            "isOverlayRequired": "true",
            "detectOrientation": "true",
            "scale": "true",
            "isTable": "true",
            "OCREngine": "2",
        },
        files={"file": (filename, content, mime_type)},
        timeout=120,
    )

    if response.status_code < 200 or response.status_code >= 300:
        raise HTTPException(status_code=502, detail="OCR.space request failed")

    data = response.json()
    if data.get("IsErroredOnProcessing"):
        error_message = data.get("ErrorMessage", ["OCR processing failed."])
        raise HTTPException(status_code=400, detail=str(error_message[0] if isinstance(error_message, list) else error_message))

    extracted_text = []
    pages: list[dict[str, Any]] = []

    for page in data.get("ParsedResults", []):
        page_text = str(page.get("ParsedText", "")).strip()
        if page_text:
            extracted_text.append(page_text)

        page_lines = []
        for line in page_text.splitlines():
            clean_line = line.strip()
            if clean_line:
                page_lines.append({"text": clean_line, "bold": False, "bbox": []})

        pages.append(
            {
                "page": len(pages) + 1,
                "lines": page_lines,
            }
        )

    return {
        "success": True,
        "filename": filename,
        "text": "\n".join(extracted_text).strip(),
        "pages": pages,
    }


def _extract_pdf_via_rendered_ocr(content: bytes, filename: str) -> dict[str, Any] | None:
    try:
        document = fitz.open(stream=content, filetype="pdf")
    except Exception:
        return None

    extracted_text: list[str] = []
    pages: list[dict[str, Any]] = []

    try:
        for page_index in range(document.page_count):
            page = document.load_page(page_index)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
            image_bytes = pixmap.tobytes("png")
            ocr_page = _ocr_image_bytes(image_bytes, f"{filename}-page-{page_index + 1}.png", "image/png")

            page_lines = []
            for line in str(ocr_page.get("text", "")).splitlines():
                clean_line = line.strip()
                if clean_line:
                    page_lines.append({"text": clean_line, "bold": _looks_like_heading(clean_line), "bbox": []})

            pages.append({"page": page_index + 1, "lines": page_lines})
            if page_lines:
                extracted_text.extend(line["text"] for line in page_lines)
                if page_index < document.page_count - 1:
                    extracted_text.append("")
    finally:
        document.close()

    if not extracted_text:
        return None

    return {
        "success": True,
        "filename": filename,
        "text": "\n".join(extracted_text).strip(),
        "pages": pages,
    }


def _ocr_image_bytes(image_bytes: bytes, filename: str, mime_type: str) -> dict[str, Any]:
    response = requests.post(
        "https://api.ocr.space/parse/image",
        data={
            "apikey": OCR_SPACE_API_KEY,
            "language": "auto",
            "isOverlayRequired": "true",
            "detectOrientation": "true",
            "scale": "true",
            "isTable": "true",
            "OCREngine": "2",
        },
        files={"file": (filename, image_bytes, mime_type)},
        timeout=120,
    )

    if response.status_code < 200 or response.status_code >= 300:
        raise HTTPException(status_code=502, detail="OCR.space request failed")

    data = response.json()
    if data.get("IsErroredOnProcessing"):
        error_message = data.get("ErrorMessage", ["OCR processing failed."])
        raise HTTPException(status_code=400, detail=str(error_message[0] if isinstance(error_message, list) else error_message))

    extracted_text = []
    for page in data.get("ParsedResults", []):
        page_text = str(page.get("ParsedText", "")).strip()
        if page_text:
            extracted_text.append(page_text)

    return {
        "success": True,
        "text": "\n".join(extracted_text).strip(),
    }


def _try_extract_via_ocr_space(content: bytes, filename: str, mime_type: str) -> dict[str, Any] | None:
    try:
        return _extract_via_ocr_space(content, filename, mime_type)
    except Exception:  # noqa: BLE001
        return None


def _looks_like_heading(text: str) -> bool:
    upper_text = text.upper()
    return len(text) < 100 and (text == upper_text or "REQUEST FOR QUOTATION" in upper_text or "PROCUREMENT" in upper_text)


def _span_looks_bold(span: dict[str, Any]) -> bool:
    font_name = str(span.get("font", "")).lower()
    return "bold" in font_name or "black" in font_name or "semibold" in font_name