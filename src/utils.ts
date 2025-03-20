import * as vscode from 'vscode';

export const YAMAFILER_SCHEME = 'yamafiler';
export const YAMAFILER_LANGUAGE_ID = 'yamafiler';

export interface FileItem {
    readonly uri: vscode.Uri;
    readonly stats: vscode.FileStat;
    readonly isDirectory: boolean;
    readonly isSymbolicLink: boolean;
}

export interface FolderData {
    readonly uri: vscode.Uri;
    readonly files: FileItem[];
    readonly selectedIndexes: number[];
    shouldRefresh: boolean;
}

export interface Selection {
    readonly editor: vscode.TextEditor;
    readonly uri: vscode.Uri;
    readonly files: FileItem[];
    readonly cursored: FileItem | undefined;
    readonly folder: FolderData;
    readonly fileBases: Set<string>;
}

export interface Clipboard {
    readonly mode: 'rename' | 'copy' | 'symlink';
    readonly uri: vscode.Uri;
    readonly files: FileItem[];
}

export interface BatchDocument {
    readonly mode: 'create' | 'rename' | 'copy' | 'symlink';
    readonly doc: vscode.TextDocument;
    readonly selection: Selection;
    isToClose: boolean;
}

export function getMessage(err: unknown): string {
    if (err instanceof Error) {
        return err.message;
    } else if (err instanceof Object) {
        return err.toString();
    } else {
        return 'unknown error';
    }
}

export function getTabUri(tab: vscode.Tab | undefined): vscode.Uri | undefined {
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
