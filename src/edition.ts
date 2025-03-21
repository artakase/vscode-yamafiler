import * as fsPromises from 'fs/promises';

import * as vscode from 'vscode';

export interface SuccessResult<T> {
    value: T;
    error: undefined;
    message: undefined;
}

export interface FailureResult {
    value: undefined;
    error: Error;
    message: string;
}

export type Result<T = void> = SuccessResult<T> | FailureResult;

function normalizeError(error: unknown): Error {
    if (error instanceof vscode.FileSystemError) {
        return error;
    } else if (error instanceof Error) {
        if (error.name === 'SystemError' && error.message.startsWith('Target already exists:')) {
            return vscode.FileSystemError.FileExists(error.message);
        }
        return error;
    } else if (error instanceof Object) {
        return new Error(error.toString());
    }
    return new Error('Unknown error.');
}

async function resolveResult<T>(
    operation: Thenable<T>,
    formatErrorMessage: (errorMessage: string) => string
): Promise<Result<T>> {
    try {
        return { value: await operation, error: undefined, message: undefined };
    } catch (originalError) {
        const error = normalizeError(originalError);
        const message = formatErrorMessage(error.message);
        return { value: undefined, error, message };
    }
}

export function showAndLogErrors(results: Result[]) {
    let hasError = false;
    for (const error of results) {
        if (error.error) {
            if (!hasError) {
                hasError = true;
                void vscode.window.showErrorMessage(error.message);
            }
            console.error(error.message);
        }
    }
}

export function createDir(uri: vscode.Uri): Promise<Result> {
    function formatErrorMessage(errorMessage: string) {
        return vscode.l10n.t('Could not create {0}: {1}', uri.fsPath, errorMessage);
    }
    return resolveResult(vscode.workspace.fs.createDirectory(uri), formatErrorMessage);
}

export function createFile(uri: vscode.Uri): Promise<Result> {
    function formatErrorMessage(errorMessage: string) {
        return vscode.l10n.t('Could not create {0}: {1}', uri.fsPath, errorMessage);
    }
    return resolveResult(fsPromises.writeFile(uri.fsPath, '', { flag: 'wx' }), formatErrorMessage);
}

export function rename(
    sourceUri: vscode.Uri,
    targetUri: vscode.Uri,
    options?: { overwrite?: boolean }
): Promise<Result> {
    function formatErrorMessage(errorMessage: string) {
        return vscode.l10n.t('Could not rename {0} to {1}: {2}', sourceUri.fsPath, targetUri.fsPath, errorMessage);
    }
    return resolveResult(
        vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite: options?.overwrite }),
        formatErrorMessage
    );
}

export function copy(
    sourceUri: vscode.Uri,
    targetUri: vscode.Uri,
    options?: { overwrite?: boolean; merge?: boolean }
): Promise<Result> {
    function formatErrorMessage(errorMessage: string) {
        return vscode.l10n.t('Could not copy {0} to {1}: {2}', sourceUri.fsPath, targetUri.fsPath, errorMessage);
    }
    if (options?.merge) {
        return resolveResult(
            fsPromises.cp(sourceUri.fsPath, targetUri.fsPath, {
                recursive: true,
                force: options.overwrite,
                errorOnExist: true,
            }),
            formatErrorMessage
        );
    } else {
        return resolveResult(
            vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite: options?.overwrite }),
            formatErrorMessage
        );
    }
}

function _delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<Result> {
    function formatErrorMessage(errorMessage: string) {
        return vscode.l10n.t('Could not delete {0}: {1}', uri.fsPath, errorMessage);
    }
    return resolveResult(vscode.workspace.fs.delete(uri, options), formatErrorMessage);
}

export { _delete as delete };

export function symlink(targetUri: vscode.Uri, symlinkUri: vscode.Uri): Promise<Result> {
    function formatErrorMessage(errorMessage: string) {
        return vscode.l10n.t(
            'Could not create symbolic link {0} pointing to {1}: {2}',
            symlinkUri.fsPath,
            targetUri.fsPath,
            errorMessage
        );
    }
    return resolveResult(fsPromises.symlink(targetUri.fsPath, symlinkUri.fsPath), formatErrorMessage);
}
