import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Bot, User, X, Sparkles, ChevronDown } from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore } from '../store/app'
import type { RSOPResult } from '../lib/api'

interface Props {
  context?: RSOPResult
  onClose?: () => void
}

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude',
  openai: 'ChatGPT',
  gemini: 'Gemini',
  copilot: 'Copilot',
}

const PROVIDER_COLORS: Record<string, string> = {
  claude:  'from-orange-500 to-amber-500',
  openai:  'from-green-500 to-teal-500',
  gemini:  'from-blue-500 to-purple-500',
  copilot: 'from-sky-500 to-blue-600',
}

export default function AIChat({ context, onClose }: Props) {
  const { aiMessages, addAIMessage, clearAIMessages, aiProviders } = useAppStore()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedProvider, setSelectedProvider] = useState(() =>
    aiProviders.find(p => p.enabled && p.hasKey)?.provider ?? ''
  )
  const [providerOpen, setProviderOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages, loading])

  const enabledProviders = aiProviders.filter(p => p.enabled)
  const activeProvider = aiProviders.find(p => p.provider === selectedProvider)

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    if (!selectedProvider) { setError('Select an AI provider first.'); return }

    setInput('')
    setError('')
    addAIMessage({ role: 'user', content: text })
    setLoading(true)

    try {
      const res = await api.ai.query({
        provider: selectedProvider,
        model: activeProvider?.model ?? '',
        apiKey,
        messages: [...aiMessages, { role: 'user', content: text }],
        context,
      })
      addAIMessage({ role: 'assistant', content: res.content })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'AI query failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface-raised border-l border-surface-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-brand-400" />
          <span className="font-medium text-sm">AI Assistant</span>
        </div>
        <div className="flex items-center gap-2">
          {aiMessages.length > 0 && (
            <button onClick={clearAIMessages} className="btn-ghost text-xs py-1 px-2">Clear</button>
          )}
          {onClose && (
            <button onClick={onClose} className="btn-ghost p-1"><X size={14} /></button>
          )}
        </div>
      </div>

      {/* Provider selector */}
      <div className="px-4 py-2 border-b border-surface-border">
        <div className="relative">
          <button
            onClick={() => setProviderOpen(o => !o)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-overlay border border-surface-border text-sm"
          >
            {selectedProvider ? (
              <>
                <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${PROVIDER_COLORS[selectedProvider] ?? 'from-white to-white'}`} />
                <span>{PROVIDER_LABELS[selectedProvider]}</span>
              </>
            ) : (
              <span className="text-white/30">Select AI provider…</span>
            )}
            <ChevronDown size={13} className={`ml-auto text-white/30 transition-transform ${providerOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {providerOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 right-0 mt-1 z-50 card shadow-xl"
              >
                {enabledProviders.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-white/40">No providers enabled. Configure in Settings.</p>
                ) : (
                  enabledProviders.map(p => (
                    <button
                      key={p.provider}
                      onClick={() => { setSelectedProvider(p.provider); setProviderOpen(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-overlay text-sm transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${PROVIDER_COLORS[p.provider] ?? ''}`} />
                      {PROVIDER_LABELS[p.provider]}
                      {!p.hasKey && <span className="ml-auto text-xs text-amber-400">needs key</span>}
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Inline API key if not set */}
        {selectedProvider && activeProvider && !activeProvider.hasKey && (
          <input
            type="password"
            placeholder={`${PROVIDER_LABELS[selectedProvider]} API key`}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="input mt-2 text-xs"
          />
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {aiMessages.length === 0 && (
          <div className="text-center py-8 text-white/25 text-sm">
            <Bot size={24} className="mx-auto mb-2 opacity-40" />
            {context
              ? 'Ask anything about this RSOP configuration…'
              : 'Ask a Scout configuration question…'
            }
          </div>
        )}

        {aiMessages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center
              ${msg.role === 'user' ? 'bg-brand-600/40' : 'bg-surface-overlay border border-surface-border'}`}>
              {msg.role === 'user' ? <User size={11} /> : <Bot size={11} className="text-brand-400" />}
            </div>
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed
              ${msg.role === 'user'
                ? 'bg-brand-600/20 border border-brand-500/20 text-white/90'
                : 'bg-surface-overlay border border-surface-border text-white/80'
              }`}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {msg.content}
            </div>
          </motion.div>
        ))}

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-surface-overlay border border-surface-border flex items-center justify-center">
              <Bot size={11} className="text-brand-400" />
            </div>
            <div className="px-3 py-2 rounded-xl bg-surface-overlay border border-surface-border">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-brand-500/60 animate-shimmer"
                    style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {error && (
          <p className="text-red-400 text-xs px-1">{error}</p>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-surface-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask about this configuration…"
            className="input flex-1 text-sm"
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="btn-primary p-2 !px-2.5"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
