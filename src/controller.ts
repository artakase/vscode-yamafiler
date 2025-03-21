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
    normalizePath,
    PendingFileOperation,
    YAMAFILER_LANGUAGE_ID,
    YAMAFILER_SCHEME,
} from './utils';
import { makeValidator } from './validator';

function resolveSymlinkIfRequested(sourceUri: vscode.Uri, resolveSymlinks: boolean): vscode.Uri | undefined {
    if (resolveSymlinks) {
        try {
            return vscode.Uri.file(fs.realpathSync(sourceUri.fsPath));
        } catch (error) {
            vscode.window.showErrorMessage(
                vscode.l10n.t('Could not resolve {0}: {1}', sourceUri.fsPath, getErrorMessage(error))
            );
            return undefined;
        }
    } else {
        return sourceUri;
    }
}

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
        for (const tab of event.closed) {
            const uri = getUriFromTab(tab);
            if (uri?.scheme === YAMAFILER_SCHEME) {
                closedViewPaths.add(normalizePath(uri.fsPath));
            } else if (
                uri &&
                this.currentBatchOperation &&
                normalizePath(this.currentBatchOperation.batchDocument.uri.fsPath) === normalizePath(uri.fsPath)
            ) {
                this.currentBatchOperation = undefined;
            }
        }
        if (closedViewPaths.size === 0) {
            return;
        }
        const remainingViewPaths = new Set<string>();
        for (const tabGroup of vscode.window.tabGroups.all) {
            for (const tab of tabGroup.tabs) {
                const tabUri = getUriFromTab(tab);
                if (tabUri?.scheme === YAMAFILER_SCHEME) {
                    remainingViewPaths.add(normalizePath(tabUri.fsPath));
                }
            }
        }
        for (const closedPath of closedViewPaths) {
            if (!remainingViewPaths.has(closedPath)) {
                this.contentProvider.cachedDirViews.delete(closedPath);
            }
        }
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

        let targetDirUri: vscode.Uri | undefined;
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
            const activeFile = resolveSymlinkIfRequested(activeUri, resolveSymlinks);
            if (!activeFile) {
                return;
            }
            targetDirUri = vscode.Uri.joinPath(activeFile, '..');
        } else if (workspaceUri) {
            targetDirUri = workspaceUri;
        } else {
            targetDirUri = homeUri;
        }
        targetDirUri = resolveSymlinkIfRequested(targetDirUri, resolveSymlinks);
        if (!targetDirUri) {
            return;
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
        const targetUri = resolveSymlinkIfRequested(focusedEntry.uri, resolveSymlinks);
        if (!targetUri) {
            return;
        }

        const matchOptions = { matchBase: true, dot: true, noext: true, nocase: true };

        const handleOpenError = (reason: unknown) => {
            void vscode.window.showErrorMessage(
                vscode.l10n.t('Could not open {0}: {1}', targetUri.fsPath, getErrorMessage(reason))
            );
        };

        if (focusedEntry.isDir) {
            if (minimatch(targetUri.path, externalFolderPattern, matchOptions)) {
                vscode.env.openExternal(targetUri).then(undefined, handleOpenError);
            } else {
                void this.showFiler(targetUri, 'active');
            }
            return;
        }

        const viewColumnToUse = column === 'active' ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside;
        const viewOptions = { viewColumn: viewColumnToUse, preserveFocus, preview };

        if (minimatch(targetUri.path, binaryPattern, matchOptions)) {
            void vscode.commands.executeCommand('vscode.open', targetUri, viewOptions);
        } else if (minimatch(targetUri.path, externalPattern, matchOptions)) {
            vscode.env.openExternal(targetUri).then(undefined, handleOpenError);
        } else {
            vscode.window.showTextDocument(targetUri, viewOptions).then(undefined, handleOpenError);
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
        const targetUri = resolveSymlinkIfRequested(focused.uri, resolveSymlinks);
        if (!targetUri) {
            return;
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
                const uri = resolveSymlinkIfRequested(file.uri, true);
                if (!uri) {
                    return;
                }
                uris.push({ uri });
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
            void vscode.window.showErrorMessage(vscode.l10n.t('Could not add selected items to workspace.'));
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
        if (!context || context.selectedEntries.length === 0) {
            return;
        }
        const selectedEntryPaths = context.selectedEntries.map((entry) => entry.uri.fsPath).join('\n');
        const choiceDelete = useTrash ? vscode.l10n.t('Move to Trash') : vscode.l10n.t('Delete Permanently');
        const userSelection = await vscode.window.showWarningMessage(
            useTrash
                ? vscode.l10n.t('Are you sure you want to move the selected items to the trash?')
                : vscode.l10n.t('Are you sure you want to permanently delete the selected items?'),
            { modal: true, detail: selectedEntryPaths },
            choiceDelete
        );
        if (userSelection == choiceDelete) {
            const operationResults = await Promise.all(
                context.selectedEntries.map((entry) => edition.delete(entry.uri, { recursive: true, useTrash }))
            );
            const success: string[] = [];
            const failure: edition.FailureResult[] = [];
            for (const [index, result] of operationResults.entries()) {
                if (result.error) {
                    failure.push(result);
                } else {
                    success.push(context.selectedEntries[index].uri.fsPath);
                }
            }
            edition.showAndLogErrors(failure);
            if (success.length > 0) {
                void vscode.window.showInformationMessage(
                    vscode.l10n.t('Successfully deleted {0} items.', success.length)
                );
            }
        }
        this.refresh({ resetSelection: true });
    }

    setPendingOperation(operationType: 'rename' | 'copy' | 'symlink'): void {
        const context = this.getCurrentNavigationContext();
        if (!context || context.selectedEntries.length == 0) {
            return;
        }
        this.pendingFileOperation = {
            operationType: operationType,
            sourceDirUri: context.currentDirUri,
            sourceFileEntries: context.selectedEntries,
        };
        const messages = {
            rename: vscode.l10n.t('Prepared {0} items for moving.', context.selectedEntries.length),
            copy: vscode.l10n.t('Prepared {0} items for copying.', context.selectedEntries.length),
            symlink: vscode.l10n.t('Prepared {0} items for symbolic link creation.', context.selectedEntries.length),
        };
        void vscode.window.showInformationMessage(messages[operationType]);

        this.refresh({ resetSelection: true });
    }

    async executePendingOperation(): Promise<void> {
        const context = this.getCurrentNavigationContext();
        if (!context || !this.pendingFileOperation) {
            return;
        }
        if (context.currentDirUri.path === this.pendingFileOperation.sourceDirUri.path) {
            void vscode.window.showErrorMessage(
                vscode.l10n.t('Could not paste: Source and destination folders are the same.')
            );
            return;
        }
        const operationType = this.pendingFileOperation.operationType;
        const promises: Promise<edition.Result>[] = [];
        for (const entry of this.pendingFileOperation.sourceFileEntries) {
            const oldUri = entry.uri;
            const relativePath = path.relative(this.pendingFileOperation.sourceDirUri.fsPath, oldUri.fsPath);
            const newUri = vscode.Uri.joinPath(context.currentDirUri, relativePath);
            if (operationType === 'rename') {
                promises.push(edition.rename(oldUri, newUri, { overwrite: false }));
            } else if (operationType === 'copy') {
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

        if (conflictingEntries.length === 0 || operationType === 'symlink') {
            this.pendingFileOperation = undefined;
            this.refresh({ resetSelection: true });
            return;
        }

        const choices = [];
        const overwriteAll = vscode.l10n.t('Overwrite');
        const mergeOverwrite = vscode.l10n.t('Overwrite (Merge Folders)');
        const skip = vscode.l10n.t('Skip');
        if (operationType === 'copy' && containsDir && IS_WINDOWS) {
            choices.push(overwriteAll, mergeOverwrite, skip);
        } else {
            choices.push(overwriteAll, skip);
        }

        const joinedPaths = conflictingEntries.map((uri) => uri.fsPath).join('\n');
        const userSelection = await vscode.window.showWarningMessage(
            vscode.l10n.t('File already exists. Overwrite?'),
            { modal: true, detail: joinedPaths },
            ...choices
        );

        if (userSelection && userSelection !== skip) {
            const rootUri = context.currentDirUri;
            const merge = userSelection === mergeOverwrite;

            const promises: Promise<edition.Result>[] = [];
            for (const uri of conflictingEntries) {
                const baseName = path.basename(uri.path);
                if (operationType === 'copy') {
                    promises.push(
                        edition.copy(uri, vscode.Uri.joinPath(rootUri, baseName), {
                            overwrite: true,
                            merge: merge,
                        })
                    );
                } else {
                    promises.push(edition.rename(uri, vscode.Uri.joinPath(rootUri, baseName), { overwrite: true }));
                }
            }
            const operationResults = await Promise.all(promises);
            edition.showAndLogErrors(operationResults);
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

        let selectionStartLine = Math.max(context.editor.selection.start.line - 1, 0);
        let selectionEndLine = context.editor.selection.end.line;

        if (value === 'toggleAll') {
            selectionStartLine = 0;
            selectionEndLine = document.lineCount - 1;
        } else if (selectionEndLine === 0) {
            selectionEndLine = document.lineCount - 1;
        } else if (selectionEndLine < document.lineCount - 1) {
            void vscode.commands.executeCommand('cursorMove', { to: 'down', by: 'line' });
        }

        let shouldAddAsterisk: boolean;
        if (value === 'on') {
            shouldAddAsterisk = true;
        } else if (value === 'off') {
            shouldAddAsterisk = false;
        } else {
            const asteriskedIndices = context.dirView.asteriskedIndices;
            let asteriskStartLine = asteriskedIndices.findIndex((value) => value >= selectionStartLine);
            if (asteriskStartLine === -1) {
                asteriskStartLine = asteriskedIndices.length;
            }
            let asteriskEndLine = asteriskedIndices.findIndex((value) => value >= selectionEndLine);
            if (asteriskEndLine === -1) {
                asteriskEndLine = asteriskedIndices.length;
            }
            shouldAddAsterisk = asteriskEndLine - asteriskStartLine !== selectionEndLine - selectionStartLine;
        }

        const updatedAsteriskedIndexSet = new Set(context.dirView.asteriskedIndices);
        for (let i = selectionStartLine; i < selectionEndLine; i++) {
            if (shouldAddAsterisk) {
                updatedAsteriskedIndexSet.add(i);
            } else {
                updatedAsteriskedIndexSet.delete(i);
            }
        }
        context.dirView.asteriskedIndices.splice(0);
        context.dirView.asteriskedIndices.push(...[...updatedAsteriskedIndexSet].sort((a, b) => a - b));
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
        const cachedDirView = this.contentProvider.cachedDirViews.get(normalizePath(currentDirUri.fsPath));
        if (!cachedDirView) {
            void vscode.window
                .showErrorMessage(
                    vscode.l10n.t('Cache not found. Please refresh to rebuild the cache.'),
                    vscode.l10n.t('Refresh')
                )
                .then((selection) => {
                    if (selection === vscode.l10n.t('Refresh')) {
                        this.refresh();
                    }
                });
            return undefined;
        }
        const cursorLineNumber = activeEditor.selection.active.line;
        const focusedEntry =
            0 < cursorLineNumber && cursorLineNumber <= cachedDirView.entries.length
                ? cachedDirView.entries[cursorLineNumber - 1]
                : undefined;
        const selectedEntries: FileEntry[] = [];
        const existingFileNames = new Set<string>();
        const asteriskedIndexSet = new Set(cachedDirView.asteriskedIndices);
        for (const [index, entry] of cachedDirView.entries.entries()) {
            if (asteriskedIndexSet.has(index)) {
                selectedEntries.push(entry);
            }
            if (fileNameFilterMode === 'all' || !asteriskedIndexSet.has(index)) {
                existingFileNames.add(normalizePath(path.basename(entry.uri.path)));
            }
        }
        if (selectedEntries.length === 0) {
            const start = Math.max(activeEditor.selection.start.line - 1, 0);
            const end = activeEditor.selection.end.line;
            selectedEntries.push(...cachedDirView.entries.slice(start, end));
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
            void vscode.window.showErrorMessage(
                vscode.l10n.t(
                    'A batch operation is already in progress. Please finish or cancel it before starting a new one.'
                )
            );
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
                    'Enter one filename per line. Add a trailing "/" to create folders. Save to create files or close to cancel.'
                )
            );
        } else {
            const operationMessages = {
                rename: {
                    title: 'Old Names ↔ New Names',
                    message: vscode.l10n.t(
                        'Edit filenames in the right panel. Save to apply changes or close to cancel.'
                    ),
                },
                copy: {
                    title: 'Source Names ↔ Destination Names',
                    message: vscode.l10n.t(
                        'Edit destination filenames in the right panel. Save to copy files or close to cancel.'
                    ),
                },
                symlink: {
                    title: 'Target Names ↔ Link Names',
                    message: vscode.l10n.t(
                        'Edit link names in the right panel. Save to create symlinks or close to cancel.'
                    ),
                },
            };
            void vscode.commands.executeCommand(
                'vscode.diff',
                originalNamesFileUri,
                editableNamesFileUri,
                operationMessages[operationType].title,
                { preview: false }
            );
            void vscode.window.showInformationMessage(operationMessages[operationType].message);
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
        const operationType = batchOperation.operationType;
        const documentLineCount = batchOperation.batchDocument.lineAt(batchOperation.batchDocument.lineCount - 1)
            .isEmptyOrWhitespace
            ? batchOperation.batchDocument.lineCount - 1
            : batchOperation.batchDocument.lineCount;

        if (operationType !== 'create') {
            if (documentLineCount !== batchOperation.navigationContext.selectedEntries.length) {
                void vscode.window.showErrorMessage(
                    vscode.l10n.t(
                        'Line count mismatch: Expected {1} lines but found {0}.',
                        batchOperation.navigationContext.selectedEntries.length,
                        documentLineCount
                    )
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
                operationType === 'create'
                    ? newBaseName.endsWith('/')
                    : batchOperation.navigationContext.selectedEntries[i].isDir;
            if (newBaseName.endsWith('/')) {
                newBaseName = newBaseName.slice(0, -1);
            }
            const message = fileNameValidator(newBaseName);
            if (message) {
                void vscode.window.showErrorMessage(
                    vscode.l10n.t('Invalid filename at line {0}: "{1}" ({2})', i + 1, newBaseName, message)
                );
                return;
            }
            uniqueFileNameSet.add(normalizePath(newBaseName));
            const newUri = vscode.Uri.joinPath(this.currentBatchOperation.navigationContext.currentDirUri, newBaseName);
            if (operationType === 'create') {
                fileCreationEntries.push([newUri, isDir]);
            } else {
                sourceDestUriPairs.push([batchOperation.navigationContext.selectedEntries[i].uri, newUri]);
            }
        }
        if (uniqueFileNameSet.size < documentLineCount) {
            void vscode.window.showErrorMessage(
                vscode.l10n.t('Duplicate filenames detected. All filenames must be unique within this folder.')
            );
            return;
        }
        const operationPromises: Promise<edition.Result>[] = [];
        if (operationType === 'create') {
            for (const [newUri, isDir] of fileCreationEntries) {
                if (isDir) {
                    operationPromises.push(edition.createDir(newUri));
                } else {
                    operationPromises.push(edition.createFile(newUri));
                }
            }
        } else {
            for (const [oldUri, newUri] of sourceDestUriPairs) {
                if (operationType === 'rename') {
                    operationPromises.push(edition.rename(oldUri, newUri));
                } else if (operationType === 'copy') {
                    operationPromises.push(edition.copy(oldUri, newUri));
                } else {
                    operationPromises.push(edition.symlink(oldUri, newUri));
                }
            }
        }
        const operationResults = await Promise.all(operationPromises);
        edition.showAndLogErrors(operationResults);

        this.currentBatchOperation.hasCompleted = true;
        this.contentProvider.emitChange(batchOperation.navigationContext.currentDirUri, true);
    }

    finalizeBatchOperation(document: vscode.TextDocument): void {
        if (!this.currentBatchOperation?.hasCompleted) {
            return;
        }
        if (document === this.currentBatchOperation.batchDocument) {
            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            const tabPath = getUriFromTab(activeTab)?.fsPath;
            if (
                activeTab &&
                tabPath &&
                normalizePath(tabPath) === normalizePath(this.currentBatchOperation.batchDocument.uri.fsPath)
            ) {
                void vscode.window.tabGroups.close(activeTab);
            }
        }

        this.currentBatchOperation = undefined;
    }
}
