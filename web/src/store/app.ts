import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Server, RSOPResult, AIProvider } from '../lib/api'

interface Session {
  serverId: string
  username: string
  loggedInAt: number
}

interface AppState {
  // Servers
  servers: Server[]
  setServers: (servers: Server[]) => void

  // Sessions (which servers are logged in)
  sessions: Record<string, Session>
  setSession: (serverId: string, username: string) => void
  clearSession: (serverId: string) => void

  // Active server
  activeServerId: string | null
  setActiveServer: (id: string | null) => void

  // Last RSOP result (current session, not persisted)
  currentResult: RSOPResult | null
  setCurrentResult: (r: RSOPResult | null) => void

  // AI chat context
  aiMessages: { role: string; content: string }[]
  addAIMessage: (msg: { role: string; content: string }) => void
  clearAIMessages: () => void

  // Settings cache
  aiProviders: AIProvider[]
  setAIProviders: (p: AIProvider[]) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      servers: [],
      setServers: (servers) => set({ servers }),

      sessions: {},
      setSession: (serverId, username) =>
        set((s) => ({ sessions: { ...s.sessions, [serverId]: { serverId, username, loggedInAt: Date.now() } } })),
      clearSession: (serverId) =>
        set((s) => {
          const sessions = { ...s.sessions }
          delete sessions[serverId]
          return { sessions }
        }),

      activeServerId: null,
      setActiveServer: (id) => set({ activeServerId: id }),

      currentResult: null,
      setCurrentResult: (r) => set({ currentResult: r }),

      aiMessages: [],
      addAIMessage: (msg) => set((s) => ({ aiMessages: [...s.aiMessages, msg] })),
      clearAIMessages: () => set({ aiMessages: [] }),

      aiProviders: [],
      setAIProviders: (p) => set({ aiProviders: p }),
    }),
    {
      name: 'scout-rsop-store',
      partialize: (s) => ({
        servers: s.servers,
        sessions: s.sessions,
        activeServerId: s.activeServerId,
        aiProviders: s.aiProviders,
      }),
    }
  )
)
