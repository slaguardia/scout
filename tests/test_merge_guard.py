"""Port of internal/store/merge_guard_test.go.

companyChildTables is hand-maintained and drives merge_company / _fold_children.
This derives the truth from the live schema and fails if the list drifts.
"""
from scout.store import companies


def test_company_child_tables_match_schema(db):
    tables = [
        r[0] for r in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    ]

    referencing = []
    for table in tables:
        for fk in db.execute(f"PRAGMA foreign_key_list({table})").fetchall():
            # columns: id, seq, table, from, to, on_update, on_delete, match
            ref_table, from_col = fk[2], fk[3]
            if ref_table == "companies" and from_col == "company_id":
                referencing.append(table)
                break

    assert sorted(referencing) == sorted(companies.COMPANY_CHILD_TABLES)
