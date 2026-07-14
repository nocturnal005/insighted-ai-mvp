"""Braille OCR as a serverless function, served from this same deployment.

The engine is a Python image-processing pipeline (NumPy/OpenCV) and the app is
Next.js, so they cannot share a process — but they can share a *deployment*.
Running the engine here means one Vercel URL serves both: no separately hosted
service to stand up, pay for, or wake before a demo.

The engine itself is installed from its own repository (see requirements.txt),
so this file holds no OCR logic — it only exposes `run_ocr` over HTTP using the
engine's own request/response models, keeping the contract identical to the
standalone service. The app's external_braille_ocr provider therefore needs no
change: point BRAILLE_OCR_ENDPOINT at this route.

Requests are authorised the same way the standalone engine does it, so the
route cannot be driven by anyone who does not hold the key.

Output is a draft. It always requires QTVI or Braille-literate specialist
verification; this engine never claims certified Braille accuracy.
"""

from __future__ import annotations

import json
import os
import secrets
from http.server import BaseHTTPRequestHandler

from app.models.requests import OcrRequest
from app.ocr.pipeline import run_ocr

# Refuse anything larger than the engine's own intake ceiling before parsing, so
# an oversized body cannot be buffered into memory inside the function.
_MAX_BODY_BYTES = 12 * 1024 * 1024


def _authorised(headers) -> bool:
    """Mirror the engine's auth: X-API-Key or Authorization: Bearer.

    An unset OCR_ENGINE_API_KEY leaves the route open, matching the standalone
    engine's behaviour for local runs. Set the variable in any deployment that
    is reachable from the internet.
    """
    expected = os.environ.get("OCR_ENGINE_API_KEY")
    if not expected:
        return True

    presented: list[str] = []
    api_key = headers.get("X-API-Key")
    if api_key:
        presented.append(api_key.strip())
    authorization = headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        presented.append(token.strip())

    return any(secrets.compare_digest(value, expected) for value in presented)


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 - name fixed by BaseHTTPRequestHandler
        if not _authorised(self.headers):
            self._respond(401, {"detail": "Invalid or missing API key."})
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._respond(422, {"detail": "Invalid Content-Length."})
            return
        if length <= 0 or length > _MAX_BODY_BYTES:
            self._respond(413, {"detail": "Request body missing or too large."})
            return

        try:
            payload = json.loads(self.rfile.read(length))
            request = OcrRequest(**payload)
        except Exception:
            # Never echo the body back: it carries the image and task context.
            self._respond(422, {"detail": "Invalid OCR request body."})
            return

        try:
            response = run_ocr(request)
        except Exception:
            # run_ocr is already fail-safe; this is a last resort that must not
            # leak internals to the caller.
            self._respond(500, {"detail": "OCR processing failed."})
            return

        self._respond(200, json.loads(response.model_dump_json()))

    def do_GET(self) -> None:  # noqa: N802
        """Liveness probe — confirms the function and engine imported cleanly."""
        self._respond(200, {"status": "ok", "engine": "in-app"})

    def _respond(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args) -> None:
        """Silence the default handler log: it prints the request line, and the
        engine's own logging policy is metadata-only (never pupil data)."""
        return
