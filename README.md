# Yamafiler

Yamafiler is a file manager for VS Code.

![demo](images/demo.gif)

[Japanese README](docs/README_ja.md)

## Commands

"Selected lines" are the lines marked with \* or the lines within the cursor range.

### Open

-   `yamafiler.openFiler` - Opens a filer.

    -   _path_ - Path to a folder. '~' opens the home folder.
    -   _column_ = 'active' - Column in which the filer should be shown. 'active' or 'beside'.
    -   _ask_ = 'never' - How to ask a folder to show in the filer. By default it shows the parent folder of the current file. 'dialog' shows a folder selection dialog.

-   `yamafiler.enter` - Opens the child folder or file under cursor.

    -   _column_ = 'active' - Column in which the file should be shown. 'active' or 'beside'.
    -   _preserveFocus_ = false - If true, the file will not take focus.
    -   _preview_ = false - If true, the tab will show as preview.
    -   _binaryPattern_ = '' - Pattern for file names to open as binary.
    -   _externalPattern_ = '' - Pattern for file names to open in an external application.
    -   _externalFolderPattern_ = '' - Pattern for folder names to open in an external application.

-   `yamafiler.goToParent` - Opens the parent folder of the current folder.
-   `yamafiler.refresh` - Updates the contents of the folder.
    -   _resetSelection_ = false - If true, discard the selection.
-   `yamafiler.openWorkspace` - Opens the workspace under cursor. A workspace is a `.code-workspace` file or a folder.
    -   _forceNewWindow_ = false - If true, the workspace will be opened in a new window.
-   `yamafiler.addToWorkspace` - Adds the selected folders to the workspace.

### File operations

-   `yamafiler.newFolder` - Creates a new folder by entering a name.
-   `yamafiler.newFile` - Creates a new file by entering a name.
-   `yamafiler.newMultipleFiles` - Create new folders and files by batch file.
-   `yamafiler.rename` - Renames the selected folders and files. Batch file is used for multiple selection.
-   `yamafiler.duplicate` - Copies the selected folders and files to the current folder with the name you enter. Batch file is used for multiple selection.
-   `yamafiler.symlink` - Creates symbolic links to the selected folders and files. Batch file is used for multiple selection.
-   `yamafiler.delete` - Deletes the selected folders and files.

### File operations with clipboard

-   `yamafiler.cut` - Cuts the selected folders and files.
-   `yamafiler.copy` - Copies the selected folders and files.
-   `yamafiler.targetForSymlink` - Specifies the selected folders and files as the targets of symbolic links.
-   `yamafiler.paste` - Pastes the folders and files from the clipboard into the current folder. It cannot be executed in the source of the clipboard.

### File selection

-   `yamafiler.select` - Selects the cursor line and mark it with \*.
-   `yamafiler.deselect` - Deselects the cursor line.
-   `yamafiler.toggleSelection` - Toggles selection of the cursor line.
-   `yamafiler.toggleSelectionAll` - Toggles selection of all lines.

## Setting examples

Yamafiler does not define default keybindings.

An example of setting in keybindings.json is shown below.

```json
[
    {
        "key": "ctrl+y",
        "command": "yamafiler.openFiler",
        "when": "editorTextFocus && !inDebugRepl"
    },
    // An example for using VSCode Neovim together.
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
    // It is also recommended to add pdf if you use an extension for preview.
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

## License

Licensed under the [MIT](LICENSE.txt) license.

## Thanks

-   [Shougo/defx.nvim](https://github.com/Shougo/defx.nvim) - Source of idea
-   [shirou/vscode-dired](https://github.com/shirou/vscode-dired) - Pioneer
-   [JannisX11/batch-rename](https://github.com/JannisX11/batch-rename) - Batch function
