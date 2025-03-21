// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { Controller } from './controller';
import { YAMAFILER_SCHEME } from './utils';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): void {
    const controller = new Controller(context);

    function pushCommand(name: string, callback: () => void | Promise<void>) {
        context.subscriptions.push(vscode.commands.registerCommand(`yamafiler.${name}`, callback, controller));
    }

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(YAMAFILER_SCHEME, controller.contentProvider)
    );

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(YAMAFILER_SCHEME, controller.symbolProvider)
    );

    pushCommand('openFiler', controller.openFiler);
    pushCommand('enter', controller.openFocusedEntry);
    pushCommand('goToParent', controller.goToParent);
    pushCommand('refresh', controller.refresh);
    pushCommand('openWorkspace', controller.openWorkspace);
    pushCommand('addToWorkspace', controller.addToWorkspace);
    pushCommand('newFolder', () => controller.create(true));
    pushCommand('newFile', () => controller.create(false));
    pushCommand('newMultipleFiles', () => controller.create(false, true));
    pushCommand('rename', () => controller.executeFileOperation('rename'));
    pushCommand('duplicate', () => controller.executeFileOperation('copy'));
    pushCommand('symlink', () => controller.executeFileOperation('symlink'));
    pushCommand('delete', controller.delete);
    pushCommand('cut', () => {
        controller.setPendingOperation('rename');
    });
    pushCommand('copy', () => {
        controller.setPendingOperation('copy');
    });
    pushCommand('targetForSymlink', () => {
        controller.setPendingOperation('symlink');
    });
    pushCommand('paste', controller.executePendingOperation);
    pushCommand('select', () => {
        controller.updateAsterisks('on');
    });
    pushCommand('deselect', () => {
        controller.updateAsterisks('off');
    });
    pushCommand('toggleSelection', () => {
        controller.updateAsterisks('toggle');
    });
    pushCommand('toggleSelectionAll', () => {
        controller.updateAsterisks('toggleAll');
    });
}
