// Package scout provides an HTTP client for the Scout Board REST API.
package scout

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client wraps HTTP communication with a Scout Server instance.
type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client
}

// New creates a Client. Set ignoreTLS=true for self-signed certificates.
func New(baseURL string, ignoreTLS bool) *Client {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: ignoreTLS}, //nolint:gosec
	}
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout:   30 * time.Second,
			Transport: transport,
		},
	}
}

// SetToken stores the session token returned by Login.
func (c *Client) SetToken(token string) { c.token = token }

// Token returns the current session token.
func (c *Client) Token() string { return c.token }

// LoginRequest holds credentials for Scout Board authentication.
// The API requires credentials encoded as base64 JSON in the loginData64 field.
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Domain   string `json:"domain"`
}

// Login authenticates and stores the returned JWT cookie token.
func (c *Client) Login(req LoginRequest) error {
	credJSON, err := json.Marshal(req)
	if err != nil {
		return err
	}
	loginData64 := base64.StdEncoding.EncodeToString(credJSON)

	body := map[string]string{"loginData64": loginData64}
	var resp struct {
		Token string `json:"token"`
	}
	if err := c.post("/auth/v1/login", body, &resp); err != nil {
		return err
	}
	if resp.Token == "" {
		return fmt.Errorf("authentication failed: no token returned")
	}
	c.token = resp.Token
	return nil
}

// envelope is the standard Scout Board API response wrapper.
type envelope struct {
	Code     int             `json:"code"`
	Message  string          `json:"message"`
	Response json.RawMessage `json:"response"`
	Status   json.RawMessage `json:"status"`
}

// --- Configuration endpoints ---

// GetBaseConfig fetches the base configuration for a given section.
func (c *Client) GetBaseConfig(section string) (json.RawMessage, error) {
	return c.getUnwrapped("/api/v1/configuration/base/" + section)
}

// GetOUConfig fetches configuration for an OU by ID.
func (c *Client) GetOUConfig(section string, ouID string) (json.RawMessage, error) {
	return c.getUnwrappedQuery("/api/v1/configuration/ou/"+section, map[string]string{"ouId": ouID})
}

// GetDeviceConfig fetches configuration for a specific device.
func (c *Client) GetDeviceConfig(section, deviceID string) (json.RawMessage, error) {
	return c.getUnwrappedQuery("/api/v1/configuration/device/"+section, map[string]string{"deviceId": deviceID})
}

// GetDeviceConfigOrigins returns the inheritance origins for a device's config.
func (c *Client) GetDeviceConfigOrigins(deviceID string) (json.RawMessage, error) {
	return c.getUnwrappedQuery("/api/v1/device/configOrigins", map[string]string{"deviceId": deviceID})
}

// --- Device endpoints ---

// SearchDevices returns devices matching the search term within an OU.
// ouID: OU to search in; searchTerm: partial name/identifier; fields: comma-separated device fields to match.
func (c *Client) SearchDevices(ouID, searchTerm, searchFields string) (json.RawMessage, error) {
	if searchFields == "" {
		searchFields = "Name,ClientIdentifier,MAC_Address,IP_Address"
	}
	return c.getUnwrappedQuery("/api/v1/device/search", map[string]string{
		"ouId":          ouID,
		"searchTerm":    searchTerm,
		"searchFields":  searchFields,
		"includeSubOus": "true",
		"limit":         "100",
	})
}

// GetDevice returns device details by ID.
func (c *Client) GetDevice(deviceID string) (json.RawMessage, error) {
	return c.getUnwrappedQuery("/api/v1/device", map[string]string{"deviceId": deviceID})
}

// ListDevicesInOU returns the status and IDs of all devices in an OU.
// Uses the /api/v1/ou/device/status endpoint which accepts the OU id (OUID numeric).
func (c *Client) ListDevicesInOU(ouID string, includeSubOus bool) (json.RawMessage, error) {
	sub := "false"
	if includeSubOus {
		sub = "true"
	}
	return c.getUnwrappedQuery("/api/v1/ou/device/status", map[string]string{
		"id":            ouID,
		"includeSubOus": sub,
	})
}

// GetDeviceStatus returns the status of a single device by name, id, mac, or clientid.
func (c *Client) GetDeviceStatus(params map[string]string) (json.RawMessage, error) {
	return c.getUnwrappedQuery("/api/v1/device/status", params)
}

// --- OU endpoints ---

// GetOUStructure returns the full OU tree.
func (c *Client) GetOUStructure() (json.RawMessage, error) {
	raw, err := c.getUnwrapped("/api/v1/ou/structure")
	if err != nil {
		return nil, err
	}
	// The structure is nested under response.status.msg.treeStructure
	var wrapper struct {
		Status struct {
			Msg struct {
				TreeStructure json.RawMessage `json:"treeStructure"`
			} `json:"msg"`
		} `json:"status"`
	}
	if err := json.Unmarshal(raw, &wrapper); err != nil {
		return raw, nil // fall back to raw
	}
	if wrapper.Status.Msg.TreeStructure != nil {
		return wrapper.Status.Msg.TreeStructure, nil
	}
	return raw, nil
}

