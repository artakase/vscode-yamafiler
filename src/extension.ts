// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { Controller } from './controller';
import { YAMAFILER_SCHEME } from './utils';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): void {
    const controller = new Controller(context);

    context.subscriptions.push(controller);

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(YAMAFILER_SCHEME, controller.contentProvider)
    );
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(YAMAFILER_SCHEME, controller.symbolProvider)
    );

    const commands = {
        openFiler: controller.openFiler.bind(controller),
        enter: controller.openFocusedEntry.bind(controller),
        goToParent: controller.goToParent.bind(controller),
        refresh: controller.refresh.bind(controller),
        openWorkspace: controller.openWorkspace.bind(controller),
        addToWorkspace: controller.addToWorkspace.bind(controller),
        newFolder: () => controller.create(true),
        newFile: () => controller.create(false),
        newMultipleFiles: () => controller.create(false, true),
        rename: () => controller.executeFileOperation('rename'),
        duplicate: () => controller.executeFileOperation('copy'),
        symlink: () => controller.executeFileOperation('symlink'),
        delete: controller.delete.bind(controller),
        cut: () => {
            controller.setPendingOperation('rename');
        },
        copy: () => {
            controller.setPendingOperation('copy');
        },
        targetForSymlink: () => {
            controller.setPendingOperation('symlink');
        },
        paste: controller.executePendingOperation.bind(controller),
        select: () => {
            controller.updateAsterisks('on');
        },
        deselect: () => {
            controller.updateAsterisks('off');
        },
        toggleSelection: () => {
            controller.updateAsterisks('toggle');
        },
        toggleSelectionAll: () => {
            controller.updateAsterisks('toggleAll');
        },
    };
    for (const [command, callback] of Object.entries(commands)) {
        context.subscriptions.push(vscode.commands.registerCommand(`yamafiler.${command}`, callback));
    }
}
