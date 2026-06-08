import { useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, ExternalLink, ChevronRight, Search, Layers, GitBranch, Cpu, Shield, Network } from 'lucide-react'

const DOCS = [
  {
    category: 'Scout RSOP Tool',
    icon: <Layers size={14} className="text-brand-400" />,
    articles: [
      {
        title: 'Getting Started',
        content: `## Getting Started with Scout RSOP

Scout RSOP is a cross-platform tool for analysing the Resultant Set of Policy (RSOP) for Citrix Scout Board managed thin-client devices.

### First Launch

1. Open the app in your browser (default: **http://localhost:8080**)
2. Go to **Servers** and click **Add Server**
3. Enter your Scout Board URL, e.g. \`https://scout.corp.com:22160\`
4. Enable **Ignore TLS** if your server uses a self-signed certificate
5. Click the server card and **Login** with your Scout credentials (username, domain, password)

### Running Your First RSOP

1. Go to **RSOP** in the sidebar
2. Choose what to compare against: **Base**, **OU**, or another **Device**
3. Select or search for the **Target Device** you want to analyse
4. (Optional) Select specific config sections to include
5. Click **Run RSOP**

The results will show all configuration keys with their baseline value and the device's effective value, grouped by section.`,
      },
      {
        title: 'Understanding the Diff View',
        content: `## Understanding the Diff View

The diff view colour-codes every configuration key:

| Badge | Meaning |
|-------|---------|
| 🟡 **Changed** | Key exists in both but values differ |
| 🟢 **Added** | Key exists only on the device (not in baseline) |
| 🔴 **Removed** | Key exists in baseline but not on the device |
| ⬜ **Same** | Key and value are identical |

### Filtering

Use the filter bar above the diff to show only Changed, Added, or Removed keys — useful for large configs.

### Section Accordion

Each config section (e.g. *network*, *display*, *security*) is collapsed by default. Click to expand. Sections with no differences are hidden in the **diff** tab; use the **full** tab to see all sections.

### Summary Tab

The Summary tab shows aggregate counts and a proportional bar chart, plus the request parameters that produced this result.`,
      },
      {
        title: 'Saving & History',
        content: `## Saving & History

### Saving a Run

Before clicking **Run RSOP**, check **Save this run** and give it a name (e.g. *"Prod device 2026-06-08 post-migration check"*). The full result is stored in the local SQLite database.

### History Page

The **History** page lists all saved runs. You can:
- Filter by server or search by name/device
- Click a run to view its full diff
- Click **Load Result** to copy it back to the RSOP page
- Delete individual runs

Runs are stored at \`~/.scoutrsop/scoutrsop.db\` (configurable with \`--data\` flag).`,
      },
      {
        title: 'AI Assistant',
        content: `## AI Assistant

The AI panel is available on the RSOP results page (click the **AI** button in the toolbar). The current RSOP result is automatically included as context.

### Supported Providers

| Provider | Notes |
|----------|-------|
| **Claude** (Anthropic) | Recommended — best at structured config analysis |
| **ChatGPT** (OpenAI) | GPT-4o |
| **Gemini** (Google) | Gemini 1.5 Pro |
| **Copilot** (Microsoft) | Azure OpenAI |

### Setup

1. Go to **Settings → AI Providers**
2. Enable a provider and paste its API key
3. Choose a model
4. Click **Save Settings**

Keys are stored encrypted in \`~/.scoutrsop/config.json\` and never sent to the browser in plain text.

### Example Queries

- *"Which network settings differ from the base config and why might that cause issues?"*
- *"The device has a different firmware path — is that expected for its OU?"*
- *"Summarise the key differences in a table"*`,
      },
    ],
  },
  {
    category: 'Scout Board Concepts',
    icon: <Cpu size={14} className="text-brand-400" />,
    articles: [
      {
        title: 'Configuration Hierarchy',
        content: `## Scout Board Configuration Hierarchy

Scout Board uses a layered policy model. Configuration is applied in this priority order (lower number = lower priority, higher wins):

| Priority | Source |
|----------|--------|
| 1 | **Base configuration** — global defaults |
| 2 | **OU configuration** — inherited or independent per-OU settings |
| 3 | **Advanced device configuration** — device-level overrides |
| 4 | **OU-assigned Labels** (by sequence number) |
| 5 | **Device-assigned Labels** (by sequence number) |
| 6 | **Independent device configuration** — explicit device config |
| 7 | **Rules** *(highest)* — dynamic labels applied by evaluated conditions |

### Inheritance

By default, an OU inherits its parent OU's config (**UseParent = 1**). An administrator can "break" inheritance to set independent values. When you run RSOP, Scout RSOP fetches the effective config at each level so you can see exactly which values were overridden and where.`,
      },
      {
        title: 'Labels & Rules (Dynamic Config)',
        content: `## Labels & Rules — Dynamic Configuration

### Labels

A **Label** is a named bundle of configuration sections. For example, a label called *"Firmware"* might contain only the firmware path. Multiple labels can be applied to an OU or device; when sections overlap, the label with the higher sequence number wins.

Labels have:
- **LabelID** — unique GUID
- **Name** and **Color** for visual identification
- **Content** — the actual config sections (firmware, applications, etc.)
- **Active** — can be toggled without deleting

### Rules

A **Rule** evaluates a logical condition against device attributes (e.g. \`SCOUT_OU startsWith "NorthCreek"\`). When the condition is true, the rule's associated labels are applied to matching devices.

Rules use **Sequence** ordering — lower sequence = lower priority, applied first.

### RSOP and Dynamic Config

The Scout RSOP tool shows **Labels** and **Rules** alongside the section diff so you can understand *why* a device has an unexpected value. If a device's firmware differs from the base config, it may be because a Rule matched and applied a Firmware label.`,
      },
      {
        title: 'OU Structure',
        content: `## OU Structure

OUs (Organisational Units) form a tree. Each OU can contain devices and child OUs.

Key OU fields returned by the API:

| Field | Description |
|-------|-------------|
| \`OUID\` | Numeric ID — used in API calls |
| \`Name\` | Display name |
| \`UseParent\` | 1 = inherits parent config, 0 = independent |
| \`DeviceCount\` | Number of directly-assigned devices |
| \`ParentID\` | -1 for root-level OUs |
| \`children\` | Nested child OUs |

When running RSOP against an **OU** baseline, Scout RSOP uses the OU's \`OUID\` to fetch its configuration for each section.`,
      },
    ],
  },
  {
    category: 'API Reference',
    icon: <Network size={14} className="text-brand-400" />,
    articles: [
      {
        title: 'Authentication',
        content: `## Scout Board API Authentication

The Scout Board REST API uses a **JWT cookie** for authentication.

### Login

\`\`\`
POST /rest/auth/v1/login
Content-Type: application/json

{
  "loginData64": "<base64-encoded JSON>"
}
\`\`\`

The \`loginData64\` value is a base64 encoding of:
\`\`\`json
{"username": "user", "password": "pass", "domain": "corp.com"}
\`\`\`

The response contains a \`token\` field. This token must be sent as the cookie \`ScoutBoardAuthJWT\` on all subsequent requests.

### Response Envelope

All API responses use this envelope:
\`\`\`json
{
  "code": 200,
  "message": "OK",
  "status": { "result": 0 },
  "response": { ... actual data ... }
}
\`\`\`

Scout RSOP automatically unwraps the \`response\` field.`,
      },
      {
        title: 'Config Sections Reference',
        content: `## Configuration Section Reference

These sections are available for RSOP analysis:

| Section | Description |
|---------|-------------|
| \`general\` | General device settings, license mode |
| \`display\` | Screen resolution, refresh rate, orientation |
| \`network\` | Overall network settings |
| \`network/lan\` | Wired LAN configuration |
| \`network/wlan\` | Wi-Fi settings |
| \`network/vpn\` | VPN configuration |
| \`security\` | Security policies |
| \`userauthentication\` | Auth type (AD, OIDC, SAML, etc.) |
| \`hardware\` | Hardware settings |
| \`firmware\` | Firmware image path |
| \`powermanagement\` | Power profiles (eco, performance) |
| \`multimedia\` | Audio/video settings |
| \`keyboardmouse\` | Input device settings |
| \`desktop/language\` | UI language, keyboard layout |
| \`desktop/timesettings\` | Timezone, NTP |
| \`desktop/advancedsettings\` | Advanced desktop options |
| \`diagnostics\` | Logging, telemetry |
| \`drives\` | USB/drive policies |
| \`mirror\` | Mirror/clone configuration |

Advanced sections (device/OU level only): \`environment\`, \`display\`, \`keyboard\`, \`mouse\`, \`management\`, \`update\`, \`wol\`, \`rules\``,
      },
    ],
  },
  {
    category: 'Operations',
    icon: <GitBranch size={14} className="text-brand-400" />,
    articles: [
      {
        title: 'Running & Building',
        content: `## Running & Building Scout RSOP

### Single Binary (Production)

\`\`\`bash
# Run on default port 8080
./scoutrsop

# Custom port and data directory
./scoutrsop --port 9000 --data /var/scoutrsop
\`\`\`

### Build from Source

\`\`\`bash
# Build for current platform (includes frontend build)
make build

# Cross-compile all platforms → dist/
make build-all

# Output:
# dist/scoutrsop-windows-amd64.exe
# dist/scoutrsop-linux-amd64
# dist/scoutrsop-linux-arm64
# dist/scoutrsop-darwin-amd64
# dist/scoutrsop-darwin-arm64
\`\`\`

### Development Mode

\`\`\`bash
# Terminal 1: Go backend
go run . --port 8080

# Terminal 2: Vite dev server (hot reload)
cd web && npm run dev
# → http://localhost:5173
\`\`\`

### Creating a Release

Push a \`v*\` tag to GitHub to trigger the release workflow:

\`\`\`bash
git tag v1.0.0
git push origin v1.0.0
\`\`\`

GitHub Actions will build all 5 platform binaries and create a release with them attached.`,
      },
      {
        title: 'Version & Updates',
        content: `## Version & Updates

Scout RSOP checks for new releases on startup by querying the GitHub Releases API for the configured repository (**Settings → Version & Updates**).

If a newer version tag is found, a banner appears at the top of every page with a link to the release notes.

### Changelog

Go to **Settings → Release History** and click **Load** to fetch the full release history from GitHub.

### Version Info

The current version and build date are shown at the bottom of the sidebar and on the Settings page. The version is injected at compile time via \`-ldflags\`:

\`\`\`
-X github.com/mathiastornblom/scoutrsop/internal/update.AppVersion=v1.0.0
-X github.com/mathiastornblom/scoutrsop/internal/update.BuildDate=2026-06-08T12:00:00Z
\`\`\``,
      },
    ],
  },
  {
    category: 'Security',
    icon: <Shield size={14} className="text-brand-400" />,
    articles: [
      {
        title: 'Security Notes',
        content: `## Security Notes

### Credential Storage

- Scout Server credentials are **never stored** — they are used to obtain a JWT token which is held in server-side memory only (cleared on restart)
- AI provider API keys are stored in \`~/.scoutrsop/config.json\` with file permissions \`0600\`
- API keys are never returned to the browser in plain text — the UI shows only masked versions

### TLS

- By default, Scout RSOP validates TLS certificates when connecting to Scout Servers
- **Ignore TLS** can be enabled per-server for environments using self-signed certificates
- The Scout RSOP web UI itself runs over plain HTTP on localhost — do not expose it to the network without adding a reverse proxy with TLS

### Network Exposure

Scout RSOP binds to \`0.0.0.0\` by default. On a shared machine, restrict access with a firewall or bind to localhost:

\`\`\`bash
# Linux — bind only to localhost
./scoutrsop --port 8080
# Then add firewall rule to block external access to port 8080
\`\`\``,
      },
    ],
  },
]

