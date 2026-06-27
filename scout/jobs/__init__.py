"""Package jobs is a tiny in-process runner for scout's long-running pipeline
stages (ingest, enrich, verdict) triggered from the UI.

A job runs in a background thread; the HTTP layer returns immediately with an id
and streams the job's progress lines over SSE. Live state (lines, cancel) is
in-memory; the durable record lives in the runs table (written by the caller via
the on_finish hook). Process restart loses in-flight jobs and live lines, never
results — the DB has those.

Concurrency model: each job runs on a threading.Thread; cancellation rides on a
Context wrapping a threading.Event; an SSE subscriber is a queue.Queue closed by
enqueuing a None sentinel. The work Func returns its summary and raises on failure.
"""

from __future__ import annotations

import queue
import threading
import time
import uuid
from collections.abc import Callable

# Status values for a job.
STATUS_RUNNING = "running"
STATUS_DONE = "done"
STATUS_FAILED = "failed"
STATUS_CANCELED = "canceled"


class Context:
    """The cancelable context handed to a job's work function. cancel() sets the
    underlying event; cancelled() reports whether cancellation has been requested."""

    def __init__(self) -> None:
        self._ev = threading.Event()

    def cancel(self) -> None:
        self._ev.set()

    def cancelled(self) -> bool:
        return self._ev.is_set()


# Func is the work a job performs. It receives a cancelable Context and an emit
# callback for progress lines, and returns a summary dict (raising on failure). id
# is the job's id, so work can tag any durable rows it writes (e.g. the run uuid).
Func = Callable[[Context, str, Callable[[str], None]], "dict | None"]


class ErrBusy(Exception):
    """Raised by Runner.start when another job is already running."""

    def __init__(self, stage: str):
        super().__init__(f"a {stage} job is already running")
        self.stage = stage


class Job:
    """The live, in-memory view of a run."""

    def __init__(self, id: str, stage: str, cancel_ctx: Context):
        self.id = id
        self.stage = stage
        self.status = STATUS_RUNNING
        self.started = time.time()

        self._mu = threading.Lock()
        self._lines: list[str] = []
        self._subs: list[queue.Queue] = []  # SSE subscribers
        self._ctx = cancel_ctx
        self._done = threading.Event()

    def emit(self, line: str) -> None:
        with self._mu:
            self._lines.append(line)
            subs = list(self._subs)
        for ch in subs:
            try:
                ch.put_nowait(line)
            except queue.Full:  # drop if a slow subscriber's buffer is full
                pass

    def _finish(self, status: str) -> None:
        with self._mu:
            self.status = status
            subs = self._subs
            self._subs = []
        for ch in subs:
            ch.put_nowait(None)  # close: a None sentinel ends the consumer's drain
        self._done.set()

    def lines(self) -> list[str]:
        """A snapshot of the lines emitted so far."""
        with self._mu:
            return list(self._lines)

    def current_status(self) -> str:
        """The job's status under lock."""
        with self._mu:
            return self.status

    def subscribe(self) -> tuple[list[str], queue.Queue, threading.Event]:
        """Return (backlog, ch, done): a snapshot of lines already emitted, a queue
        of future lines (terminated by a None sentinel when the job finishes), and
        the done event. The caller must drain ch."""
        with self._mu:
            backlog = list(self._lines)
            if self.status != STATUS_RUNNING:
                # Already finished: return a pre-closed queue so the consumer ends
                # cleanly.
                closed: queue.Queue = queue.Queue()
                closed.put_nowait(None)
                return backlog, closed, self._done
            c: queue.Queue = queue.Queue(maxsize=64)
            self._subs.append(c)
            return backlog, c, self._done


class Runner:
    """Owns the set of jobs and enforces one-active-job-per-stage (and, because
    pipeline stages share the single SQLite writer, one job at a time overall)."""

    def __init__(self) -> None:
        self._mu = threading.Lock()
        self._jobs: dict[str, Job] = {}
        self._active = ""  # id of the currently running job, "" if idle

        # on_start / on_finish let the caller persist to the runs table. Both may
        # be None. on_finish receives the terminal status, summary, and error text.
        self.on_start: Callable[[str, str], None] | None = None
        self.on_finish: Callable[[str, str, dict | None, str], None] | None = None

    def busy(self) -> str:
        """The stage of the currently-running job, or "" if idle."""
        with self._mu:
            if self._active == "":
                return ""
            j = self._jobs.get(self._active)
            return j.stage if j is not None else ""

    def start(self, stage: str, fn: Func) -> Job:
        """Launch fn as a new job for stage. Raises ErrBusy if another job is
        active. The job runs in its own thread."""
        with self._mu:
            if self._active != "":
                busy_stage = stage
                j = self._jobs.get(self._active)
                if j is not None:
                    busy_stage = j.stage
                raise ErrBusy(busy_stage)
            ctx = Context()
            job = Job(id=str(uuid.uuid4()), stage=stage, cancel_ctx=ctx)
            self._jobs[job.id] = job
            self._active = job.id

        if self.on_start is not None:
            self.on_start(job.id, stage)

        def run() -> None:
            summary: dict | None = None
            status = STATUS_DONE
            err_msg = ""
            try:
                summary = fn(ctx, job.id, job.emit)
            except Exception as e:  # noqa: BLE001 - any work failure is a terminal status
                if ctx.cancelled():
                    status = STATUS_CANCELED
                else:
                    status = STATUS_FAILED
                err_msg = str(e)
            finally:
                ctx.cancel()
            job._finish(status)
            with self._mu:
                self._active = ""
            if self.on_finish is not None:
                self.on_finish(job.id, status, summary, err_msg)

        threading.Thread(target=run, daemon=True).start()
        return job

    def get(self, id: str) -> Job | None:
        """The job by id, or None."""
        with self._mu:
            return self._jobs.get(id)

    def cancel(self, id: str) -> bool:
        """Cancel a running job by id. No-op if not found or already done."""
        with self._mu:
            j = self._jobs.get(id)
        if j is None:
            return False
        with j._mu:
            running = j.status == STATUS_RUNNING
        if running:
            j._ctx.cancel()
            return True
        return False
