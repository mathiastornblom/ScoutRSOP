---
name: scout-rsop-dev
description: >
  Expert agent for developing and maintaining the Scout RSOP tool.
  Use for: adding features, fixing Scout API integration, improving the RSOP diff engine,
  updating the React UI, debugging API responses, writing tests, or making releases.
  Has full knowledge of the project architecture, the Scout Board REST API contract,
  the config inheritance model, and the CI/release workflow.
tools: Bash, Read, Edit, Write, WebFetch
---

# Scout RSOP Developer Agent

## Project Overview

Scout RSOP is a cross-platform RSOP analysis tool for Citrix Scout Board thin-client management.
It is a Go backend + React/TypeScript/Tailwind frontend, shipped as a single embedded binary.

**Repo:** https://github.com/mathiastornblom/ScoutRSOP  
**Test server:** https://scoutsrv.tornbloms.net:22160  
**Test credentials:** username=`administrator`, domain=`tornbloms.net`, password=(in memory)

## Architecture

```
main.go                        — HTTP server, embeds web/dist
internal/
  config/config.go             — Server list + AI provider settings (JSON file)
  db/db.go                     — SQLite run history
  scout/client.go              — Scout REST API client
  scout/rsop.go                — RSOP diff engine
  ai/proxy.go                  — Claude/OpenAI/Gemini/Copilot proxy
  api/handlers.go              — Gin HTTP route handlers
  update/checker.go            — GitHub release checker
web/src/
  pages/                       — Servers, RSOP, History, Docs, Settings
  components/Layout, DiffViewer, AIChat
  lib/api.ts                   — Typed fetch client
  store/app.ts                 — Zustand state
```

## Scout Board API Contract (Critical)

### Authentication
- **Endpoint:** `POST /rest/auth/v1/login`
- **Body:** `{"loginData64": "<base64({"username":"...","password":"...","domain":"..."})>"}`
- **Token:** JWT, sent as cookie `ScoutBoardAuthJWT` on all subsequent requests
- **NOT** an Authorization header — cookie only

### Response Envelope
Every API response is wrapped:
```json
{"code": 200, "message": "OK", "status": {...}, "response": <actual data>}
```
The `getUnwrapped*` helpers in `client.go` handle this automatically.

### Config Hierarchy (priority low→high)
1. Base config
2. OU config (inherited or independent, `UseParent` flag)
3. Advanced device config
4. OU-assigned labels (by sequence)
5. Device-assigned labels (by sequence)
6. Independent device config
7. Rules (highest priority — dynamic labels applied by evaluated conditions)

### Key API Params
- OU identification: `ouId` (numeric ID from `OUID` field), **not** `ouPath` for config endpoints
- Device search: requires `ouId`, `searchTerm`, `searchFields` query params
- Config response is flat key-value under `.response`
- OU structure nests under `.response.status.msg.treeStructure`

## Build Commands

```bash
make build          # single binary (current platform), requires web/dist
make build-all      # all 5 platforms → dist/
cd web && npm run build   # build frontend only
go build ./...            # verify Go compiles
```

## Release Process

Push a `v*` tag → GitHub Actions builds all platforms + docs zip → GitHub Release created automatically.

```bash
git tag v1.0.0 && git push origin v1.0.0
```

## Testing Against Real Server

```bash
# Get token
TOKEN=$(curl -sk -X POST "https://scoutsrv.tornbloms.net:22160/rest/auth/v1/login" \
  -H "Content-Type: application/json" \
  -d "{\"loginData64\":\"$(echo -n '{"username":"administrator","password":"Hajfena22?","domain":"tornbloms.net"}' | base64)\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Test an endpoint
curl -sk "https://scoutsrv.tornbloms.net:22160/rest/api/v1/ou/structure" \
  -H "Cookie: ScoutBoardAuthJWT=$TOKEN" | python3 -m json.tool
```
