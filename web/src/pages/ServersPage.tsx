import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Server, Trash2, Edit2, Wifi, WifiOff, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore } from '../store/app'
import type { Server as ServerType } from '../lib/api'

export default function ServersPage() {
  const { servers, setServers, setActiveServer, activeServerId, sessions, setSession } = useAppStore()
  const [showForm, setShowForm] = useState(false)
  const [editServer, setEditServer] = useState<ServerType | null>(null)
  const [loginTarget, setLoginTarget] = useState<ServerType | null>(null)

  useEffect(() => {
    api.servers.list().then(setServers).catch(() => {})
  }, [setServers])

  async function handleDelete(id: string) {
    if (!confirm('Remove this server?')) return
    await api.servers.delete(id)
    setServers(servers.filter(s => s.id !== id))
    if (activeServerId === id) setActiveServer(null)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Scout Servers</h1>
          <p className="text-sm text-white/40 mt-1">Manage Scout Board server connections</p>
        </div>
        <button onClick={() => { setEditServer(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
          <Plus size={15} />
          Add Server
        </button>
      </div>

      {servers.length === 0 && !showForm ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-12 text-center"
        >
          <Server size={40} className="mx-auto mb-4 text-white/20" />
          <h2 className="text-lg font-medium text-white/60 mb-2">No servers configured</h2>
          <p className="text-sm text-white/30 mb-6">Add your first Scout Server to get started with RSOP analysis.</p>
          <button onClick={() => setShowForm(true)} className="btn-primary mx-auto">
            Add your first server
          </button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {servers.map((srv, i) => (
            <ServerCard
              key={srv.id}
              server={srv}
              index={i}
              active={srv.id === activeServerId}
              loggedIn={!!sessions[srv.id]}
              onEdit={() => { setEditServer(srv); setShowForm(true) }}
              onDelete={() => handleDelete(srv.id)}
              onSelect={() => setActiveServer(srv.id)}
              onLogin={() => setLoginTarget(srv)}
            />
          ))}
        </div>
      )}

      {/* Server form modal */}
      <AnimatePresence>
        {showForm && (
          <ServerFormModal
            server={editServer}
            onClose={() => setShowForm(false)}
            onSave={async (s) => {
              if (s.id) {
                await api.servers.update(s as ServerType)
                setServers(servers.map(x => x.id === s.id ? s as ServerType : x))
              } else {
                const saved = await api.servers.add(s as Omit<ServerType, 'id' | 'createdAt' | 'updatedAt'>)
                setServers([...servers, saved])
              }
              setShowForm(false)
            }}
          />
        )}
      </AnimatePresence>

      {/* Login modal */}
      <AnimatePresence>
        {loginTarget && (
          <LoginModal
            server={loginTarget}
            onClose={() => setLoginTarget(null)}
            onLogin={(username) => {
              setSession(loginTarget.id, username)
              setActiveServer(loginTarget.id)
              setLoginTarget(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ServerCard({ server, index, active, loggedIn, onEdit, onDelete, onSelect, onLogin }: {
  server: ServerType; index: number; active: boolean; loggedIn: boolean
  onEdit: () => void; onDelete: () => void; onSelect: () => void; onLogin: () => void
}) {
  const [pinging, setPinging] = useState(false)
  const [pingResult, setPingResult] = useState<boolean | null>(null)

  async function ping() {
    setPinging(true)
    try {
      const r = await api.scout.ping(server.id)
      setPingResult(r.online)
    } catch {
      setPingResult(false)
    } finally {
      setPinging(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`card p-4 flex items-center gap-4 group transition-all duration-150
        ${active ? 'border-brand-500/40 bg-brand-950/30' : 'hover:border-white/10'}`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
        ${active ? 'bg-brand-600/30' : 'bg-surface-overlay'}`}>
        <Server size={16} className={active ? 'text-brand-400' : 'text-white/40'} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm text-white">{server.name}</h3>
          {active && <span className="badge bg-brand-600/20 text-brand-400 border border-brand-500/20">Active</span>}
          {loggedIn
            ? <span className="badge-added flex items-center gap-1"><Wifi size={9} /> Connected</span>
            : <span className="badge bg-white/5 text-white/30 border border-white/10 flex items-center gap-1"><WifiOff size={9} /> Disconnected</span>
          }
        </div>
        <p className="text-xs text-white/40 mt-0.5 font-mono truncate">{server.url}</p>
        {server.description && <p className="text-xs text-white/30 mt-0.5">{server.description}</p>}
      </div>

      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {pingResult !== null && (
          pingResult
            ? <CheckCircle size={14} className="text-green-400" />
            : <XCircle size={14} className="text-red-400" />
        )}
        <button onClick={ping} disabled={pinging} className="btn-ghost text-xs py-1 px-2">
          {pinging ? '…' : 'Ping'}
        </button>
        {!loggedIn && (
          <button onClick={onLogin} className="btn-primary text-xs py-1 px-3">Login</button>
        )}
        {!active && (
          <button onClick={onSelect} className="btn-secondary text-xs py-1 px-3">Select</button>
        )}
        <button onClick={onEdit} className="btn-ghost p-1.5"><Edit2 size={13} /></button>
        <button onClick={onDelete} className="btn-ghost p-1.5 text-red-400/60 hover:text-red-400"><Trash2 size={13} /></button>
      </div>
    </motion.div>
  )
}

function ServerFormModal({ server, onClose, onSave }: {
  server: ServerType | null
  onClose: () => void
  onSave: (s: Partial<ServerType>) => void
}) {
  const [form, setForm] = useState({
    name: server?.name ?? '',
    url: server?.url ?? 'https://',
    ignoreTls: server?.ignoreTls ?? false,
    description: server?.description ?? '',
  })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({ ...form, id: server?.id })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="card w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="font-semibold text-lg mb-5">{server ? 'Edit Server' : 'Add Server'}</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Name *</label>
            <input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Production Scout" />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">URL *</label>
            <input className="input font-mono text-xs" required value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://scout.corp.com:22160" />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Description</label>
            <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.ignoreTls} onChange={e => setForm(f => ({ ...f, ignoreTls: e.target.checked }))}
              className="w-4 h-4 rounded accent-brand-500" />
            <span className="text-sm text-white/60">Ignore TLS certificate errors (self-signed)</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : server ? 'Update' : 'Add Server'}
            </button>
          </div>
        </form>
      </motion.div>
    </Backdrop>
  )
}

function LoginModal({ server, onClose, onLogin }: {
  server: ServerType; onClose: () => void; onLogin: (username: string) => void
}) {
  const [creds, setCreds] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPw, setShowPw] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.scout.login(server.id, creds.username, creds.password)
      onLogin(creds.username)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="card w-full max-w-sm p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-brand-600/20 flex items-center justify-center">
            <Server size={16} className="text-brand-400" />
          </div>
          <div>
            <h2 className="font-semibold">Sign in</h2>
            <p className="text-xs text-white/40">{server.name}</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input className="input" required placeholder="Username" value={creds.username}
            onChange={e => setCreds(c => ({ ...c, username: e.target.value }))} autoFocus />
          <div className="relative">
            <input className="input pr-10" required placeholder="Password" type={showPw ? 'text' : 'password'}
              value={creds.password} onChange={e => setCreds(c => ({ ...c, password: e.target.value }))} />
            <button type="button" onClick={() => setShowPw(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </motion.div>
    </Backdrop>
  )
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      {children}
    </motion.div>
  )
}
