// Package scout provides an HTTP client for the Scout Board REST API.
package scout

import (
	"bytes"
	"crypto/tls"
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

// Login authenticates and stores the returned token.
func (c *Client) Login(username, password string) error {
	body := map[string]string{"username": username, "password": password}
	var resp struct {
		Token string `json:"authToken"`
	}
	if err := c.post("/auth/v1/login", body, &resp); err != nil {
		return err
	}
	c.token = resp.Token
	return nil
}

// --- Configuration endpoints ---

// GetBaseConfig fetches the base configuration for a given section.
// section examples: "general", "network", "display", "security", etc.
func (c *Client) GetBaseConfig(section string) (json.RawMessage, error) {
	return c.getRaw("/api/v1/configuration/base/" + section)
}

// GetOUConfig fetches configuration for an OU.
func (c *Client) GetOUConfig(section, ouPath string) (json.RawMessage, error) {
	return c.getRawQuery("/api/v1/configuration/ou/"+section, map[string]string{"ou": ouPath})
}

// GetDeviceConfig fetches configuration for a specific device.
func (c *Client) GetDeviceConfig(section, deviceID string) (json.RawMessage, error) {
	return c.getRawQuery("/api/v1/configuration/device/"+section, map[string]string{"deviceId": deviceID})
}

// GetDeviceConfigOrigins returns the inheritance origins for a device's config.
func (c *Client) GetDeviceConfigOrigins(deviceID string) (json.RawMessage, error) {
	return c.getRawQuery("/api/v1/device/configOrigins", map[string]string{"deviceId": deviceID})
}

// --- Device endpoints ---

// SearchDevices returns devices matching the query.
func (c *Client) SearchDevices(query string) (json.RawMessage, error) {
	return c.getRawQuery("/api/v1/device/search", map[string]string{"query": query})
}

// GetDevice returns device details.
func (c *Client) GetDevice(deviceID string) (json.RawMessage, error) {
	return c.getRawQuery("/api/v1/device", map[string]string{"deviceId": deviceID})
}

// GetDeviceStatus returns the status of devices in an OU.
func (c *Client) GetDeviceStatus(ouPath string) (json.RawMessage, error) {
	return c.getRawQuery("/api/v1/device/status", map[string]string{"ou": ouPath})
}

// --- OU endpoints ---

// GetOUStructure returns the full OU tree.
func (c *Client) GetOUStructure() (json.RawMessage, error) {
	return c.getRaw("/api/v1/ou/structure")
}

// GetOURoot returns the root OU.
func (c *Client) GetOURoot() (json.RawMessage, error) {
	return c.getRaw("/api/v1/ou/root")
}

// SearchOUs searches for OUs matching the query.
func (c *Client) SearchOUs(query string) (json.RawMessage, error) {
	return c.getRawQuery("/api/v1/ou/search", map[string]string{"query": query})
}

// --- Labels & Rules ---

// GetLabels returns all labels.
func (c *Client) GetLabels() (json.RawMessage, error) {
	return c.getRaw("/api/v1/labels")
}

// GetRules returns all rules.
func (c *Client) GetRules() (json.RawMessage, error) {
	return c.getRaw("/api/v1/rules")
}

// --- Applications ---

// GetBaseApplications returns all base applications.
func (c *Client) GetBaseApplications() (json.RawMessage, error) {
	return c.getRaw("/api/v1/applications/base")
}

// GetOUApplications returns applications for an OU.
func (c *Client) GetOUApplications(ouPath string) (json.RawMessage, error) {
	return c.getRawQuery("/api/v1/applications/ou", map[string]string{"ou": ouPath})
}

// GetDeviceApplications returns applications for a device (via inheritance endpoint).
func (c *Client) GetDeviceApplications(deviceID string) (json.RawMessage, error) {
	return c.getRawQuery("/api/v1/applications/inheritance", map[string]string{"deviceId": deviceID})
}

// Ping checks if the server is reachable.
func (c *Client) Ping() error {
	_, err := c.getRaw("/ping")
	return err
}

// Healthcheck returns server health info.
func (c *Client) Healthcheck() (json.RawMessage, error) {
	return c.getRaw("/api/v1/healthcheck")
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

func (c *Client) getRaw(path string) (json.RawMessage, error) {
	return c.getRawQuery(path, nil)
}

func (c *Client) getRawQuery(path string, params map[string]string) (json.RawMessage, error) {
	req, err := http.NewRequest(http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	if c.token != "" {
		req.Header.Set("X-AUTH-TOKEN", c.token)
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
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("scout api error %d: %s", resp.StatusCode, string(body))
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
		req.Header.Set("X-AUTH-TOKEN", c.token)
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
		return fmt.Errorf("scout api error %d: %s", resp.StatusCode, string(respBody))
	}
	if out != nil {
		return json.Unmarshal(respBody, out)
	}
	return nil
}
