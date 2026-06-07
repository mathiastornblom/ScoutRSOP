// Package api wires up the HTTP API handlers served by the Go backend.
package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/mathiast/scoutrsop/internal/ai"
	"github.com/mathiast/scoutrsop/internal/config"
	"github.com/mathiast/scoutrsop/internal/db"
	"github.com/mathiast/scoutrsop/internal/scout"
	"github.com/mathiast/scoutrsop/internal/update"
)

// Register mounts all API routes on the given router group.
func Register(r *gin.RouterGroup) {
	// Server management
	r.GET("/servers", listServers)
	r.POST("/servers", addServer)
	r.PUT("/servers/:id", updateServer)
	r.DELETE("/servers/:id", deleteServer)

	// Scout proxy (auth + data)
	r.POST("/scout/:serverId/login", scoutLogin)
	r.GET("/scout/:serverId/ping", scoutPing)
	r.GET("/scout/:serverId/health", scoutHealth)
	r.GET("/scout/:serverId/ou/structure", scoutOUStructure)
	r.GET("/scout/:serverId/ou/root", scoutOURoot)
	r.GET("/scout/:serverId/ou/search", scoutOUSearch)
	r.GET("/scout/:serverId/devices/search", scoutDeviceSearch)
	r.GET("/scout/:serverId/devices/:deviceId", scoutDeviceGet)
	r.GET("/scout/:serverId/labels", scoutLabels)
	r.GET("/scout/:serverId/rules", scoutRules)
	r.GET("/scout/:serverId/config/sections", scoutConfigSections)

	// RSOP analysis
	r.POST("/scout/:serverId/rsop", runRSOP)

	// Run history
	r.GET("/runs", listRuns)
	r.GET("/runs/:id", getRun)
	r.DELETE("/runs/:id", deleteRun)

	// AI query
	r.POST("/ai/query", aiQuery)

	// Version check
	r.GET("/version", versionCheck)
	r.GET("/releases", listReleases)

	// App settings
	r.GET("/settings", getSettings)
	r.PUT("/settings/ai", updateAISettings)
}

// session cache: serverId -> token (in-memory, not persisted)
var sessions = map[string]string{}

func getClient(c *gin.Context) (*scout.Client, bool) {
	serverID := c.Param("serverId")
	servers := config.ListServers()
	var srv *config.Server
	for i := range servers {
		if servers[i].ID == serverID {
			srv = &servers[i]
			break
		}
	}
	if srv == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return nil, false
	}

	client := scout.New(srv.URL+"/rest", srv.IgnoreTLS)
	if token, ok := sessions[serverID]; ok {
		client.SetToken(token)
	}
	return client, true
}

// --- Server management ---

func listServers(c *gin.Context) {
	c.JSON(http.StatusOK, config.ListServers())
}

func addServer(c *gin.Context) {
	var s config.Server
	if err := c.ShouldBindJSON(&s); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	created, err := config.AddServer(s)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, created)
}

func updateServer(c *gin.Context) {
	var s config.Server
	if err := c.ShouldBindJSON(&s); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	s.ID = c.Param("id")
	if err := config.UpdateServer(s); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, s)
}

func deleteServer(c *gin.Context) {
	if err := config.DeleteServer(c.Param("id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	delete(sessions, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// --- Scout proxy ---

func scoutLogin(c *gin.Context) {
	serverID := c.Param("serverId")
	var creds struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Domain   string `json:"domain"`
	}
	if err := c.ShouldBindJSON(&creds); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	client, ok := getClient(c)
	if !ok {
		return
	}
	if err := client.Login(scout.LoginRequest{
		Username: creds.Username,
		Password: creds.Password,
		Domain:   creds.Domain,
	}); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	sessions[serverID] = client.Token()
	c.JSON(http.StatusOK, gin.H{"token": client.Token()})
}

func scoutPing(c *gin.Context) {
	client, ok := getClient(c)
	if !ok {
		return
	}
	if err := client.Ping(); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"online": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"online": true})
}

