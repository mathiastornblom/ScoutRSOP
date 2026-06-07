import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Server, GitCompare, History, Settings, ChevronDown,
  Wifi, WifiOff, RefreshCw, ExternalLink, AlertCircle
} from 'lucide-react'
import { useAppStore } from '../store/app'
import { api } from '../lib/api'
import type { ReleaseInfo } from '../lib/api'

const NAV = [
  { to: '/',         icon: Server,     label: 'Servers'  },
  { to: '/rsop',     icon: GitCompare, label: 'RSOP'     },
  { to: '/history',  icon: History,    label: 'History'  },
  { to: '/settings', icon: Settings,   label: 'Settings' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { servers, sessions, activeServerId } = useAppStore()
  const [release, setRelease] = useState<ReleaseInfo | null>(null)
  const [showUpdateBanner, setShowUpdateBanner] = useState(false)

  useEffect(() => {
    api.version.check().then(r => {
      setRelease(r)
      if (r.updateAvailable) setShowUpdateBanner(true)
    }).catch(() => {})
  }, [])

  const activeServer = servers.find(s => s.id === activeServerId)
  const isLoggedIn = activeServerId ? !!sessions[activeServerId] : false

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-surface-border bg-surface-raised">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg">
              <GitCompare size={14} className="text-white" />
            </div>
            {/* Brand name placeholder — update when branding is finalised */}
            <span className="font-semibold text-sm tracking-wide text-white">Scout RSOP</span>
          </div>
          <p className="text-xs text-white/30 mt-1 font-mono">
            v{release?.current ?? '—'}
          </p>
        </div>

        {/* Server selector */}
        <div className="px-3 py-3 border-b border-surface-border">
          <p className="text-xs text-white/30 font-medium px-2 mb-1.5 uppercase tracking-widest">Active Server</p>
          <ServerSelector />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to))
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150
                  ${active
                    ? 'bg-brand-600/20 text-brand-400 border border-brand-500/20'
                    : 'text-white/50 hover:text-white/80 hover:bg-surface-overlay'
                  }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Connection status */}
        {activeServer && (
          <div className="px-4 py-3 border-t border-surface-border">
            <div className="flex items-center gap-2">
              {isLoggedIn
                ? <Wifi size={13} className="text-green-400" />
                : <WifiOff size={13} className="text-white/30" />
              }
              <span className="text-xs text-white/40 truncate">{activeServer.name}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Update banner */}
        <AnimatePresence>
          {showUpdateBanner && release && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-brand-600/20 border-b border-brand-500/30 px-4 py-2 flex items-center justify-between text-sm"
            >
              <span className="flex items-center gap-2 text-brand-300">
                <RefreshCw size={13} />
                New version available: <strong>{release.tag_name}</strong>
              </span>
              <div className="flex items-center gap-3">
                <a href={release.html_url} target="_blank" rel="noreferrer"
                   className="text-brand-400 hover:text-brand-300 flex items-center gap-1">
                  View release <ExternalLink size={11} />
                </a>
                <button onClick={() => setShowUpdateBanner(false)} className="text-white/30 hover:text-white/60">✕</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

function ServerSelector() {
  const { servers, activeServerId, setActiveServer, sessions } = useAppStore()
  const [open, setOpen] = useState(false)

  const active = servers.find(s => s.id === activeServerId)

  if (servers.length === 0) {
    return (
      <Link to="/" className="flex items-center gap-2 px-2 py-1.5 text-xs text-white/30 hover:text-white/50">
        <AlertCircle size={12} />
        No servers configured
      </Link>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-surface-overlay text-sm text-left transition-colors"
      >
        <span className="truncate text-white/70">{active?.name ?? 'Select server…'}</span>
        <ChevronDown size={13} className={`text-white/30 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full left-0 right-0 mt-1 z-50 card shadow-xl overflow-hidden"
          >
            {servers.map(s => (
              <button
                key={s.id}
                onClick={() => { setActiveServer(s.id); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-overlay transition-colors
                  ${s.id === activeServerId ? 'text-brand-400' : 'text-white/70'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sessions[s.id] ? 'bg-green-400' : 'bg-white/20'}`} />
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
