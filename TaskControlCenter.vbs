' ==========================================================================
'  TaskControlCenter ランチャー（Windows 用・ウィンドウ非表示）
'  デスクトップにこのファイルのショートカットを置いてダブルクリックで起動。
'  WSL 上のアプリを起動し、GUI は WSLg で Windows デスクトップに表示されます。
'
'  リポジトリを別の場所に移した場合は WSLDIR を変更（WSLで `pwd` で確認）。
'  既定以外の WSL ディストロを使う場合は "wsl.exe" の後に "-d <名前> " を追加。
' ==========================================================================
Dim WSLDIR
WSLDIR = "/home/ca1000mol/mygitproject/TaskControlCenter"

Dim cmd
cmd = "wsl.exe -e bash -lic ""cd '" & WSLDIR & "' && ./start-app.sh"""

' 第2引数 0 = ウィンドウ非表示, 第3引数 False = 終了を待たない
CreateObject("WScript.Shell").Run cmd, 0, False