func scoutHealth(c *gin.Context) {
	client, ok := getClient(c)
	if !ok {
		return
	}
	data, err := client.Healthcheck()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

func scoutOUStructure(c *gin.Context) {
	client, ok := getClient(c)
	if !ok {
		return
	}
	data, err := client.GetOUStructure()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

func scoutOURoot(c *gin.Context) {
	client, ok := getClient(c)
	if !ok {
		return
	}
	data, err := client.GetOURoot()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

func scoutOUSearch(c *gin.Context) {
	client, ok := getClient(c)
	if !ok {
		return
	}
	data, err := client.SearchOUs(c.Query("q"))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

func scoutDeviceSearch(c *gin.Context) {
	client, ok := getClient(c)
	if !ok {
		return
	}
	data, err := client.SearchDevices(c.Query("ouId"), c.Query("q"), c.Query("fields"))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

func scoutDeviceGet(c *gin.Context) {
	client, ok := getClient(c)
	if !ok {
		return
	}
	data, err := client.GetDevice(c.Param("deviceId"))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

func scoutLabels(c *gin.Context) {
	client, ok := getClient(c)
	if !ok {
		return
	}
	data, err := client.GetLabels()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

func scoutRules(c *gin.Context) {
	client, ok := getClient(c)
	if !ok {
		return
	}
	data, err := client.GetRules()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

func scoutConfigSections(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"sections":          scout.ConfigSections,
		"advancedSections":  scout.AdvancedSections,
	})
}

// --- RSOP ---

func runRSOP(c *gin.Context) {
	serverID := c.Param("serverId")
	client, ok := getClient(c)
	if !ok {
		return
	}

	var req struct {
		scout.RSOPRequest
		SaveAs      string `json:"saveAs"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := client.Run(req.RSOPRequest)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	// Optionally save the run
	if req.SaveAs != "" {
		servers := config.ListServers()
		serverName := serverID
		for _, s := range servers {
			if s.ID == serverID {
				serverName = s.Name
				break
			}
		}
		run := db.Run{
			ID:          uuid.NewString(),
			ServerID:    serverID,
			ServerName:  serverName,
			Name:        req.SaveAs,
			Description: req.Description,
			BaseType:    req.BaseType,
			BaseRef:     req.BaseRef,
			TargetType:  "device",
			TargetRef:   req.TargetRef,
			Sections:    req.Sections,
			CreatedAt:   time.Now(),
		}
		// Store result as JSON
		resultJSON, _ := json.Marshal(result)
		run.Result = resultJSON
		_ = db.SaveRun(run)
	}

	c.JSON(http.StatusOK, result)
}

// --- Run history ---

func listRuns(c *gin.Context) {
	serverID := c.Query("serverId")
	limit := 50
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			limit = n
		}
	}
	runs, err := db.ListRuns(serverID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if runs == nil {
		runs = []db.Run{}
	}
	c.JSON(http.StatusOK, runs)
}

func getRun(c *gin.Context) {
	run, err := db.GetRun(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if run == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, run)
}

func deleteRun(c *gin.Context) {
	if err := db.DeleteRun(c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// --- AI ---

func aiQuery(c *gin.Context) {
	var req ai.QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := ai.Query(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// --- Version ---

func versionCheck(c *gin.Context) {
	cfg := config.Get()
	info, err := update.CheckLatest(cfg.GithubRepo)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"current":         update.AppVersion,
			"buildDate":       update.BuildDate,
			"updateAvailable": false,
			"error":           err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, info)
}

func listReleases(c *gin.Context) {
	cfg := config.Get()
	releases, err := update.ListReleases(cfg.GithubRepo, 10)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, releases)
}

// --- Settings ---

func getSettings(c *gin.Context) {
	cfg := config.Get()
	// Don't expose API keys to frontend — return masked versions
	providers := make([]map[string]any, len(cfg.AIProviders))
	for i, p := range cfg.AIProviders {
		masked := ""
		if len(p.APIKey) > 8 {
			masked = p.APIKey[:4] + "..." + p.APIKey[len(p.APIKey)-4:]
		} else if p.APIKey != "" {
			masked = "***"
		}
		providers[i] = map[string]any{
			"provider":     p.Provider,
			"model":        p.Model,
			"enabled":      p.Enabled,
			"hasKey":       p.APIKey != "",
			"maskedKey":    masked,
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"githubRepo":  cfg.GithubRepo,
		"aiProviders": providers,
		"version":     update.AppVersion,
		"buildDate":   update.BuildDate,
	})
}

func updateAISettings(c *gin.Context) {
	var req struct {
		Providers  []config.AIProvider `json:"providers"`
		GithubRepo string              `json:"githubRepo"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.GithubRepo != "" {
		if err := config.UpdateGithubRepo(req.GithubRepo); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	if len(req.Providers) > 0 {
		// Merge: only update APIKey if non-empty (don't overwrite with masked value)
		existing := config.Get().AIProviders
		for i, p := range req.Providers {
			for _, ex := range existing {
				if ex.Provider == p.Provider && p.APIKey == "" {
					req.Providers[i].APIKey = ex.APIKey
				}
			}
		}
		if err := config.UpdateAIProviders(req.Providers); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
