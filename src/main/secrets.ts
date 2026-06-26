import { safeStorage } from 'electron'
import { getMeta, setMeta } from './db'

const KEY = 'anthropicApiKeyEnc'

/**
 * APIキーは平文保存しない。Electron safeStorage で暗号化し、暗号文を base64 で
 * meta テーブルに保存する。
 * - Windows: DPAPI
 * - Linux(キーリングあり): libsecret / KWallet
 * - WSL 等キーリング無し: basic バックエンド（固定鍵の難読化。index.ts で有効化）
 */
export function setApiKey(plain: string): void {
  if (!plain) {
    setMeta(KEY, '')
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OSの暗号化機構が利用できないため、APIキーを安全に保存できません。')
  }
  const enc = safeStorage.encryptString(plain)
  setMeta(KEY, enc.toString('base64'))
}

export function getApiKey(): string | null {
  const stored = getMeta(KEY)
  if (!stored) return null
  try {
    const buf = Buffer.from(stored, 'base64')
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

export function hasApiKey(): boolean {
  return !!getMeta(KEY)
}

export function clearApiKey(): void {
  setMeta(KEY, '')
}
