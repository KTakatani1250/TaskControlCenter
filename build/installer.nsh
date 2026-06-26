; アンインストール時、タスクデータを残すか削除するかをユーザーに選択させる。
; タスクデータは Electron の userData（%APPDATA%\task-control-center）に保存される。
; package.json の name が "task-control-center" のため、このフォルダ名になる。

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "タスクデータも削除しますか？$\n$\n「いいえ」を選ぶとデータは保持され、再インストール時に再利用できます。" \
    /SD IDNO IDNO keepUserData
    RMDir /r "$APPDATA\task-control-center"
  keepUserData:
!macroend
