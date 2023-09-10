# Yamafiler

Yamafiler は VS Code 用のファイルマネージャーです。

## コマンド

選択されている行とは、\*マークが付いた行があればその行、無ければカーソル範囲の行のことを表します。

### 開く

-   `yamafiler.openFiler` - Yamafiler を開きます。

    -   _path_ - フォルダーのパスです。'~' にするとホームフォルダーを開きます。
    -   _column_ = 'active' - ファイラーを開くカラムです。'active' または 'beside' です。
    -   _ask_ = 'never' - ファイラーで表示するフォルダーを尋ねるかどうかを選択します。デフォルトでは現在のファイルの親フォルダーを表示します。'dialog' にするとフォルダー選択ダイアログを表示します。

-   `yamafiler.enter` - カーソル行の子フォルダーまたはファイルを開きます。

    -   _column_ = 'active' - ファイルを開くカラムです。'active' または 'beside' です。
    -   _preserveFocus_ = false - ファイルを開くとき、ファイラーにフォーカスしたままにするかを指定します。
    -   _preview_ = false - ファイルをプレビューで開くかを指定します。
    -   _binaryPattern_ = '' - バイナリとして開くファイルの名前のパターンです。
    -   _externalPattern_ = '' - 外部アプリケーションで開くファイルの名前のパターンです。
    -   _externalFolderPattern_ = '' - 外部アプリケーションで開くフォルダーの名前のパターンです。

-   `yamafiler.goToParent` - 現在表示しているフォルダーの親フォルダーを開きます。
-   `yamafiler.refresh` - フォルダーの内容を更新します。
    -   _resetSelection_ = false - 選択を破棄するかを指定します。
-   `yamafiler.openWorkspace` - カーソル上のワークスペースを開きます。ワークスペースはワークスペース設定ファイルまたはフォルダーです。
    -   _forceNewWindow_ = false - ワークスペースを新しいウィンドウで開くかを選択します。
-   `yamafiler.addToWorkspace` - 選択されているフォルダーをワークスペースに追加します。

### ファイル操作

-   `yamafiler.newFolder` - 名前を入力して新しいフォルダーを作成します。
-   `yamafiler.newFile` - 名前を入力して新しいファイルを作成します。
-   `yamafiler.newMultipleFiles` - バッチを使用して新しいフォルダーとファイルを作成します。
-   `yamafiler.rename` - 選択されているフォルダーまたはファイルの名前を変更します。複数選択時はバッチを使用します。
-   `yamafiler.duplicate` - 選択されているフォルダーまたはファイルを入力した名前で現在のフォルダーに複製します。複数選択時はバッチを使用します。
-   `yamafiler.symlink` - 選択されているフォルダーまたはファイルへのシンボリックリンクを作成します。複数選択時はバッチを使用します。
-   `yamafiler.delete` - 選択されているフォルダーまたはファイルを削除します。

### クリップボードを使用したファイル操作

-   `yamafiler.cut` - 選択されているフォルダーまたはファイルをカットします。
-   `yamafiler.copy` - 選択されているフォルダーまたはファイルのコピーを作成します。
-   `yamafiler.targetForSymlink` - 選択されているフォルダーまたはファイルをシンボリックリンクのターゲットとして指定します。
-   `yamafiler.paste` - クリップボードのファイルをファイラーのフォルダーに貼り付けます。クリップボードに書き込んだフォルダーを開いているときには実行できません。

### ファイル選択

-   `yamafiler.select` - カーソル行を選択し、\* マークを付けます。
-   `yamafiler.deselect` - カーソル行の選択を解除します。
-   `yamafiler.toggleSelection` - カーソル行の選択をトグルします。
-   `yamafiler.toggleSelectionAll` - 全ての行の選択をトグルします。

## 設定例

Yamafiler はデフォルトのキーバインドを定義しません。

keybindings.json に設定する例を以下に示します。

```json
[
    {
        "key": "ctrl+y",
        "command": "yamafiler.openFiler",
        "when": "editorTextFocus && !inDebugRepl"
    },
    // VSCode Neovim を併用している場合の例
    // {
    //     "key": ",",
    //     "command": "yamafiler.openFiler",
    //     "when": "!inputFocus || editorTextFocus && !inDebugRepl && neovim.mode == 'normal' && neovim.init"
    // },
    {
        "key": "o",
        "command": "yamafiler.openFiler",
        "args": { "column": "beside" },
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "shift+`",
        "command": "yamafiler.openFiler",
        "args": { "path": "~" },
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    // プレビュー用の拡張を併用している場合は pdf を加えるのもおすすめです。
    {
        "key": "l",
        "command": "yamafiler.enter",
        "args": {
            "binaryPattern": "*.{jpg,jpe,jpeg,png,bmp,gif,ico,webp,avif,mp3,wav,ogg,oga,mp4,webm}",
            "preview": true
        },
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "e",
        "command": "yamafiler.enter",
        "args": { "preview": true },
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "enter",
        "command": "yamafiler.enter",
        "args": { "preview": true },
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "shift+p",
        "command": "yamafiler.enter",
        "args": {
            "preview": true,
            "binaryPattern": "*.{jpg,jpe,jpeg,png,bmp,gif,ico,webp,avif,mp3,wav,ogg,oga,mp4,webm}",
            "column": "beside",
            "preserveFocus": true
        },
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "h",
        "command": "yamafiler.goToParent",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "z",
        "command": "yamafiler.refresh",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "x",
        "command": "yamafiler.enter",
        "args": {
            "preview": true,
            "binaryPattern": "*.{jpg,jpe,jpeg,png,bmp,gif,ico,webp,avif,mp3,wav,ogg,oga,mp4,webm}",
            "externalPattern": "*.{html,docx}"
        },
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "q",
        "command": "workbench.action.closeActiveEditor",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "space",
        "command": "yamafiler.toggleSelection",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "shift+8",
        "command": "yamafiler.toggleSelectionAll",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "w",
        "command": "yamafiler.openWorkspace",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "shift+w",
        "command": "yamafiler.openWorkspace",
        "args": { "forceNewWindow": true },
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "shift+k",
        "command": "yamafiler.newFolder",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "shift+n",
        "command": "yamafiler.newFile",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "shift+m",
        "command": "yamafiler.newMultipleFiles",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "r",
        "command": "yamafiler.rename",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "c",
        "command": "yamafiler.duplicate",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "shift+s",
        "command": "yamafiler.symlink",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "d",
        "command": "yamafiler.delete",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "m",
        "command": "yamafiler.cut",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "y",
        "command": "yamafiler.copy",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "shift+t",
        "command": "yamafiler.targetForSymlink",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "p",
        "command": "yamafiler.paste",
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "k",
        "command": "cursorMove",
        "args": { "to": "up", "by": "line" },
        "when": "resourceScheme == yamafiler && editorTextFocus"
    },
    {
        "key": "j",
        "command": "cursorMove",
        "args": { "to": "down", "by": "line" },
        "when": "resourceScheme == yamafiler && editorTextFocus"
    }
]
```

## ライセンス

[MIT](LICENSE) license のもとに公開します。

## 感謝

-   [Shougo/defx.nvim](https://github.com/Shougo/defx.nvim) - アイデアの源
-   [shirou/vscode-dired](https://github.com/shirou/vscode-dired) - 先駆者
-   [JannisX11/batch-rename](https://github.com/JannisX11/batch-rename) - バッチ機能
