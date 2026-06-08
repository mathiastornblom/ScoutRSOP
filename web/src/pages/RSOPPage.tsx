import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GitCompare, Search, Play, Sparkles, BarChart3,
  ChevronDown, ChevronRight, RefreshCw, AlertCircle, SlidersHorizontal,
  Monitor, Folder, FolderOpen, X
} from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore } from '../store/app'
import DiffViewer from '../components/DiffViewer'
import AIChat from '../components/AIChat'
import type { RSOPResult, OUNode, ScoutDevice } from '../lib/api'

type BaseType = 'base' | 'ou' | 'device'

export default function RSOPPage() {
  const { activeServerId, sessions, currentResult, setCurrentResult, servers } = useAppStore()
  const [baseType, setBaseType] = useState<BaseType>('base')
  const [baseRef, setBaseRef] = useState('')
  const [targetRef, setTargetRef] = useState('')
  const [sections, setSections] = useState<string[]>([])
  const [allSections, setAllSections] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [saveAs, setSaveAs] = useState('')
  const [showSave, setShowSave] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [ouTree, setOuTree] = useState<OUNode[]>([])
  const [ouOptions, setOuOptions] = useState<{ id: string; name: string }[]>([])
  const [targetDeviceName, setTargetDeviceName] = useState('')
  const [activeTab, setActiveTab] = useState<'diff' | 'full' | 'summary'>('diff')

  const server = servers.find(s => s.id === activeServerId)
  const isLoggedIn = activeServerId ? !!sessions[activeServerId] : false

  useEffect(() => {
    if (!activeServerId || !isLoggedIn) return
    api.scout.configSections(activeServerId).then(r => setAllSections(r.sections)).catch(() => {})
    api.scout.ouStructure(activeServerId).then((data: unknown) => {
      const tree = extractOUTree(data)
      setOuTree(tree)
      // Flatten for OU dropdown (baseType=ou)
      function flattenOUs(nodes: OUNode[], prefix = ''): { id: string; name: string }[] {
        return nodes.flatMap(n => {
          const label = prefix ? `${prefix} / ${n.Name}` : n.Name
          return [{ id: String(n.OUID), name: label }, ...flattenOUs(n.children ?? [], label)]
        })
      }
      setOuOptions(flattenOUs(tree))
    }).catch(() => {})
  }, [activeServerId, isLoggedIn])

  async function runRSOP() {
    if (!activeServerId) return
    if (!targetRef) { setError('Select a target device first'); return }
    if (baseType !== 'base' && !baseRef) { setError('Select a baseline reference'); return }

    setRunning(true)
    setError('')
    setCurrentResult(null)

    try {
      const result = await api.scout.runRSOP(activeServerId, {
        baseType,
        baseRef,
        targetRef,
        sections: sections.length ? sections : undefined,
        saveAs: showSave ? saveAs : undefined,
      })
      setCurrentResult(result)
      setActiveTab('diff')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'RSOP analysis failed')
    } finally {
      setRunning(false)
    }
  }

  if (!activeServerId || !server) {
    return (
      <div className="flex items-center justify-center h-full text-center p-8">
        <div>
          <GitCompare size={40} className="mx-auto mb-4 text-white/20" />
          <h2 className="text-lg font-medium text-white/50 mb-2">No server selected</h2>
          <p className="text-sm text-white/30">Select an active server from the sidebar to run RSOP analysis.</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center h-full text-center p-8">
        <div>
          <AlertCircle size={40} className="mx-auto mb-4 text-amber-400/50" />
          <h2 className="text-lg font-medium text-white/50 mb-2">Not authenticated</h2>
          <p className="text-sm text-white/30">Log in to <strong>{server.name}</strong> from the Servers page first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel: config */}
      <div className={`flex flex-col border-r border-surface-border transition-all duration-300 ${showAI ? 'w-80' : 'w-96'} flex-shrink-0`}>
        <div className="px-5 py-4 border-b border-surface-border">
          <h2 className="font-semibold text-sm text-white flex items-center gap-2">
            <GitCompare size={14} className="text-brand-400" />
            RSOP Configuration
          </h2>
          <p className="text-xs text-white/30 mt-0.5">{server.name}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Baseline type */}
          <div>
            <label className="text-xs text-white/50 mb-2 block font-medium uppercase tracking-wide">Compare Against</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['base', 'ou', 'device'] as BaseType[]).map(t => (
                <button
                  key={t}
                  onClick={() => { setBaseType(t); setBaseRef('') }}
                  className={`py-2 rounded-lg text-xs font-medium transition-all duration-150 capitalize
                    ${baseType === t
                      ? 'bg-brand-600/30 text-brand-300 border border-brand-500/30'
                      : 'bg-surface-overlay text-white/50 hover:text-white/70 border border-surface-border'
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Baseline ref */}
          {baseType === 'ou' && (
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">OU</label>
              <select
                value={baseRef}
                onChange={e => setBaseRef(e.target.value)}
                className="input text-sm"
              >
                <option value="">Select OU…</option>
                {ouOptions.map(ou => <option key={ou.id} value={ou.id}>{ou.name}</option>)}
              </select>
            </div>
          )}

          {baseType === 'device' && (
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Baseline Device</label>
              <DeviceTreePicker
                serverId={activeServerId}
                ouTree={ouTree}
                value={baseRef}
                onChange={(id) => setBaseRef(id)}
                placeholder="Browse or filter baseline device…"
              />
            </div>
          )}

          {/* Target device */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Target Device *</label>
            <DeviceTreePicker
              serverId={activeServerId}
              ouTree={ouTree}
              value={targetRef}
              onChange={(id, name) => { setTargetRef(id); setTargetDeviceName(name) }}
              placeholder="Browse or filter target device…"
            />
          </div>

          {/* Sections selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-white/50 font-medium uppercase tracking-wide">Config Sections</label>
              <div className="flex gap-2">
                <button onClick={() => setSections(allSections)} className="text-xs text-brand-400 hover:text-brand-300">All</button>
                <button onClick={() => setSections([])} className="text-xs text-white/30 hover:text-white/50">None</button>
              </div>
            </div>
            <div className="space-y-0.5 max-h-44 overflow-y-auto">
              {allSections.map(s => (
                <label key={s} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-overlay cursor-pointer text-xs text-white/50 hover:text-white/70">
                  <input
                    type="checkbox"
                    checked={sections.length === 0 || sections.includes(s)}
                    onChange={e => {
                      if (sections.length === 0) {
                        // Deselect this one
                        setSections(allSections.filter(x => x !== s))
                      } else {
                        setSections(e.target.checked ? [...sections, s] : sections.filter(x => x !== s))
                      }
                    }}
                    className="accent-brand-500 w-3.5 h-3.5"
                  />
                  <span className="font-mono">{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Save option */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" checked={showSave} onChange={e => setShowSave(e.target.checked)}
                className="accent-brand-500 w-3.5 h-3.5" />
              <span className="text-xs text-white/50">Save this run</span>
            </label>
            <AnimatePresence>
              {showSave && (
                <motion.input
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="input text-sm"
                  placeholder="Run name (e.g. Prod check 2026-06-08)"
                  value={saveAs}
                  onChange={e => setSaveAs(e.target.value)}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Run button */}
        <div className="px-5 py-4 border-t border-surface-border">
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <button
            onClick={runRSOP}
            disabled={running || !targetRef}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? 'Running analysis…' : 'Run RSOP'}
          </button>
        </div>
      </div>

      {/* Result panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!currentResult ? (
          <EmptyResult running={running} />
        ) : (
          <>
            {/* Result toolbar */}
            <div className="flex items-center gap-4 px-6 py-3 border-b border-surface-border bg-surface-raised flex-shrink-0">
              {/* Summary pills */}
              <SummaryPills result={currentResult} />

              <div className="flex-1" />

              {/* Tabs */}
              <div className="flex items-center gap-1 bg-surface-overlay rounded-lg p-1">
                {(['diff', 'full', 'summary'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize
                      ${activeTab === t ? 'bg-brand-600/30 text-brand-300' : 'text-white/40 hover:text-white/60'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowAI(s => !s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${showAI ? 'bg-brand-600/30 text-brand-300 border border-brand-500/30' : 'btn-ghost'}`}
              >
                <Sparkles size={12} />
                AI
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Main result area */}
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'diff' && (
                  <DiffViewer sections={currentResult.sections} />
                )}
                {activeTab === 'full' && (
                  <FullConfigView result={currentResult} />
                )}
                {activeTab === 'summary' && (
                  <SummaryView result={currentResult} targetName={targetDeviceName} />
                )}
              </div>

              {/* AI panel */}
              <AnimatePresence>
                {showAI && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: 380 }}
                    exit={{ width: 0 }}
                    className="flex-shrink-0 overflow-hidden"
                  >
                    <AIChat context={currentResult} onClose={() => setShowAI(false)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function EmptyResult({ running }: { running: boolean }) {
  return (
    <div className="flex items-center justify-center h-full text-center p-12">
      {running ? (
        <div>
          <RefreshCw size={32} className="mx-auto mb-4 text-brand-400 animate-spin" />
          <p className="text-white/50 text-sm">Running RSOP analysis…</p>
          <p className="text-white/25 text-xs mt-1">Fetching configuration from all levels</p>
        </div>
      ) : (
        <div>
          <BarChart3 size={40} className="mx-auto mb-4 text-white/15" />
          <h3 className="text-white/40 font-medium mb-2">No results yet</h3>
          <p className="text-white/25 text-sm">Configure a target device and run the analysis to see RSOP output.</p>
        </div>
      )}
    </div>
  )
}

function SummaryPills({ result }: { result: RSOPResult }) {
  const s = result.summary
  return (
    <div className="flex items-center gap-2">
      {s.changedKeys > 0 && <span className="badge-changed">{s.changedKeys} changed</span>}
      {s.addedKeys > 0 && <span className="badge-added">{s.addedKeys} added</span>}
      {s.removedKeys > 0 && <span className="badge-removed">{s.removedKeys} removed</span>}
      <span className="badge bg-white/5 text-white/30 border border-white/10">{s.sameKeys} same</span>
    </div>
  )
}

function FullConfigView({ result }: { result: RSOPResult }) {
  const [expandedSec, setExpandedSec] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
        <SlidersHorizontal size={14} />
        Full Configuration — {result.request.targetRef}
      </h3>
      {result.sections.map(sec => (
        <div key={sec.section} className="card overflow-hidden">
          <button
            onClick={() => setExpandedSec(e => e === sec.section ? null : sec.section)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-overlay text-left"
          >
            <ChevronDown size={13} className={`text-white/30 transition-transform ${expandedSec === sec.section ? '' : '-rotate-90'}`} />
            <span className="font-mono text-sm text-white/70">{sec.section}</span>
          </button>
          <AnimatePresence>
            {expandedSec === sec.section && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                <pre className="px-6 pb-4 text-xs text-white/50 font-mono overflow-x-auto border-t border-surface-border pt-3">
                  {JSON.stringify(sec.device, null, 2)}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

function SummaryView({ result, targetName }: { result: RSOPResult; targetName: string }) {
  const s = result.summary
  const total = s.totalKeys || 1
  return (
    <div className="max-w-lg space-y-6">
      <h3 className="text-sm font-medium text-white/60 flex items-center gap-2">
        <BarChart3 size={14} />
        Analysis Summary
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Changed', value: s.changedKeys, color: 'bg-amber-500', cls: 'text-amber-400' },
          { label: 'Added',   value: s.addedKeys,   color: 'bg-green-500',  cls: 'text-green-400' },
          { label: 'Removed', value: s.removedKeys, color: 'bg-red-500',    cls: 'text-red-400' },
          { label: 'Same',    value: s.sameKeys,    color: 'bg-white/20',   cls: 'text-white/40' },
        ].map(({ label, value, color, cls }) => (
          <div key={label} className="card p-4">
            <div className={`text-2xl font-bold ${cls}`}>{value}</div>
            <div className="text-xs text-white/40 mt-0.5">{label}</div>
            <div className="mt-2 h-1 bg-surface-border rounded-full overflow-hidden">
              <div className={`h-full ${color} rounded-full`} style={{ width: `${(value / total) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="card p-4 space-y-2">
        <h4 className="text-xs text-white/40 font-medium uppercase tracking-wide mb-3">Request Details</h4>
        <Row label="Compare against" value={`${result.request.baseType}${result.request.baseRef ? ` / ${result.request.baseRef}` : ''}`} />
        <Row label="Target device" value={targetName || result.request.targetRef} />
        <Row label="Sections analysed" value={`${result.sections.length}`} />
        <Row label="Total keys" value={`${s.totalKeys}`} />
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/40">{label}</span>
      <span className="text-white/70 font-mono text-xs">{value}</span>
    </div>
  )
}

// DeviceTreePicker — OU tree browser with contains-filter search
function DeviceTreePicker({ serverId, ouTree, value, onChange, placeholder }: {
  serverId: string
  ouTree: OUNode[]
  value: string          // selected DeviceID (string)
  onChange: (id: string, name: string) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [deviceCache, setDeviceCache] = useState<Record<number, ScoutDevice[]>>({})
  const [loadingOu, setLoadingOu] = useState<number | null>(null)
  const [expandedOus, setExpandedOus] = useState<Set<number>>(new Set())
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function loadDevices(ouid: number) {
    if (deviceCache[ouid]) return
    setLoadingOu(ouid)
    try {
      const devices = await api.scout.deviceList(serverId, String(ouid))
      setDeviceCache(c => ({ ...c, [ouid]: devices }))
    } catch { /* noop */ } finally { setLoadingOu(null) }
  }

  function toggleOU(ouid: number) {
    setExpandedOus(prev => {
      const next = new Set(prev)
      if (next.has(ouid)) { next.delete(ouid); return next }
      next.add(ouid)
      loadDevices(ouid)
      return next
    })
  }

  function selectDevice(device: ScoutDevice) {
    const id = String(device.DeviceID)
    onChange(id, device.Name)
    setSelectedName(device.Name)
    setOpen(false)
    setFilter('')
  }

  function clearSelection() {
    onChange('', '')
    setSelectedName('')
  }

  // Gather all loaded devices for filter search
  const allDevices: ScoutDevice[] = filter.length >= 1
    ? Object.values(deviceCache).flat().filter(d =>
        d.Name.toLowerCase().includes(filter.toLowerCase())
      )
    : []

  function renderTree(nodes: OUNode[], depth = 0): React.ReactNode {
    return nodes.map(node => {
      const isExpanded = expandedOus.has(node.OUID)
      const devices = deviceCache[node.OUID] ?? []
      const filteredDevices = filter
        ? devices.filter(d => d.Name.toLowerCase().includes(filter.toLowerCase()))
        : devices
      const isLoading = loadingOu === node.OUID

      return (
        <div key={node.OUID}>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-overlay text-left transition-colors"
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => toggleOU(node.OUID)}
          >
            {isExpanded
              ? <FolderOpen size={13} className="text-brand-400 flex-shrink-0" />
              : <Folder size={13} className="text-white/30 flex-shrink-0" />
            }
            <span className="text-sm text-white/70 flex-1 truncate">{node.Name}</span>
            {node.DeviceCount > 0 && (
              <span className="text-xs text-white/25 font-mono">{node.DeviceCount}</span>
            )}
            {isExpanded
              ? <ChevronDown size={11} className="text-white/30 flex-shrink-0" />
              : <ChevronRight size={11} className="text-white/20 flex-shrink-0" />
            }
          </button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                {isLoading && (
                  <div className="flex items-center gap-2 px-4 py-2" style={{ paddingLeft: `${28 + depth * 16}px` }}>
                    <RefreshCw size={11} className="animate-spin text-white/30" />
                    <span className="text-xs text-white/30">Loading…</span>
                  </div>
                )}
                {!isLoading && filteredDevices.length === 0 && (
                  <div className="text-xs text-white/20 px-4 py-1" style={{ paddingLeft: `${28 + depth * 16}px` }}>
                    No devices
                  </div>
                )}
                {filteredDevices.map(d => (
                  <button
                    key={d.DeviceID}
                    className={`w-full flex items-center gap-2 py-1.5 hover:bg-brand-600/10 text-left transition-colors
                      ${String(d.DeviceID) === value ? 'bg-brand-600/15 text-brand-300' : 'text-white/60'}`}
                    style={{ paddingLeft: `${28 + depth * 16}px`, paddingRight: '12px' }}
                    onClick={() => selectDevice(d)}
                  >
                    <Monitor size={11} className="flex-shrink-0 text-white/30" />
                    <span className="text-sm flex-1 truncate">{d.Name}</span>
                    <span className={`text-xs font-mono ${d.Status === 'ONLINE' ? 'text-green-400/70' : 'text-white/20'}`}>
                      {d.Status === 'ONLINE' ? '●' : '○'}
                    </span>
                  </button>
                ))}
                {node.children && node.children.length > 0 && renderTree(node.children, depth + 1)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )
    })
  }

  return (
    <div className="relative" ref={ref}>
      {/* Trigger input */}
      <div className="relative">
        <Monitor size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          className="input pl-8 pr-8 text-sm cursor-pointer"
          readOnly
          placeholder={placeholder}
          value={selectedName || (value ? `Device ID ${value}` : '')}
          onClick={() => setOpen(o => !o)}
        />
        {value
          ? <button type="button" onClick={clearSelection}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              <X size={12} />
            </button>
          : <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        }
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            className="absolute top-full left-0 right-0 mt-1 z-50 card shadow-2xl overflow-hidden"
            style={{ maxHeight: '320px' }}
          >
            {/* Search filter */}
            <div className="p-2 border-b border-surface-border">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  className="input pl-7 py-1.5 text-xs"
                  placeholder="Filter devices by name…"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  autoFocus
                />
                {filter && (
                  <button onClick={() => setFilter('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: '264px' }}>
              {/* Filter results across all loaded OUs */}
              {filter.length >= 1 && allDevices.length > 0 && (
                <div className="border-b border-surface-border">
                  <div className="px-3 py-1 text-xs text-white/25 uppercase tracking-wide">Search results</div>
                  {allDevices.map(d => (
                    <button key={d.DeviceID}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-brand-600/10 text-left transition-colors"
                      onClick={() => selectDevice(d)}
                    >
                      <Monitor size={11} className="text-white/30 flex-shrink-0" />
                      <span className="text-sm text-white/70 flex-1 truncate">{d.Name}</span>
                      <span className={`text-xs font-mono ${d.Status === 'ONLINE' ? 'text-green-400/70' : 'text-white/20'}`}>
                        {d.Status === 'ONLINE' ? '● Online' : '○ Offline'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {filter.length >= 1 && allDevices.length === 0 && (
                <div className="px-3 py-3 text-xs text-white/30 text-center">
                  No loaded devices match "{filter}" — expand OUs below to load more
                </div>
              )}

              {/* OU tree */}
              {ouTree.length > 0 ? (
                <div className="py-1">
                  <div className="px-3 py-1 text-xs text-white/25 uppercase tracking-wide">Browse by OU</div>
                  {renderTree(ouTree)}
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-white/30">
                  <RefreshCw size={14} className="mx-auto mb-2 animate-spin" />
                  Loading OU tree…
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function extractOUTree(data: unknown): OUNode[] {
  if (!data || typeof data !== 'object') return []
  const arr = Array.isArray(data) ? data : [data]
  return arr.map((node) => {
    const n = node as Record<string, unknown>
    return {
      OUID: (n.OUID ?? n.ouid ?? 0) as number,
      Name: (n.Name ?? n.name ?? '') as string,
      DeviceCount: (n.DeviceCount ?? n.deviceCount ?? 0) as number,
      ParentID: (n.ParentID ?? n.parentId ?? -1) as number,
      children: n.children ? extractOUTree(n.children) : [],
    } as OUNode
  }).filter(n => n.Name)
}
