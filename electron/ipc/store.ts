import type { IpcMain } from 'electron'
import type Store from 'electron-store'
import { ALLOWED_STORE_KEYS } from '../agent/constants'

export function registerStoreIpc(ipcMain: IpcMain, store: Store): void {
  ipcMain.handle('get-store-value', (_event, key: string) => {
    if (!ALLOWED_STORE_KEYS.has(key)) {
      throw new Error(`不允许读取 store key: ${key}`)
    }
    return store.get(key)
  })

  ipcMain.handle('set-store-value', (_event, key: string, value: unknown) => {
    if (!ALLOWED_STORE_KEYS.has(key)) {
      throw new Error(`不允许写入 store key: ${key}`)
    }
    store.set(key, value)
  })
}