// GetOURoot returns the root OU info.
func (c *Client) GetOURoot() (json.RawMessage, error) {
	return c.getUnwrapped("/api/v1/ou/root")
}

// SearchOUs searches for OUs matching the query.
func (c *Client) SearchOUs(query string) (json.RawMessage, error) {
	return c.getUnwrappedQuery("/api/v1/ou/search", map[string]string{"query": query})
}

// --- Labels & Rules ---

// GetLabels returns all dynamic configuration labels.
func (c *Client) GetLabels() (json.RawMessage, error) {
	return c.getUnwrapped("/api/v1/labels")
}

// GetRules returns all dynamic configuration rules.
func (c *Client) GetRules() (json.RawMessage, error) {
	return c.getUnwrapped("/api/v1/rules")
}

// --- Applications ---

// GetBaseApplications returns all base applications.
func (c *Client) GetBaseApplications() (json.RawMessage, error) {
	return c.getUnwrapped("/api/v1/applications/base")
}

// GetOUApplications returns applications for an OU.
func (c *Client) GetOUApplications(ouID string) (json.RawMessage, error) {
	return c.getUnwrappedQuery("/api/v1/applications/ou", map[string]string{"ouId": ouID})
}

// GetDeviceApplications returns applications inherited by a device.
func (c *Client) GetDeviceApplications(deviceID string) (json.RawMessage, error) {
	return c.getUnwrappedQuery("/api/v1/applications/inheritance", map[string]string{"deviceId": deviceID})
}

// Ping checks if the server is reachable.
func (c *Client) Ping() error {
	resp, err := http.Get(c.baseURL + "/../ping") //nolint:noctx
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

// Healthcheck returns server health info.
func (c *Client) Healthcheck() (json.RawMessage, error) {
	return c.getUnwrapped("/api/v1/healthcheck")
}

// ConfigSections is the ordered list of standard configuration sections.
var ConfigSections = []string{
	"general",
	"display",
	"network",
	"network/lan",
	"network/wlan",
	"network/vpn",
	"security",
	"userauthentication",
	"hardware",
	"firmware",
	"powermanagement",
	"multimedia",
	"keyboardmouse",
	"desktop/language",
	"desktop/timesettings",
	"desktop/advancedsettings",
	"diagnostics",
	"drives",
	"mirror",
}

// AdvancedSections is the list of advanced configuration sections.
var AdvancedSections = []string{
	"environment",
	"display",
	"keyboard",
	"mouse",
	"management",
	"update",
	"wol",
	"rules",
}

// --- HTTP helpers ---

// getUnwrapped fetches a path and unwraps the Scout response envelope, returning .response.
func (c *Client) getUnwrapped(path string) (json.RawMessage, error) {
	return c.getUnwrappedQuery(path, nil)
}

func (c *Client) getUnwrappedQuery(path string, params map[string]string) (json.RawMessage, error) {
	raw, err := c.getRaw(path, params)
	if err != nil {
		return nil, err
	}
	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil {
		// Not envelope format — validate it's at least valid JSON before returning
		if !json.Valid(raw) {
			return nil, fmt.Errorf("scout api returned non-JSON response: %s", string(raw))
		}
		return raw, nil
	}
	if env.Code >= 400 {
		return nil, fmt.Errorf("scout api %d: %s", env.Code, env.Message)
	}
	if env.Response == nil {
		return json.RawMessage(`{}`), nil
	}
	return env.Response, nil
}

func (c *Client) getRaw(path string, params map[string]string) (json.RawMessage, error) {
	req, err := http.NewRequest(http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	// Scout Board uses a JWT cookie for auth
	if c.token != "" {
		req.AddCookie(&http.Cookie{Name: "ScoutBoardAuthJWT", Value: c.token})
	}
	q := req.URL.Query()
	for k, v := range params {
		q.Set(k, v)
	}
	req.URL.RawQuery = q.Encode()

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("unauthorized: session expired or invalid credentials")
	}
	if len(body) == 0 {
		return json.RawMessage(`{}`), nil
	}
	return body, nil
}

func (c *Client) post(path string, body any, out any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, c.baseURL+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.AddCookie(&http.Cookie{Name: "ScoutBoardAuthJWT", Value: c.token})
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		// Try to extract message from envelope
		var env envelope
		if jerr := json.Unmarshal(respBody, &env); jerr == nil && env.Message != "" {
			return fmt.Errorf("scout api error %d: %s", env.Code, env.Message)
		}
		return fmt.Errorf("scout api error %d: %s", resp.StatusCode, string(respBody))
	}
	if out != nil {
		return json.Unmarshal(respBody, out)
	}
	return nil
}