export default function DocsPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<{ cat: string; title: string } | null>(
    { cat: DOCS[0].category, title: DOCS[0].articles[0].title }
  )

  const allArticles = DOCS.flatMap(cat => cat.articles.map(a => ({ ...a, category: cat.category })))

  const filtered = search
    ? allArticles.filter(a =>
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.content.toLowerCase().includes(search.toLowerCase())
      )
    : null

  const activeArticle = allArticles.find(
    a => a.category === selected?.cat && a.title === selected?.title
  )

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r border-surface-border overflow-hidden">
        <div className="px-4 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={14} className="text-brand-400" />
            <h2 className="font-semibold text-sm">Documentation</h2>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              className="input pl-8 text-xs py-1.5"
              placeholder="Search docs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {(filtered ?? DOCS.map(cat => ({
            ...cat,
            articles: cat.articles.map(a => ({ ...a, category: cat.category }))
          }))).map((cat, i) => {
            const catArticles = filtered ?? (cat as typeof DOCS[0]).articles
            if (filtered && catArticles.length === 0) return null

            return (
              <div key={i} className="px-3 mb-3">
                {!filtered && (
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-white/40 uppercase tracking-widest">
                    {(cat as typeof DOCS[0]).icon}
                    {cat.category}
                  </div>
                )}
                {(catArticles as { title: string; category?: string }[]).map(article => {
                  const artCat = (article as { category?: string }).category ?? cat.category
                  const active = selected?.cat === artCat && selected?.title === article.title
                  return (
                    <button
                      key={article.title}
                      onClick={() => { setSelected({ cat: artCat, title: article.title }); setSearch('') }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-all duration-150
                        ${active
                          ? 'bg-brand-600/20 text-brand-300 border border-brand-500/20'
                          : 'text-white/50 hover:text-white/80 hover:bg-surface-overlay'
                        }`}
                    >
                      <ChevronRight size={10} className={active ? 'opacity-100' : 'opacity-0'} />
                      {article.title}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* External links */}
        <div className="border-t border-surface-border px-4 py-3 space-y-1.5">
          <a href="https://docs.citrix.com/en-us/unicon-elux-scout" target="_blank" rel="noreferrer"
             className="flex items-center gap-2 text-xs text-white/35 hover:text-white/60 transition-colors">
            <ExternalLink size={11} />
            Citrix Scout Docs
          </a>
          <a href="https://github.com/mathiastornblom/ScoutRSOP" target="_blank" rel="noreferrer"
             className="flex items-center gap-2 text-xs text-white/35 hover:text-white/60 transition-colors">
            <ExternalLink size={11} />
            GitHub Repository
          </a>
          <a href="https://github.com/mathiastornblom/ScoutRSOP/releases" target="_blank" rel="noreferrer"
             className="flex items-center gap-2 text-xs text-white/35 hover:text-white/60 transition-colors">
            <ExternalLink size={11} />
            Releases & Changelog
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-10 py-8">
        {activeArticle ? (
          <motion.div
            key={activeArticle.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <MarkdownRenderer content={activeArticle.content} />
          </motion.div>
        ) : (
          <div className="text-center py-12 text-white/30">Select an article</div>
        )}
      </div>
    </div>
  )
}

/** Minimal markdown-to-JSX renderer for headings, tables, code blocks, lists. */
function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-xl font-semibold text-white mt-6 mb-3">{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-base font-semibold text-white/80 mt-5 mb-2">{line.slice(4)}</h3>)
    } else if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={i} className="bg-surface-overlay border border-surface-border rounded-lg px-4 py-3 text-xs font-mono text-white/70 overflow-x-auto my-3">
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
    } else if (line.startsWith('| ')) {
      // Table
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      elements.push(<MarkdownTable key={i} lines={tableLines} />)
      continue
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={i} className="list-disc list-inside space-y-1 my-3 text-sm text-white/60 pl-2">
          {items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ul>
      )
      continue
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    } else {
      elements.push(<p key={i} className="text-sm text-white/60 leading-relaxed">{renderInline(line)}</p>)
    }
    i++
  }

  return <div className="max-w-3xl">{elements}</div>
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines.filter(l => !l.match(/^\|[-\s|]+\|$/))
  const [header, ...body] = rows
  const cols = header.split('|').filter(c => c.trim()).map(c => c.trim())

  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {cols.map((col, i) => (
              <th key={i} className="text-left px-4 py-2 text-xs font-medium text-white/40 uppercase tracking-wide border-b border-surface-border bg-surface-overlay first:rounded-tl-lg last:rounded-tr-lg">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => {
            const cells = row.split('|').filter(c => c.trim()).map(c => c.trim())
            return (
              <tr key={ri} className="border-b border-surface-border/50 hover:bg-surface-overlay/50">
                {cells.map((cell, ci) => (
                  <td key={ci} className="px-4 py-2 text-white/60 text-xs font-mono">{renderInline(cell)}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function renderInline(text: string): React.ReactNode {
  // Bold **text**, inline code `text`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-white/80">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="font-mono text-brand-300 bg-brand-900/30 px-1 rounded">{part.slice(1, -1)}</code>
    return part
  })
}
