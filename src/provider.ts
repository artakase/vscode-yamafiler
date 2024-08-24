import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { filesize } from 'filesize';
import { Uri } from 'vscode';
import { FileItem, FolderData, getMessage, YAMAFILER_SCHEME } from './utils';

export function sortFunc(a: FileItem, b: FileItem): number {
    const dirOrder = (a.isDirectory ? 0 : 1) - (b.isDirectory ? 0 : 1);
    if (dirOrder !== 0) {
        return dirOrder;
    }
    return a.uri.path.localeCompare(b.uri.path);
}

function makeLine(file: FileItem, isSelected: boolean): string {
    const timeStr = new Date(file.stats.mtime).toISOString().substring(5, 16).replace('T', ' ');
    const fileName = path.basename(file.uri.path);
    const markSelected = isSelected ? '*' : ' ';
    const markDirectory = file.isDirectory ? '/' : '';
    const markSymbolicLink =
        file.isSymbolicLink && file.stats.type & (vscode.FileType.Directory | vscode.FileType.File)
            ? 'L'
            : file.isSymbolicLink
            ? 'l'
            : ' ';
    const sizeStr = file.isDirectory
        ? ''
        : filesize(file.stats.size, { base: 2, standard: 'jedec', round: 1, symbols: { B: ' B' } });

    return `${markSelected}${markSymbolicLink}${sizeStr.padStart(9)} ${timeStr} ${fileName}${markDirectory}`;
}

function tildify(p: string): string {
    const relPath = path.relative(Uri.file(os.homedir()).path, Uri.file(p).path);
    if (relPath === '') {
        return '~';
    } else if (relPath.startsWith('..')) {
        return p;
    } else {
        return `~${Uri.file(relPath).path}`;
    }
}

export class YamafilerProvider implements vscode.TextDocumentContentProvider {
    readonly cachedFolders = new Map<string, FolderData>();
    private readonly onDidChangeEmitter = new vscode.EventEmitter<Uri>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    dispose() {
        this.onDidChangeEmitter.dispose();
    }

    async provideTextDocumentContent(uri: Uri): Promise<string | undefined> {
        let folder: FolderData;
        try {
            folder = await this.readFolder(uri.with({ scheme: 'file' }));
        } catch (error) {
            console.error(error);
            void vscode.window.showErrorMessage(vscode.l10n.t('Could not read {0}: {1}', uri.path, getMessage(error)));
            return undefined;
        }
        const header = `${tildify(uri.path)}:`;
        const setSelection = new Set(folder.selectedIndexes);
        return [header].concat(folder.files.map((file, index) => makeLine(file, setSelection.has(index)))).join('\n');
    }

    private async readFolder(uri: Uri): Promise<FolderData> {
        const cachedFolder = this.cachedFolders.get(uri.path);
        if (cachedFolder?.shouldRefresh === false) {
            return cachedFolder;
        }
        const files: FileItem[] = [];
        for (const [filename, filetype] of await vscode.workspace.fs.readDirectory(uri)) {
            const fileUri = Uri.joinPath(uri, filename);
            try {
                const stats = await vscode.workspace.fs.stat(fileUri);
                files.push({
                    uri: fileUri,
                    stats,
                    isDirectory: !!(filetype & vscode.FileType.Directory),
                    isSymbolicLink: !!(filetype & vscode.FileType.SymbolicLink),
                });
            } catch (err) {
                console.log(`Could not get stat of ${fileUri.toString()}: ${getMessage(err)}`);
            }
        }
        files.sort(sortFunc);
        const selectedIndexes: number[] = [];
        if (cachedFolder) {
            const selectedFileNames = new Set(
                cachedFolder.selectedIndexes.map((index) => cachedFolder.files[index].uri.path)
            );
            files.forEach((file, index) => {
                if (selectedFileNames.has(file.uri.path)) {
                    selectedIndexes.push(index);
                }
            });
        }
        const resultFolder = { uri, files, selectedIndexes, shouldRefresh: false };
        this.cachedFolders.set(uri.path, resultFolder);
        return resultFolder;
    }

    emitChange(uri: Uri, resetSelection = false): void {
        const cachedFolder = this.cachedFolders.get(uri.path);
        if (cachedFolder) {
            cachedFolder.shouldRefresh = true;
            if (resetSelection) {
                cachedFolder.selectedIndexes.splice(0);
            }
        }
        this.onDidChangeEmitter.fire(uri.with({ scheme: YAMAFILER_SCHEME }));
    }
}
