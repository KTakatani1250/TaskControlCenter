#!/usr/bin/env bash
# TaskControlCenter を WSL/Linux 上で起動する（GUI は WSLg 経由で Windows デスクトップに表示）。
# Windows からは TaskControlCenter.vbs / TaskControlCenter.cmd 経由で呼ばれる。
set -e
cd "$(dirname "$(readlink -f "$0")")"

# 起動ログ（.vbs は画面非表示なので、失敗時はこのファイルで原因を確認する）
LOG="start-app.log"
exec > >(tee "$LOG") 2>&1
echo "=== TaskControlCenter 起動: $(date) ==="

# nvm 等で入れた node に PATH を通す（Windows からのコールド起動でも確実に見つける）
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node が見つかりません。WSL に Node.js を入れてください。" >&2
  exit 1
fi
echo "node: $(command -v node) ($(node -v))"

# WSLg のディスプレイ（未設定時のフォールバック）
export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
echo "DISPLAY=$DISPLAY WAYLAND_DISPLAY=$WAYLAND_DISPLAY"

# 日本語入力（IME）。WSLg では Linux 側 IME(fcitx5+mozc) が必要。
# 環境変数は IME 未導入でも無害。fcitx5 があれば未起動時に自動で立ち上げる。
export GTK_IM_MODULE="${GTK_IM_MODULE:-fcitx}"
export QT_IM_MODULE="${QT_IM_MODULE:-fcitx}"
export XMODIFIERS="${XMODIFIERS:-@im=fcitx}"
if command -v fcitx5 >/dev/null 2>&1; then
  if ! pgrep -x fcitx5 >/dev/null 2>&1; then
    echo "fcitx5 を起動します..."
    (fcitx5 -d >/dev/null 2>&1 &)
    sleep 1
  fi
  echo "IME: fcitx5 稼働中"
else
  echo "IME: fcitx5 未インストール（日本語入力するには 'sudo apt install -y fcitx5 fcitx5-mozc' が必要）"
fi

# 依存が無ければ用意（初回のみ時間がかかる）
[ -d node_modules ] || npm install

# ソースが更新されていれば再ビルド（out が無い／src のほうが新しい場合）。
# これをしないと git pull 後も古いビルドのまま起動してしまう。
if [ ! -f out/main/index.js ] || [ -n "$(find src electron.vite.config.ts package.json -newer out/main/index.js 2>/dev/null)" ]; then
  echo "ソース変更を検出 → 再ビルドします..."
  npm run build
else
  echo "ビルドは最新です（再ビルド不要）"
fi

# アプリ起動
echo "Electron を起動します..."
exec ./node_modules/.bin/electron . --no-sandbox "$@"
