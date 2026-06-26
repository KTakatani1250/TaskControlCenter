import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { generateDueRecurrences } from './recurrence'

let mainWindow: BrowserWindow | null = null

/**
 * WSL かどうかを判定する。WSL には通常 OS キーリング（libsecret/KWallet）が無く、
 * その場合 Electron の safeStorage は isEncryptionAvailable() が false になり、
 * APIキーを保存できない。
 */
function isWSL(): boolean {
  if (process.env.WSL_DISTRO_NAME) return true
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf8'))
  } catch {
    return false
  }
}

// WSL ではキーリングが無いため、Electron 組み込みの basic バックエンドにフォールバックする。
// （固定鍵による難読化で OS レベルの保護は無いが、キーリング無しでも safeStorage が使える。
//  native Linux でキーリングがある環境は弱体化させないよう WSL のときだけ適用。）
// この switch は app の ready 前に設定する必要がある。
if (process.platform === 'linux' && isWSL()) {
  app.commandLine.appendSwitch('password-store', 'basic')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    title: 'TaskControlCenter',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // 外部リンクは既定ブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // electron-vite: 開発時はdevサーバ、本番はビルド済みHTML
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initDb()
  registerIpc()
  // 起動時に繰り返しタスクの自動生成を確認
  try {
    generateDueRecurrences()
  } catch (e) {
    console.error('recurrence generation failed', e)
  }

  createWindow()

  // ウィンドウが再フォーカスされたとき（日付変更後の初回操作相当）に再確認
  app.on('browser-window-focus', () => {
    try {
      generateDueRecurrences()
    } catch (e) {
      console.error('recurrence generation failed', e)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
