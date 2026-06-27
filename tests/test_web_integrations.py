"""The Anthropic-key resolver and the write-only key integration endpoint."""

from __future__ import annotations

from web_helpers import new_test_app, open_db

from scout.store import settings as settings_store


def test_active_anthropic_key(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    state = client.app.state.scout
    con = open_db(db_path)

    # Neither set -> ("", "").
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert state.active_anthropic_key(con) == ("", "")

    # Only env set -> ("env-key", "env").
    monkeypatch.setenv("ANTHROPIC_API_KEY", "env-key")
    assert state.active_anthropic_key(con) == ("env-key", "env")

    # DB-stored key wins over env -> ("db-key", "db").
    settings_store.set_setting(con, settings_store.ANTHROPIC_KEY_SETTING, "db-key")
    assert state.active_anthropic_key(con) == ("db-key", "db")

    # Removing the DB key falls back to the env.
    settings_store.delete_setting(con, settings_store.ANTHROPIC_KEY_SETTING)
    assert state.active_anthropic_key(con)[1] == "env"
    con.close()


def test_anthropic_key_endpoint(tmp_path, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)  # isolate from host env
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    state = client.app.state.scout

    # Stub the verifier so no network call is made.
    flags = {"fail": False}

    def verify(_key):
        if flags["fail"]:
            raise ValueError("nope")

    state.key_verifier = verify

    # GET with nothing set -> has_key:false, key_source:null.
    rec = client.get("/api/integrations/anthropic")
    assert rec.status_code == 200
    assert rec.json() == {"has_key": False, "key_source": None}

    put = lambda body: client.put(
        "/api/integrations/anthropic", content=body, headers={"Content-Type": "application/json"}
    )

    # PUT a rejected key -> 400, nothing stored.
    flags["fail"] = True
    assert put('{"key":"bad"}').status_code == 400
    con = open_db(db_path)
    assert settings_store.get_setting(con, settings_store.ANTHROPIC_KEY_SETTING) == ""
    con.close()

    # PUT an accepted key -> 200, stored, client re-keyed, key never echoed.
    flags["fail"] = False
    rec = put('{"key":"sk-live-123"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    assert "sk-live-123" not in rec.text
    con = open_db(db_path)
    assert settings_store.get_setting(con, settings_store.ANTHROPIC_KEY_SETTING) == "sk-live-123"
    con.close()
    assert state.anthropic.has_key()

    # GET now reports the DB key; still never the bytes.
    rec = client.get("/api/integrations/anthropic")
    assert "sk-live-123" not in rec.text
    assert rec.json() == {"has_key": True, "key_source": "db"}

    # /api/meta reflects the stored key (verdict/capture true with no env set).
    meta = client.get("/api/meta").json()
    assert meta["verdict"] is True and meta["capture"] is True

    # DELETE -> falls back to env (set one), key_source:env, DB key removed.
    monkeypatch.setenv("ANTHROPIC_API_KEY", "env-fallback")
    rec = client.delete("/api/integrations/anthropic")
    assert rec.status_code == 200
    assert rec.json() == {"has_key": True, "key_source": "env"}
    con = open_db(db_path)
    assert settings_store.get_setting(con, settings_store.ANTHROPIC_KEY_SETTING) == ""
    con.close()
    assert state.anthropic.has_key()  # re-keyed to the env fallback


def test_missing_key_field_is_400(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)
    client.app.state.scout.key_verifier = lambda _key: None
    rec = client.put(
        "/api/integrations/anthropic", content="{}", headers={"Content-Type": "application/json"}
    )
    assert rec.status_code == 400
    assert "missing required field: key" in rec.json()["error"]
