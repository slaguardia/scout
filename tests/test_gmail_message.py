"""MIME build + subject splitting (pure)."""
from __future__ import annotations

import base64

from scout.gmail import message


def _decode(raw_b64: str) -> str:
    return base64.urlsafe_b64decode(raw_b64).decode()


def test_build_raw_headers_and_body():
    raw, mid = message.build_raw("me@gmail.com", "you@acme.com", "Hello", "Line one.\n\nLine two.")
    mime = _decode(raw)
    assert "From: me@gmail.com" in mime
    assert "To: you@acme.com" in mime
    assert "Subject: Hello" in mime
    assert "Line one." in mime and "Line two." in mime
    assert mid and f"Message-ID: {mid}" in mime
    assert "In-Reply-To" not in mime


def test_build_raw_threading_headers():
    raw, _ = message.build_raw("a@b.com", "c@d.com", "Re: x", "body", "<prev@mail>", "<prev@mail>")
    mime = _decode(raw)
    assert "In-Reply-To: <prev@mail>" in mime
    assert "References: <prev@mail>" in mime


def test_split_subject_extracts_leading_line():
    subject, body = message.split_subject("Subject: My subject\n\nHi there\n\nThanks", "DEFAULT")
    assert subject == "My subject"
    assert body == "Hi there\n\nThanks"


def test_split_subject_falls_back_to_default():
    subject, body = message.split_subject("Hi there, no subject line here", "DEFAULT")
    assert subject == "DEFAULT"
    assert body == "Hi there, no subject line here"


def test_split_subject_tolerates_leading_blank_lines():
    subject, body = message.split_subject("\n\nSubject: S\nbody", "D")
    assert subject == "S" and body == "body"


def test_header_value_case_insensitive():
    msg = {"payload": {"headers": [{"name": "Message-Id", "value": "<x@y>"}]}}
    assert message.header_value(msg, "message-id") == "<x@y>"
    assert message.header_value(msg, "subject") == ""
