import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Settings, Sparkles, GitBranch, Eye, EyeOff, Save,
  ExternalLink, CheckCircle, AlertCircle, RefreshCw
} from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore } from '../store/app'
import type { Settings as SettingsType, ReleaseInfo } from '../lib/api'

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
  gemini: 'Gemini (Google)',
  copilot: 'Copilot (Microsoft)',
}

const PROVIDER_MODELS: Record<string, string[]> = {
  claude:  ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
  openai:  ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  gemini:  ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
  copilot: ['gpt-4o', 'gpt-4-turbo'],
}

export default function SettingsPage() {
  const { setAIProviders } = useAppStore()
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [providers, setProviders] = useState<{
    provider: string; model: string; apiKey: string; enabled: boolean; hasKey: boolean; maskedKey: string
  }[]>([])
  const [githubRepo, setGithubRepo] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [releases, setReleases] = useState<ReleaseInfo[]>([])
  const [loadingReleases, setLoadingReleases] = useState(false)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    api.settings.get().then(s => {
      setSettings(s)
      setGithubRepo(s.githubRepo)
      setProviders(s.aiProviders.map(p => ({ ...p, apiKey: '' })))
      setAIProviders(s.aiProviders)
    }).catch(() => {})
  }, [setAIProviders])

  async function save() {
    setSaving(true)
    try {
      await api.settings.updateAI({
        providers: providers.map(p => ({
          provider: p.provider,
          model: p.model,
          apiKey: p.apiKey,
          enabled: p.enabled,
        })),
        githubRepo,
      })
      // Refresh to get updated maskedKeys
      const fresh = await api.settings.get()
      setProviders(fresh.aiProviders.map(p => ({ ...p, apiKey: '' })))
      setAIProviders(fresh.aiProviders)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function loadReleases() {
    setLoadingReleases(true)
    try {
      const r = await api.version.releases()
      setReleases(r)
    } catch { /* noop */ } finally { setLoadingReleases(false) }
  }

  function updateProvider(provider: string, key: string, value: unknown) {
    setProviders(ps => ps.map(p => p.provider === provider ? { ...p, [key]: value } : p))
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Settings size={20} className="text-brand-400" />
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      {/* AI Providers */}
      <Section title="AI Providers" icon={<Sparkles size={14} className="text-brand-400" />}
        description="Configure AI assistants for natural language RSOP queries.">
        <div className="space-y-4">
          {providers.map((p, i) => (
            <motion.div
              key={p.provider}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`card p-4 transition-all duration-150 ${p.enabled ? 'border-brand-500/20' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={e => updateProvider(p.provider, 'enabled', e.target.checked)}
                      className="accent-brand-500 w-4 h-4"
                    />
                    <span className="font-medium text-sm">{PROVIDER_LABELS[p.provider]}</span>
                  </label>
                  {p.hasKey && <span className="badge-added flex items-center gap-1"><CheckCircle size={9} /> Key set</span>}
                  {!p.hasKey && p.enabled && <span className="badge bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1"><AlertCircle size={9} /> Needs key</span>}
                </div>
              </div>

              {p.enabled && (
                <div className="space-y-2.5">
                  {/* API Key */}
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">API Key {p.hasKey && <span className="text-white/20">(current: {p.maskedKey})</span>}</label>
                    <div className="relative">
                      <input
                        type={showKeys[p.provider] ? 'text' : 'password'}
                        className="input text-sm pr-9"
                        placeholder={p.hasKey ? 'Leave blank to keep existing key' : 'Enter API key…'}
                        value={p.apiKey}
                        onChange={e => updateProvider(p.provider, 'apiKey', e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeys(s => ({ ...s, [p.provider]: !s[p.provider] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                      >
                        {showKeys[p.provider] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                  {/* Model */}
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Model</label>
                    <select
                      value={p.model}
                      onChange={e => updateProvider(p.provider, 'model', e.target.value)}
                      className="input text-sm"
                    >
                      {(PROVIDER_MODELS[p.provider] ?? []).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </Section>

      {/* GitHub / Version */}
      <Section title="Version & Updates" icon={<GitBranch size={14} className="text-brand-400" />}
        description="Configure the GitHub repository for version checks and changelogs.">
        <div className="space-y-4">
          {settings && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-overlay border border-surface-border">
              <div className="flex-1">
                <p className="text-sm text-white/70 font-mono">v{settings.version}</p>
                <p className="text-xs text-white/30">Built {settings.buildDate}</p>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-white/40 mb-1.5 block">GitHub Repository (owner/repo)</label>
            <input
              className="input font-mono text-sm"
              value={githubRepo}
              onChange={e => setGithubRepo(e.target.value)}
              placeholder="mathiast/ScoutRSOP"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-white/60">Release History</h4>
              <button onClick={loadReleases} disabled={loadingReleases} className="btn-ghost text-xs flex items-center gap-1">
                {loadingReleases ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Load
              </button>
            </div>
            {releases.length > 0 ? (
              <div className="space-y-2">
                {releases.map(r => (
                  <div key={r.tag_name} className="card p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono text-brand-400">{r.tag_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/30">{new Date(r.published_at).toLocaleDateString()}</span>
                        <a href={r.html_url} target="_blank" rel="noreferrer"
                           className="text-white/30 hover:text-white/60">
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                    {r.name && <p className="text-xs text-white/50 mt-1">{r.name}</p>}
                    {r.body && (
                      <pre className="text-xs text-white/30 mt-2 whitespace-pre-wrap font-sans leading-relaxed line-clamp-4">
                        {r.body}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/25 text-center py-4">Click "Load" to fetch release history from GitHub.</p>
            )}
          </div>
        </div>
      </Section>

      {/* Save */}
      <div className="flex items-center justify-end gap-3 mt-8">
        {saved && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-green-400 flex items-center gap-1">
            <CheckCircle size={13} /> Saved
          </motion.span>
        )}
        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, icon, description, children }: {
  title: string; icon: React.ReactNode; description: string; children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h2 className="font-semibold text-sm text-white">{title}</h2>
      </div>
      <p className="text-xs text-white/35 mb-4">{description}</p>
      {children}
    </section>
  )
}
