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

export function normalizeError(error: unknown): Error {
    if (error instanceof vscode.FileSystemError) {
        return error;
    } else if (error instanceof Error) {
        if (
            error.name === 'SystemError'
            && typeof error.message === 'string'
            && error.message.startsWith('Target already exists:')
        ) {
            return vscode.FileSystemError.FileExists(error.message);
        }
        return error;
    } else if (error === null) {
        return new Error('Error object is null');
    } else if (error === undefined) {
        return new Error('Error object is undefined');
    } else if (typeof error === 'string' || typeof error === 'number' || typeof error === 'boolean') {
        return new Error(String(error));
    } else if (typeof error === 'object') {
        try {
            const serialized = JSON.stringify(error);
            return new Error(serialized);
        } catch (serializationError) {
            try {
                const errorType = Object.prototype.toString.call(error);

                const keys = Object.keys(error).slice(0, 10);
                const keysStr = keys.join(', ') + (keys.length >= 10 ? '...' : '');

                const serializationErrorMessage = serializationError instanceof Error
                    ? serializationError.message
                    : 'Unknown serialization error';

                return new Error(
                    `[Unserializable object: ${errorType} with keys: ${keysStr}] ${serializationErrorMessage}`
                );
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (unexpectedError: unknown) {
                return new Error('Error during serialization of complex object');
            }
        }
    } else {
        return new Error('Unknown error type');
    }
}

export function getErrorMessage(error: unknown): string {
    const normalizedError = normalizeError(error);
    return normalizedError.message;
}

export function getUriFromTab(tab: vscode.Tab | undefined): vscode.Uri | undefined {
    if (!tab) {
        return undefined;
    } else if (
        tab.input instanceof vscode.TabInputText
        || tab.input instanceof vscode.TabInputCustom
        || tab.input instanceof vscode.TabInputNotebook
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
