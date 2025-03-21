import * as vscode from 'vscode';

export const IS_MACINTOSH = process.platform === 'darwin';
export const IS_WINDOWS = process.platform === 'win32';
export const YAMAFILER_SCHEME = 'yamafiler';
export const YAMAFILER_LANGUAGE_ID = 'yamafiler';

export interface FileEntry {
    readonly uri: vscode.Uri;
    readonly stats?: vscode.FileStat;
    readonly isDir: boolean;
    readonly isSymlink: boolean;
}

export interface DirView {
    readonly uri: vscode.Uri;
    readonly entries: FileEntry[];
    readonly asteriskedIndices: number[];
    needsRefresh: boolean;
}

export interface NavigationContext {
    readonly editor: vscode.TextEditor;
    readonly currentDirUri: vscode.Uri;
    readonly selectedEntries: FileEntry[];
    readonly focusedEntry: FileEntry | undefined;
    readonly dirView: DirView;
    readonly existingFileNames: Set<string>;
}

export interface PendingFileOperation {
    readonly operationType: 'rename' | 'copy' | 'symlink';
    readonly sourceDirUri: vscode.Uri;
    readonly sourceFileEntries: FileEntry[];
}

export interface BatchFileOperation {
    readonly operationType: 'create' | 'rename' | 'copy' | 'symlink';
    readonly batchDocument: vscode.TextDocument;
    readonly navigationContext: NavigationContext;
    hasCompleted: boolean;
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    } else if (error instanceof Object) {
        return error.toString();
    } else {
        return 'unknown error';
    }
}

export function getUriFromTab(tab: vscode.Tab | undefined): vscode.Uri | undefined {
    if (!tab) {
        return undefined;
    } else if (
        tab.input instanceof vscode.TabInputText ||
        tab.input instanceof vscode.TabInputCustom ||
        tab.input instanceof vscode.TabInputNotebook
    ) {
        return tab.input.uri;
    } else if (tab.input instanceof vscode.TabInputTextDiff || tab.input instanceof vscode.TabInputNotebookDiff) {
        return tab.input.modified;
    } else {
        return undefined;
    }
}

export function normalizePath(path: string): string {
    if (IS_MACINTOSH || IS_WINDOWS) {
        return path.toLowerCase();
    } else {
        return path;
    }
}
