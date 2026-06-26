#!/usr/bin/env bash
# TaskControlCenter を WSL/Linux 上で起動する（GUI は WSLg 経由で Windows デスクトップに表示）。
# Windows からは TaskControlCenter.vbs / TaskControlCenter.cmd 経由で呼ばれる。
set -e
cd "$(dirname "$(readlink -f "$0")")"

# WSLg のディスプレイ（未設定時のフォールバック）
export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"

# 依存とビルド成果物が無ければ用意（初回のみ時間がかかる）
[ -d node_modules ] || npm install
[ -f out/main/index.js ] || npm run build

# アプリ起動
exec ./node_modules/.bin/electron . --no-sandbox "$@"
