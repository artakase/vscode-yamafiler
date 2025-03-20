import * as fsPromises from 'fs/promises';

import * as vscode from 'vscode';

export type Result<T = void> =
    | { value: T; error: undefined; message: undefined }
    | { value: undefined; error: Error; message: string };

async function resolveResult<T>(
    operation: Thenable<T>,
    formatErrorMessage: (errorMessage: string) => string
): Promise<Result<T>> {
    try {
        return { value: await operation, error: undefined, message: undefined };
    } catch (originalError) {
        const value = undefined;
        let error: Error;
        if (originalError instanceof vscode.FileSystemError) {
            error = originalError;
        } else if (originalError instanceof Error) {
            if (originalError.name === 'SystemError' && originalError.message.startsWith('Target already exists:')) {
                error = vscode.FileSystemError.FileExists(originalError.message);
            } else {
                error = originalError;
            }
        } else if (originalError instanceof Object) {
            error = Error(originalError.toString());
        } else {
            error = Error('Unknown error.');
        }
        const message = formatErrorMessage(error.message);
        return { value, error, message };
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
    return resolveResult(vscode.workspace.fs.writeFile(uri, new Uint8Array()), formatErrorMessage);
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
