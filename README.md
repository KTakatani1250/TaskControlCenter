# TaskControlCenter

Windows向けの付箋型タスク管理デスクトップアプリ。タスクを優先度に応じて3段階で表示し、
ローカルに保存します。見込時間の推定に Anthropic API を利用します。

## 特徴

- **3エリア表示**
  - エリア1：今取り組んでいるタスク（1件・最大表示・実績タイマー）
  - エリア2：今日中に終えるべきタスク（締切・逆算判定、理由を表示）
  - エリア3：全タスク（ドラッグ&ドロップで並び替え、今日中タスクを色分け）
- **実績時間の自動計測**：進行中にした時点でタイマー開始、完了時に確認・修正
- **完了時の自動選択**：完了すると手動並び順で次の未着手タスクを自動的に進行中へ
- **今日中判定**：1日5時間（300分）を前提に、締切までの逆算で本日着手が必要なタスクを抽出
- **自動並び替え**：締切超過→本日AM→本日PM→本日着手要→締切が近い→優先度→見込時間
- **繰り返しタスク**：毎週／毎月。次回締切日の7日前0:00以降に自動生成（重複防止）
- **AI見込時間推定**：見込時間が空欄のとき、過去の実績を踏まえて推定
- **タグ（仕事／私事）と絞り込み**：各タスクにタグを付与。表示バーで仕事／私事を独立にオン・オフ（両方表示も可）
- **エクスポート／バックアップ**：JSON・CSV出力、JSONバックアップからの復元（全置換）
- **安全なAPIキー保存**：Electron `safeStorage`（Windowsでは DPAPI）で暗号化保存。平文保存なし
- **ローカル保存**：SQLite（better-sqlite3）。タスクデータはアプリ本体と分離して userData に保存

## 技術スタック

- Electron + TypeScript + React（electron-vite）
- better-sqlite3（SQLite, N-API でABI安定）
- @anthropic-ai/sdk（見込時間推定。既定モデルは `claude-haiku-4-5`、設定で変更可）
- @dnd-kit（ドラッグ&ドロップ）
- electron-builder（NSIS インストーラ）

## ディレクトリ構成

```
src/
  shared/      共有の型とロジック（today判定/自動並び替え/繰り返し計算: 純粋関数）
  main/        メインプロセス（DB, リポジトリ, 繰り返し生成, Anthropic, 資格情報, IPC, 起動）
  preload/     contextBridge による安全なAPI公開 + window.api 型定義
  renderer/    React UI（3エリア, エディタ, タイマー, 各ダイアログ, 設定）
build/         NSIS カスタムスクリプト（アンインストール時のデータ保持選択）
```

## 開発

```bash
npm install        # 依存インストール（better-sqlite3 を Electron 用にリビルド）
npm run dev        # 開発起動（ホットリロード）
npm run typecheck  # 型チェック
npm run build      # 本番ビルド（out/ に出力）
```

> WSL/Linux で起動する場合は WSLg が必要です（`npm run dev` で GUI 表示）。

## インストーラ無しで起動（デスクトップショートカット）

インストーラを作らなくても、**WSL 上のこのアプリを Windows から1クリックで起動**できます
（GUI は WSLg で Windows デスクトップに表示されます）。Windows 側の追加ビルドは不要です。

リポジトリに同梱のランチャー:

| ファイル | 用途 |
| --- | --- |
| `start-app.sh` | 実体（WSL でアプリを起動。初回は自動で `npm install` / `npm run build`） |
| `TaskControlCenter.vbs` | **推奨**：ウィンドウ非表示で起動（デスクトップショートカット向き） |
| `TaskControlCenter.cmd` | コンソール表示ありで起動（動作確認・デバッグ向き） |

### 使い方

1. （初回のみ）WSL で一度ビルドしておく:
   ```bash
   cd /home/ca1000mol/mygitproject/TaskControlCenter
   npm install && npm run build
   ```
2. Windows のエクスプローラーで `\\wsl$\<ディストロ名>\home\ca1000mol\mygitproject\TaskControlCenter\`
   を開く。
3. `TaskControlCenter.vbs` を右クリック →「ショートカットの作成」→ そのショートカットをデスクトップへ移動。
4. 以後はデスクトップのショートカットをダブルクリックで起動。

> リポジトリを移動した場合は、`TaskControlCenter.vbs` / `.cmd` 内の `WSLDIR` を新しいパスに変更してください
> （WSL で `pwd` を実行すると現在のパスが分かります）。
> 既定以外の WSL ディストロを使う場合は、`wsl.exe` の後に `-d <ディストロ名> ` を追加します。
> WSLg が必要です（Windows 11、または WSLg 対応の WSL2）。

## Windows インストーラの作成

> ⚠️ **必ず Windows 上でビルドしてください。**
> 本アプリは `better-sqlite3`（ネイティブモジュール）を使うため、Windows 用バイナリは
> Windows 上での `npm install` 時に生成されます。WSL/Linux 上でビルドすると Linux 用
> バイナリが同梱され、できあがった Windows アプリは起動時にクラッシュします。
> （WSLをお使いの場合も、以下は WSL ではなく **Windows 側（PowerShell）** で実行します）

### 事前準備（Windows）

1. **Node.js LTS** をインストール（[nodejs.org](https://nodejs.org/) / 例: v20 か v22）。npm が同梱されます。
2. `better-sqlite3` は通常プリビルドが取得されますが、取得できない場合に備え
   **Visual Studio Build Tools（C++）** と **Python 3** があるとビルドが安定します。
3. プロジェクトを **Windows のファイルシステム**（例 `C:\dev\TaskControlCenter`）に置きます。
   WSL 内のパス（`\\wsl$\...`）上での `npm install` は避けてください。

### ビルド手順（PowerShell）

```powershell
cd C:\dev\TaskControlCenter
npm install          # Windows 用 better-sqlite3 をビルド/取得
npm run package:win  # electron-vite build → electron-builder --win (NSIS)
```

`dist-installer\TaskControlCenter-Setup-<version>.exe` が生成されます。インストーラは：

- スタートメニューにアプリを追加
- デスクトップショートカットを任意で作成
- アンインストール可能
- アンインストール時にタスクデータ（`%APPDATA%\task-control-center`）を残すか削除するか選択可能

### ビルドが通ったことの確認

`dist-installer\win-unpacked\resources\app.asar.unpacked\node_modules\better-sqlite3\build\Release\better_sqlite3.node`
が **Windows DLL（PE32+）** であること（Linux ELF でないこと）を確認してください。

> 補足: アプリアイコンは未設定（Electron 既定）です。独自アイコンを使う場合は
> `build/icon.ico`（256x256 推奨）を置けば electron-builder が自動採用します。

## 使い方の要点

1. 「＋ 新規タスク」で見出し・締切・見込時間・優先度・メモ・繰り返しを設定
2. タスクを「進行中に」すると実績タイマーが開始（エリア1に大きく表示）
3. 「完了」で実績時間を確認・修正 → 次のタスクが自動的に進行中に
4. 「後回し」で締切を再設定、または後回しのまま保持
5. 「自動並び替え」で優先順に整列、エリア3でドラッグして手動調整も可能
6. AI推定を使うには、設定画面で Anthropic APIキーを登録

## 締切時間帯の内部扱い

- AM → 当日 12:00
- PM → 当日 24:00（翌0:00）
- 指定なし → 当日終端として扱う
