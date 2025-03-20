import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as process from 'process';

import { minimatch } from 'minimatch';

import * as vscode from 'vscode';
import { Uri } from 'vscode';

import { YamafilerProvider } from './contentProvider';
import * as edition from './edition';
import {
    BatchDocument,
    Clipboard,
    FileItem,
    getMessage,
    getTabUri,
    Selection,
    YAMAFILER_LANGUAGE_ID,
    YAMAFILER_SCHEME,
} from './utils';
import { makeValidator } from './validator';

export class Controller {
    private readonly disposables: vscode.Disposable[] = [];
    readonly provider;
    private clipboard: Clipboard | undefined;
    private batch: BatchDocument | undefined;
    private tmpDirUri: Uri | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.provider = new YamafilerProvider();
        this.disposables.push(vscode.window.tabGroups.onDidChangeTabs(this.removeCache, this));
        this.disposables.push(vscode.workspace.onWillSaveTextDocument(this.saveBatch, this));
        this.disposables.push(vscode.workspace.onDidSaveTextDocument(this.savedBatch, this));
    }

    public dispose(): void {
        this.disposables.forEach((d) => {
            d.dispose();
        });
    }

    removeCache(event: vscode.TabChangeEvent): void {
        const closedTabNames = new Set<string>();
        event.closed.forEach((tab) => {
            const uri = getTabUri(tab);
            if (uri?.scheme === YAMAFILER_SCHEME) {
                closedTabNames.add(uri.fsPath);
            } else if (uri?.fsPath && this.batch && path.relative(uri.fsPath, this.batch.doc.uri.fsPath) === '') {
                this.batch = undefined;
            }
        });
        if (closedTabNames.size === 0) {
            return;
        }
        const allTabNames = new Set<string>();
        vscode.window.tabGroups.all.forEach((tabGroup) => {
            tabGroup.tabs.forEach((tab) => {
                const uri = getTabUri(tab);
                if (uri?.scheme === YAMAFILER_SCHEME) {
                    allTabNames.add(uri.fsPath);
                }
            });
        });
        if (this.batch) {
            if (!allTabNames.has(this.batch.doc.uri.fsPath)) {
                this.batch = undefined;
            }
        }
        closedTabNames.forEach((tabName) => {
            if (!allTabNames.has(tabName)) {
                this.provider.cachedFolders.delete(tabName);
            }
        });
    }

    private async showFiler(uri: Uri, column: 'active' | 'beside' = 'active'): Promise<void> {
        const yamafilerUri = uri.with({ scheme: YAMAFILER_SCHEME });
        const doc = await vscode.workspace.openTextDocument(yamafilerUri);
        if (doc.lineAt(0).isEmptyOrWhitespace) {
            return;
        }
        if (doc.languageId === YAMAFILER_LANGUAGE_ID) {
            this.provider.emitChange(yamafilerUri);
        } else {
            void vscode.languages.setTextDocumentLanguage(doc, YAMAFILER_LANGUAGE_ID);
        }
        let selection: vscode.Range | undefined;
        if (doc.lineCount > 1) {
            selection = new vscode.Range(1, 0, 1, 0);
        }
        await vscode.window
            .showTextDocument(doc, {
                viewColumn: column === 'active' ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside,
                selection,
            })
            .then(undefined, (reason: unknown) =>
                vscode.window.showErrorMessage(vscode.l10n.t('Could not open {0}: {1}', uri.fsPath, getMessage(reason)))
            );
    }

    async openFiler({
        path = '',
        column = 'active',
        ask = 'never',
        resolveSymlinks = false,
    }: {
        path?: string;
        column?: 'active' | 'beside';
        ask?: 'never' | 'dialog';
        resolveSymlinks?: boolean;
    } = {}): Promise<void> {
        const workspaceUri = vscode.workspace.workspaceFolders?.[0].uri;
        const activeUri = getTabUri(vscode.window.tabGroups.activeTabGroup.activeTab);
        const homeUri = Uri.file(os.homedir());

        let uriToOpen: Uri;
        if (ask === 'dialog') {
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
            });
            if (uris?.length !== 1) {
                return;
            }
            uriToOpen = uris[0];
        } else if (path === '~') {
            uriToOpen = homeUri;
        } else if (path.startsWith('~/')) {
            uriToOpen = Uri.joinPath(homeUri, path.substring(2));
        } else if (path === '${workspaceFolder}' && workspaceUri) {
            uriToOpen = workspaceUri;
        } else if (path.startsWith('${workspaceFolder}/') && workspaceUri) {
            uriToOpen = Uri.joinPath(workspaceUri, path.substring(19));
        } else if (path !== '' && !path.startsWith('${workspaceFolder}')) {
            uriToOpen = Uri.file(path);
        } else if (activeUri?.scheme === YAMAFILER_SCHEME) {
            if (column === 'active') {
                this.refresh();
                return;
            } else {
                uriToOpen = activeUri;
            }
        } else if (activeUri?.scheme === 'file') {
            let activeFile = activeUri;
            if (resolveSymlinks) {
                try {
                    activeFile = Uri.file(fs.realpathSync.native(activeFile.fsPath));
                } catch (e) {
                    vscode.window.showErrorMessage(
                        vscode.l10n.t('Could not resolve {0}: {1}', activeFile.fsPath, getMessage(e))
                    );
                    return;
                }
            }
            uriToOpen = Uri.joinPath(activeFile, '..');
        } else if (workspaceUri) {
            uriToOpen = workspaceUri;
        } else {
            uriToOpen = homeUri;
        }
        if (resolveSymlinks) {
            try {
                uriToOpen = Uri.file(fs.realpathSync.native(uriToOpen.fsPath));
            } catch (e) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Could not resolve {0}: {1}', uriToOpen.fsPath, getMessage(e))
                );
                return;
            }
        }
        await this.showFiler(uriToOpen, column);
    }

    enter({
        column = 'active',
        preserveFocus = false,
        preview = false,
        binaryPattern = '',
        externalPattern = '',
        externalFolderPattern = '',
        resolveSymlinks = false,
    }: {
        column?: 'active' | 'beside';
        preserveFocus?: boolean;
        preview?: boolean;
        binaryPattern?: string;
        externalPattern?: string;
        externalFolderPattern?: string;
        resolveSymlinks?: boolean;
    } = {}): void {
        const selection = this.getSelection();
        const cursored = selection?.cursored;
        if (!cursored) {
            return;
        }
        let uriToOpen = cursored.uri;
        if (resolveSymlinks) {
            try {
                uriToOpen = Uri.file(fs.realpathSync.native(uriToOpen.fsPath));
            } catch (e) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Could not resolve {0}: {1}', uriToOpen.fsPath, getMessage(e))
                );
                return;
            }
        }
        if (
            cursored.isDirectory &&
            minimatch(uriToOpen.path, externalFolderPattern, {
                matchBase: true,
                dot: true,
                noext: true,
                nocase: true,
            })
        ) {
            vscode.env.openExternal(uriToOpen).then(undefined, (reason: unknown) => {
                void vscode.window.showErrorMessage(
                    vscode.l10n.t('Could not open {0}: {1}', uriToOpen.fsPath, getMessage(reason))
                );
            });
        } else if (cursored.isDirectory) {
            void this.showFiler(uriToOpen, 'active');
        } else if (
            minimatch(uriToOpen.path, binaryPattern, { matchBase: true, dot: true, noext: true, nocase: true })
        ) {
            void vscode.commands.executeCommand('vscode.open', uriToOpen, {
                viewColumn: column === 'active' ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside,
                preserveFocus: preserveFocus,
                prevew: preview,
            });
        } else if (
            minimatch(uriToOpen.path, externalPattern, { matchBase: true, dot: true, noext: true, nocase: true })
        ) {
            vscode.env.openExternal(uriToOpen).then(undefined, (reason: unknown) => {
                void vscode.window.showErrorMessage(
                    vscode.l10n.t('Could not open {0}: {1}', uriToOpen.fsPath, getMessage(reason))
                );
            });
        } else {
            vscode.window
                .showTextDocument(uriToOpen, {
                    viewColumn: column === 'active' ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside,
                    preserveFocus: preserveFocus,
                    preview: preview,
                })
                .then(undefined, (reason: unknown) => {
                    void vscode.window.showErrorMessage(
                        vscode.l10n.t('Could not open {0}: {1}', uriToOpen.fsPath, getMessage(reason))
                    );
                });
        }
    }

    goToParent(): void {
        const uri = vscode.window.activeTextEditor?.document.uri;
        if (uri?.scheme === YAMAFILER_SCHEME) {
            void this.showFiler(Uri.file(path.join(uri.fsPath, '..')), 'active');
        }
    }

    refresh({ resetSelection = false }: { resetSelection?: boolean } = {}): void {
        const uri = vscode.window.activeTextEditor?.document.uri;
        if (uri?.scheme === YAMAFILER_SCHEME) {
            this.provider.emitChange(uri, resetSelection);
        }
    }

    openWorkspace({
        forceNewWindow = false,
        resolveSymlinks = false,
    }: { forceNewWindow?: boolean; resolveSymlinks?: boolean } = {}): void {
        const cursored = this.getSelection()?.cursored;
        if (!cursored) {
            return;
        }
        let uriToOpen = cursored.uri;
        if (resolveSymlinks) {
            try {
                uriToOpen = Uri.file(fs.realpathSync.native(uriToOpen.fsPath));
            } catch (e) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Could not resolve {0}: {1}', uriToOpen.fsPath, getMessage(e))
                );
            }
        }
        if (
            !cursored.isDirectory &&
            !minimatch(uriToOpen.path, '*.code-workspace', { matchBase: true, dot: true, noext: true })
        ) {
            return;
        }
        void vscode.commands.executeCommand('vscode.openFolder', uriToOpen, { forceNewWindow });
    }

    addToWorkspace({ resolveSymlinks = false }: { resolveSymlinks?: boolean } = {}): void {
        const files = this.getSelection()?.files;
        if (!files || files.length === 0) {
            return;
        }
        let uris: { uri: Uri }[];
        if (resolveSymlinks) {
            uris = [];
            for (const file of files) {
                try {
                    uris.push({ uri: Uri.file(fs.realpathSync.native(file.uri.fsPath)) });
                } catch (e) {
                    vscode.window.showErrorMessage(
                        vscode.l10n.t('Could not resolve {0}: {1}', file.uri.fsPath, getMessage(e))
                    );
                }
            }
        } else {
            uris = files.map((file) => ({ uri: file.uri }));
        }
        const success = vscode.workspace.updateWorkspaceFolders(
            vscode.workspace.workspaceFolders?.length ?? 0,
            undefined,
            ...uris
        );
        if (!success) {
            void vscode.window.showErrorMessage(vscode.l10n.t('Failed to add to workspace.'));
        }
    }

    async create(isDirectory = false, multiple = false): Promise<void> {
        const selection = this.getSelection('all');
        if (!selection) {
            return;
        }
        if (multiple) {
            void this.openBatch(selection, 'create');
            return;
        }
        const newBase = await vscode.window.showInputBox({
            prompt: isDirectory ? vscode.l10n.t('Folder name') : vscode.l10n.t('File name'),
            validateInput: makeValidator(selection.fileBases),
        });
        if (newBase) {
            const uri = Uri.joinPath(selection.uri, newBase);
            let result: edition.Result;
            if (isDirectory) {
                result = await edition.createDirectory(uri);
            } else {
                result = await edition.createFile(uri);
            }
            if (result.error) {
                void vscode.window.showErrorMessage(result.message);
            }
        }
        this.refresh({ resetSelection: true });
    }

    async fileAction(mode: 'rename' | 'copy' | 'symlink'): Promise<void> {
        const selection = this.getSelection(mode === 'rename' ? 'unselected' : 'all');
        if (!selection || selection.files.length === 0) {
            return;
        }
        if (selection.files.length > 1) {
            void this.openBatch(selection, mode);
            return;
        }
        const file = selection.files[0];
        const oldBase = path.basename(file.uri.path);
        let end = oldBase.lastIndexOf('.');
        if (end < 1) {
            end = oldBase.length;
        }
        let prompt: string;
        if (mode === 'rename') {
            prompt = vscode.l10n.t('New name');
        } else if (mode === 'copy') {
            prompt = vscode.l10n.t('Copy name');
        } else {
            prompt = vscode.l10n.t('Link name');
        }
        const newBase = await vscode.window.showInputBox({
            value: oldBase,
            valueSelection: [0, end],
            prompt,
            validateInput: makeValidator(selection.fileBases),
        });
        if (newBase) {
            const uri = Uri.joinPath(selection.uri, newBase);
            let result: edition.Result;
            if (mode === 'rename') {
                result = await edition.rename(file.uri, uri);
            } else if (mode === 'copy') {
                result = await edition.copy(file.uri, uri);
            } else {
                result = await edition.symlink(file.uri, uri);
            }
            if (result.error) {
                void vscode.window.showErrorMessage(result.message);
            }
        }
        this.refresh({ resetSelection: true });
    }

    async delete({ useTrash = true }: { useTrash?: boolean } = {}): Promise<void> {
        const selection = this.getSelection();
        if (!selection || selection.files.length == 0) {
            return;
        }
        const pathList = selection.files.map((file) => file.uri.fsPath).join('\n');
        const choiceDelete = vscode.l10n.t('Delete');
        const answer = await vscode.window.showWarningMessage(
            vscode.l10n.t('Delete this file?'),
            { modal: true, detail: pathList },
            choiceDelete
        );
        if (answer == choiceDelete) {
            const results = await Promise.all(
                selection.files.map((file) => edition.delete(file.uri, { recursive: true, useTrash }))
            );
            const success: string[] = [];
            const failure: edition.Result[] = [];
            for (const [index, result] of results.entries()) {
                if (result.error) {
                    console.error(result.error);
                    failure.push(result);
                } else {
                    success.push(pathList[index]);
                }
            }
            if (failure.length > 0) {
                if (failure[0].message) {
                    void vscode.window.showErrorMessage(failure[0].message);
                } else {
                    void vscode.window.showErrorMessage('failure');
                }
            }
            if (success.length > 0) {
                void vscode.window.showInformationMessage(vscode.l10n.t('{0} has been deleted.', pathList));
            }
        }
        this.refresh({ resetSelection: true });
    }

    setClipboard(mode: 'rename' | 'copy' | 'symlink'): void {
        const selection = this.getSelection();
        if (!selection || selection.files.length == 0) {
            return;
        }
        const pathList = selection.files.map((file) => file.uri.fsPath).join('\n');
        this.clipboard = { mode, uri: selection.uri, files: selection.files };
        if (mode === 'rename') {
            void vscode.window.showInformationMessage(vscode.l10n.t('{0} has been cut.', pathList));
        } else if (mode === 'copy') {
            void vscode.window.showInformationMessage(vscode.l10n.t('{0} has been copied.', pathList));
        } else {
            void vscode.window.showInformationMessage(vscode.l10n.t('{0} has been targeted.', pathList));
        }
        this.refresh({ resetSelection: true });
    }

    async paste(): Promise<void> {
        const selection = this.getSelection();
        if (!selection) {
            return;
        }
        if (!this.clipboard) {
            return;
        }
        if (selection.uri.path === this.clipboard.uri.path) {
            void vscode.window.showInformationMessage(vscode.l10n.t('Same parent.'));
            return;
        }
        const promises: Promise<edition.Result>[] = [];
        for (const file of this.clipboard.files) {
            const oldUri = file.uri;
            const relPath = path.relative(this.clipboard.uri.fsPath, oldUri.fsPath);
            const newUri = Uri.joinPath(selection.uri, relPath);
            if (this.clipboard.mode === 'rename') {
                promises.push(edition.rename(oldUri, newUri, { overwrite: false }));
            } else if (this.clipboard.mode === 'copy') {
                promises.push(edition.copy(oldUri, newUri, { overwrite: false }));
            } else {
                promises.push(edition.symlink(oldUri, newUri));
            }
        }
        const results = await Promise.all(promises);
        const existUris: Uri[] = [];
        let containsDirectory = false;
        for (const [index, result] of results.entries()) {
            if (result.error) {
                if (result.error instanceof vscode.FileSystemError && result.error.code === 'FileExists') {
                    existUris.push(this.clipboard.files[index].uri);
                    if (this.clipboard.files[index].isDirectory) {
                        containsDirectory = true;
                    }
                } else {
                    console.error(result.error);
                }
            }
        }
        const choices = [];
        const overwriteAll = vscode.l10n.t('Overwrite');
        const mergeOverwrite = vscode.l10n.t('Overwrite (Merge Folders)');
        const skip = vscode.l10n.t('Skip');
        if (this.clipboard.mode === 'rename') {
            choices.push(overwriteAll, skip);
        } else if (this.clipboard.mode === 'copy') {
            if (process.platform === 'win32' || !containsDirectory) {
                choices.push(overwriteAll, skip);
            } else {
                choices.push(overwriteAll, mergeOverwrite, skip);
            }
        }
        let answer: string | undefined;
        if (existUris.length > 0 && choices.length > 0) {
            const pathList = existUris.map((uri) => uri.path).join('\n');
            answer = await vscode.window.showWarningMessage(
                vscode.l10n.t('File already exists. Overwrite?'),
                { modal: true, detail: pathList },
                ...choices
            );
        }
        if (answer) {
            const rootUri = selection.uri;
            const overwrite = answer === overwriteAll || answer === mergeOverwrite;
            const merge = answer === mergeOverwrite || answer === skip;

            const promises: Promise<edition.Result>[] = [];
            for (const uri of existUris) {
                const baseName = path.basename(uri.path);
                if (this.clipboard.mode === 'rename') {
                    promises.push(edition.rename(uri, Uri.joinPath(rootUri, baseName), { overwrite: overwrite }));
                } else if (this.clipboard.mode === 'copy') {
                    promises.push(
                        edition.copy(uri, Uri.joinPath(rootUri, baseName), { overwrite: overwrite, merge: merge })
                    );
                }
            }
            const results = await Promise.all(promises);
            let failed = false;
            results.forEach((result) => {
                if (result.error) {
                    if (!failed) {
                        void vscode.window.showErrorMessage(result.message);
                        failed = true;
                    }
                    console.error(result.error);
                }
            });
        }

        this.clipboard = undefined;
        this.refresh({ resetSelection: true });
    }

    setSelection(value: 'on' | 'off' | 'toggle' | 'toggleAll'): void {
        const selection = this.getSelection();
        if (!selection) {
            return;
        }
        const doc = selection.editor.document;

        let start = Math.max(selection.editor.selection.start.line - 1, 0);
        let end = selection.editor.selection.end.line;

        if (value === 'toggleAll') {
            start = 0;
            end = doc.lineCount - 1;
        } else if (end === 0) {
            end = doc.lineCount - 1;
        } else if (end < doc.lineCount - 1) {
            void vscode.commands.executeCommand('cursorMove', { to: 'down', by: 'line' });
        }

        let leftIndex = selection.folder.selectedIndexes.findIndex((value) => value >= start);
        let rightIndex = selection.folder.selectedIndexes.findIndex((value) => value >= end);
        if (leftIndex === -1) {
            leftIndex = 0;
            rightIndex = 0;
        } else if (rightIndex === -1) {
            rightIndex = selection.folder.selectedIndexes.length;
        }

        let willBeSelected: boolean;
        if (value === 'on') {
            willBeSelected = true;
        } else if (value === 'off') {
            willBeSelected = false;
        } else {
            willBeSelected = rightIndex - leftIndex !== end - start;
        }

        if (willBeSelected) {
            selection.folder.selectedIndexes.splice(
                leftIndex,
                rightIndex - leftIndex,
                ...Array.from({ length: end - start }, (_, i) => start + i)
            );
        } else {
            selection.folder.selectedIndexes.splice(leftIndex, rightIndex - leftIndex);
        }
        this.provider.emitChange(doc.uri);
    }

    private getSelection(getBaseNames?: 'all' | 'unselected'): Selection | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }
        const filerUri = editor.document.uri;
        if (filerUri.scheme !== YAMAFILER_SCHEME) {
            return undefined;
        }
        const uri = filerUri.with({ scheme: 'file' });
        const folder = this.provider.cachedFolders.get(uri.fsPath);
        if (!folder) {
            void vscode.window.showErrorMessage(vscode.l10n.t('The cache has been deleted. Please refresh the filer.'));
            return undefined;
        }
        const selectedIndexes = folder.selectedIndexes;
        let cursored: FileItem | undefined = undefined;
        const lineCursor = editor.selection.active.line;
        if (0 < lineCursor && lineCursor <= folder.files.length) {
            cursored = folder.files[lineCursor - 1];
        }
        const files: FileItem[] = [];
        const fileBases = new Set<string>();
        const setIndexes = new Set(selectedIndexes);
        folder.files.forEach((file, index) => {
            if (setIndexes.has(index)) {
                files.push(file);
            }
            if (getBaseNames === 'all' || !setIndexes.has(index)) {
                fileBases.add(path.basename(file.uri.path));
            }
        });
        if (files.length === 0) {
            const start = Math.max(editor.selection.start.line - 1, 0);
            const end = editor.selection.end.line;
            files.splice(0, 0, ...folder.files.slice(start, end));
        }
        return { editor, uri, files, cursored, folder, fileBases };
    }

    private async openBatch(selection: Selection, mode: 'create' | 'rename' | 'copy' | 'symlink'): Promise<void> {
        if (this.batch) {
            void vscode.window.showErrorMessage(vscode.l10n.t('Batch already exists. Please save or cancel it first.'));
            return;
        }
        this.tmpDirUri ??= Uri.file(fs.mkdtempSync(path.join(os.tmpdir(), 'yamafiler-')));
        const originalFileUri = Uri.joinPath(this.tmpDirUri, '.Original.yamafiler-batch');
        const batchFileUri = Uri.joinPath(this.tmpDirUri, '.FileNames.yamafiler-batch');
        if (mode === 'create') {
            await vscode.workspace.fs.writeFile(batchFileUri, new Uint8Array());
        } else {
            const oldNames = selection.files.map(
                (file) => path.basename(file.uri.path) + (file.isDirectory ? '/' : '')
            );
            await vscode.workspace.fs.writeFile(originalFileUri, new TextEncoder().encode(oldNames.join('\n')));
            await vscode.workspace.fs.writeFile(batchFileUri, new TextEncoder().encode(oldNames.join('\n')));
        }

        const doc = await vscode.workspace.openTextDocument(batchFileUri);
        if (mode === 'create') {
            await vscode.window.showTextDocument(doc, { preview: false });
            void vscode.window.showInformationMessage(
                vscode.l10n.t(
                    'Input file names. For folder names, add "/" (e.g. "foldername/"). Save the tab manually to execute. Close the tab to cancel.'
                )
            );
        } else if (mode === 'rename') {
            void vscode.commands.executeCommand('vscode.diff', originalFileUri, batchFileUri, 'Old Names ↔ New Names', {
                preview: false,
            });
            void vscode.window.showInformationMessage(
                vscode.l10n.t('Edit file names. Save this tab manually to execute. Close this tab to cancel.')
            );
        } else if (mode === 'copy') {
            void vscode.commands.executeCommand(
                'vscode.diff',
                originalFileUri,
                batchFileUri,
                'Source Names ↔ Dest Names',
                {
                    preview: false,
                }
            );
            void vscode.window.showInformationMessage(
                vscode.l10n.t('Edit file names. Save this tab manually to execute. Close this tab to cancel.')
            );
        } else {
            void vscode.commands.executeCommand(
                'vscode.diff',
                originalFileUri,
                batchFileUri,
                'Target Names ↔ Path Names',
                {
                    preview: false,
                }
            );
            void vscode.window.showInformationMessage(
                vscode.l10n.t('Edit path names. Save this tab manually to execute. Close this tab to cancel.')
            );
        }
        this.batch = { mode, doc, selection, isToClose: false };
        this.provider.emitChange(selection.editor.document.uri, true);
    }

    async saveBatch(event: vscode.TextDocumentWillSaveEvent): Promise<void> {
        const batch = this.batch;
        if (!this.batch || event.document !== batch?.doc || event.reason !== vscode.TextDocumentSaveReason.Manual) {
            return;
        }

        const validateFileName = makeValidator(batch.selection.fileBases);

        const batchLineCount = batch.doc.lineAt(batch.doc.lineCount - 1).isEmptyOrWhitespace
            ? batch.doc.lineCount - 1
            : batch.doc.lineCount;

        if (batch.mode === 'rename' || batch.mode === 'copy' || batch.mode === 'symlink') {
            if (batchLineCount !== batch.selection.files.length) {
                void vscode.window.showInformationMessage(
                    vscode.l10n.t('The line count does not match the file selection!')
                );
                return;
            }
        }

        const newFileNameSet = new Set<string>();
        const createUris: [Uri, boolean][] = [];
        const moveUris: [Uri, Uri][] = [];
        for (let i = 0; i < batchLineCount; i++) {
            let newBase = batch.doc.lineAt(i).text;
            const isDirectory = batch.mode === 'create' ? newBase.endsWith('/') : batch.selection.files[i].isDirectory;
            if (newBase.endsWith('/')) {
                newBase = newBase.slice(0, -1);
            }
            const message = validateFileName(newBase);
            if (message) {
                void vscode.window.showInformationMessage(
                    vscode.l10n.t('Invalid value at line {0}: {1}', i + 1, message)
                );
                return;
            }
            newFileNameSet.add(newBase);
            const newUri = Uri.joinPath(this.batch.selection.uri, newBase);
            if (batch.mode === 'create') {
                createUris.push([newUri, isDirectory]);
            } else {
                moveUris.push([batch.selection.files[i].uri, newUri]);
            }
        }
        if (newFileNameSet.size < batchLineCount) {
            void vscode.window.showInformationMessage(vscode.l10n.t('Duplicated file names.'));
            return;
        }
        const promises: Promise<edition.Result>[] = [];
        if (batch.mode === 'create') {
            createUris.forEach(([newUri, isDirectory]) => {
                if (isDirectory) {
                    promises.push(edition.createDirectory(newUri));
                } else {
                    promises.push(edition.createFile(newUri));
                }
            });
        } else {
            moveUris.forEach(([oldUri, newUri]) => {
                if (batch.mode === 'rename') {
                    promises.push(edition.rename(oldUri, newUri));
                } else if (batch.mode === 'copy') {
                    promises.push(edition.copy(oldUri, newUri));
                } else if (batch.mode === 'symlink') {
                    promises.push(edition.symlink(oldUri, newUri));
                }
            });
        }
        const results = await Promise.all(promises);
        let failed = false;
        results.forEach((result) => {
            if (result.error) {
                if (!failed) {
                    void vscode.window.showErrorMessage(result.message);
                    failed = true;
                }
                console.error(result.error);
            }
        });
        this.batch.isToClose = true;

        this.provider.emitChange(batch.selection.uri, true);
    }

    savedBatch(document: vscode.TextDocument): void {
        const batch = this.batch;
        if (!this.batch || document !== batch?.doc || !batch.isToClose) {
            return;
        }
        const at = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (at?.input instanceof vscode.TabInputText || at?.input instanceof vscode.TabInputTextDiff) {
            const tabPath = getTabUri(at)?.fsPath;
            if (tabPath && path.relative(tabPath, batch.doc.uri.fsPath) === '') {
                void vscode.window.tabGroups.close(at);
            }
        }
        this.batch = undefined;
    }
}
