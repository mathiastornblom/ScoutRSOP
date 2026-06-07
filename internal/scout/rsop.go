// Package scout - RSOP engine: fetches and merges config for diff analysis.
//
// Scout Board config priority (low → high):
//  1. Base configuration
//  2. Inherited/Independent OU configuration
//  3. Advanced device configuration
//  4. OU-assigned labels (by sequence)
//  5. Device-assigned labels (by sequence)
//  6. Independent device configuration
//  7. Rules (highest priority)
package scout

import (
	"encoding/json"
	"fmt"
	"sync"
)

// RSOPRequest defines what to compare.
type RSOPRequest struct {
	BaseType  string   `json:"baseType"`  // "base" | "ou" | "device"
	BaseRef   string   `json:"baseRef"`   // OU ID or device ID (empty for base)
	TargetRef string   `json:"targetRef"` // device ID to analyse
	Sections  []string `json:"sections"`  // empty = all ConfigSections
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
			sectionMap[r.idx] = RSOPSection{
				Section: sections[r.idx],
				Diff:    []DiffEntry{},
			}
			continue
		}
		sectionMap[r.idx] = r.sec
	}

	result.Sections = make([]RSOPSection, len(sections))
	for i := range sections {
		result.Sections[i] = sectionMap[i]
	}

	// Applications
	if apps, err := c.fetchApplicationComparison(req); err == nil {
		result.Applications = apps
	}

	// Labels and rules (global)
	result.Labels, _ = c.GetLabels()
	result.Rules, _ = c.GetRules()

	// Config origins for target device (may not be available on all Scout versions)
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
	s := RSOPSection{Section: section, Diff: []DiffEntry{}}
	var err error

	s.Base, err = c.GetBaseConfig(section)
	if err != nil {
		return s, fmt.Errorf("base/%s: %w", section, err)
	}

	switch req.BaseType {
	case "base":
		s.Comparison = s.Base
	case "ou":
		if d, e := c.GetOUConfig(section, req.BaseRef); e == nil {
			s.Comparison = d
		} else {
			s.Comparison = s.Base
		}
	case "device":
		if d, e := c.GetDeviceConfig(section, req.BaseRef); e == nil {
			s.Comparison = d
		} else {
			s.Comparison = s.Base
		}
	default:
		s.Comparison = s.Base
	}

	deviceConfig, err := c.GetDeviceConfig(section, req.TargetRef)
	if err != nil {
		// Device may not have this section configured — use comparison as both sides
		s.Device = s.Comparison
	} else {
		s.Device = deviceConfig
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
		if d, e := c.GetOUApplications(req.BaseRef); e == nil {
			ac.Comparison = d
		} else {
			ac.Comparison = ac.Base
		}
	case "device":
		if d, e := c.GetDeviceApplications(req.BaseRef); e == nil {
			ac.Comparison = d
		} else {
			ac.Comparison = ac.Base
		}
	default:
		ac.Comparison = ac.Base
	}

	if d, e := c.GetDeviceApplications(req.TargetRef); e == nil {
		ac.Device = d
	}
	ac.Diff = diffJSON(ac.Comparison, ac.Device)
	return ac, nil
}

// diffJSON compares two JSON objects and returns per-key diffs.
// Handles both flat objects and nested objects (flattened with dot notation).
func diffJSON(a, b json.RawMessage) []DiffEntry {
	flatA := flattenJSON(a, "")
	flatB := flattenJSON(b, "")

	seen := map[string]bool{}
	var diffs []DiffEntry

	for k, va := range flatA {
		seen[k] = true
		vb, ok := flatB[k]
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
	for k, vb := range flatB {
		if !seen[k] {
			diffs = append(diffs, DiffEntry{Key: k, TargetValue: vb, Status: "added"})
		}
	}
	return diffs
}

// flattenJSON recursively flattens a JSON object using dot-notation keys.
func flattenJSON(raw json.RawMessage, prefix string) map[string]any {
	result := map[string]any{}
	if len(raw) == 0 {
		return result
	}

	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		// Not an object — might be an array or scalar
		return result
	}

	for k, v := range obj {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}
		switch typed := v.(type) {
		case map[string]any:
			nested, _ := json.Marshal(typed)
			for nk, nv := range flattenJSON(nested, key) {
				result[nk] = nv
			}
		default:
			result[key] = v
		}
	}
	return result
}
