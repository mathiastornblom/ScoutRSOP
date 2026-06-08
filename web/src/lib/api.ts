const BASE = '/api'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data as T
}

// --- Types ---

export interface Server {
  id: string
  name: string
  url: string
  ignoreTls: boolean
  description: string
  createdAt: string
  updatedAt: string
}

export interface DiffEntry {
  key: string
  baseValue: unknown
  targetValue: unknown
  status: 'changed' | 'added' | 'removed' | 'same'
}

export interface RSOPSection {
  section: string
  base: unknown
  comparison: unknown
  device: unknown
  diff: DiffEntry[]
}

export interface RSOPSummary {
  totalKeys: number
  changedKeys: number
  addedKeys: number
  removedKeys: number
  sameKeys: number
}

export interface RSOPResult {
  request: {
    baseType: string
    baseRef: string
    targetRef: string
    sections: string[]
  }
  sections: RSOPSection[]
  applications: {
    base: unknown
    comparison: unknown
    device: unknown
    diff: DiffEntry[]
  } | null
  labels: unknown
  rules: unknown
  configOrigins: unknown
  summary: RSOPSummary
}

export interface Run {
  id: string
  serverId: string
  serverName: string
  name: string
  description: string
  baseType: string
  baseRef: string
  targetType: string
  targetRef: string
  sections: string[]
  result: RSOPResult
  createdAt: string
}

export interface ReleaseInfo {
  tag_name: string
  name: string
  body: string
  html_url: string
  published_at: string
  current: string
  buildDate: string
  updateAvailable: boolean
}

export interface AIProvider {
  provider: string
  model: string
  enabled: boolean
  hasKey: boolean
  maskedKey: string
}

export interface ScoutDevice {
  DeviceID: number
  Name: string
  IP_Address: string
  Mac_Address: string
  GroupID: number
  Status: string
  Activated: string
  LastContact: string
}

export interface OUNode {
  OUID: number
  Name: string
  DeviceCount: number
  ParentID: number
  children?: OUNode[]
}

export interface CertInfo {
  subject: string
  issuer: string
  dnsNames: string[]
  ips: string[]
  notBefore: string
  notAfter: string
  selfSigned: boolean
  daysLeft: number
}

export interface TLSStatus {
  enabled: boolean
  certFile: string
  keyFile: string
  cert?: CertInfo
}

export interface Settings {
  githubRepo: string
  aiProviders: AIProvider[]
  version: string
  buildDate: string
}

// --- Server management ---

export const api = {
  servers: {
    list: () => request<Server[]>('GET', '/servers'),
    add: (s: Omit<Server, 'id' | 'createdAt' | 'updatedAt'>) => request<Server>('POST', '/servers', s),
    update: (s: Server) => request<Server>('PUT', `/servers/${s.id}`, s),
    delete: (id: string) => request<{ ok: boolean }>('DELETE', `/servers/${id}`),
  },

  scout: {
    login: (serverId: string, username: string, password: string, domain = '') =>
      request<{ token: string }>('POST', `/scout/${serverId}/login`, { username, password, domain }),
    ping: (serverId: string) => request<{ online: boolean }>('GET', `/scout/${serverId}/ping`),
    health: (serverId: string) => request<unknown>('GET', `/scout/${serverId}/health`),
    ouStructure: (serverId: string) => request<unknown>('GET', `/scout/${serverId}/ou/structure`),
    ouRoot: (serverId: string) => request<unknown>('GET', `/scout/${serverId}/ou/root`),
    ouSearch: (serverId: string, q: string) => request<unknown>('GET', `/scout/${serverId}/ou/search?q=${encodeURIComponent(q)}`),
    deviceSearch: (serverId: string, q: string, ouId = '') =>
      request<unknown>('GET', `/scout/${serverId}/devices/search?q=${encodeURIComponent(q)}&ouId=${encodeURIComponent(ouId)}`),
    deviceList: (serverId: string, ouId: string) =>
      request<ScoutDevice[]>('GET', `/scout/${serverId}/devices/search?ouId=${encodeURIComponent(ouId)}`),
    deviceGet: (serverId: string, deviceId: string) => request<unknown>('GET', `/scout/${serverId}/devices/${deviceId}`),
    labels: (serverId: string) => request<unknown>('GET', `/scout/${serverId}/labels`),
    rules: (serverId: string) => request<unknown>('GET', `/scout/${serverId}/rules`),
    configSections: (serverId: string) => request<{ sections: string[]; advancedSections: string[] }>('GET', `/scout/${serverId}/config/sections`),
    runRSOP: (serverId: string, req: {
      baseType: string
      baseRef: string
      targetRef: string
      sections?: string[]
      saveAs?: string
      description?: string
    }) => request<RSOPResult>('POST', `/scout/${serverId}/rsop`, req),
  },

  runs: {
    list: (serverId?: string, limit?: number) => {
      const params = new URLSearchParams()
      if (serverId) params.set('serverId', serverId)
      if (limit) params.set('limit', String(limit))
      return request<Run[]>('GET', `/runs?${params}`)
    },
    get: (id: string) => request<Run>('GET', `/runs/${id}`),
    delete: (id: string) => request<{ ok: boolean }>('DELETE', `/runs/${id}`),
  },

  ai: {
    query: (req: {
      provider: string
      model: string
      apiKey: string
      messages: { role: string; content: string }[]
      context?: unknown
    }) => request<{ content: string; model: string }>('POST', '/ai/query', req),
  },

  version: {
    check: () => request<ReleaseInfo>('GET', '/version'),
    releases: () => request<ReleaseInfo[]>('GET', '/releases'),
  },

  settings: {
    get: () => request<Settings>('GET', '/settings'),
    updateAI: (body: { providers?: { provider: string; model: string; apiKey: string; enabled: boolean }[]; githubRepo?: string }) =>
      request<{ ok: boolean }>('PUT', '/settings/ai', body),
  },

  tls: {
    status: () => request<TLSStatus>('GET', '/settings/tls'),
    update: (certPem: string, keyPem: string) =>
      request<{ ok: boolean; restartRequired: boolean; cert?: CertInfo }>('PUT', '/settings/tls', { certPem, keyPem }),
    generate: (hosts: string[]) =>
      request<{ ok: boolean; restartRequired: boolean; cert?: CertInfo; certPem?: string }>('POST', '/settings/tls/generate', { hosts }),
    delete: () => request<{ ok: boolean; restartRequired: boolean }>('DELETE', '/settings/tls'),
  },
}
