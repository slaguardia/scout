package store

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
)

// Chat scopes. A thread is global (the tracking agent) or bound to one entity
// (the per-entity research chat). scope_id is the company/posting id; "" (NULL)
// for global.
const (
	ChatScopeGlobal  = "global"
	ChatScopeCompany = "company"
	ChatScopePosting = "posting"
)

// ChatThread is one conversation. A panel reuses its (scope, scope_id) thread
// across visits — see OpenOrCreateThread.
type ChatThread struct {
	ID        string `json:"id"`
	Scope     string `json:"scope"`
	ScopeID   string `json:"scope_id"` // "" for global
	Title     string `json:"title"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// ChatMessage is one turn. Content is the raw content-block JSON array (text +
// any tool_use / tool_result / thinking blocks), stored verbatim so it replays
// into the next API turn without reconstruction.
type ChatMessage struct {
	ID        string          `json:"id"`
	ThreadID  string          `json:"thread_id"`
	Role      string          `json:"role"`
	Content   json.RawMessage `json:"content"`
	CreatedAt string          `json:"created_at"`
}

func scanThread(row interface{ Scan(...any) error }) (*ChatThread, error) {
	var t ChatThread
	var scopeID, title, updated sql.NullString
	if err := row.Scan(&t.ID, &t.Scope, &scopeID, &title, &t.CreatedAt, &updated); err != nil {
		return nil, err
	}
	t.ScopeID = scopeID.String
	t.Title = title.String
	t.UpdatedAt = updated.String
	return &t, nil
}

const threadCols = `id, scope, scope_id, title, created_at, updated_at`

// OpenOrCreateThread returns the thread for (scope, scopeID), creating it on
// first sight. scopeID "" means global. Idempotent: a panel's repeat visits
// resolve to the same accumulating thread (guarded by the unique scope index).
func (db *DB) OpenOrCreateThread(scope, scopeID string) (*ChatThread, error) {
	switch scope {
	case ChatScopeGlobal, ChatScopeCompany, ChatScopePosting:
	default:
		return nil, fmt.Errorf("unknown chat scope %q", scope)
	}
	if scope == ChatScopeGlobal {
		scopeID = "" // global threads carry no entity id
	} else if scopeID == "" {
		return nil, fmt.Errorf("scope %q requires a scope_id", scope)
	}

	if t, err := db.findThread(scope, scopeID); err != nil {
		return nil, err
	} else if t != nil {
		return t, nil
	}

	id := uuid.NewString()
	var scopeVal sql.NullString
	if scopeID != "" {
		scopeVal = sql.NullString{String: scopeID, Valid: true}
	}
	// Create only if still absent — the WHERE NOT EXISTS makes a concurrent
	// double-open collapse to one row instead of tripping the unique index.
	const q = `INSERT INTO chat_threads (id, scope, scope_id, updated_at)
	           SELECT ?, ?, ?, CURRENT_TIMESTAMP
	           WHERE NOT EXISTS (SELECT 1 FROM chat_threads WHERE scope = ? AND COALESCE(scope_id, '') = ?)`
	if _, err := db.Exec(q, id, scope, scopeVal, scope, scopeID); err != nil {
		return nil, fmt.Errorf("create chat thread: %w", err)
	}
	t, err := db.findThread(scope, scopeID)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, fmt.Errorf("create chat thread: row vanished")
	}
	return t, nil
}

func (db *DB) findThread(scope, scopeID string) (*ChatThread, error) {
	const q = `SELECT ` + threadCols + ` FROM chat_threads
	           WHERE scope = ? AND COALESCE(scope_id, '') = ? LIMIT 1`
	t, err := scanThread(db.QueryRow(q, scope, scopeID))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return t, nil
}

// GetThread returns one thread by id, or (nil, nil) when absent.
func (db *DB) GetThread(id string) (*ChatThread, error) {
	t, err := scanThread(db.QueryRow(`SELECT `+threadCols+` FROM chat_threads WHERE id = ?`, id))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return t, nil
}

// ListThreads returns the threads for a scope, newest-updated first. scopeID ""
// with a non-global scope lists every thread of that scope; with global it's
// the single global thread.
func (db *DB) ListThreads(scope string) ([]ChatThread, error) {
	const q = `SELECT ` + threadCols + ` FROM chat_threads WHERE scope = ?
	           ORDER BY COALESCE(updated_at, created_at) DESC, rowid DESC`
	rows, err := db.Query(q, scope)
	if err != nil {
		return nil, fmt.Errorf("list chat threads: %w", err)
	}
	defer rows.Close()
	out := []ChatThread{}
	for rows.Next() {
		t, err := scanThread(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

// AppendMessage stores one turn and returns it. content is the raw content-block
// JSON array. The first user line seeds the thread title when it's still unset;
// every append bumps updated_at so ListThreads orders by recency. Returns
// sql.ErrNoRows if the thread doesn't exist.
func (db *DB) AppendMessage(threadID, role string, content json.RawMessage, title string) (*ChatMessage, error) {
	if len(content) == 0 {
		return nil, fmt.Errorf("chat message content is empty")
	}
	exists, err := db.threadExists(threadID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, sql.ErrNoRows
	}

	id := uuid.NewString()
	if _, err := db.Exec(
		`INSERT INTO chat_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)`,
		id, threadID, role, string(content),
	); err != nil {
		return nil, fmt.Errorf("append chat message: %w", err)
	}
	// Bump updated_at; set the title only if blank (first user line wins).
	if _, err := db.Exec(
		`UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP,
		     title = CASE WHEN (title IS NULL OR title = '') AND ? <> '' THEN ? ELSE title END
		 WHERE id = ?`,
		title, title, threadID,
	); err != nil {
		return nil, fmt.Errorf("touch chat thread: %w", err)
	}

	return db.readMessage(id)
}

func (db *DB) threadExists(id string) (bool, error) {
	var n int
	if err := db.QueryRow(`SELECT COUNT(1) FROM chat_threads WHERE id = ?`, id).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

func (db *DB) readMessage(id string) (*ChatMessage, error) {
	var m ChatMessage
	var content string
	err := db.QueryRow(
		`SELECT id, thread_id, role, content, created_at FROM chat_messages WHERE id = ?`, id,
	).Scan(&m.ID, &m.ThreadID, &m.Role, &content, &m.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("read chat message %s: %w", id, err)
	}
	m.Content = json.RawMessage(content)
	return &m, nil
}

// ThreadMessages returns a thread's messages oldest-first (created_at, then
// rowid to break sub-second ties deterministically). Empty (non-nil) when none.
func (db *DB) ThreadMessages(threadID string) ([]ChatMessage, error) {
	const q = `SELECT id, thread_id, role, content, created_at FROM chat_messages
	           WHERE thread_id = ? ORDER BY created_at ASC, rowid ASC`
	rows, err := db.Query(q, threadID)
	if err != nil {
		return nil, fmt.Errorf("list chat messages: %w", err)
	}
	defer rows.Close()
	out := []ChatMessage{}
	for rows.Next() {
		var m ChatMessage
		var content string
		if err := rows.Scan(&m.ID, &m.ThreadID, &m.Role, &content, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.Content = json.RawMessage(content)
		out = append(out, m)
	}
	return out, rows.Err()
}
