"""Port of internal/store/enrichment_test.go."""
from scout.store import enrichment
from scout.store.companies import Company, upsert_company
from scout.store.enrichment import Enrichment


def test_enrichment_targets_only_blanks(db):
    id_a = upsert_company(db, Company(source="test", name="A", domain="a.com", raw_json="{}"))
    upsert_company(db, Company(source="test", name="B", domain="b.com", raw_json="{}"))

    # A is enriched, then "re-ingested" later — its cache is stale.
    enrichment.upsert_enrichment(db, Enrichment(company_id=id_a, fetch_status="ok"))
    db.execute("UPDATE companies SET ingested_at = datetime('now', '+1 hour') WHERE id = ?", (id_a,))

    def names(force, only_blanks):
        return {t.name for t in enrichment.enrichment_targets(db, force, only_blanks, None)}

    got = names(False, False)
    assert "A" in got and "B" in got
    got = names(False, True)
    assert "A" not in got and "B" in got
    got = names(True, True)
    assert "A" in got and "B" in got

    # Targeted: exactly the asked-for company, even when its cache is fresh.
    db.execute("UPDATE companies SET ingested_at = datetime('now', '-1 hour') WHERE id = ?", (id_a,))
    ts = enrichment.enrichment_targets(db, False, True, [id_a])
    assert len(ts) == 1 and ts[0].name == "A"
