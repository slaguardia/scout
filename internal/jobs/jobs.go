// Package jobs is a tiny in-process runner for scout's long-running pipeline
// stages (enrich, verdict, ingest, episodes) triggered from the UI.
//
// A job runs in a background goroutine; the HTTP layer returns immediately
// with an id and streams the job's progress lines over SSE. Live state
// (lines, cancel func) is in-memory; the durable record lives in the runs
// table (written by the caller via the OnFinish hook). Process restart loses
// in-flight jobs and live lines, never results — the DB has those.
package jobs

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Status values for a job.
const (
	StatusRunning  = "running"
	StatusDone     = "done"
	StatusFailed   = "failed"
	StatusCanceled = "canceled"
)

// Job is the live, in-memory view of a run.
type Job struct {
	ID      string
	Stage   string
	Status  string
	Started time.Time

	mu      sync.Mutex
	lines   []string
	subs    []chan string // SSE subscribers
	cancel  context.CancelFunc
	done    chan struct{}
}

// Func is the work a job performs. It receives a cancelable context and an
// emit callback for progress lines, and returns a summary + error.
type Func func(ctx context.Context, emit func(string)) (summary map[string]any, err error)

// Runner owns the set of jobs and enforces one-active-job-per-stage (and,
// because pipeline stages share the single SQLite writer, one job at a time
// overall).
type Runner struct {
	mu       sync.Mutex
	jobs     map[string]*Job
	active   string // id of the currently running job, "" if idle

	// OnStart / OnFinish let the caller persist to the runs table. Both may
	// be nil. OnFinish receives the terminal status, summary, and error text.
	OnStart  func(id, stage string)
	OnFinish func(id, status string, summary map[string]any, errMsg string)
}

// New returns an empty Runner.
func New() *Runner {
	return &Runner{jobs: map[string]*Job{}}
}

// Busy reports the stage of the currently-running job, or "" if idle.
func (r *Runner) Busy() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.active == "" {
		return ""
	}
	if j := r.jobs[r.active]; j != nil {
		return j.Stage
	}
	return ""
}

// ErrBusy is returned by Start when another job is already running.
type ErrBusy struct{ Stage string }

func (e ErrBusy) Error() string { return "a " + e.Stage + " job is already running" }

// Start launches fn as a new job for stage. Returns ErrBusy if another job is
// active. The job runs in its own goroutine.
func (r *Runner) Start(stage string, fn Func) (*Job, error) {
	r.mu.Lock()
	if r.active != "" {
		busyStage := stage
		if j := r.jobs[r.active]; j != nil {
			busyStage = j.Stage
		}
		r.mu.Unlock()
		return nil, ErrBusy{Stage: busyStage}
	}
	ctx, cancel := context.WithCancel(context.Background())
	j := &Job{
		ID:      uuid.NewString(),
		Stage:   stage,
		Status:  StatusRunning,
		Started: time.Now(),
		cancel:  cancel,
		done:    make(chan struct{}),
	}
	r.jobs[j.ID] = j
	r.active = j.ID
	r.mu.Unlock()

	if r.OnStart != nil {
		r.OnStart(j.ID, stage)
	}

	go func() {
		defer cancel()
		summary, err := fn(ctx, j.emit)
		status := StatusDone
		errMsg := ""
		if err != nil {
			if ctx.Err() != nil {
				status = StatusCanceled
			} else {
				status = StatusFailed
			}
			errMsg = err.Error()
		}
		j.finish(status)
		r.mu.Lock()
		r.active = ""
		r.mu.Unlock()
		if r.OnFinish != nil {
			r.OnFinish(j.ID, status, summary, errMsg)
		}
	}()

	return j, nil
}

// Get returns the job by id, or nil.
func (r *Runner) Get(id string) *Job {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.jobs[id]
}

// Cancel cancels a running job by id. No-op if not found or already done.
func (r *Runner) Cancel(id string) bool {
	r.mu.Lock()
	j := r.jobs[id]
	r.mu.Unlock()
	if j == nil {
		return false
	}
	j.mu.Lock()
	running := j.Status == StatusRunning
	j.mu.Unlock()
	if running {
		j.cancel()
		return true
	}
	return false
}

// --- Job methods ---

func (j *Job) emit(line string) {
	j.mu.Lock()
	j.lines = append(j.lines, line)
	subs := append([]chan string(nil), j.subs...)
	j.mu.Unlock()
	for _, ch := range subs {
		select {
		case ch <- line:
		default: // drop if a slow subscriber's buffer is full
		}
	}
}

func (j *Job) finish(status string) {
	j.mu.Lock()
	j.Status = status
	subs := j.subs
	j.subs = nil
	j.mu.Unlock()
	for _, ch := range subs {
		close(ch)
	}
	close(j.done)
}

// Lines returns a snapshot of the lines emitted so far.
func (j *Job) Lines() []string {
	j.mu.Lock()
	defer j.mu.Unlock()
	return append([]string(nil), j.lines...)
}

// CurrentStatus returns the job's status under lock.
func (j *Job) CurrentStatus() string {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.Status
}

// Subscribe returns a channel of future lines plus a snapshot of lines already
// emitted. The channel is closed when the job finishes. The caller must drain.
func (j *Job) Subscribe() (backlog []string, ch chan string, done <-chan struct{}) {
	j.mu.Lock()
	defer j.mu.Unlock()
	backlog = append([]string(nil), j.lines...)
	if j.Status != StatusRunning {
		// Already finished: return a closed channel so the consumer ends cleanly.
		closed := make(chan string)
		close(closed)
		return backlog, closed, j.done
	}
	c := make(chan string, 64)
	j.subs = append(j.subs, c)
	return backlog, c, j.done
}
