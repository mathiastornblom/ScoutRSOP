# Scout RSOP

A cross-platform RSOP (Resultant Set of Policy) analysis tool for **Citrix Scout Server**. Compare device configurations against base, OU, or another device — with a modern web UI, AI-assisted analysis, and full run history.

![Scout RSOP UI](https://github.com/mathiastornblom/ScoutRSOP/raw/main/docs/screenshot.png)

## Features

- **Multi-server management** — add, edit, and remove Scout Server connections from the web UI
- **RSOP analysis** — compare a device's effective config against base, an OU, or another device
- **Full & diff view** — side-by-side diff with changed / added / removed / same indicators per config key
- **Config sections** — granular selection of which Scout config areas to analyse (network, display, security, firmware, etc.)
- **AI assistant** — natural language queries powered by Claude, ChatGPT, Gemini, or Copilot, with the RSOP result as context
- **Run history** — save, reload, and re-run past analyses with full diff preserved
- **Version checker** — banner appears when a new GitHub release is available; in-app changelog via Settings
- **Single binary** — no runtime required; ships as a self-contained executable with the UI embedded

## Quick Start

### Pre-built binary

Download the latest release for your platform from the [Releases page](https://github.com/mathiastornblom/ScoutRSOP/releases):

| Platform | File |
|----------|------|
| Windows (x64) | `scoutrsop-windows-amd64.exe` |
| Linux (x64)   | `scoutrsop-linux-amd64` |
| Linux (arm64) | `scoutrsop-linux-arm64` |
| macOS (Intel) | `scoutrsop-darwin-amd64` |
| macOS (Apple Silicon) | `scoutrsop-darwin-arm64` |

Run it:

```bash
./scoutrsop                        # opens on http://localhost:8080
./scoutrsop --port 9000            # custom port
./scoutrsop --data /var/scoutrsop  # custom data directory
```

On first launch, open `http://localhost:8080` in your browser. Add a Scout Server, log in, and run your first RSOP analysis.

### Build from source

**Requirements:** Go 1.22+, Node 20+

```bash
git clone https://github.com/mathiastornblom/ScoutRSOP
cd ScoutRSOP
make build          # builds single binary for current OS
make build-all      # cross-compiles all platforms into dist/
```

### Development

```bash
# Terminal 1 — Go backend (serves API on :8080)
go run . --port 8080

# Terminal 2 — Vite dev server (hot reload on :5173, proxies /api → :8080)
cd web && npm install && npm run dev
```

Then open `http://localhost:5173`.

## Configuration

Config and database are stored in `~/.scoutrsop/` by default:

| File | Contents |
|------|----------|
| `config.json` | Scout server list, AI provider keys, GitHub repo |
| `scoutrsop.db` | SQLite — saved run history |

All AI provider API keys are stored only in `config.json` (never sent to the frontend in plain text).

## AI Assistant

The AI panel is available on the RSOP results page. It passes the full RSOP result as context so you can ask questions like:

> "Which network settings differ from the base config and why might that cause issues?"

Configure providers in **Settings → AI Providers**. Supported:

| Provider | Model default |
|----------|--------------|
| Claude (Anthropic) | `claude-sonnet-4-6` |
| ChatGPT (OpenAI) | `gpt-4o` |
| Gemini (Google) | `gemini-1.5-pro` |
| Copilot (Microsoft) | `gpt-4o` |

## Architecture

```
ScoutRSOP/
├── main.go                    # Entry point — HTTP server, embedded UI
├── internal/
│   ├── config/config.go       # Server list + AI settings persistence
│   ├── db/db.go               # SQLite run history
│   ├── scout/
│   │   ├── client.go          # Scout REST API client
│   │   └── rsop.go            # RSOP diff engine
│   ├── ai/proxy.go            # Multi-provider AI proxy
│   ├── api/handlers.go        # HTTP route handlers
│   └── update/checker.go      # GitHub release checker
└── web/                       # React frontend (Vite + Tailwind + Framer Motion)
    └── src/
        ├── pages/             # Servers, RSOP, History, Settings
        ├── components/        # Layout, DiffViewer, AIChat
        ├── lib/api.ts         # Typed API client
        └── store/app.ts       # Zustand state
```

## Scout Server compatibility

Tested against Scout Board REST API **v25.11.0** (Citrix). The tool connects to the standard HTTPS port `22160`. Enable **Ignore TLS** in server settings for self-signed certificates.

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
