import * as fsPromises from 'fs/promises';
import * as vscode from 'vscode';
import { Uri } from 'vscode';

export type Result<T = void> = { value: T; error: undefined } | { value: undefined; error: Error };

async function resolveResult<T>(thenable: Thenable<T>): Promise<Result<T>> {
    try {
        return { value: await thenable, error: undefined };
    } catch (error) {
        if (error instanceof vscode.FileSystemError) {
            return { value: undefined, error: error };
        } else if (error instanceof Error) {
            if (error.name === 'SystemError') {
                if (error.message.startsWith('Target already exists:')) {
                    return { value: undefined, error: vscode.FileSystemError.FileExists(error.message) };
                }
            }
            return { value: undefined, error: error };
        } else if (error instanceof Object) {
            return { value: undefined, error: Error(error.toString()) };
        } else {
            return { value: undefined, error: Error('Unknown error.') };
        }
    }
}

export function createDirectory(uri: Uri): Promise<Result<void>> {
    return resolveResult(vscode.workspace.fs.createDirectory(uri));
}

export function createFile(uri: Uri): Promise<Result> {
    return resolveResult(vscode.workspace.fs.writeFile(uri, new Uint8Array()));
}

export function rename(oldUri: Uri, newUri: Uri, options?: { overwrite?: boolean }): Promise<Result> {
    return resolveResult(vscode.workspace.fs.rename(oldUri, newUri, { overwrite: options?.overwrite }));
}

export function copy(oldUri: Uri, newUri: Uri, options?: { overwrite?: boolean; merge?: boolean }): Promise<Result> {
    if (options?.merge) {
        return resolveResult(
            fsPromises.cp(oldUri.path, newUri.path, {
                recursive: true,
                force: options?.overwrite,
                errorOnExist: true,
            }),
        );
    } else {
        return resolveResult(vscode.workspace.fs.copy(oldUri, newUri, { overwrite: options?.overwrite }));
    }
}

function _delete(uri: Uri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<Result> {
    return resolveResult(vscode.workspace.fs.delete(uri, options));
}

export { _delete as delete };

export function symlink(targetUri: Uri, linkUri: Uri): Promise<Result> {
    return resolveResult(fsPromises.symlink(targetUri.path, linkUri.path));
}
