import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, Filter } from 'lucide-react'
import type { RSOPSection, DiffEntry } from '../lib/api'

interface Props {
  sections: RSOPSection[]
  filter?: 'all' | 'changed' | 'added' | 'removed'
}

export default function DiffViewer({ sections, filter = 'all' }: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<string>(filter)

  const toggle = (name: string) =>
    setExpandedSections(s => {
      const n = new Set(s)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })

  const filteredSections = sections.map(sec => ({
    ...sec,
    diff: (sec.diff ?? []).filter(d =>
      activeFilter === 'all' ? true : d.status === activeFilter
    ),
  })).filter(sec => sec.diff.length > 0)

  return (
    <div className="space-y-1">
      {/* Filter bar */}
      <div className="flex items-center gap-2 pb-3">
        <Filter size={13} className="text-white/30" />
        {['all', 'changed', 'added', 'removed', 'same'].map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150
              ${activeFilter === f
                ? 'bg-brand-600/30 text-brand-300 border border-brand-500/30'
                : 'text-white/40 hover:text-white/60'
              }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filteredSections.length === 0 && (
        <div className="text-center py-12 text-white/30 text-sm">
          No differences found for this filter.
        </div>
      )}

      {filteredSections.map(sec => {
        const expanded = expandedSections.has(sec.section)
        const changedCount = sec.diff.filter(d => d.status !== 'same').length

        return (
          <div key={sec.section} className="card overflow-hidden">
            <button
              onClick={() => toggle(sec.section)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-overlay transition-colors text-left"
            >
              <span className="text-white/30">
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <span className="font-medium text-sm text-white/80 flex-1 font-mono">{sec.section}</span>
              <div className="flex items-center gap-1.5">
                {changedCount > 0 && (
                  <span className="badge-changed">{changedCount} diff</span>
                )}
                <span className="badge bg-white/5 text-white/30 border border-white/10">
                  {sec.diff.length} keys
                </span>
              </div>
            </button>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-surface-border">
                    <DiffTable entries={sec.diff} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

function DiffTable({ entries }: { entries: DiffEntry[] }) {
  return (
    <table className="w-full text-xs font-mono">
      <thead>
        <tr className="border-b border-surface-border">
          <th className="text-left px-4 py-2 text-white/30 font-medium w-8">Status</th>
          <th className="text-left px-4 py-2 text-white/30 font-medium">Key</th>
          <th className="text-left px-4 py-2 text-white/30 font-medium">Baseline</th>
          <th className="text-left px-4 py-2 text-white/30 font-medium">Device</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, i) => (
          <tr
            key={entry.key}
            className={`border-b border-surface-border/50 transition-colors
              ${i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.01]'}
              ${entry.status === 'changed' ? 'hover:bg-amber-500/5' : ''}
              ${entry.status === 'added' ? 'hover:bg-green-500/5' : ''}
              ${entry.status === 'removed' ? 'hover:bg-red-500/5' : ''}
            `}
          >
            <td className="px-4 py-1.5">
              <StatusBadge status={entry.status} />
            </td>
            <td className="px-4 py-1.5 text-white/70">{entry.key}</td>
            <td className="px-4 py-1.5">
              <ValueCell value={entry.baseValue} status={entry.status} side="base" />
            </td>
            <td className="px-4 py-1.5">
              <ValueCell value={entry.targetValue} status={entry.status} side="target" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    changed: 'badge-changed',
    added:   'badge-added',
    removed: 'badge-removed',
    same:    'badge-same',
  }
  const labels: Record<string, string> = {
    changed: '~', added: '+', removed: '−', same: '=',
  }
  return <span className={map[status] ?? 'badge'}>{labels[status] ?? status}</span>
}

function ValueCell({ value, status, side }: { value: unknown; status: string; side: 'base' | 'target' }) {
  if (value === undefined || value === null) {
    return <span className="text-white/20 italic">—</span>
  }
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
  const colorClass =
    status === 'changed' && side === 'base' ? 'text-amber-400/70 line-through' :
    status === 'changed' && side === 'target' ? 'text-amber-300' :
    status === 'added' ? 'text-green-400' :
    status === 'removed' ? 'text-red-400' :
    'text-white/50'

  return <span className={`${colorClass} max-w-xs truncate block`} title={str}>{str}</span>
}
