// Package update checks for new releases on GitHub.
package update

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// AppVersion is the current build version, injected at build time via -ldflags.
var AppVersion = "dev"

// BuildDate is the build date, injected at build time via -ldflags.
var BuildDate = "unknown"

// ReleaseInfo describes a GitHub release.
type ReleaseInfo struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	Body        string    `json:"body"`
	HTMLURL     string    `json:"html_url"`
	PublishedAt time.Time `json:"published_at"`
	Current     string    `json:"current"`
	BuildDate   string    `json:"buildDate"`
	UpdateAvail bool      `json:"updateAvailable"`
}

var httpClient = &http.Client{Timeout: 10 * time.Second}

// CheckLatest fetches the latest release from the given GitHub repo (owner/repo).
func CheckLatest(repo string) (*ReleaseInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo)
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "ScoutRSOP/"+AppVersion)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("network error checking for updates: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return &ReleaseInfo{Current: AppVersion, BuildDate: BuildDate, UpdateAvail: false}, nil
	}
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("github api error %d: %s", resp.StatusCode, string(body))
	}

	var info ReleaseInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}

	info.Current = AppVersion
	info.BuildDate = BuildDate
	info.UpdateAvail = info.TagName != "" && info.TagName != AppVersion && AppVersion != "dev"

	return &info, nil
}

// ListReleases returns recent releases (for changelog display).
func ListReleases(repo string, limit int) ([]ReleaseInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=%d", repo, limit)
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "ScoutRSOP/"+AppVersion)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("github api error %d", resp.StatusCode)
	}

	var releases []ReleaseInfo
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, err
	}
	for i := range releases {
		releases[i].Current = AppVersion
		releases[i].BuildDate = BuildDate
	}
	return releases, nil
}
