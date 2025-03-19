import {
    FileStat,
    Tab,
    TabInputCustom,
    TabInputNotebook,
    TabInputNotebookDiff,
    TabInputText,
    TabInputTextDiff,
    TextDocument,
    TextEditor,
    Uri,
} from 'vscode';

export const YAMAFILER_SCHEME = 'yamafiler';
export const YAMAFILER_LANGUAGE_ID = 'yamafiler';

export interface FileItem {
    readonly uri: Uri;
    readonly stats: FileStat;
    readonly isDirectory: boolean;
    readonly isSymbolicLink: boolean;
}

export interface FolderData {
    readonly uri: Uri;
    readonly files: FileItem[];
    readonly selectedIndexes: number[];
    shouldRefresh: boolean;
}

export interface Selection {
    readonly editor: TextEditor;
    readonly uri: Uri;
    readonly files: FileItem[];
    readonly cursored: FileItem | undefined;
    readonly folder: FolderData;
    readonly fileBases: Set<string>;
}

export interface Clipboard {
    readonly mode: 'rename' | 'copy' | 'symlink';
    readonly uri: Uri;
    readonly files: FileItem[];
}

export interface BatchDocument {
    readonly mode: 'create' | 'rename' | 'copy' | 'symlink';
    readonly doc: TextDocument;
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

export function getTabUri(tab: Tab | undefined): Uri | undefined {
    if (!tab) {
        return undefined;
    } else if (
        tab.input instanceof TabInputText ||
        tab.input instanceof TabInputCustom ||
        tab.input instanceof TabInputNotebook
    ) {
        return tab.input.uri;
    } else if (tab.input instanceof TabInputTextDiff || tab.input instanceof TabInputNotebookDiff) {
        return tab.input.modified;
    } else {
        return undefined;
    }
}
