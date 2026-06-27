"""JSON helpers + the store-exception → HTTP-status mapping.

The web layer surfaces errors as a small `{"error": msg}` body (the frontend
reads `JSON.parse(txt).error`, falling back to plain text): json_response for
success payloads, json_error for failures, and a set of exception handlers that
turn the store sentinels into the right status with that same body shape.
"""

from __future__ import annotations

import dataclasses
import json

from fastapi import FastAPI, Request
from starlette.responses import Response

from scout.store import errors


def _default(o):
    """json.dumps hook: serialize a dataclass instance by field name (the
    snake_case field names are the JSON keys)."""
    if dataclasses.is_dataclass(o) and not isinstance(o, type):
        return dataclasses.asdict(o)
    raise TypeError(f"object of type {type(o).__name__} is not JSON serializable")


def json_response(data, status_code: int = 200) -> Response:
    """Write a JSON body with an explicit status. Accepts plain dicts/lists and
    (possibly nested) store dataclasses."""
    body = json.dumps(data, default=_default)
    return Response(content=body, media_type="application/json", status_code=status_code)


def json_error(message: str, status_code: int) -> Response:
    """The standard error body shape: {"error": msg} at the given status."""
    return json_response({"error": message}, status_code)


def install_error_handlers(app: FastAPI) -> None:
    """Map the store exceptions to HTTP statuses with the json_error body.

    NotFound→404, DomainTaken→409, UnknownCompany→400, and a field-prefixed
    ValueError→400 (the validation idiom the store uses, e.g. "website …" /
    "url …"). A handler raising any of these from a route needs no inline catch.
    """

    @app.exception_handler(errors.NotFound)
    def _not_found(_: Request, exc: errors.NotFound) -> Response:  # noqa: ARG001
        return json_error(str(exc) or "not found", 404)

    @app.exception_handler(errors.DomainTaken)
    def _domain_taken(_: Request, exc: errors.DomainTaken) -> Response:  # noqa: ARG001
        return json_error(str(exc), 409)

    @app.exception_handler(errors.UnknownCompany)
    def _unknown_company(_: Request, exc: errors.UnknownCompany) -> Response:  # noqa: ARG001
        return json_error(str(exc), 400)

    @app.exception_handler(ValueError)
    def _value_error(_: Request, exc: ValueError) -> Response:  # noqa: ARG001
        return json_error(str(exc), 400)
