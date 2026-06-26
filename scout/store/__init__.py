"""scout.store — the SQLite persistence layer.

Mirrors the Go internal/store package. db.py is the foundation (connection +
migrations); the per-table query modules will be ported on top of it.
"""
