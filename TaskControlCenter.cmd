@echo off
REM ==========================================================================
REM  TaskControlCenter ランチャー（Windows 用・コンソール表示あり）
REM  WSL 上のアプリを起動します（GUI は WSLg で Windows デスクトップに表示）。
REM
REM  リポジトリを別の場所に移した場合は、下の WSLDIR を新しい WSL パスに変更。
REM  （WSL で `pwd` を実行すると現在のパスが分かります）
REM  既定以外の WSL ディストロを使う場合は `wsl.exe` に -d <名前> を追加。
REM ==========================================================================
set "WSLDIR=/home/ca1000mol/mygitproject/TaskControlCenter"
wsl.exe -e bash -lic "cd '%WSLDIR%' && ./start-app.sh"
