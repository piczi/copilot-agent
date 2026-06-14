import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import StoreModule from 'electron-store'
import { initCheckpointer } from './agent/checkpointer'
import { registerChatIpc } from './ipc/chat'
import { registerConversationIpc } from './ipc/conversations'
import { registerLlmConfigIpc } from './ipc/llm-config'
import { registerStoreIpc } from './ipc/store'

const Store = (StoreModule as any).default || StoreModule

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const RENDERER_URL = process.env['ELECTRON_RENDERER_URL'] || process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'renderer')

process.env.VITE_PUBLIC = RENDERER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

const store = new Store()

let win: BrowserWindow | null

function hideWindowMenu(window: BrowserWindow) {
  window.setMenu(null)
  window.setAutoHideMenuBar(true)
  window.setMenuBarVisibility(false)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 14 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  hideWindowMenu(win)

  if (RENDERER_URL) {
    win.loadURL(RENDERER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  win.on('closed', () => {
    win = null
  })
}

function registerIpcHandlers() {
  registerStoreIpc(ipcMain, store)
  registerLlmConfigIpc(ipcMain, store)
  registerChatIpc(ipcMain, store)
  registerConversationIpc(ipcMain, store)
}

app.on('browser-window-created', (_event, window) => {
  hideWindowMenu(window)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  await initCheckpointer()
  registerIpcHandlers()
  Menu.setApplicationMenu(null)
  createWindow()
})
