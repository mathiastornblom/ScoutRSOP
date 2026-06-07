import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { History, Trash2, Play, Eye, Search, Calendar, Server, GitCompare } from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore } from '../store/app'
import DiffViewer from '../components/DiffViewer'
import type { Run } from '../lib/api'

export default function HistoryPage() {
  const { servers, setCurrentResult } = useAppStore()
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Run | null>(null)
  const [serverFilter, setServerFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    api.runs.list(serverFilter || undefined, 100)
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false))
  }, [serverFilter])

  async function handleDelete(id: string) {
    if (!confirm('Delete this run?')) return
    await api.runs.delete(id)
    setRuns(r => r.filter(x => x.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  function handleRerun(run: Run) {
    // Navigate to RSOP page with this run's params pre-filled
    setCurrentResult(run.result)
    window.location.hash = '/rsop'
  }

  const filtered = runs.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.serverName.toLowerCase().includes(search.toLowerCase()) ||
    r.targetRef.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-full overflow-hidden">
      {/* List panel */}
      <div className="w-96 flex-shrink-0 flex flex-col border-r border-surface-border">
        <div className="px-5 py-4 border-b border-surface-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <History size={14} className="text-brand-400" />
              Run History
            </h2>
            <span className="text-xs text-white/30">{runs.length} runs</span>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              className="input pl-8 text-sm"
              placeholder="Search runs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select value={serverFilter} onChange={e => setServerFilter(e.target.value)} className="input text-sm">
            <option value="">All servers</option>
            {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-surface-overlay animate-shimmer" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-white/25 text-sm">
              <History size={24} className="mx-auto mb-2 opacity-40" />
              {runs.length === 0 ? 'No runs saved yet. Run RSOP and save it.' : 'No runs match the filter.'}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filtered.map((run, i) => (
                <RunCard
                  key={run.id}
                  run={run}
                  index={i}
                  active={selected?.id === run.id}
                  onClick={() => setSelected(run)}
                  onDelete={() => handleDelete(run.id)}
                  onRerun={() => handleRerun(run)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-center p-12">
            <div>
              <Eye size={32} className="mx-auto mb-3 text-white/15" />
              <p className="text-white/30 text-sm">Select a run to view its diff</p>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white">{selected.name}</h2>
                {selected.description && <p className="text-sm text-white/40 mt-0.5">{selected.description}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs text-white/30">
                  <span className="flex items-center gap-1"><Server size={11} />{selected.serverName}</span>
                  <span className="flex items-center gap-1"><Calendar size={11} />{new Date(selected.createdAt).toLocaleString()}</span>
                  <span className="flex items-center gap-1"><GitCompare size={11} />vs {selected.baseType}{selected.baseRef ? ` / ${selected.baseRef}` : ''}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleRerun(selected)} className="btn-secondary flex items-center gap-1.5 text-xs">
                  <Play size={12} />
                  Load Result
                </button>
                <button onClick={() => handleDelete(selected.id)} className="btn-danger flex items-center gap-1.5 text-xs">
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            </div>

            {/* Summary pills */}
            {selected.result?.summary && (
              <div className="flex items-center gap-2 mb-6">
                {selected.result.summary.changedKeys > 0 && <span className="badge-changed">{selected.result.summary.changedKeys} changed</span>}
                {selected.result.summary.addedKeys > 0 && <span className="badge-added">{selected.result.summary.addedKeys} added</span>}
                {selected.result.summary.removedKeys > 0 && <span className="badge-removed">{selected.result.summary.removedKeys} removed</span>}
              </div>
            )}

            {selected.result?.sections && (
              <DiffViewer sections={selected.result.sections} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RunCard({ run, index, active, onClick, onDelete, onRerun }: {
  run: Run; index: number; active: boolean
  onClick: () => void; onDelete: () => void; onRerun: () => void
}) {
  const s = run.result?.summary

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className={`rounded-lg p-3 cursor-pointer group transition-all duration-150
        ${active
          ? 'bg-brand-600/15 border border-brand-500/25'
          : 'hover:bg-surface-overlay border border-transparent hover:border-surface-border'
        }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/80 truncate">{run.name}</p>
          <p className="text-xs text-white/30 mt-0.5 font-mono truncate">{run.targetRef}</p>
          <p className="text-xs text-white/25 mt-0.5">{new Date(run.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => { e.stopPropagation(); onRerun() }} className="btn-ghost p-1"><Play size={11} /></button>
          <button onClick={e => { e.stopPropagation(); onDelete() }} className="btn-ghost p-1 text-red-400/50 hover:text-red-400"><Trash2 size={11} /></button>
        </div>
      </div>
      {s && (
        <div className="flex items-center gap-1.5 mt-2">
          {s.changedKeys > 0 && <span className="badge-changed text-xs">{s.changedKeys}~</span>}
          {s.addedKeys > 0 && <span className="badge-added text-xs">{s.addedKeys}+</span>}
          {s.removedKeys > 0 && <span className="badge-removed text-xs">{s.removedKeys}−</span>}
        </div>
      )}
    </motion.div>
  )
}
