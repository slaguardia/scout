"""Migration 0055 schema + the Gmail store accessors."""
from __future__ import annotations

import sqlite3

import pytest

from scout.store import contacts, gmail as gmail_store, postings
from scout.store.companies import Company, upsert_company
from scout.store.contacts import ContactInput, OutreachInput


def test_migration_0055_schema(db):
    cols = {r[1] for r in db.execute("PRAGMA table_info(outreach_log)")}
    assert {"gmail_message_id", "gmail_thread_id"} <= cols

    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"gmail_messages", "notifications"} <= tables

    # The partial unique index on a non-empty gmail_message_id exists.
    idx = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    assert "idx_outreach_log_gmail_msg" in idx


def test_credentials_and_cursor_accessors(db):
    assert not gmail_store.is_connected(db)
    assert gmail_store.address(db) == ""

    gmail_store.store_credentials(db, "rt", "me@gmail.com")
    assert gmail_store.is_connected(db)
    assert gmail_store.refresh_token(db) == "rt"
    assert gmail_store.address(db) == "me@gmail.com"

    # A blank refresh on reconnect keeps the existing token; address updates.
    gmail_store.store_credentials(db, "", "me2@gmail.com")
    assert gmail_store.refresh_token(db) == "rt"
    assert gmail_store.address(db) == "me2@gmail.com"

    gmail_store.set_cursor(db, "12345")
    assert gmail_store.cursor(db) == "12345"

    gmail_store.clear_credentials(db)
    assert not gmail_store.is_connected(db)
    assert gmail_store.address(db) == ""
    assert gmail_store.cursor(db) == ""


def test_autoflip_toggle_defaults_off(db):
    assert gmail_store.autoflip(db) is False
    gmail_store.set_autoflip(db, True)
    assert gmail_store.autoflip(db) is True
    gmail_store.set_autoflip(db, False)
    assert gmail_store.autoflip(db) is False


def test_gmail_message_id_unique_dedupe(db):
    cid = upsert_company(db, Company(source="t", name="Acme", domain="acme.com", raw_json="{}"))
    p = postings.add_posting(db, cid, "https://acme.com/j", "SE")
    c = contacts.create_contact(db, cid, ContactInput(email="r@acme.com"))

    contacts.log_outreach(db, p.id, c.id, OutreachInput(gmail_message_id="m1", gmail_thread_id="t1"))
    # A second send with the same Gmail message id is rejected by the partial index.
    with pytest.raises(sqlite3.IntegrityError):
        contacts.log_outreach(db, p.id, c.id, OutreachInput(gmail_message_id="m1", gmail_thread_id="t1"))

    # Blank gmail_message_id rows are exempt — several manual logs may coexist.
    contacts.log_outreach(db, p.id, c.id, OutreachInput())
    contacts.log_outreach(db, p.id, c.id, OutreachInput())

    # latest_send_thread returns the most recent threaded send's ids.
    thr, msg = gmail_store.latest_send_thread(db, p.id, c.id)
    assert thr == "t1" and msg == "m1"


def test_oauth_state_roundtrip(db):
    assert gmail_store.oauth_state(db) == ""
    gmail_store.set_oauth_state(db, "nonce-1")
    assert gmail_store.oauth_state(db) == "nonce-1"
    gmail_store.clear_oauth_state(db)
    assert gmail_store.oauth_state(db) == ""
