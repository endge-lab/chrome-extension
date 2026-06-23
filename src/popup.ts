import type { PopupState } from './shared.js'

const STORAGE_KEY_OUTPUT_ROOT = 'endge.outputRoot'

const outputRootInput = document.querySelector<HTMLInputElement>('#output-root')
const tabStatusEl = document.querySelector<HTMLElement>('#tab-status')
const tabUrlEl = document.querySelector<HTMLElement>('#tab-url')
const listenerStatusEl = document.querySelector<HTMLElement>('#listener-status')
const connectButton = document.querySelector<HTMLButtonElement>('#connect-button')
const extensionVersionEl = document.querySelector<HTMLElement>('#extension-version')
const messageEl = document.querySelector<HTMLElement>('#message')
const generateButton = document.querySelector<HTMLButtonElement>('#generate-button')
const refreshButton = document.querySelector<HTMLButtonElement>('#refresh-button')

function setMessage(text: string): void {
  if (messageEl) {
    messageEl.textContent = text
  }
}

function setLoading(loading: boolean): void {
  if (generateButton) {
    generateButton.disabled = loading
  }
  if (refreshButton) {
    refreshButton.disabled = loading
  }
  if (connectButton) {
    connectButton.disabled = loading
  }
}

function renderState(state: PopupState): void {
  if (tabStatusEl) {
    tabStatusEl.textContent = state.tabSupported
      ? `Поддерживаемая вкладка: ${state.tabTitle}`
      : 'Текущая вкладка не выглядит как Endge admin'
  }

  if (tabUrlEl) {
    tabUrlEl.textContent = state.tabUrl
  }

  if (listenerStatusEl) {
    listenerStatusEl.textContent = state.listenerMessage
  }
  if (connectButton) {
    connectButton.style.display = state.listenerConnected ? 'none' : 'inline-block'
  }
}

async function readStoredOutputRoot(): Promise<void> {
  const storage = await chrome.storage.local.get([STORAGE_KEY_OUTPUT_ROOT])
  if (outputRootInput) {
    outputRootInput.value = String(storage[STORAGE_KEY_OUTPUT_ROOT] ?? '')
  }
}

async function saveOutputRoot(): Promise<void> {
  const value = outputRootInput?.value.trim() ?? ''
  await chrome.storage.local.set({
    [STORAGE_KEY_OUTPUT_ROOT]: value,
  })
}

async function refreshState(opts?: { checkListener?: boolean }): Promise<void> {
  setMessage('')
  const response = await chrome.runtime.sendMessage({
    type: 'ENDGE_POPUP_GET_STATE',
    checkListener: opts?.checkListener === true,
  })

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to load popup state')
  }

  renderState(response.state as PopupState)
}

async function connect(): Promise<void> {
  setLoading(true)
  setMessage('')
  try {
    const response = await chrome.runtime.sendMessage({ type: 'ENDGE_POPUP_CONNECT' })
    if (!response?.ok) {
      setMessage(response?.error ?? 'Ошибка подключения')
      return
    }
    renderState(response.state as PopupState)
    if (response.state?.listenerConnected) {
      setMessage('Подключено к listener.')
    }
  }
  catch (e) {
    setMessage(e instanceof Error ? e.message : 'Ошибка подключения')
  }
  finally {
    setLoading(false)
  }
}

async function generate(): Promise<void> {
  const outputRoot = outputRootInput?.value.trim() ?? ''
  if (!outputRoot) {
    setMessage('Укажи полный путь до проекта.')
    return
  }

  await saveOutputRoot()
  setLoading(true)
  setMessage('Запрашиваем домен и запускаем генерацию...')

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ENDGE_POPUP_GENERATE',
      outputRoot,
    })

    if (!response?.ok) {
      throw new Error(response?.error ?? 'Generation failed')
    }

    setMessage(`Готово. Файлы сгенерированы в ${response.outputDir}.`)
    await refreshState()
  }
  finally {
    setLoading(false)
  }
}

if (outputRootInput) {
  outputRootInput.addEventListener('change', () => {
    void saveOutputRoot()
  })
}

if (refreshButton) {
  refreshButton.addEventListener('click', () => {
    setLoading(true)
    void refreshState({ checkListener: true })
      .catch(error => setMessage(error instanceof Error ? error.message : 'Refresh failed'))
      .finally(() => setLoading(false))
  })
}

if (connectButton) {
  connectButton.addEventListener('click', () => {
    void connect()
  })
}

if (generateButton) {
  generateButton.addEventListener('click', () => {
    void generate().catch(error => {
      setLoading(false)
      setMessage(error instanceof Error ? error.message : 'Generation failed')
    })
  })
}

if (extensionVersionEl) {
  extensionVersionEl.textContent = `v${chrome.runtime.getManifest().version}`
}

void readStoredOutputRoot()
void refreshState().catch(error => setMessage(error instanceof Error ? error.message : 'Failed to load popup'))
