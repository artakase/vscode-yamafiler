import * as os from 'os';
import * as path from 'path';

import { filesize } from 'filesize';

import * as vscode from 'vscode';

import { DirView, FileEntry, getErrorMessage, YAMAFILER_SCHEME } from './utils';

export function compareFileSystemEntries(entryA: FileEntry, entryB: FileEntry): number {
    const dirOrder = (entryA.isDir ? 0 : 1) - (entryB.isDir ? 0 : 1);
    if (dirOrder !== 0) {
        return dirOrder;
    }
    return entryA.uri.path.localeCompare(entryB.uri.path);
}

function formatEntryForDisplay(entry: FileEntry, isAsterisked: boolean): string {
    const formattedModTime = new Date(entry.stats.mtime).toISOString().substring(5, 16).replace('T', ' ');
    const entryName = path.basename(entry.uri.path);
    const asteriskOrSpace = isAsterisked ? '*' : ' ';
    const dirMarker = entry.isDir ? '/' : '';
    const symlinkMarker =
        entry.isSymlink && entry.stats.type & (vscode.FileType.Directory | vscode.FileType.File)
            ? 'L'
            : entry.isSymlink
            ? 'l'
            : ' ';
    const formattedSize = entry.isDir
        ? ''
        : filesize(entry.stats.size, { base: 2, standard: 'jedec', round: 1, symbols: { B: ' B' } });

    return `${asteriskOrSpace}${symlinkMarker}${formattedSize.padStart(
        9
    )} ${formattedModTime} ${entryName}${dirMarker}`;
}

function tildify(absolutePath: string): string {
    const relativePath = path.relative(vscode.Uri.file(os.homedir()).path, vscode.Uri.file(absolutePath).path);
    if (relativePath === '') {
        return '~';
    } else if (relativePath.startsWith('..')) {
        return absolutePath;
    } else {
        return `~${vscode.Uri.file(relativePath).fsPath}`;
    }
}

export class YamafilerContentProvider implements vscode.TextDocumentContentProvider {
    readonly cachedDirViews = new Map<string, DirView>();
    private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    dispose() {
        this.onDidChangeEmitter.dispose();
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string | undefined> {
        let dirView: DirView;
        try {
            dirView = await this.loadDirContents(uri.with({ scheme: 'file' }));
        } catch (error) {
            console.error(error);
            void vscode.window.showErrorMessage(
                vscode.l10n.t('Could not read {0}: {1}', uri.fsPath, getErrorMessage(error))
            );
            return '';
        }
        const dirHeaderLine = `${tildify(uri.fsPath)}:`;
        const asteriskedIndexSet = new Set(dirView.asteriskedIndices);
        return [dirHeaderLine]
            .concat(dirView.entries.map((entry, index) => formatEntryForDisplay(entry, asteriskedIndexSet.has(index))))
            .join('\n');
    }

    private async loadDirContents(uri: vscode.Uri): Promise<DirView> {
        const cachedDirView = this.cachedDirViews.get(uri.fsPath);
        if (cachedDirView?.needsRefresh === false) {
            return cachedDirView;
        }
        const entries: FileEntry[] = [];
        for (const [filename, filetype] of await vscode.workspace.fs.readDirectory(uri)) {
            const entryUri = vscode.Uri.joinPath(uri, filename);
            try {
                const stats = await vscode.workspace.fs.stat(entryUri);
                entries.push({
                    uri: entryUri,
                    stats,
                    isDir: !!(filetype & vscode.FileType.Directory),
                    isSymlink: !!(filetype & vscode.FileType.SymbolicLink),
                });
            } catch (error) {
                console.log(`Could not get stats for ${entryUri.toString()}: ${getErrorMessage(error)}`);
            }
        }
        entries.sort(compareFileSystemEntries);
        const asteriskedIndices: number[] = [];
        if (cachedDirView) {
            const asteriskedFileNameSet = new Set(
                cachedDirView.asteriskedIndices.map((index) => cachedDirView.entries[index].uri.fsPath)
            );
            entries.forEach((entry, index) => {
                if (asteriskedFileNameSet.has(entry.uri.fsPath)) {
                    asteriskedIndices.push(index);
                }
            });
        }
        const refreshedDirView = { uri, entries, asteriskedIndices, needsRefresh: false };
        this.cachedDirViews.set(uri.fsPath, refreshedDirView);
        return refreshedDirView;
    }

    emitChange(uri: vscode.Uri, clearAsterisks = false): void {
        const cachedDirView = this.cachedDirViews.get(uri.fsPath);
        if (cachedDirView) {
            cachedDirView.needsRefresh = true;
            if (clearAsterisks) {
                cachedDirView.asteriskedIndices.splice(0);
            }
        }
        this.onDidChangeEmitter.fire(uri.with({ scheme: YAMAFILER_SCHEME }));
    }
}
