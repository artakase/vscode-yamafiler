import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { minimatch } from 'minimatch';

import * as vscode from 'vscode';

import { YamafilerContentProvider } from './contentProvider';
import * as edition from './edition';
import {
    BatchFileOperation,
    FileEntry,
    getErrorMessage,
    getUriFromTab,
    IS_WINDOWS,
    NavigationContext,
    PendingFileOperation,
    YAMAFILER_LANGUAGE_ID,
    YAMAFILER_SCHEME,
} from './utils';
import { makeValidator } from './validator';

export class Controller {
    private readonly disposables: vscode.Disposable[] = [];
    readonly contentProvider = new YamafilerContentProvider();
    private pendingFileOperation: PendingFileOperation | undefined;
    private currentBatchOperation: BatchFileOperation | undefined;
    private tempDirUri: vscode.Uri | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.disposables.push(vscode.window.tabGroups.onDidChangeTabs(this.cleanupClosedViewsFromCache, this));
        this.disposables.push(vscode.workspace.onWillSaveTextDocument(this.processBatchOperation, this));
        this.disposables.push(vscode.workspace.onDidSaveTextDocument(this.finalizeBatchOperation, this));
    }

    public dispose(): void {
        this.disposables.forEach((d) => {
            d.dispose();
        });
    }

    cleanupClosedViewsFromCache(event: vscode.TabChangeEvent): void {
        const closedViewPaths = new Set<string>();
        event.closed.forEach((tab) => {
            const uri = getUriFromTab(tab);
            if (uri?.scheme === YAMAFILER_SCHEME) {
                closedViewPaths.add(uri.fsPath);
            } else if (
                uri?.fsPath &&
                this.currentBatchOperation &&
                path.relative(uri.fsPath, this.currentBatchOperation.batchDocument.uri.fsPath) === ''
            ) {
                this.currentBatchOperation = undefined;
            }
        });
        if (closedViewPaths.size === 0) {
            return;
        }
        const remainingViewPaths = new Set<string>();
        vscode.window.tabGroups.all.forEach((tabGroup) => {
            tabGroup.tabs.forEach((tab) => {
                const tabUri = getUriFromTab(tab);
                if (tabUri?.scheme === YAMAFILER_SCHEME) {
                    remainingViewPaths.add(tabUri.fsPath);
                }
            });
        });
        if (this.currentBatchOperation) {
            if (!remainingViewPaths.has(this.currentBatchOperation.batchDocument.uri.fsPath)) {
                this.currentBatchOperation = undefined;
            }
        }
        closedViewPaths.forEach((closedPath) => {
            if (!remainingViewPaths.has(closedPath)) {
                this.contentProvider.cachedDirViews.delete(closedPath);
            }
        });
    }

    private async showFiler(uri: vscode.Uri, column: 'active' | 'beside' = 'active'): Promise<void> {
        const yamafilerUri = uri.with({ scheme: YAMAFILER_SCHEME });
        const document = await vscode.workspace.openTextDocument(yamafilerUri);
        if (document.lineAt(0).isEmptyOrWhitespace) {
            return;
        }
        if (document.languageId === YAMAFILER_LANGUAGE_ID) {
            this.contentProvider.emitChange(yamafilerUri);
        } else {
            void vscode.languages.setTextDocumentLanguage(document, YAMAFILER_LANGUAGE_ID);
        }
        let selection: vscode.Range | undefined;
        if (document.lineCount > 1) {
            selection = new vscode.Range(1, 0, 1, 0);
        }
        await vscode.window
            .showTextDocument(document, {
                viewColumn: column === 'active' ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside,
                selection,
            })
            .then(undefined, (reason: unknown) =>
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Could not open {0}: {1}', uri.fsPath, getErrorMessage(reason))
                )
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
        const activeUri = getUriFromTab(vscode.window.tabGroups.activeTabGroup.activeTab);
        const homeUri = vscode.Uri.file(os.homedir());

        let targetDirUri: vscode.Uri;
        if (ask === 'dialog') {
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
            });
            if (uris?.length !== 1) {
                return;
            }
            targetDirUri = uris[0];
        } else if (path === '~') {
            targetDirUri = homeUri;
        } else if (path.startsWith('~/')) {
            targetDirUri = vscode.Uri.joinPath(homeUri, path.substring(2));
        } else if (path === '${workspaceFolder}' && workspaceUri) {
            targetDirUri = workspaceUri;
        } else if (path.startsWith('${workspaceFolder}/') && workspaceUri) {
            targetDirUri = vscode.Uri.joinPath(workspaceUri, path.substring(19));
        } else if (path !== '' && !path.startsWith('${workspaceFolder}')) {
            targetDirUri = vscode.Uri.file(path);
        } else if (activeUri?.scheme === YAMAFILER_SCHEME) {
            if (column === 'active') {
                this.refresh();
                return;
            } else {
                targetDirUri = activeUri;
            }
        } else if (activeUri?.scheme === 'file') {
            let activeFile = activeUri;
            if (resolveSymlinks) {
                try {
                    activeFile = vscode.Uri.file(fs.realpathSync.native(activeFile.fsPath));
                } catch (error) {
                    vscode.window.showErrorMessage(
                        vscode.l10n.t('Could not resolve {0}: {1}', activeFile.fsPath, getErrorMessage(error))
                    );
                    return;
                }
            }
            targetDirUri = vscode.Uri.joinPath(activeFile, '..');
        } else if (workspaceUri) {
            targetDirUri = workspaceUri;
        } else {
            targetDirUri = homeUri;
        }
        if (resolveSymlinks) {
            try {
                targetDirUri = vscode.Uri.file(fs.realpathSync.native(targetDirUri.fsPath));
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Could not resolve {0}: {1}', targetDirUri.fsPath, getErrorMessage(error))
                );
                return;
            }
        }
        await this.showFiler(targetDirUri, column);
    }

    openFocusedEntry({
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
        const context = this.getCurrentNavigationContext();
        const focusedEntry = context?.focusedEntry;
        if (!focusedEntry) {
            return;
        }
        let targetUri = focusedEntry.uri;
        if (resolveSymlinks) {
            try {
                targetUri = vscode.Uri.file(fs.realpathSync.native(targetUri.fsPath));
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Could not resolve {0}: {1}', targetUri.fsPath, getErrorMessage(error))
                );
                return;
            }
        }
        if (
            focusedEntry.isDir &&
            minimatch(targetUri.path, externalFolderPattern, {
                matchBase: true,
                dot: true,
                noext: true,
                nocase: true,
            })
        ) {
            vscode.env.openExternal(targetUri).then(undefined, (reason: unknown) => {
                void vscode.window.showErrorMessage(
                    vscode.l10n.t('Could not open {0}: {1}', targetUri.fsPath, getErrorMessage(reason))
                );
            });
        } else if (focusedEntry.isDir) {
            void this.showFiler(targetUri, 'active');
        } else if (
            minimatch(targetUri.path, binaryPattern, { matchBase: true, dot: true, noext: true, nocase: true })
        ) {
            void vscode.commands.executeCommand('vscode.open', targetUri, {
                viewColumn: column === 'active' ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside,
                preserveFocus: preserveFocus,
                prevew: preview,
            });
        } else if (
            minimatch(targetUri.path, externalPattern, { matchBase: true, dot: true, noext: true, nocase: true })
        ) {
            vscode.env.openExternal(targetUri).then(undefined, (reason: unknown) => {
                void vscode.window.showErrorMessage(
                    vscode.l10n.t('Could not open {0}: {1}', targetUri.fsPath, getErrorMessage(reason))
                );
            });
        } else {
            vscode.window
                .showTextDocument(targetUri, {
                    viewColumn: column === 'active' ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside,
                    preserveFocus: preserveFocus,
                    preview: preview,
                })
                .then(undefined, (reason: unknown) => {
                    void vscode.window.showErrorMessage(
                        vscode.l10n.t('Could not open {0}: {1}', targetUri.fsPath, getErrorMessage(reason))
                    );
                });
        }
    }

    goToParent(): void {
        const uri = vscode.window.activeTextEditor?.document.uri;
        if (uri?.scheme === YAMAFILER_SCHEME) {
            void this.showFiler(vscode.Uri.file(path.join(uri.fsPath, '..')), 'active');
        }
    }

    refresh({ resetSelection = false }: { resetSelection?: boolean } = {}): void {
        const uri = vscode.window.activeTextEditor?.document.uri;
        if (uri?.scheme === YAMAFILER_SCHEME) {
            this.contentProvider.emitChange(uri, resetSelection);
        }
    }

    openWorkspace({
        forceNewWindow = false,
        resolveSymlinks = false,
    }: { forceNewWindow?: boolean; resolveSymlinks?: boolean } = {}): void {
        const focused = this.getCurrentNavigationContext()?.focusedEntry;
        if (!focused) {
            return;
        }
        let targetUri = focused.uri;
        if (resolveSymlinks) {
            try {
                targetUri = vscode.Uri.file(fs.realpathSync.native(targetUri.fsPath));
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Could not resolve {0}: {1}', targetUri.fsPath, getErrorMessage(error))
                );
            }
        }
        if (
            !focused.isDir &&
            !minimatch(targetUri.path, '*.code-workspace', { matchBase: true, dot: true, noext: true })
        ) {
            return;
        }
        void vscode.commands.executeCommand('vscode.openFolder', targetUri, { forceNewWindow });
    }

    addToWorkspace({ resolveSymlinks = false }: { resolveSymlinks?: boolean } = {}): void {
        const files = this.getCurrentNavigationContext()?.selectedEntries;
        if (!files || files.length === 0) {
            return;
        }
        let uris: { uri: vscode.Uri }[];
        if (resolveSymlinks) {
            uris = [];
            for (const file of files) {
                try {
                    uris.push({ uri: vscode.Uri.file(fs.realpathSync.native(file.uri.fsPath)) });
                } catch (error) {
                    vscode.window.showErrorMessage(
                        vscode.l10n.t('Could not resolve {0}: {1}', file.uri.fsPath, getErrorMessage(error))
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

    async create(isDir = false, multiple = false): Promise<void> {
        const context = this.getCurrentNavigationContext('all');
        if (!context) {
            return;
        }
        if (multiple) {
            void this.startBatchOperation(context, 'create');
            return;
        }
        const newFileNameBase = await vscode.window.showInputBox({
            prompt: isDir ? vscode.l10n.t('Folder name') : vscode.l10n.t('File name'),
            validateInput: makeValidator(context.existingFileNames),
        });
        if (newFileNameBase) {
            const uri = vscode.Uri.joinPath(context.currentDirUri, newFileNameBase);
            let result: edition.Result;
            if (isDir) {
                result = await edition.createDir(uri);
            } else {
                result = await edition.createFile(uri);
            }
            if (result.error) {
                void vscode.window.showErrorMessage(result.message);
            }
        }
        this.refresh({ resetSelection: true });
    }

    async executeFileOperation(operationType: 'rename' | 'copy' | 'symlink'): Promise<void> {
        const context = this.getCurrentNavigationContext(operationType === 'rename' ? 'unselected' : 'all');
        if (!context || context.selectedEntries.length === 0) {
            return;
        }
        if (context.selectedEntries.length > 1) {
            void this.startBatchOperation(context, operationType);
            return;
        }
        const entry = context.selectedEntries[0];
        const oldBaseName = path.basename(entry.uri.path);
        let end = oldBaseName.lastIndexOf('.');
        if (end < 1) {
            end = oldBaseName.length;
        }
        let inputPromptText: string;
        if (operationType === 'rename') {
            inputPromptText = vscode.l10n.t('New name');
        } else if (operationType === 'copy') {
            inputPromptText = vscode.l10n.t('Copy name');
        } else {
            inputPromptText = vscode.l10n.t('Link name');
        }
        const newBaseName = await vscode.window.showInputBox({
            value: oldBaseName,
            valueSelection: [0, end],
            prompt: inputPromptText,
            validateInput: makeValidator(context.existingFileNames),
        });
        if (newBaseName) {
            const uri = vscode.Uri.joinPath(context.currentDirUri, newBaseName);
            let result: edition.Result;
            if (operationType === 'rename') {
                result = await edition.rename(entry.uri, uri);
            } else if (operationType === 'copy') {
                result = await edition.copy(entry.uri, uri);
            } else {
                result = await edition.symlink(entry.uri, uri);
            }
            if (result.error) {
                void vscode.window.showErrorMessage(result.message);
            }
        }
        this.refresh({ resetSelection: true });
    }

    async delete({ useTrash = true }: { useTrash?: boolean } = {}): Promise<void> {
        const context = this.getCurrentNavigationContext();
        if (!context || context.selectedEntries.length == 0) {
            return;
        }
        const selectedEntryPaths = context.selectedEntries.map((entry) => entry.uri.fsPath).join('\n');
        const choiceDelete = vscode.l10n.t('Delete');
        const userSelection = await vscode.window.showWarningMessage(
            vscode.l10n.t('Delete this file?'),
            { modal: true, detail: selectedEntryPaths },
            choiceDelete
        );
        if (userSelection == choiceDelete) {
            const operationResults = await Promise.all(
                context.selectedEntries.map((entry) => edition.delete(entry.uri, { recursive: true, useTrash }))
            );
            const success: string[] = [];
            const failure: edition.Result[] = [];
            for (const [index, result] of operationResults.entries()) {
                if (result.error) {
                    console.error(result.error);
                    failure.push(result);
                } else {
                    success.push(selectedEntryPaths[index]);
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
                void vscode.window.showInformationMessage(vscode.l10n.t('{0} has been deleted.', selectedEntryPaths));
            }
        }
        this.refresh({ resetSelection: true });
    }

    setPendingOperation(operationType: 'rename' | 'copy' | 'symlink'): void {
        const context = this.getCurrentNavigationContext();
        if (!context || context.selectedEntries.length == 0) {
            return;
        }
        const pathList = context.selectedEntries.map((entries) => entries.uri.fsPath).join('\n');
        this.pendingFileOperation = {
            operationType: operationType,
            sourceDirUri: context.currentDirUri,
            sourceFileEntries: context.selectedEntries,
        };
        if (operationType === 'rename') {
            void vscode.window.showInformationMessage(vscode.l10n.t('{0} has been cut.', pathList));
        } else if (operationType === 'copy') {
            void vscode.window.showInformationMessage(vscode.l10n.t('{0} has been copied.', pathList));
        } else {
            void vscode.window.showInformationMessage(vscode.l10n.t('{0} has been targeted.', pathList));
        }
        this.refresh({ resetSelection: true });
    }

    async executePendingOperation(): Promise<void> {
        const context = this.getCurrentNavigationContext();
        if (!context) {
            return;
        }
        if (!this.pendingFileOperation) {
            return;
        }
        if (context.currentDirUri.path === this.pendingFileOperation.sourceDirUri.path) {
            void vscode.window.showInformationMessage(vscode.l10n.t('Same parent.'));
            return;
        }
        const promises: Promise<edition.Result>[] = [];
        for (const entry of this.pendingFileOperation.sourceFileEntries) {
            const oldUri = entry.uri;
            const relativePath = path.relative(this.pendingFileOperation.sourceDirUri.fsPath, oldUri.fsPath);
            const newUri = vscode.Uri.joinPath(context.currentDirUri, relativePath);
            if (this.pendingFileOperation.operationType === 'rename') {
                promises.push(edition.rename(oldUri, newUri, { overwrite: false }));
            } else if (this.pendingFileOperation.operationType === 'copy') {
                promises.push(edition.copy(oldUri, newUri, { overwrite: false }));
            } else {
                promises.push(edition.symlink(oldUri, newUri));
            }
        }
        const operationResults = await Promise.all(promises);
        const conflictingEntries: vscode.Uri[] = [];
        let containsDir = false;
        for (const [index, result] of operationResults.entries()) {
            if (result.error) {
                if (result.error instanceof vscode.FileSystemError && result.error.code === 'FileExists') {
                    conflictingEntries.push(this.pendingFileOperation.sourceFileEntries[index].uri);
                    if (this.pendingFileOperation.sourceFileEntries[index].isDir) {
                        containsDir = true;
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
        if (this.pendingFileOperation.operationType === 'rename') {
            choices.push(overwriteAll, skip);
        } else if (this.pendingFileOperation.operationType === 'copy') {
            if (IS_WINDOWS || !containsDir) {
                choices.push(overwriteAll, skip);
            } else {
                choices.push(overwriteAll, mergeOverwrite, skip);
            }
        }
        let userSelection: string | undefined;
        if (conflictingEntries.length > 0 && choices.length > 0) {
            const joinedPaths = conflictingEntries.map((uri) => uri.path).join('\n');
            userSelection = await vscode.window.showWarningMessage(
                vscode.l10n.t('File already exists. Overwrite?'),
                { modal: true, detail: joinedPaths },
                ...choices
            );
        }
        if (userSelection) {
            const rootUri = context.currentDirUri;
            const overwrite = userSelection === overwriteAll || userSelection === mergeOverwrite;
            const merge = userSelection === mergeOverwrite || userSelection === skip;

            const promises: Promise<edition.Result>[] = [];
            for (const uri of conflictingEntries) {
                const baseName = path.basename(uri.path);
                if (this.pendingFileOperation.operationType === 'rename') {
                    promises.push(
                        edition.rename(uri, vscode.Uri.joinPath(rootUri, baseName), { overwrite: overwrite })
                    );
                } else if (this.pendingFileOperation.operationType === 'copy') {
                    promises.push(
                        edition.copy(uri, vscode.Uri.joinPath(rootUri, baseName), {
                            overwrite: overwrite,
                            merge: merge,
                        })
                    );
                }
            }
            const operationResults = await Promise.all(promises);
            let hasError = false;
            operationResults.forEach((result) => {
                if (result.error) {
                    if (!hasError) {
                        void vscode.window.showErrorMessage(result.message);
                        hasError = true;
                    }
                    console.error(result.error);
                }
            });
        }

        this.pendingFileOperation = undefined;
        this.refresh({ resetSelection: true });
    }

    updateAsterisks(value: 'on' | 'off' | 'toggle' | 'toggleAll'): void {
        const context = this.getCurrentNavigationContext();
        if (!context) {
            return;
        }
        const document = context.editor.document;

        let start = Math.max(context.editor.selection.start.line - 1, 0);
        let end = context.editor.selection.end.line;

        if (value === 'toggleAll') {
            start = 0;
            end = document.lineCount - 1;
        } else if (end === 0) {
            end = document.lineCount - 1;
        } else if (end < document.lineCount - 1) {
            void vscode.commands.executeCommand('cursorMove', { to: 'down', by: 'line' });
        }

        let selectionStartIndex = context.dirView.asteriskedIndices.findIndex((value) => value >= start);
        let selectionEndIndex = context.dirView.asteriskedIndices.findIndex((value) => value >= end);
        if (selectionStartIndex === -1) {
            selectionStartIndex = 0;
            selectionEndIndex = 0;
        } else if (selectionEndIndex === -1) {
            selectionEndIndex = context.dirView.asteriskedIndices.length;
        }

        let shouldBeAsterisked: boolean;
        if (value === 'on') {
            shouldBeAsterisked = true;
        } else if (value === 'off') {
            shouldBeAsterisked = false;
        } else {
            shouldBeAsterisked = selectionEndIndex - selectionStartIndex !== end - start;
        }

        if (shouldBeAsterisked) {
            context.dirView.asteriskedIndices.splice(
                selectionStartIndex,
                selectionEndIndex - selectionStartIndex,
                ...Array.from({ length: end - start }, (_, i) => start + i)
            );
        } else {
            context.dirView.asteriskedIndices.splice(selectionStartIndex, selectionEndIndex - selectionStartIndex);
        }
        this.contentProvider.emitChange(document.uri);
    }

    private getCurrentNavigationContext(fileNameFilterMode?: 'all' | 'unselected'): NavigationContext | undefined {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return undefined;
        }
        const yamafilerUri = activeEditor.document.uri;
        if (yamafilerUri.scheme !== YAMAFILER_SCHEME) {
            return undefined;
        }
        const currentDirUri = yamafilerUri.with({ scheme: 'file' });
        const cachedDirView = this.contentProvider.cachedDirViews.get(currentDirUri.fsPath);
        if (!cachedDirView) {
            void vscode.window.showErrorMessage(vscode.l10n.t('The cache has been deleted. Please refresh the filer.'));
            return undefined;
        }
        const asteriskedIndices = cachedDirView.asteriskedIndices;
        let focusedEntry: FileEntry | undefined = undefined;
        const cursorLineNumber = activeEditor.selection.active.line;
        if (0 < cursorLineNumber && cursorLineNumber <= cachedDirView.entries.length) {
            focusedEntry = cachedDirView.entries[cursorLineNumber - 1];
        }
        const selectedEntries: FileEntry[] = [];
        const existingFileNames = new Set<string>();
        const asteriskedIndexSet = new Set(asteriskedIndices);
        cachedDirView.entries.forEach((entry, index) => {
            if (asteriskedIndexSet.has(index)) {
                selectedEntries.push(entry);
            }
            if (fileNameFilterMode === 'all' || !asteriskedIndexSet.has(index)) {
                existingFileNames.add(path.basename(entry.uri.path));
            }
        });
        if (selectedEntries.length === 0) {
            const start = Math.max(activeEditor.selection.start.line - 1, 0);
            const end = activeEditor.selection.end.line;
            selectedEntries.splice(0, 0, ...cachedDirView.entries.slice(start, end));
        }
        return {
            editor: activeEditor,
            currentDirUri: currentDirUri,
            selectedEntries: selectedEntries,
            focusedEntry: focusedEntry,
            dirView: cachedDirView,
            existingFileNames: existingFileNames,
        };
    }

    private async startBatchOperation(
        currentContext: NavigationContext,
        operationType: 'create' | 'rename' | 'copy' | 'symlink'
    ): Promise<void> {
        if (this.currentBatchOperation) {
            void vscode.window.showErrorMessage(vscode.l10n.t('Batch already exists. Please save or cancel it first.'));
            return;
        }
        this.tempDirUri ??= vscode.Uri.file(fs.mkdtempSync(path.join(os.tmpdir(), 'yamafiler-')));
        const originalNamesFileUri = vscode.Uri.joinPath(this.tempDirUri, '.Original.yamafiler-batch');
        const editableNamesFileUri = vscode.Uri.joinPath(this.tempDirUri, '.FileNames.yamafiler-batch');
        if (operationType === 'create') {
            await vscode.workspace.fs.writeFile(editableNamesFileUri, new Uint8Array());
        } else {
            const selectedEntryNames = currentContext.selectedEntries.map(
                (file) => path.basename(file.uri.path) + (file.isDir ? '/' : '')
            );
            await vscode.workspace.fs.writeFile(
                originalNamesFileUri,
                new TextEncoder().encode(selectedEntryNames.join('\n'))
            );
            await vscode.workspace.fs.writeFile(
                editableNamesFileUri,
                new TextEncoder().encode(selectedEntryNames.join('\n'))
            );
        }

        const batchEditDocument = await vscode.workspace.openTextDocument(editableNamesFileUri);
        if (operationType === 'create') {
            await vscode.window.showTextDocument(batchEditDocument, { preview: false });
            void vscode.window.showInformationMessage(
                vscode.l10n.t(
                    'Input file names. For folder names, add "/" (e.g. "foldername/"). Save the tab manually to execute. Close the tab to cancel.'
                )
            );
        } else if (operationType === 'rename') {
            void vscode.commands.executeCommand(
                'vscode.diff',
                originalNamesFileUri,
                editableNamesFileUri,
                'Old Names ↔ New Names',
                {
                    preview: false,
                }
            );
            void vscode.window.showInformationMessage(
                vscode.l10n.t('Edit file names. Save this tab manually to execute. Close this tab to cancel.')
            );
        } else if (operationType === 'copy') {
            void vscode.commands.executeCommand(
                'vscode.diff',
                originalNamesFileUri,
                editableNamesFileUri,
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
                originalNamesFileUri,
                editableNamesFileUri,
                'Target Names ↔ Path Names',
                {
                    preview: false,
                }
            );
            void vscode.window.showInformationMessage(
                vscode.l10n.t('Edit path names. Save this tab manually to execute. Close this tab to cancel.')
            );
        }
        this.currentBatchOperation = {
            operationType: operationType,
            batchDocument: batchEditDocument,
            navigationContext: currentContext,
            hasCompleted: false,
        };
        this.contentProvider.emitChange(currentContext.editor.document.uri, true);
    }

    async processBatchOperation(event: vscode.TextDocumentWillSaveEvent): Promise<void> {
        const batchOperation = this.currentBatchOperation;
        if (
            !this.currentBatchOperation ||
            event.document !== batchOperation?.batchDocument ||
            event.reason !== vscode.TextDocumentSaveReason.Manual
        ) {
            return;
        }

        const fileNameValidator = makeValidator(batchOperation.navigationContext.existingFileNames);

        const documentLineCount = batchOperation.batchDocument.lineAt(batchOperation.batchDocument.lineCount - 1)
            .isEmptyOrWhitespace
            ? batchOperation.batchDocument.lineCount - 1
            : batchOperation.batchDocument.lineCount;

        if (
            batchOperation.operationType === 'rename' ||
            batchOperation.operationType === 'copy' ||
            batchOperation.operationType === 'symlink'
        ) {
            if (documentLineCount !== batchOperation.navigationContext.selectedEntries.length) {
                void vscode.window.showInformationMessage(
                    vscode.l10n.t('The line count does not match the file selection!')
                );
                return;
            }
        }

        const uniqueFileNameSet = new Set<string>();
        const fileCreationEntries: [vscode.Uri, boolean][] = [];
        const sourceDestUriPairs: [vscode.Uri, vscode.Uri][] = [];
        for (let i = 0; i < documentLineCount; i++) {
            let newBaseName = batchOperation.batchDocument.lineAt(i).text;
            const isDir =
                batchOperation.operationType === 'create'
                    ? newBaseName.endsWith('/')
                    : batchOperation.navigationContext.selectedEntries[i].isDir;
            if (newBaseName.endsWith('/')) {
                newBaseName = newBaseName.slice(0, -1);
            }
            const message = fileNameValidator(newBaseName);
            if (message) {
                void vscode.window.showInformationMessage(
                    vscode.l10n.t('Invalid value at line {0}: {1}', i + 1, message)
                );
                return;
            }
            uniqueFileNameSet.add(newBaseName);
            const newUri = vscode.Uri.joinPath(this.currentBatchOperation.navigationContext.currentDirUri, newBaseName);
            if (batchOperation.operationType === 'create') {
                fileCreationEntries.push([newUri, isDir]);
            } else {
                sourceDestUriPairs.push([batchOperation.navigationContext.selectedEntries[i].uri, newUri]);
            }
        }
        if (uniqueFileNameSet.size < documentLineCount) {
            void vscode.window.showInformationMessage(vscode.l10n.t('Duplicated file names.'));
            return;
        }
        const operationPromises: Promise<edition.Result>[] = [];
        if (batchOperation.operationType === 'create') {
            fileCreationEntries.forEach(([newUri, isDir]) => {
                if (isDir) {
                    operationPromises.push(edition.createDir(newUri));
                } else {
                    operationPromises.push(edition.createFile(newUri));
                }
            });
        } else {
            sourceDestUriPairs.forEach(([oldUri, newUri]) => {
                if (batchOperation.operationType === 'rename') {
                    operationPromises.push(edition.rename(oldUri, newUri));
                } else if (batchOperation.operationType === 'copy') {
                    operationPromises.push(edition.copy(oldUri, newUri));
                } else if (batchOperation.operationType === 'symlink') {
                    operationPromises.push(edition.symlink(oldUri, newUri));
                }
            });
        }
        const operationResults = await Promise.all(operationPromises);
        let hasError = false;
        operationResults.forEach((result) => {
            if (result.error) {
                if (!hasError) {
                    void vscode.window.showErrorMessage(result.message);
                    hasError = true;
                }
                console.error(result.error);
            }
        });
        this.currentBatchOperation.hasCompleted = true;

        this.contentProvider.emitChange(batchOperation.navigationContext.currentDirUri, true);
    }

    finalizeBatchOperation(document: vscode.TextDocument): void {
        const batch = this.currentBatchOperation;
        if (!this.currentBatchOperation || document !== batch?.batchDocument || !batch.hasCompleted) {
            return;
        }
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (activeTab?.input instanceof vscode.TabInputText || activeTab?.input instanceof vscode.TabInputTextDiff) {
            const tabPath = getUriFromTab(activeTab)?.fsPath;
            if (tabPath && path.relative(tabPath, batch.batchDocument.uri.fsPath) === '') {
                void vscode.window.tabGroups.close(activeTab);
            }
        }
        this.currentBatchOperation = undefined;
    }
}
