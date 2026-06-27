"""A thin HTTP/JSON client for the brain service.

Scout uses the brain READ-ONLY through reads: recall (search), map (discovery),
doc (deterministic whole-document fetch), changes (cheap change signal), and a
liveness health probe. The brain is a pgvector document substrate — a librarian
that returns faithful content and never a verdict. Scout does all interpretation
locally and never writes.

Contract (verified against the brain's api.py):

    GET  /health                    -> {ok:true}
    GET  /recall?q=&k=&complete=    -> {chunks:[{id,heading,text,score,path}]}
    GET  /doc?id=                   -> {id,title,path,version,text}
    GET  /map                       -> {sources:[{id,title,path,parent_id,version}]}
    GET  /changes?since=            -> {cursor,changed}

The brain is an enhancement, never a hard dependency: when it is unreachable
callers fall back to local criteria (taste.md). If the base URL isn't configured,
every call raises a "not configured" error.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

import httpx

_MAX_RESPONSE_SIZE = 1 << 20


@dataclass
class Chunk:
    """One retrieved section: a heading, its prose text, the hybrid-search
    relevance score, and the source path it came from. id is the owning
    document's stable id — the bridge to doc()."""

    id: str = ""
    heading: str = ""
    text: str = ""
    score: float = 0.0
    path: str = ""


@dataclass
class RecallResult:
    """GET /recall: the top-k chunks matching a query."""

    chunks: list[Chunk] = field(default_factory=list)


@dataclass
class Doc:
    """One whole document: the stored text VERBATIM. version is a content stamp
    over {title, text} — cache text keyed by version from the same response."""

    id: str = ""
    title: str = ""
    path: str = ""
    version: str = ""
    text: str = ""


@dataclass
class MapSource:
    """One synced document in the brain's tree: the stable id to pin,
    display-only title/path, and the version stamp. parent_id links to the parent
    document when that parent is itself synced, else None."""

    id: str = ""
    title: str = ""
    path: str = ""
    parent_id: str | None = None
    version: str = ""


@dataclass
class MapResult:
    """GET /map: the synced document tree."""

    sources: list[MapSource] = field(default_factory=list)


@dataclass
class ChangesResult:
    """GET /changes: the brain's Tier 0 change signal. cursor is the brain's
    current opaque change stamp (compare for equality only, never parse); changed
    reports whether it differs from the `since` the caller passed."""

    cursor: str = ""
    changed: bool = False


class HTTPError(Exception):
    """A non-2xx brain response, carrying the status so callers can branch on it
    (a 404 on a pinned doc id is a loud, distinct failure)."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def is_not_found(err: Exception) -> bool:
    """Whether err is a brain HTTP 404."""
    return isinstance(err, HTTPError) and err.status == 404


def _error_detail(raw: bytes) -> str:
    """Pull {"error":"..."} out of an error body, falling back to the raw
    (trimmed) text."""
    try:
        e = json.loads(raw)
        if isinstance(e, dict) and e.get("error"):
            return e["error"]
    except Exception:  # noqa: BLE001 - any decode failure → fall back to raw text
        pass
    return raw.decode(errors="replace").strip()


class Client:
    """A brain HTTP client.

    base_url like "http://127.0.0.1:8100". Empty disables the client (every call
    raises). auth is an optional bearer token (VPS path), sourced from
    BRAIN_BEARER_TOKEN by new(); empty (and unused) for local dev.
    """

    def __init__(self, base_url: str, auth: str = "", http: httpx.Client | None = None):
        self.base_url = base_url.rstrip("/")
        self.auth = auth
        self.http = http if http is not None else httpx.Client(timeout=60.0)

    def enabled(self) -> bool:
        """Whether a base URL is configured."""
        return self.base_url != ""

    def health(self) -> None:
        """Probe liveness. Returns None when the brain is up; raises otherwise."""
        out = self._get_json("/health", None)
        if not out.get("ok"):
            raise RuntimeError("brain health: ok=false")

    def recall(self, query: str, k: int) -> RecallResult:
        """Fetch the top-k chunks most relevant to a natural-language query.
        k <= 0 omits the param (the brain defaults to 12)."""
        return self._recall(query, k, False)

    def recall_complete(self, query: str, k: int) -> RecallResult:
        """recall with complete=true: the brain returns everything IT judges
        relevant, with k as a safety cap only."""
        return self._recall(query, k, True)

    def _recall(self, query: str, k: int, complete: bool) -> RecallResult:
        params: list[tuple[str, str]] = [("q", query)]
        if k > 0:
            params.append(("k", str(k)))
        if complete:
            params.append(("complete", "true"))
        out = self._get_json("/recall", params)
        return RecallResult(
            chunks=[
                Chunk(
                    id=c.get("id", ""),
                    heading=c.get("heading", ""),
                    text=c.get("text", ""),
                    score=c.get("score", 0.0),
                    path=c.get("path", ""),
                )
                for c in (out.get("chunks") or [])
            ]
        )

    def doc(self, id: str) -> Doc:
        """Fetch one whole document by its stable id. A 404 means the document left
        the synced set (or was never ingested) — for a pinned id that is a LOUD
        failure (is_not_found classifies it)."""
        out = self._get_json("/doc", [("id", id)])
        return Doc(
            id=out.get("id", ""),
            title=out.get("title", ""),
            path=out.get("path", ""),
            version=out.get("version", ""),
            text=out.get("text", ""),
        )

    def map(self) -> MapResult:
        """Fetch the synced document tree — the discovery surface where pinnable
        ids come from."""
        out = self._get_json("/map", None)
        return MapResult(
            sources=[
                MapSource(
                    id=s.get("id", ""),
                    title=s.get("title", ""),
                    path=s.get("path", ""),
                    parent_id=s.get("parent_id"),
                    version=s.get("version", ""),
                )
                for s in (out.get("sources") or [])
            ]
        )

    def changes(self, since: str) -> ChangesResult:
        """The cheap 'did anything in the brain move since `since`?' read. `since`
        is sent as-is (present even when empty)."""
        out = self._get_json("/changes", [("since", since)])
        return ChangesResult(cursor=out.get("cursor", ""), changed=out.get("changed", False))

    # --- transport ---

    def _get_json(self, path: str, params) -> dict:
        if not self.enabled():
            raise RuntimeError("brainbot: not configured")
        headers = {"Accept": "application/json"}
        if self.auth != "":
            headers["Authorization"] = "Bearer " + self.auth
        try:
            resp = self.http.get(self.base_url + path, params=params, headers=headers)
        except httpx.RequestError as e:
            raise RuntimeError(f"brain GET {path}: {e}")
        raw = resp.content[:_MAX_RESPONSE_SIZE]
        if resp.status_code // 100 != 2:
            raise HTTPError(
                resp.status_code,
                f"brain GET {path}: HTTP {resp.status_code}: {_error_detail(raw)}",
            )
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"brain GET {path}: decode: {e}")


def new(base_url: str) -> Client:
    """Build a client. base_url like 'http://127.0.0.1:8100'; empty disables it.
    The bearer token (for the VPS edge) is read from BRAIN_BEARER_TOKEN."""
    return Client(base_url=base_url, auth=os.environ.get("BRAIN_BEARER_TOKEN", ""))
