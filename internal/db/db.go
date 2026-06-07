// Package db manages the SQLite database for run history and saved tests.
package db

import (
	"database/sql"
	"encoding/json"
	"time"

	_ "modernc.org/sqlite"
)

var db *sql.DB

// Run represents a saved RSOP analysis run.
type Run struct {
	ID          string          `json:"id"`
	ServerID    string          `json:"serverId"`
	ServerName  string          `json:"serverName"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	BaseType    string          `json:"baseType"`    // "base" | "ou" | "device"
	BaseRef     string          `json:"baseRef"`     // OU path or device ID
	TargetType  string          `json:"targetType"`  // always "device"
	TargetRef   string          `json:"targetRef"`   // device ID
	Sections    []string        `json:"sections"`    // which config sections were included
	Result      json.RawMessage `json:"result"`      // full RSOP result JSON
	CreatedAt   time.Time       `json:"createdAt"`
}

// Init opens (or creates) the SQLite database at path.
func Init(path string) error {
	var err error
	db, err = sql.Open("sqlite", path)
	if err != nil {
		return err
	}
	return migrate()
}

func migrate() error {
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS runs (
		id          TEXT PRIMARY KEY,
		server_id   TEXT NOT NULL,
		server_name TEXT NOT NULL,
		name        TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		base_type   TEXT NOT NULL,
		base_ref    TEXT NOT NULL,
		target_type TEXT NOT NULL DEFAULT 'device',
		target_ref  TEXT NOT NULL,
		sections    TEXT NOT NULL DEFAULT '[]',
		result      TEXT NOT NULL DEFAULT '{}',
		created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_runs_server ON runs(server_id);
	CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);
	`)
	return err
}

// SaveRun inserts a new run record.
func SaveRun(r Run) error {
	sections, _ := json.Marshal(r.Sections)
	_, err := db.Exec(`
		INSERT INTO runs (id, server_id, server_name, name, description, base_type, base_ref, target_type, target_ref, sections, result, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.ID, r.ServerID, r.ServerName, r.Name, r.Description,
		r.BaseType, r.BaseRef, r.TargetType, r.TargetRef,
		string(sections), string(r.Result), r.CreatedAt,
	)
	return err
}

// ListRuns returns runs, optionally filtered by serverID.
func ListRuns(serverID string, limit int) ([]Run, error) {
	query := `SELECT id, server_id, server_name, name, description, base_type, base_ref, target_type, target_ref, sections, result, created_at
		FROM runs`
	args := []any{}
	if serverID != "" {
		query += ` WHERE server_id = ?`
		args = append(args, serverID)
	}
	query += ` ORDER BY created_at DESC LIMIT ?`
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []Run
	for rows.Next() {
		var r Run
		var sections, result, createdAt string
		if err := rows.Scan(&r.ID, &r.ServerID, &r.ServerName, &r.Name, &r.Description,
			&r.BaseType, &r.BaseRef, &r.TargetType, &r.TargetRef,
			&sections, &result, &createdAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(sections), &r.Sections)
		r.Result = json.RawMessage(result)
		r.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		runs = append(runs, r)
	}
	return runs, rows.Err()
}

// GetRun returns a single run by ID.
func GetRun(id string) (*Run, error) {
	var r Run
	var sections, result, createdAt string
	err := db.QueryRow(`SELECT id, server_id, server_name, name, description, base_type, base_ref, target_type, target_ref, sections, result, created_at
		FROM runs WHERE id = ?`, id).
		Scan(&r.ID, &r.ServerID, &r.ServerName, &r.Name, &r.Description,
			&r.BaseType, &r.BaseRef, &r.TargetType, &r.TargetRef,
			&sections, &result, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(sections), &r.Sections)
	r.Result = json.RawMessage(result)
	r.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return &r, nil
}

// DeleteRun removes a run by ID.
func DeleteRun(id string) error {
	_, err := db.Exec(`DELETE FROM runs WHERE id = ?`, id)
	return err
}
