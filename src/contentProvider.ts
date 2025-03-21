import * as os from 'os';
import * as path from 'path';

import { filesize } from 'filesize';

import * as vscode from 'vscode';

import { DirView, FileEntry, getErrorMessage, IS_WINDOWS, YAMAFILER_SCHEME } from './utils';

export function compareFileSystemEntries(entryA: FileEntry, entryB: FileEntry): number {
    const dirOrder = (entryA.isDir ? 0 : 1) - (entryB.isDir ? 0 : 1);
    if (dirOrder !== 0) {
        return dirOrder;
    }
    return entryA.uri.path.localeCompare(entryB.uri.path);
}

function formatEntryForDisplay(entry: FileEntry, isAsterisked: boolean): string {
    const entryName = path.basename(entry.uri.path);
    const asteriskOrSpace = isAsterisked ? '*' : ' ';
    const dirMarker = entry.isDir ? '/' : '';
    if (!entry.stats) {
        return `${asteriskOrSpace}?                      ${entryName}${dirMarker}`;
    }
    const formattedModTime = new Date(entry.stats.mtime).toISOString().substring(5, 16).replace('T', ' ');
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

function normalizeDriveLetter(pathString: string): string {
    const normalized = pathString.replace(/\\/g, '/');

    if (IS_WINDOWS && /^[a-z]:/i.test(normalized)) {
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }

    return normalized;
}

function tildify(absolutePath: string): string {
    if (!absolutePath) {
        return '';
    }

    const homedir = os.homedir();

    try {
        if (absolutePath === homedir) {
            return '~';
        }
        if (IS_WINDOWS) {
            const homePrefix = homedir + path.sep;
            if (absolutePath.startsWith(homePrefix)) {
                return `~/${normalizeDriveLetter(absolutePath.substring(homePrefix.length))}`;
            }
            return normalizeDriveLetter(absolutePath);
        }
        if (path.parse(homedir).root.toLowerCase() !== path.parse(absolutePath).root.toLowerCase()) {
            return normalizeDriveLetter(absolutePath);
        }

        const relativePath = path.relative(homedir, absolutePath);

        if (relativePath === '') {
            return '~';
        } else if (!relativePath.startsWith('..')) {
            return `~/${normalizeDriveLetter(relativePath)}`;
        }

        return normalizeDriveLetter(absolutePath);
    } catch (error) {
        console.error(`Error in tildify for path "${absolutePath}": ${getErrorMessage(error)}`);
        return normalizeDriveLetter(absolutePath);
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
        const tildifiedPath = tildify(uri.fsPath);
        const dirHeaderLine = `${tildifiedPath}${tildifiedPath.endsWith('/') ? '' : '/'}:`;
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
        const dirEntries = await vscode.workspace.fs.readDirectory(uri);
        const statPromises = dirEntries.map(async ([fileName, fileType]) => {
            const entryUri = vscode.Uri.joinPath(uri, fileName);
            let fileStats: vscode.FileStat | undefined;
            try {
                fileStats = await vscode.workspace.fs.stat(entryUri);
            } catch (error) {
                console.warn(`Could not get stats for ${entryUri.toString()}: ${getErrorMessage(error)}`);
                fileStats = undefined;
            }
            return {
                uri: entryUri,
                stats: fileStats,
                isDir: !!(fileType & vscode.FileType.Directory),
                isSymlink: !!(fileType & vscode.FileType.SymbolicLink),
            };
        });
        const entries = (await Promise.all(statPromises)).filter(Boolean) as FileEntry[];
        entries.sort(compareFileSystemEntries);
        const asteriskedIndices: number[] = [];
        if (cachedDirView) {
            const uriPathToIndexMap = new Map(entries.map((entry, index) => [entry.uri.fsPath, index]));
            for (const cachedEntryIndex of cachedDirView.asteriskedIndices) {
                const path = cachedDirView.entries[cachedEntryIndex].uri.fsPath;
                const currentEntryIndex = uriPathToIndexMap.get(path);
                if (currentEntryIndex !== undefined) {
                    asteriskedIndices.push(currentEntryIndex);
                }
            }
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
