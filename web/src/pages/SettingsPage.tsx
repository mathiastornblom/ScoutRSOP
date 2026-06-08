import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, Sparkles, GitBranch, Eye, EyeOff, Save,
  ExternalLink, CheckCircle, AlertCircle, RefreshCw, Download, Info,
  Lock, LockOpen, ShieldCheck, ShieldAlert, Trash2, Wand2, ChevronDown
} from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore } from '../store/app'
import type { Settings as SettingsType, ReleaseInfo, TLSStatus, CertInfo } from '../lib/api'

const PROVIDER_LABELS: Record<string, string> = {
  claude:  'Claude (Anthropic)',
  openai:  'ChatGPT (OpenAI)',
  gemini:  'Gemini (Google)',
  copilot: 'Copilot (Microsoft)',
}

const PROVIDER_MODELS: Record<string, string[]> = {
  claude:  ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  openai:  ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  gemini:  ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  copilot: ['gpt-4o', 'gpt-4-turbo'],
}

// Default provider entries shown even if backend has none configured
const DEFAULT_PROVIDERS = ['claude', 'openai', 'gemini', 'copilot'].map(provider => ({
  provider,
  model: PROVIDER_MODELS[provider][0],
  apiKey: '',
  enabled: false,
  hasKey: false,
  maskedKey: '',
}))

