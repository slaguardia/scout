"""Smoke tests for the argparse CLI (scout/cli.py).

There are no Go CLI tests to port, so these verify the wiring: argparse parses
the top-level and every subcommand's --help, the helper parsers behave, the
dotenv loader matches the Go semantics, and a couple of commands run end-to-end
against a temp DB with no network (stats, backup).
"""
from __future__ import annotations

import os

import pytest

from scout import cli


# --- helper parsers ----------------------------------------------------------


def test_parse_duration():
    assert cli.parse_duration("12s") == 12.0
    assert cli.parse_duration("6h") == 21600.0
    assert cli.parse_duration("2m") == 120.0
    assert cli.parse_duration("1h30m") == 5400.0
    assert cli.parse_duration("500ms") == 0.5
    assert cli.parse_duration("0") == 0.0
    assert cli.parse_duration("") == 0.0
    with pytest.raises(Exception):
        cli.parse_duration("nope")


def test_parse_addr():
    assert cli.parse_addr(":8765") == ("0.0.0.0", 8765)
    assert cli.parse_addr("127.0.0.1:8807") == ("127.0.0.1", 8807)
    assert cli.parse_addr("localhost:5173") == ("localhost", 5173)
    with pytest.raises(ValueError):
        cli.parse_addr("8765")  # no colon


def test_split_ids():
    assert cli.split_ids("a, b ,,c") == ["a", "b", "c"]
    assert cli.split_ids("") == []


def test_url_host():
    assert cli.url_host("https://www.greenhouse.io/jobs/1") == "greenhouse.io"
    assert cli.url_host("not a url") == "(unknown)"


# --- dotenv (port of dotenv.go) ---------------------------------------------


def test_load_dotenv(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text(
        "# a comment\n"
        "\n"
        "export FOO=bar\n"
        'QUOTED="hello world"\n'
        "SINGLE='x'\n"
        "PREEXISTING=fromfile\n"
    )
    monkeypatch.delenv("FOO", raising=False)
    monkeypatch.delenv("QUOTED", raising=False)
    monkeypatch.delenv("SINGLE", raising=False)
    monkeypatch.setenv("PREEXISTING", "fromenv")  # real env must win

    cli.load_dotenv(str(env))
    assert os.environ["FOO"] == "bar"
    assert os.environ["QUOTED"] == "hello world"
    assert os.environ["SINGLE"] == "x"
    assert os.environ["PREEXISTING"] == "fromenv"


def test_load_dotenv_missing_is_noop(tmp_path):
    cli.load_dotenv(str(tmp_path / "does-not-exist.env"))  # no raise


# --- argparse wiring: --help parses for the top level + each subcommand ------


def test_top_level_help_exits_zero(capsys):
    with pytest.raises(SystemExit) as exc:
        cli.build_parser().parse_args(["--help"])
    assert exc.value.code == 0
    assert "personal job-research pipeline" in capsys.readouterr().out


@pytest.mark.parametrize(
    "argv",
    [
        ["ingest", "--help"],
        ["filter", "--help"],
        ["enrich", "--help"],
        ["verdict", "--help"],
        ["distill", "--help"],
        ["outreach", "--help"],
        ["outreach", "sources", "--help"],
        ["outreach", "draft", "--help"],
        ["questions", "--help"],
        ["questions", "detect", "--help"],
        ["serve", "--help"],
        ["stats", "--help"],
        ["backup", "--help"],
        ["restore", "--help"],
    ],
)
def test_subcommand_help_parses(argv, capsys):
    with pytest.raises(SystemExit) as exc:
        cli.build_parser().parse_args(argv)
    assert exc.value.code == 0
    capsys.readouterr()  # drain


def test_flag_defaults_wired():
    """A representative parse pins the Go flag defaults onto the namespace."""
    p = cli.build_parser()
    a = p.parse_args(["serve"])
    assert a.addr == ":8765"
    assert a.db == "scout.db"
    assert a.brain_cache_ttl == 21600.0
    assert a.reconcile_interval == 120.0

    a = p.parse_args(["enrich"])
    assert a.workers == 8
    assert a.timeout == 12.0
    assert a.force is False

    a = p.parse_args(["verdict"])
    assert a.workers == 10
    assert a.model  # haiku default present


# --- a parent command with no subcommand errors like Go (exit 1) -------------


@pytest.mark.parametrize(
    "argv,msg",
    [(["outreach"], "sources | draft"), (["questions"], "detect")],
)
def test_parent_command_requires_subcommand(argv, msg, capsys):
    with pytest.raises(SystemExit) as exc:
        cli.main(argv)
    assert exc.value.code == 1
    assert msg in capsys.readouterr().err


# --- end-to-end against a temp DB (no network) -------------------------------


def test_stats_empty_db(tmp_path, capsys, monkeypatch):
    monkeypatch.chdir(tmp_path)  # so load_dotenv(".env") finds nothing here
    db = tmp_path / "s.db"
    cli.main(["stats", "--db", str(db)])
    assert "companies=0" in capsys.readouterr().out


def test_stats_after_ingest(tmp_path, capsys, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = tmp_path / "s.db"
    csv = tmp_path / "in.csv"
    csv.write_text("name,website,location\nAcme,acme.com,SF\nBeta,beta.io,Remote\n")

    cli.main(["ingest", str(csv), "--db", str(db)])
    out = capsys.readouterr().out
    assert "read=2 upserted=2" in out

    cli.main(["stats", "--db", str(db)])
    assert "companies=2" in capsys.readouterr().out


def test_backup_writes_snapshot(tmp_path, capsys, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = tmp_path / "s.db"
    cli.main(["stats", "--db", str(db)])  # create + migrate the db
    capsys.readouterr()

    snap = tmp_path / "snap.db"
    cli.main(["backup", "--db", str(db), "--out", str(snap)])
    assert snap.exists()
    assert "backup written" in capsys.readouterr().out

    # Refuses to overwrite an existing snapshot (Go's os.Stat guard).
    with pytest.raises(SystemExit) as exc:
        cli.main(["backup", "--db", str(db), "--out", str(snap)])
    assert exc.value.code != 0


def test_restore_roundtrips(tmp_path, capsys, monkeypatch):
    monkeypatch.chdir(tmp_path)
    src = tmp_path / "src.db"
    csv = tmp_path / "in.csv"
    csv.write_text("name,website\nAcme,acme.com\n")
    cli.main(["ingest", str(csv), "--db", str(src)])
    snap = tmp_path / "snap.db"
    cli.main(["backup", "--db", str(src), "--out", str(snap)])
    capsys.readouterr()

    target = tmp_path / "live.db"
    cli.main(["restore", str(snap), "--db", str(target), "--force"])
    assert "restored" in capsys.readouterr().out

    cli.main(["stats", "--db", str(target)])
    assert "companies=1" in capsys.readouterr().out
