import * as fsPromises from 'fs/promises';

import * as vscode from 'vscode';

export type Result<T = void> =
    | { value: T; error: undefined; message: undefined }
    | { value: undefined; error: Error; message: string };

async function resolveResult<T>(
    thenable: Thenable<T>,
    messageFunc: (errorMessage: string) => string
): Promise<Result<T>> {
    try {
        return { value: await thenable, error: undefined, message: undefined };
    } catch (e) {
        const value = undefined;
        let error: Error;
        if (e instanceof vscode.FileSystemError) {
            error = e;
        } else if (e instanceof Error) {
            if (e.name === 'SystemError' && e.message.startsWith('Target already exists:')) {
                error = vscode.FileSystemError.FileExists(e.message);
            } else {
                error = e;
            }
        } else if (e instanceof Object) {
            error = Error(e.toString());
        } else {
            error = Error('Unknown error.');
        }
        const message = messageFunc(error.message);
        return { value, error, message };
    }
}

export function createDirectory(uri: vscode.Uri): Promise<Result> {
    function messageFunc(errorMessage: string) {
        return vscode.l10n.t('Could not create {0}: {1}', uri.fsPath, errorMessage);
    }
    return resolveResult(vscode.workspace.fs.createDirectory(uri), messageFunc);
}

export function createFile(uri: vscode.Uri): Promise<Result> {
    function messageFunc(errorMessage: string) {
        return vscode.l10n.t('Could not create {0}: {1}', uri.fsPath, errorMessage);
    }
    return resolveResult(vscode.workspace.fs.writeFile(uri, new Uint8Array()), messageFunc);
}

export function rename(oldUri: vscode.Uri, newUri: vscode.Uri, options?: { overwrite?: boolean }): Promise<Result> {
    function messageFunc(errorMessage: string) {
        return vscode.l10n.t('Could not rename {0} to {1}: {2}', oldUri.fsPath, newUri.fsPath, errorMessage);
    }
    return resolveResult(vscode.workspace.fs.rename(oldUri, newUri, { overwrite: options?.overwrite }), messageFunc);
}

export function copy(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options?: { overwrite?: boolean; merge?: boolean }
): Promise<Result> {
    function messageFunc(errorMessage: string) {
        return vscode.l10n.t('Could not copy {0} to {1}: {2}', oldUri.fsPath, newUri.fsPath, errorMessage);
    }
    if (options?.merge) {
        return resolveResult(
            fsPromises.cp(oldUri.fsPath, newUri.fsPath, {
                recursive: true,
                force: options.overwrite,
                errorOnExist: true,
            }),
            messageFunc
        );
    } else {
        return resolveResult(vscode.workspace.fs.copy(oldUri, newUri, { overwrite: options?.overwrite }), messageFunc);
    }
}

function _delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<Result> {
    function messageFunc(errorMessage: string) {
        return vscode.l10n.t('Failed to delete {0}: {1}', uri.fsPath, errorMessage);
    }
    return resolveResult(vscode.workspace.fs.delete(uri, options), messageFunc);
}

export { _delete as delete };

export function symlink(targetUri: vscode.Uri, linkUri: vscode.Uri): Promise<Result> {
    function messageFunc(errorMessage: string) {
        return vscode.l10n.t('Could not link {0} to {1}: {2}', linkUri.fsPath, targetUri.fsPath, errorMessage);
    }
    return resolveResult(fsPromises.symlink(targetUri.fsPath, linkUri.fsPath), messageFunc);
}
