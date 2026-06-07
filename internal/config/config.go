// Package config manages Scout Server connection profiles persisted to disk.
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Server represents a Scout Server connection profile.
type Server struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	URL         string    `json:"url"`         // e.g. https://scout.corp.com:22160
	IgnoreTLS   bool      `json:"ignoreTls"`   // skip TLS verification (self-signed certs)
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// AIProvider holds credentials for a single AI provider.
type AIProvider struct {
	Provider string `json:"provider"` // claude | openai | gemini | copilot
	APIKey   string `json:"apiKey"`
	Model    string `json:"model"`
	Enabled  bool   `json:"enabled"`
}

// AppConfig is the top-level config file schema.
type AppConfig struct {
	Servers     []Server     `json:"servers"`
	AIProviders []AIProvider `json:"aiProviders"`
	GithubRepo  string       `json:"githubRepo"` // owner/repo for update checks
}

var (
	mu       sync.RWMutex
	filePath string
	current  AppConfig
)

// Init loads or creates the config file at the given path.
func Init(path string) error {
	filePath = path
	mu.Lock()
	defer mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		current = AppConfig{
			GithubRepo: "mathiast/ScoutRSOP",
			AIProviders: []AIProvider{
				{Provider: "claude", Model: "claude-sonnet-4-6", Enabled: false},
				{Provider: "openai", Model: "gpt-4o", Enabled: false},
				{Provider: "gemini", Model: "gemini-1.5-pro", Enabled: false},
				{Provider: "copilot", Model: "gpt-4o", Enabled: false},
			},
		}
		return save()
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(data, &current)
}

// Get returns a copy of the current config.
func Get() AppConfig {
	mu.RLock()
	defer mu.RUnlock()
	return current
}

// ListServers returns all configured servers.
func ListServers() []Server {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]Server, len(current.Servers))
	copy(out, current.Servers)
	return out
}

// AddServer adds a new server and persists.
func AddServer(s Server) (Server, error) {
	mu.Lock()
	defer mu.Unlock()
	s.ID = uuid.NewString()
	s.CreatedAt = time.Now()
	s.UpdatedAt = time.Now()
	current.Servers = append(current.Servers, s)
	return s, save()
}

// UpdateServer replaces an existing server by ID.
func UpdateServer(s Server) error {
	mu.Lock()
	defer mu.Unlock()
	for i, srv := range current.Servers {
		if srv.ID == s.ID {
			s.CreatedAt = srv.CreatedAt
			s.UpdatedAt = time.Now()
			current.Servers[i] = s
			return save()
		}
	}
	return os.ErrNotExist
}

// DeleteServer removes a server by ID.
func DeleteServer(id string) error {
	mu.Lock()
	defer mu.Unlock()
	for i, srv := range current.Servers {
		if srv.ID == id {
			current.Servers = append(current.Servers[:i], current.Servers[i+1:]...)
			return save()
		}
	}
	return os.ErrNotExist
}

// UpdateAIProviders replaces the full AI provider list.
func UpdateAIProviders(providers []AIProvider) error {
	mu.Lock()
	defer mu.Unlock()
	current.AIProviders = providers
	return save()
}

// UpdateGithubRepo sets the GitHub repo slug for update checks.
func UpdateGithubRepo(repo string) error {
	mu.Lock()
	defer mu.Unlock()
	current.GithubRepo = repo
	return save()
}

func save() error {
	data, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, data, 0o600)
}
