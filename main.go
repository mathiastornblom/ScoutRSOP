// ScoutRSOP - RSOP analysis tool for Citrix Scout Server.
// Serves a web UI and proxies Scout REST API calls.
// Run with -cert and -key flags (or configure via Settings → TLS) to enable HTTPS.
package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/mathiast/scoutrsop/internal/api"
	"github.com/mathiast/scoutrsop/internal/config"
	"github.com/mathiast/scoutrsop/internal/db"
	"github.com/mathiast/scoutrsop/internal/update"
)

//go:embed web/dist
var webFS embed.FS

func main() {
	port := flag.Int("port", 8080, "HTTP/HTTPS listen port")
	dataDir := flag.String("data", defaultDataDir(), "Directory for config and database files")
	certFlag := flag.String("cert", "", "Path to TLS certificate PEM (overrides stored config)")
	keyFlag := flag.String("key", "", "Path to TLS private key PEM (overrides stored config)")
	flag.Parse()

	log.Printf("ScoutRSOP %s (built %s)", update.AppVersion, update.BuildDate)

	// Initialise config
	if err := config.Init(filepath.Join(*dataDir, "config.json")); err != nil {
		log.Fatalf("config init: %v", err)
	}

	// Initialise SQLite
	if err := db.Init(filepath.Join(*dataDir, "scoutrsop.db")); err != nil {
		log.Fatalf("db init: %v", err)
	}

	// Expose data dir to API handlers (for cert file writes)
	api.DataDir = *dataDir

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// CORS for dev (Vite dev server on :5173)
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://localhost:8080", "http://localhost:8081"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// API routes
	api.Register(r.Group("/api"))

	// Serve embedded frontend
	distFS, err := fs.Sub(webFS, "web/dist")
	if err != nil {
		log.Fatalf("embed: %v", err)
	}
	r.NoRoute(func(c *gin.Context) {
		// SPA fallback: serve index.html for any unknown route
		path := c.Request.URL.Path
		if _, err := fs.Stat(distFS, path[1:]); err != nil {
			c.FileFromFS("index.html", http.FS(distFS))
			return
		}
		c.FileFromFS(path[1:], http.FS(distFS))
	})

	addr := fmt.Sprintf(":%d", *port)

	// Resolve TLS cert/key: CLI flags take precedence, then stored config
	certPath := *certFlag
	keyPath := *keyFlag
	if certPath == "" || keyPath == "" {
		tlsCfg := config.GetTLS()
		if tlsCfg.Enabled && tlsCfg.CertFile != "" && tlsCfg.KeyFile != "" {
			certPath = tlsCfg.CertFile
			keyPath = tlsCfg.KeyFile
		}
	}

	if certPath != "" && keyPath != "" {
		log.Printf("TLS enabled — listening on https://localhost%s", addr)
		log.Printf("  cert: %s", certPath)
		log.Printf("  key:  %s", keyPath)
		if err := r.RunTLS(addr, certPath, keyPath); err != nil {
			log.Fatalf("server (TLS): %v", err)
		}
	} else {
		log.Printf("Listening on http://localhost%s  (configure TLS in Settings to enable HTTPS)", addr)
		if err := r.Run(addr); err != nil {
			log.Fatalf("server: %v", err)
		}
	}
}

func defaultDataDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return filepath.Join(home, ".scoutrsop")
}
