// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Controller } from './controller';
import { YAMAFILER_SCHEME } from './utils';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): void {
    const controller = new Controller(context);

    function pushCommand(name: string, callback: () => any) {
        context.subscriptions.push(vscode.commands.registerCommand(`yamafiler.${name}`, callback, controller));
    }

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(YAMAFILER_SCHEME, controller.provider),
    );

    pushCommand('openFiler', controller.openFiler);
    pushCommand('enter', controller.enter);
    pushCommand('goToParent', controller.goToParent);
    pushCommand('refresh', controller.refresh);
    pushCommand('openWorkspace', controller.openWorkspace);
    pushCommand('addToWorkspace', controller.addToWorkspace);
    pushCommand('newFolder', () => controller.create(true));
    pushCommand('newFile', () => controller.create(false));
    pushCommand('newMultipleFiles', () => controller.create(false, true));
    pushCommand('rename', () => controller.fileAction('rename'));
    pushCommand('duplicate', () => controller.fileAction('copy'));
    pushCommand('symlink', () => controller.fileAction('symlink'));
    pushCommand('delete', controller.delete);
    pushCommand('cut', () => controller.setClipboard('rename'));
    pushCommand('copy', () => controller.setClipboard('copy'));
    pushCommand('targetForSymlink', () => controller.setClipboard('symlink'));
    pushCommand('paste', controller.paste);
    pushCommand('select', () => controller.setSelection('on'));
    pushCommand('deselect', () => controller.setSelection('off'));
    pushCommand('toggleSelection', () => controller.setSelection('toggle'));
    pushCommand('toggleSelectionAll', () => controller.setSelection('toggleAll'));
}

// This method is called when your extension is deactivated
export function deactivate(): void {}
