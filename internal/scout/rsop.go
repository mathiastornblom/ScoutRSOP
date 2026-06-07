// Package scout - RSOP engine: fetches and merges config for diff analysis.
package scout

import (
	"encoding/json"
	"fmt"
	"sync"
)

// RSOPRequest defines what to compare.
type RSOPRequest struct {
	BaseType  string   // "base" | "ou" | "device"
	BaseRef   string   // OU path or device ID (empty for base)
	TargetRef string   // device ID to compare against
	Sections  []string // empty = all ConfigSections
}

// RSOPSection holds the raw config for one section at each level.
type RSOPSection struct {
	Section    string          `json:"section"`
	Base       json.RawMessage `json:"base"`
	Comparison json.RawMessage `json:"comparison"` // the BaseType config
	Device     json.RawMessage `json:"device"`     // effective device config
	Diff       []DiffEntry     `json:"diff"`
}

// DiffEntry represents a single key-value difference.
type DiffEntry struct {
	Key         string `json:"key"`
	BaseValue   any    `json:"baseValue"`
	TargetValue any    `json:"targetValue"`
	Status      string `json:"status"` // "added" | "removed" | "changed" | "same"
}

// RSOPResult is the full analysis output.
type RSOPResult struct {
	Request       RSOPRequest            `json:"request"`
	Sections      []RSOPSection          `json:"sections"`
	Applications  *ApplicationComparison `json:"applications"`
	Labels        json.RawMessage        `json:"labels"`
	Rules         json.RawMessage        `json:"rules"`
	ConfigOrigins json.RawMessage        `json:"configOrigins"`
	Summary       RSOPSummary            `json:"summary"`
}

// RSOPSummary provides quick stats.
type RSOPSummary struct {
	TotalKeys   int `json:"totalKeys"`
	ChangedKeys int `json:"changedKeys"`
	AddedKeys   int `json:"addedKeys"`
	RemovedKeys int `json:"removedKeys"`
	SameKeys    int `json:"sameKeys"`
}

// ApplicationComparison holds app-level diff.
type ApplicationComparison struct {
	Base       json.RawMessage `json:"base"`
	Comparison json.RawMessage `json:"comparison"`
	Device     json.RawMessage `json:"device"`
	Diff       []DiffEntry     `json:"diff"`
}

// Run executes an RSOP analysis.
func (c *Client) Run(req RSOPRequest) (*RSOPResult, error) {
	sections := req.Sections
	if len(sections) == 0 {
		sections = ConfigSections
	}

	result := &RSOPResult{Request: req}

	type sectionResult struct {
		idx int
		sec RSOPSection
		err error
	}
	ch := make(chan sectionResult, len(sections))
	var wg sync.WaitGroup

	for i, section := range sections {
		wg.Add(1)
		go func(idx int, sec string) {
			defer wg.Done()
			s, err := c.fetchSection(req, sec)
			ch <- sectionResult{idx, s, err}
		}(i, section)
	}

	wg.Wait()
	close(ch)

	sectionMap := make(map[int]RSOPSection)
	for r := range ch {
		if r.err != nil {
			// Non-fatal: some sections may not exist for a device/OU
			sectionMap[r.idx] = RSOPSection{Section: sections[r.idx], Diff: []DiffEntry{}}
			continue
		}
		sectionMap[r.idx] = r.sec
	}

	result.Sections = make([]RSOPSection, len(sections))
	for i := range sections {
		result.Sections[i] = sectionMap[i]
	}

	// Applications
	apps, err := c.fetchApplicationComparison(req)
	if err == nil {
		result.Applications = apps
	}

	// Labels and rules (base only)
	result.Labels, _ = c.GetLabels()
	result.Rules, _ = c.GetRules()

	// Config origins for target device
	result.ConfigOrigins, _ = c.GetDeviceConfigOrigins(req.TargetRef)

	// Build summary
	for _, s := range result.Sections {
		for _, d := range s.Diff {
			result.Summary.TotalKeys++
			switch d.Status {
			case "changed":
				result.Summary.ChangedKeys++
			case "added":
				result.Summary.AddedKeys++
			case "removed":
				result.Summary.RemovedKeys++
			case "same":
				result.Summary.SameKeys++
			}
		}
	}

	return result, nil
}

func (c *Client) fetchSection(req RSOPRequest, section string) (RSOPSection, error) {
	s := RSOPSection{Section: section}
	var err error

	s.Base, err = c.GetBaseConfig(section)
	if err != nil {
		return s, fmt.Errorf("base/%s: %w", section, err)
	}

	switch req.BaseType {
	case "base":
		s.Comparison = s.Base
	case "ou":
		s.Comparison, err = c.GetOUConfig(section, req.BaseRef)
		if err != nil {
			s.Comparison = s.Base
		}
	case "device":
		s.Comparison, err = c.GetDeviceConfig(section, req.BaseRef)
		if err != nil {
			s.Comparison = s.Base
		}
	}

	s.Device, err = c.GetDeviceConfig(section, req.TargetRef)
	if err != nil {
		return s, nil
	}

	s.Diff = diffJSON(s.Comparison, s.Device)
	return s, nil
}

func (c *Client) fetchApplicationComparison(req RSOPRequest) (*ApplicationComparison, error) {
	ac := &ApplicationComparison{}
	var err error

	ac.Base, err = c.GetBaseApplications()
	if err != nil {
		return nil, err
	}

	switch req.BaseType {
	case "base":
		ac.Comparison = ac.Base
	case "ou":
		ac.Comparison, _ = c.GetOUApplications(req.BaseRef)
	case "device":
		ac.Comparison, _ = c.GetDeviceApplications(req.BaseRef)
	}

	ac.Device, _ = c.GetDeviceApplications(req.TargetRef)
	ac.Diff = diffJSON(ac.Comparison, ac.Device)
	return ac, nil
}

// diffJSON compares two JSON objects and returns per-key diffs.
func diffJSON(a, b json.RawMessage) []DiffEntry {
	var ma, mb map[string]any
	_ = json.Unmarshal(a, &ma)
	_ = json.Unmarshal(b, &mb)

	if ma == nil {
		ma = map[string]any{}
	}
	if mb == nil {
		mb = map[string]any{}
	}

	seen := map[string]bool{}
	var diffs []DiffEntry

	for k, va := range ma {
		seen[k] = true
		vb, ok := mb[k]
		if !ok {
			diffs = append(diffs, DiffEntry{Key: k, BaseValue: va, Status: "removed"})
			continue
		}
		if fmt.Sprintf("%v", va) == fmt.Sprintf("%v", vb) {
			diffs = append(diffs, DiffEntry{Key: k, BaseValue: va, TargetValue: vb, Status: "same"})
		} else {
			diffs = append(diffs, DiffEntry{Key: k, BaseValue: va, TargetValue: vb, Status: "changed"})
		}
	}
	for k, vb := range mb {
		if !seen[k] {
			diffs = append(diffs, DiffEntry{Key: k, TargetValue: vb, Status: "added"})
		}
	}
	return diffs
}
