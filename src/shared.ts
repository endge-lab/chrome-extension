export const LISTENER_BASE_URL = 'http://127.0.0.1:3210'
export const HEARTBEAT_INTERVAL_MS = 5000
export const STORAGE_KEY_LISTENER_CONNECTED = 'endge.listenerConnectionRequested'

export interface BridgePingPayload {
  platform: 'endge-admin'
  version: string
  url: string
  title: string
  projectId: string | null
  environment: string | null
}

export interface DomainBundle {
  version: string
  exportedAt: string
  sourceUrl: string
  projectId: string | null
  environment: string | null
  domain: Record<string, unknown>
}

export interface PopupState {
  tabSupported: boolean
  tabTitle: string
  tabUrl: string
  listenerConnected: boolean
  listenerMessage: string
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  return await response.json() as T
}

export async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed with status ${response.status}`)
  }

  return await response.json() as T
}
