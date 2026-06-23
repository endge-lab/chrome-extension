import {
  getJson,
  LISTENER_BASE_URL,
  postJson,
  STORAGE_KEY_LISTENER_CONNECTED,
  type DomainBundle,
  type PopupState,
} from './shared.js'

interface ListenerStatusResponse {
  connected: boolean
}

function sendMessageToTab<TResponse>(tabId: number, message: { type: string }): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: TResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve(response)
    })
  })
}

async function detectPlatform(tabId: number): Promise<{ title: string, url: string } | null> {
  try {
    const response = await sendMessageToTab<{ ok: boolean, payload?: { title: string, url: string } }>(tabId, {
      type: 'ENDGE_EXTENSION_DETECT',
    })
    return response.ok ? response.payload ?? null : null
  }
  catch {
    return null
  }
}

async function exportDomain(tabId: number): Promise<DomainBundle> {
  const response = await sendMessageToTab<{ ok: boolean, payload?: DomainBundle, error?: string }>(tabId, {
    type: 'ENDGE_EXTENSION_EXPORT_DOMAIN',
  })

  if (!response.ok || !response.payload) {
    throw new Error(response.error ?? 'Export failed')
  }

  return response.payload
}

async function setActionState(tabId: number, supported: boolean): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: supported ? '#a16207' : '#94a3b8',
  })
  await chrome.action.setBadgeText({
    tabId,
    text: supported ? 'GEN' : '',
  })
}

async function getActiveTab(): Promise<any | null> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  })
  return tab ?? null
}

async function getPopupState(options?: { checkListener?: boolean }): Promise<PopupState> {
  const tab = await getActiveTab()

  if (!tab?.id) {
    return {
      tabSupported: false,
      tabTitle: 'Нет активной вкладки',
      tabUrl: '',
      listenerConnected: false,
      listenerMessage: 'Нажмите «Подключиться» для проверки listener',
    }
  }

  const payload = await detectPlatform(tab.id)
  const baseState: Omit<PopupState, 'listenerConnected' | 'listenerMessage'> = {
    tabSupported: !!payload,
    tabTitle: payload?.title ?? tab.title ?? 'Текущая вкладка не поддерживается',
    tabUrl: payload?.url ?? tab.url ?? '',
  }

  if (!options?.checkListener) {
    const stored = await chrome.storage.local.get([STORAGE_KEY_LISTENER_CONNECTED])
    const wasConnected = stored[STORAGE_KEY_LISTENER_CONNECTED] === true
    return {
      ...baseState,
      listenerConnected: false,
      listenerMessage: wasConnected
        ? 'Нажмите «Обновить» для проверки или «Подключиться» заново'
        : 'Нажмите «Подключиться» для проверки listener',
    }
  }

  try {
    const listener = await getJson<ListenerStatusResponse>(`${LISTENER_BASE_URL}/api/status`)
    return {
      ...baseState,
      listenerConnected: listener.connected,
      listenerMessage: listener.connected
        ? 'Listener подключен'
        : 'Listener недоступен или не получил heartbeat',
    }
  }
  catch {
    return {
      ...baseState,
      listenerConnected: false,
      listenerMessage: 'Listener не отвечает на http://127.0.0.1:3210',
    }
  }
}

chrome.runtime.onMessage.addListener((message: { type?: string, outputRoot?: string, supported?: boolean, checkListener?: boolean }, sender: { tab?: any }, sendResponse: (response: unknown) => void) => {
  if (message.type === 'ENDGE_EXTENSION_PLATFORM_STATE') {
    if (sender.tab?.id) {
      void setActionState(sender.tab.id, message.supported === true)
    }
    return false
  }

  if (message.type === 'ENDGE_POPUP_GET_STATE') {
    void getPopupState({ checkListener: message.checkListener === true })
      .then(state => sendResponse({ ok: true, state }))
      .catch(error => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to load popup state',
      }))
    return true
  }

  if (message.type === 'ENDGE_POPUP_CONNECT') {
    void (async () => {
      const tab = await getActiveTab()
      if (!tab?.id) {
        sendResponse({ ok: false, error: 'Нет активной вкладки' })
        return
      }
      try {
        const listener = await getJson<ListenerStatusResponse>(`${LISTENER_BASE_URL}/api/status`)
        if (!listener.connected) {
          sendResponse({ ok: true, state: await getPopupState({ checkListener: true }) })
          return
        }
        await chrome.storage.local.set({ [STORAGE_KEY_LISTENER_CONNECTED]: true })
        await chrome.tabs.sendMessage(tab.id, { type: 'ENDGE_EXTENSION_START_HEARTBEAT' })
        const state = await getPopupState({ checkListener: true })
        sendResponse({ ok: true, state })
      }
      catch {
        sendResponse({ ok: true, state: await getPopupState({ checkListener: true }) })
      }
    })()
    return true
  }

  if (message.type === 'ENDGE_POPUP_GENERATE') {
    void (async () => {
      const tab = await getActiveTab()
      if (!tab?.id) {
        throw new Error('No active tab')
      }

      if (!message.outputRoot) {
        throw new Error('Output path is required')
      }

      const bundle = await exportDomain(tab.id)
      const response = await postJson<{ ok: boolean, result?: { outputDir: string } }>(`${LISTENER_BASE_URL}/api/generate`, {
        outputRoot: message.outputRoot,
        bundle,
      })

      sendResponse({
        ok: true,
        outputDir: response.result?.outputDir ?? null,
      })
    })().catch(error => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Generation failed',
    }))
    return true
  }

  return false
})

chrome.tabs.onActivated.addListener(async ({ tabId }: { tabId: number }) => {
  const payload = await detectPlatform(tabId)
  await setActionState(tabId, !!payload)
})

chrome.tabs.onUpdated.addListener(async (tabId: number, changeInfo: { status?: string }) => {
  if (changeInfo.status !== 'complete')
    return
  const payload = await detectPlatform(tabId)
  await setActionState(tabId, !!payload)
})
