import { useState, type JSX } from 'react'
import { AppSettings } from '@shared/types'
import { Modal } from './Modal'

const MODELS = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5（高速・低コスト・既定）' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6（バランス）' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8（最高精度）' }
]

export function SettingsDialog({
  settings,
  onClose,
  onSaved,
  onRestored
}: {
  settings: AppSettings
  onClose: () => void
  onSaved: () => void
  onRestored: () => void
}): JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(settings.model)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [dataMsg, setDataMsg] = useState('')

  const doExportJson = async (): Promise<void> => {
    const r = await window.api.exportJson()
    if (r.ok) setDataMsg(`JSONを書き出しました（${r.count}件）：${r.path}`)
    else if (r.error) setDataMsg('エクスポート失敗：' + r.error)
  }
  const doExportCsv = async (): Promise<void> => {
    const r = await window.api.exportCsv()
    if (r.ok) setDataMsg(`CSVを書き出しました（${r.count}件）：${r.path}`)
    else if (r.error) setDataMsg('エクスポート失敗：' + r.error)
  }
  const doImport = async (): Promise<void> => {
    if (!confirm('現在の全タスクを、選択したバックアップの内容で置き換えます。よろしいですか？')) return
    const r = await window.api.importBackup()
    if (r.ok) {
      setDataMsg(`復元しました（${r.count}件）。`)
      onRestored()
    } else if (r.error) {
      setDataMsg('復元失敗：' + r.error)
    }
  }

  const saveKey = async (): Promise<void> => {
    if (!apiKey.trim()) return
    setBusy(true)
    setStatus('')
    try {
      await window.api.setApiKey(apiKey.trim())
      setApiKey('')
      setStatus('APIキーを安全に保存しました。')
      onSaved()
    } catch (e) {
      setStatus('保存に失敗: ' + String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const testKey = async (): Promise<void> => {
    setBusy(true)
    setStatus('接続テスト中…')
    try {
      if (apiKey.trim()) await window.api.setApiKey(apiKey.trim())
      await window.api.setModel(model)
      await window.api.testApiKey(apiKey.trim() || '__use_saved__')
      setStatus('接続成功。')
      if (apiKey.trim()) setApiKey('')
      onSaved()
    } catch (e) {
      setStatus('接続失敗: ' + String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const clearKey = async (): Promise<void> => {
    await window.api.clearApiKey()
    setStatus('APIキーを削除しました。')
    onSaved()
  }

  const saveModel = async (m: string): Promise<void> => {
    setModel(m)
    await window.api.setModel(m)
    onSaved()
  }

  return (
    <Modal
      title="設定"
      onClose={onClose}
      footer={<button className="primary" onClick={onClose}>閉じる</button>}
    >
      <div className="field">
        <label>Anthropic APIキー</label>
        <div className="hint">
          現在の状態：{settings.hasApiKey ? '✅ 設定済み' : '未設定'}
          。キーはWindowsの安全な領域（DPAPI）で暗号化保存され、平文では保存されません。
        </div>
        <input
          type="password"
          placeholder={settings.hasApiKey ? '新しいキーを入力して上書き' : 'sk-ant-...'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <div className="row" style={{ marginTop: 6 }}>
          <button onClick={saveKey} disabled={busy || !apiKey.trim()}>
            保存
          </button>
          <button onClick={testKey} disabled={busy || (!settings.hasApiKey && !apiKey.trim())}>
            接続テスト
          </button>
          <button className="danger" onClick={clearKey} disabled={busy || !settings.hasApiKey}>
            削除
          </button>
        </div>
      </div>

      <div className="field">
        <label>推定に使うモデル</label>
        <select value={model} onChange={(e) => saveModel(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {status && <div className="hint">{status}</div>}

      <div className="field">
        <label>データ（エクスポート / バックアップ）</label>
        <div className="row">
          <button onClick={doExportJson}>JSON出力</button>
          <button onClick={doExportCsv}>CSV出力</button>
          <button onClick={doImport}>バックアップから復元</button>
        </div>
        <div className="hint">
          JSON はバックアップ・復元に、CSV は表計算での閲覧に使えます。復元は全タスクを置き換えます。
        </div>
        {dataMsg && <div className="hint">{dataMsg}</div>}
      </div>
    </Modal>
  )
}
