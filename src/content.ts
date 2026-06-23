import { HEARTBEAT_INTERVAL_MS, LISTENER_BASE_URL, STORAGE_KEY_LISTENER_CONNECTED } from './shared.js'

type BridgeRequestType = 'ENDGE_BRIDGE_PING' | 'ENDGE_BRIDGE_EXPORT_DOMAIN'

interface BridgeResponse<TPayload> {
  source: 'endge-admin-bridge'
  requestId: string
  ok: boolean
  payload?: TPayload
  error?: string
}

function hasBridgeMarker(): boolean {
  return document.documentElement.dataset.endgeAdminBridge === '1'
}

async function postJson(url: string, payload: unknown): Promise<void> {
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
}

function bridgeRequest<TPayload>(type: BridgeRequestType): Promise<TPayload> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return new Promise<TPayload>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error(`Bridge timeout for ${type}`))
    }, 2000)

    const onMessage = (event: MessageEvent<BridgeResponse<TPayload>>) => {
      if (event.source !== window)
        return

      const data = event.data
      if (!data || data.source !== 'endge-admin-bridge' || data.requestId !== requestId)
        return

      window.clearTimeout(timeoutId)
      window.removeEventListener('message', onMessage)

      if (!data.ok) {
        reject(new Error(data.error ?? 'Bridge request failed'))
        return
      }

      resolve(data.payload as TPayload)
    }

    window.addEventListener('message', onMessage)
    window.postMessage({
      source: 'endge-chrome-extension',
      requestId,
      type,
    }, window.location.origin)
  })
}

async function sendHeartbeat(): Promise<void> {
  if (!hasBridgeMarker()) {
    void chrome.runtime.sendMessage({
      type: 'ENDGE_EXTENSION_PLATFORM_STATE',
      supported: false,
    })
    return
  }

  try {
    const payload = await bridgeRequest<{
      title: string
      url: string
    }>('ENDGE_BRIDGE_PING')

    await postJson(`${LISTENER_BASE_URL}/api/heartbeat`, {
      extensionVersion: chrome.runtime.getManifest().version,
      tabId: -1,
      tabTitle: payload.title,
      tabUrl: payload.url,
      detectedAt: new Date().toISOString(),
    })

    void chrome.runtime.sendMessage({
      type: 'ENDGE_EXTENSION_PLATFORM_STATE',
      supported: true,
      tabTitle: payload.title,
      tabUrl: payload.url,
    })
  }
  catch {
    void chrome.runtime.sendMessage({
      type: 'ENDGE_EXTENSION_PLATFORM_STATE',
      supported: false,
    })
  }
}

let _heartbeatIntervalId: number | null = null

function startHeartbeatLoop(): void {
  if (_heartbeatIntervalId != null) return
  void sendHeartbeat()
  _heartbeatIntervalId = window.setInterval(() => {
    void sendHeartbeat()
  }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeatLoop(): void {
  if (_heartbeatIntervalId != null) {
    window.clearInterval(_heartbeatIntervalId)
    _heartbeatIntervalId = null
  }
}

chrome.runtime.onMessage.addListener((message: { type?: string }, _sender: unknown, sendResponse: (response: unknown) => void) => {
  if (message.type === 'ENDGE_EXTENSION_DETECT') {
    if (!hasBridgeMarker()) {
      sendResponse({ ok: false, error: 'Bridge marker not found' })
      return false
    }

    void bridgeRequest('ENDGE_BRIDGE_PING')
      .then(payload => sendResponse({ ok: true, payload }))
      .catch(error => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Detect failed',
      }))
    return true
  }

  if (message.type === 'ENDGE_EXTENSION_EXPORT_DOMAIN') {
    if (!hasBridgeMarker()) {
      sendResponse({ ok: false, error: 'Bridge marker not found' })
      return false
    }

    void bridgeRequest('ENDGE_BRIDGE_EXPORT_DOMAIN')
      .then(payload => sendResponse({ ok: true, payload }))
      .catch(error => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Export failed',
      }))
    return true
  }

  if (message.type === 'ENDGE_EXTENSION_START_HEARTBEAT') {
    startHeartbeatLoop()
    sendResponse({ ok: true })
    return false
  }

  if (message.type === 'ENDGE_EXTENSION_STOP_HEARTBEAT') {
    stopHeartbeatLoop()
    sendResponse({ ok: true })
    return false
  }

  return false
})

// Подключаем heartbeat только если пользователь уже нажимал «Подключиться»
chrome.storage.local.get([STORAGE_KEY_LISTENER_CONNECTED], (result: Record<string, unknown>) => {
  if (result[STORAGE_KEY_LISTENER_CONNECTED] === true) {
    startHeartbeatLoop()
  }
})
