# Yamafiler

Yamafiler is a text-based file manager for VS Code.

![demo](https://raw.githubusercontent.com/artakase/vscode-yamafiler/main/images/demo.gif)

"Yama" means "mountain" in Japanese.

[Japanese README](docs/README_ja.md)

## Table of Contents

- [Yamafiler](#yamafiler)
  - [Table of Contents](#table-of-contents)
  - [Settings](#settings)
  - [Commands](#commands)
    - [Open](#open)
    - [Operations within Yamafiler](#operations-within-yamafiler)
    - [File Operations](#file-operations)
      - [About Batch Operations](#about-batch-operations)
      - [Creating and Deleting Files and Folders](#creating-and-deleting-files-and-folders)
      - [Editing Files and Folders](#editing-files-and-folders)
    - [Cross-Folder Operations (Copy, Move, Create Link)](#cross-folder-operations-copy-move-create-link)
      - [Commands to Select Files/Folders](#commands-to-select-filesfolders)
      - [Commands to Execute Operations](#commands-to-execute-operations)
    - [File Selection](#file-selection)
  - [License](#license)
  - [Acknowledgements](#acknowledgements)

## Settings

`yamafiler.useRecommendedKeybindings` - Use the recommended keybindings shown below.

| Key            | Operation                                             |
| -------------- | ----------------------------------------------------- |
| `Ctrl+Shift+Y` | Launch Yamafiler                                      |
| ``Shift+` ``   | Browse home folder                                    |
| `O`            | Browse current folder in adjacent editor group        |
| `H`            | Browse parent folder                                  |
| `J`            | Move cursor down                                      |
| `K`            | Move cursor up                                        |
| `L`            | Open file/browse folder at cursor line                |
| `E`/`Enter`    | Open file as text/browse folder at cursor line        |
| `Shift+P`      | Browse file at cursor line in adjacent editor group   |
| `Z`            | Update current folder contents                        |
| `Q`            | Close tab browsing folder                             |
| `W`            | Open workspace at cursor line                         |
| `Shift+W`      | Open workspace at cursor line in new window           |
| `Space`        | Add/remove `*` marks to/from selection lines          |
| `Shift+8`      | Add/remove `*` marks to/from all lines                |
| `Shift+K`      | Create folder                                         |
| `Shift+N`      | Create file                                           |
| `Shift+M`      | Create multiple files and folders at once             |
| `R`            | Rename target line                                    |
| `C`            | Duplicate target line to current folder               |
| `Shift+S`      | Create symbolic link to target line in current folder |
| `D`            | Move target line to trash                             |
| `M`            | Mark target line for move                             |
| `Y`            | Mark target line for copy                             |
| `Shift+T`      | Mark target line as symbolic link target              |
| `P`            | Paste to current folder                               |

Please adjust keys manually if they conflict with other extensions.

To preview `.pdf` files, you need additional extensions such as `vscode-pdf`.

See [here](docs/keybindings.json) for equivalent keybindings.json configuration.

## Commands

"Cursor line" refers to a single line where the cursor is located.

"Selected range lines" refers to lines within a text selection range. This supports multiple lines.

"Target line" prioritizes lines marked with `*`, or if no `*` marks exist, uses lines in the selection range. If neither exists, it defaults to the cursor line. This supports multiple lines.

(Note: If there are multiple cursors or selections, only the primary one is referenced)

"Current folder" refers to the folder currently being browsed in Yamafiler.

All commands except `yamafiler.openFiler` are only valid when Yamafiler is open.

Keys shown are those when `yamafiler.useRecommendedKeybindings` is enabled.

### Open

`yamafiler.openFiler` (`Ctrl+Shift+Y`) - Browse a folder with Yamafiler.

- _path_ - Path of folder to browse. The following special notations can be used:
  - `~`: Home folder
  - `${workspaceFolder}`: Current workspace folder
  - Empty string: Parent folder of the active file
- _column_ = 'active' - Open in current editor group if `'active'`, or in the adjacent editor group if `'beside'`
- _ask_ = 'never' - `'never'` automatically selects and opens a folder. `'dialog'` displays a folder selection dialog
- _resolveSymlinks_ = false - When the cursor line is a symbolic link, `true` opens the actual path of the link destination, `false` opens the symbolic link path as is

### Operations within Yamafiler

`yamafiler.enter` (`L`) - Open file or folder at cursor line. By default, files open as text files, folders are browsed in Yamafiler.

- _column_ = 'active' - Open in current editor group if `'active'`, adjacent editor group if `'beside'`
- _preserveFocus_ = false - `true` maintains focus on the filer even after opening a file, `false` moves focus to the opened file
- _preview_ = false - `true` opens files in preview mode
- _binaryPattern_ = '' - Glob pattern for files to open as binary. (e.g., `'*.{jpg,png}'`)
- _externalPattern_ = '' - Glob pattern for files to open with external applications. (e.g., `'*.{doc,xls}'`)
- _externalFolderPattern_ = '' - Glob pattern for folders to open in external application
- _resolveSymlinks_ = false - When the cursor line is a symbolic link, `true` opens the actual path of the link destination, `false` opens the symbolic link path as is

`yamafiler.goToParent` (`H`) - Browse the parent folder of the current folder. No arguments.

`yamafiler.refresh` (`Z`) - Update the current folder contents to the latest state (reflect file system changes).

- _resetSelection_ = false - `true` clears all `*` marks when refreshing, `false` preserves `*` marks as much as possible

`yamafiler.openWorkspace` (`W`/`Shift+W`) - Open the folder or workspace file at the cursor line as a workspace.

- _forceNewWindow_ = false - `true` opens in a new window, `false` opens in the current window (closing existing workspace)
- _resolveSymlinks_ = false - When the cursor line is a symbolic link, `true` opens the actual path of the link destination, `false` opens the symbolic link path as is

`yamafiler.addToWorkspace` - Add files or folders in the target line to the current workspace.

- _resolveSymlinks_ = false - For lines that are symbolic links, `true` adds the actual path of the link destination, `false` adds the symbolic link path as is

### File Operations

#### About Batch Operations

Yamafiler has a mechanism to input multiple filenames at once using text files.

- **Batch Mode** - When operating on multiple files at once, a text editor opens. Each line corresponds to a target file. The operation is executed when the file is saved, and canceled if closed without saving.
- **Batch Difference Mode** - In a split-screen editing view, the left side shows original filenames and the right side shows modified filenames. Name change operations are executed when saving after editing the right side, and canceled if closed without saving.

#### Creating and Deleting Files and Folders

`yamafiler.newFolder` (`Shift+K`) - Create a new folder in the current folder. A name input prompt is displayed.

`yamafiler.newFile` (`Shift+N`) - Create a new file in the current folder. A name input prompt is displayed.

`yamafiler.newMultipleFiles` (`Shift+M`) - Create multiple files/folders at once in the current folder using batch mode. The naming convention for each line is:

- File: No trailing slash (e.g., `example.txt`)
- Folder: With trailing slash (e.g., `new_folder/`)

`yamafiler.delete` (`D`) - Delete files/folders in the target line.

- _useTrash_ = true - `true` moves to trash (recoverable), `false` deletes completely.

#### Editing Files and Folders

`yamafiler.rename` (`R`) - Rename files/folders in the target line.

- Single selection: A name input prompt is displayed.
- Multiple selection: Batch difference mode opens, allowing you to edit each line to specify new names.

`yamafiler.duplicate` (`C`) - Duplicate files/folders in the target line within the same folder.

- Single selection: A prompt for the copy destination name is displayed.
- Multiple selection: Batch difference mode allows editing each copy destination name.

`yamafiler.symlink` (`Shift+S`) - Create symbolic links to the target line.

- Single selection: A link name input prompt is displayed.
- Multiple selection: Batch difference mode allows editing each link name.

### Cross-Folder Operations (Copy, Move, Create Link)

These operations work like clipboard functions, allowing you to perform "copy & paste" or "cut & paste" actions across different folders. The basic flow is as follows:

#### Commands to Select Files/Folders

In the source folder, mark the files/folders you want to operate on as target lines and run one of the following:

`yamafiler.cut` (`M`) - Mark for moving (cut).

`yamafiler.copy` (`Y`) - Mark for duplication (copy). Note: On Unix and Mac systems, this operation also supports folder merging.

`yamafiler.targetForSymlink` (`Shift+T`) - Mark as a symbolic link target.

#### Commands to Execute Operations

After moving to the destination folder:

`yamafiler.paste` (`P`) - Transfer the prepared files/folders to the current folder.

- **Move (cut → paste)**: Files/folders are removed from the original location and moved to the new location.
- **Duplicate (copy → paste)**: Files/folders are copied to the new location.
- **Link (targetForSymlink → paste)**: Symbolic links to the original files/folders are created at the new location.

### File Selection

`yamafiler.select` - Add `*` marks to selected range lines.

`yamafiler.deselect` - Remove `*` marks from selected range lines.

`yamafiler.toggleSelection` (`Space`) - Toggle `*` mark status of selected range lines (add ⇄ remove).

`yamafiler.toggleSelectionAll` (`Shift+8`) - Toggle `*` mark status of all lines (add ⇄ remove).

## License

Released under [MIT](LICENSE) license.

## Acknowledgements

- [Shougo/defx.nvim](https://github.com/Shougo/defx.nvim) - Source of inspiration
- [shirou/vscode-dired](https://github.com/shirou/vscode-dired) - Pioneer
- [JannisX11/batch-rename](https://github.com/JannisX11/batch-rename) - Batch functionality