export default function SettingsPage() {
  const { setAIProviders } = useAppStore()
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS)
  const [githubRepo, setGithubRepo] = useState('mathiastornblom/ScoutRSOP')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [releases, setReleases] = useState<ReleaseInfo[]>([])
  const [loadingReleases, setLoadingReleases] = useState(false)
  const [versionInfo, setVersionInfo] = useState<ReleaseInfo | null>(null)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  // TLS state
  const [tlsStatus, setTlsStatus] = useState<TLSStatus | null>(null)
  const [tlsCertPem, setTlsCertPem] = useState('')
  const [tlsKeyPem, setTlsKeyPem] = useState('')
  const [tlsHosts, setTlsHosts] = useState('')
  const [tlsMode, setTlsMode] = useState<'upload' | 'generate'>('upload')
  const [tlsSaving, setTlsSaving] = useState(false)
  const [tlsResult, setTlsResult] = useState<{ ok?: boolean; error?: string; restartRequired?: boolean; cert?: CertInfo; certPem?: string } | null>(null)
  const [showGeneratedCert, setShowGeneratedCert] = useState(false)

  useEffect(() => {
    api.settings.get().then(s => {
      setSettings(s)
      setGithubRepo(s.githubRepo || 'mathiastornblom/ScoutRSOP')
      // Merge server providers over defaults (keeps all 4 always visible)
      setProviders(DEFAULT_PROVIDERS.map(def => {
        const server = s.aiProviders.find(p => p.provider === def.provider)
        return server ? { ...def, ...server, apiKey: '' } : def
      }))
      setAIProviders(s.aiProviders)
    }).catch(() => {})

    // Check for updates on load
    api.version.check().then(setVersionInfo).catch(() => {})

    // TLS status
    api.tls.status().then(setTlsStatus).catch(() => {})
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
            <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
              versionInfo?.updateAvailable
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-surface-overlay border-surface-border'
            }`}>
              <div className="flex-1">
                <p className="text-sm text-white/70 font-mono flex items-center gap-2">
                  <Info size={12} className="text-white/30" />
                  Running <span className="text-brand-400">{settings.version}</span>
                  {versionInfo?.updateAvailable && (
                    <span className="text-amber-400 text-xs">→ {versionInfo.tag_name} available</span>
                  )}
                </p>
                <p className="text-xs text-white/30 mt-0.5">Built {settings.buildDate}</p>
              </div>
              {versionInfo?.updateAvailable && (
                <a
                  href={versionInfo.html_url}
                  target="_blank" rel="noreferrer"
                  className="btn-primary text-xs flex items-center gap-1.5 flex-shrink-0"
                >
                  <Download size={11} /> Download update
                </a>
              )}
              {!versionInfo?.updateAvailable && versionInfo && (
                <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
              )}
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
                  <div key={r.tag_name} className={`card p-3 ${r.tag_name === settings?.version ? 'border-brand-500/30' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono text-brand-400 flex items-center gap-1.5">
                        {r.tag_name}
                        {r.tag_name === settings?.version && (
                          <span className="badge bg-brand-600/20 text-brand-400 border border-brand-500/20 text-xs">current</span>
                        )}
                      </span>
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

      {/* TLS / HTTPS */}
      <TLSSection
        status={tlsStatus}
        certPem={tlsCertPem} setCertPem={setTlsCertPem}
        keyPem={tlsKeyPem} setKeyPem={setTlsKeyPem}
        hosts={tlsHosts} setHosts={setTlsHosts}
        mode={tlsMode} setMode={setTlsMode}
        saving={tlsSaving}
        result={tlsResult}
        showGeneratedCert={showGeneratedCert}
        setShowGeneratedCert={setShowGeneratedCert}
        onSave={async () => {
          setTlsSaving(true); setTlsResult(null)
          try {
            const r = await api.tls.update(tlsCertPem, tlsKeyPem) as typeof tlsResult
            setTlsResult(r)
            setTlsStatus(await api.tls.status())
          } catch (e: unknown) { setTlsResult({ error: e instanceof Error ? e.message : 'Failed' }) }
          finally { setTlsSaving(false) }
        }}
        onGenerate={async () => {
          setTlsSaving(true); setTlsResult(null)
          try {
            const hosts = tlsHosts.split(',').map(h => h.trim()).filter(Boolean)
            const r = await api.tls.generate(hosts) as typeof tlsResult
            setTlsResult(r)
            if (r?.certPem) setShowGeneratedCert(true)
            setTlsStatus(await api.tls.status())
          } catch (e: unknown) { setTlsResult({ error: e instanceof Error ? e.message : 'Failed' }) }
          finally { setTlsSaving(false) }
        }}
        onDelete={async () => {
          if (!confirm('Disable TLS and revert to HTTP?')) return
          setTlsSaving(true); setTlsResult(null)
          try {
            await api.tls.delete()
            setTlsResult({ ok: true, restartRequired: true })
            setTlsStatus(await api.tls.status())
          } catch (e: unknown) { setTlsResult({ error: e instanceof Error ? e.message : 'Failed' }) }
          finally { setTlsSaving(false) }
        }}
      />

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

// ---------- TLS Section ----------

interface TLSSectionProps {
  status: TLSStatus | null
  certPem: string; setCertPem: (v: string) => void
  keyPem: string; setKeyPem: (v: string) => void
  hosts: string; setHosts: (v: string) => void
  mode: 'upload' | 'generate'; setMode: (v: 'upload' | 'generate') => void
  saving: boolean
  result: { ok?: boolean; error?: string; restartRequired?: boolean; cert?: CertInfo; certPem?: string } | null
  showGeneratedCert: boolean; setShowGeneratedCert: (v: boolean) => void
  onSave: () => void; onGenerate: () => void; onDelete: () => void
}

function TLSSection(p: TLSSectionProps) {
  const enabled = p.status?.enabled ?? false
  const cert = p.status?.cert

  return (
    <Section
      title="TLS / HTTPS"
      icon={enabled ? <Lock size={14} className="text-green-400" /> : <LockOpen size={14} className="text-white/30" />}
      description="Encrypt traffic between browser and ScoutRSOP server. Passwords are sent over this connection — TLS is strongly recommended."
    >
      {/* Status card */}
      <div className={`card p-4 mb-4 flex items-start gap-3 ${enabled ? 'border-green-500/25' : 'border-amber-500/20'}`}>
        <div className="mt-0.5 flex-shrink-0">
          {enabled
            ? <ShieldCheck size={18} className="text-green-400" />
            : <ShieldAlert size={18} className="text-amber-400" />
          }
        </div>
        <div className="flex-1 min-w-0">
          {enabled && cert ? (
            <>
              <p className="text-sm font-medium text-green-400 mb-1">HTTPS active — restart server to apply any new cert</p>
              <div className="text-xs text-white/50 space-y-0.5">
                <p>Subject: <span className="font-mono text-white/70">{cert.subject || '—'}</span></p>
                {cert.dnsNames?.length > 0 && <p>DNS: <span className="font-mono text-white/70">{cert.dnsNames.join(', ')}</span></p>}
                {cert.ips?.length > 0 && <p>IPs: <span className="font-mono text-white/70">{cert.ips.join(', ')}</span></p>}
                <p>
                  Expires <span className={`font-mono font-medium ${cert.daysLeft < 30 ? 'text-red-400' : cert.daysLeft < 90 ? 'text-amber-400' : 'text-white/70'}`}>
                    {new Date(cert.notAfter).toLocaleDateString()} ({cert.daysLeft}d)
                  </span>
                  {cert.selfSigned && <span className="ml-2 badge bg-amber-500/15 text-amber-400 border border-amber-500/20">self-signed</span>}
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-amber-400">Running on HTTP — credentials are transmitted unencrypted</p>
          )}
        </div>
        {enabled && (
          <button onClick={p.onDelete} disabled={p.saving}
            className="btn-ghost text-xs text-red-400/70 hover:text-red-400 flex items-center gap-1 flex-shrink-0">
            <Trash2 size={12} /> Remove TLS
          </button>
        )}
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-4 bg-surface-overlay rounded-lg p-1 w-fit">
        {(['upload', 'generate'] as const).map(m => (
          <button key={m} onClick={() => p.setMode(m)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize
              ${p.mode === m ? 'bg-brand-600/30 text-brand-300' : 'text-white/40 hover:text-white/60'}`}>
            {m === 'upload' ? '↑ Upload cert & key' : '✦ Generate self-signed'}
          </button>
        ))}
      </div>

      {p.mode === 'upload' && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Certificate PEM *</label>
            <textarea
              className="input font-mono text-xs resize-none"
              rows={6}
              placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
              value={p.certPem}
              onChange={e => p.setCertPem(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Private Key PEM *</label>
            <textarea
              className="input font-mono text-xs resize-none"
              rows={5}
              placeholder={"-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----"}
              value={p.keyPem}
              onChange={e => p.setKeyPem(e.target.value)}
            />
          </div>
          <button onClick={p.onSave} disabled={p.saving || !p.certPem || !p.keyPem}
            className="btn-primary flex items-center gap-2">
            {p.saving ? <RefreshCw size={13} className="animate-spin" /> : <Lock size={13} />}
            {p.saving ? 'Validating…' : 'Save & Enable TLS'}
          </button>
        </div>
      )}

      {p.mode === 'generate' && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Hostnames / IP addresses</label>
            <input
              className="input text-sm font-mono"
              placeholder="192.168.1.100, scout.corp.com, localhost"
              value={p.hosts}
              onChange={e => p.setHosts(e.target.value)}
            />
            <p className="text-xs text-white/25 mt-1">Comma-separated. Include all names/IPs you'll use to reach this server.</p>
          </div>
          <div className="card p-3 bg-amber-500/5 border-amber-500/15">
            <p className="text-xs text-amber-400/80">
              <strong>Self-signed certificates</strong> trigger browser security warnings.
              For production, upload a certificate from Let's Encrypt or your CA instead.
            </p>
          </div>
          <button onClick={p.onGenerate} disabled={p.saving}
            className="btn-primary flex items-center gap-2">
            {p.saving ? <RefreshCw size={13} className="animate-spin" /> : <Wand2 size={13} />}
            {p.saving ? 'Generating…' : 'Generate & Enable TLS'}
          </button>
        </div>
      )}

      {/* Result feedback */}
      <AnimatePresence>
        {p.result && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-4 space-y-2">
            {p.result.error && (
              <div className="card p-3 border-red-500/30 bg-red-500/5 flex items-start gap-2">
                <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{p.result.error}</p>
              </div>
            )}
            {p.result.ok && (
              <div className="card p-3 border-green-500/25 bg-green-500/5 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-green-400" />
                  <p className="text-xs text-green-400 font-medium">Certificate saved successfully</p>
                </div>
                {p.result.restartRequired && (
                  <p className="text-xs text-amber-400 flex items-start gap-1.5">
                    <Info size={11} className="flex-shrink-0 mt-0.5" />
                    <span><strong>Restart ScoutRSOP</strong> for HTTPS to take effect. After restart, open <span className="font-mono">https://…:{'{port}'}</span> instead of http://.</span>
                  </p>
                )}
                {p.result.cert && (
                  <p className="text-xs text-white/40 font-mono">
                    {p.result.cert.subject} — expires {new Date(p.result.cert.notAfter).toLocaleDateString()} ({p.result.cert.daysLeft}d)
                  </p>
                )}
              </div>
            )}
            {/* Downloadable self-signed cert */}
            {p.result.certPem && (
              <div className="card p-3 border-surface-border">
                <button onClick={() => p.setShowGeneratedCert(!p.showGeneratedCert)}
                  className="flex items-center gap-2 text-xs text-white/50 hover:text-white/70 w-full">
                  <ChevronDown size={12} className={`transition-transform ${p.showGeneratedCert ? '' : '-rotate-90'}`} />
                  Generated certificate (install in your browser/OS to suppress warnings)
                </button>
                {p.showGeneratedCert && (
                  <pre className="mt-2 text-xs font-mono text-white/40 bg-surface-overlay rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                    {p.result.certPem}
                  </pre>
                )}
                <button
                  onClick={() => {
                    const blob = new Blob([p.result!.certPem!], { type: 'application/x-pem-file' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a'); a.href = url; a.download = 'scoutrsop-cert.pem'; a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="btn-ghost text-xs mt-2 flex items-center gap-1">
                  <Download size={11} /> Download cert.pem
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  )
}
