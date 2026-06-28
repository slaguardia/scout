"""MIME build + subject splitting (pure)."""
from __future__ import annotations

import base64
import email
import email.policy

from scout.gmail import message


def _decode(raw_b64: str) -> str:
    return base64.urlsafe_b64decode(raw_b64).decode()


def _parse(raw_b64: str):
    return email.message_from_bytes(
        base64.urlsafe_b64decode(raw_b64), policy=email.policy.default
    )


def _part(msg, content_type: str) -> str:
    part = next(p for p in msg.walk() if p.get_content_type() == content_type)
    return part.get_content()


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


def test_build_raw_plain_when_no_markdown_link():
    raw, _ = message.build_raw("me@gmail.com", "you@acme.com", "Hi", "Just text, no links.")
    msg = _parse(raw)
    assert not msg.is_multipart()
    assert msg.get_content_type() == "text/plain"


def test_build_raw_markdown_link_becomes_multipart_html():
    body = "Thanks,\nSteven\n[stevenlaguardia.me](https://stevenlaguardia.me)"
    raw, _ = message.build_raw("me@gmail.com", "you@acme.com", "Hi", body)
    msg = _parse(raw)
    assert msg.is_multipart()
    types = {p.get_content_type() for p in msg.walk()}
    assert {"text/plain", "text/html"} <= types
    # HTML part: the label is a real anchor over the hidden https:// target.
    assert '<a href="https://stevenlaguardia.me">stevenlaguardia.me</a>' in _part(msg, "text/html")
    # Plain fallback: still carries the URL for text-only clients.
    assert "stevenlaguardia.me (https://stevenlaguardia.me)" in _part(msg, "text/plain")


def test_build_raw_html_escapes_body_text():
    raw, _ = message.build_raw("a@b.com", "c@d.com", "Hi", "5 < 6 & up [site](https://x.me)")
    html_part = _part(_parse(raw), "text/html")
    assert "5 &lt; 6 &amp; up" in html_part
    assert '<a href="https://x.me">site</a>' in html_part


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
