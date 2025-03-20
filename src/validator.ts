/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------------------------
 *  Modified by TAKASE Arihiro.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import { IS_WINDOWS } from './utils';

// Reference: https://en.wikipedia.org/wiki/Filename
const WINDOWS_INVALID_FILE_CHARS = /[\\/:*?"<>|]/g;
const UNIX_INVALID_FILE_CHARS = /[\\/]/g;
const WINDOWS_FORBIDDEN_NAMES = /^(con|prn|aux|clock\$|nul|lpt[0-9]|com[0-9])(\.(.*?))?$/i;

export function makeValidator(
    existingFileNames: Set<string> = new Set<string>()
): (name: string | null | undefined) => string | undefined {
    const invalidFileChars = IS_WINDOWS ? WINDOWS_INVALID_FILE_CHARS : UNIX_INVALID_FILE_CHARS;
    return (name: string | null | undefined): string | undefined => {
        if (!name || name.length === 0 || /^\s+$/.test(name)) {
            return vscode.l10n.t('There are only whitespace characters in the name.');
        }

        invalidFileChars.lastIndex = 0; // the holy grail of software development
        if (invalidFileChars.test(name)) {
            return vscode.l10n.t('The name contains invalid characters.');
        }

        if (IS_WINDOWS && WINDOWS_FORBIDDEN_NAMES.test(name)) {
            return vscode.l10n.t('Invalid file name on Windows.');
        }

        if (name === '.' || name === '..') {
            return vscode.l10n.t('Reserved file name.');
        }

        if (IS_WINDOWS && name.endsWith('.')) {
            return vscode.l10n.t('The name cannot end with a "." on Windows.');
        }

        if (IS_WINDOWS && name.length !== name.trimEnd().length) {
            return vscode.l10n.t('The name cannot end with a whitespace on Windows.');
        }

        if (name.length > 255) {
            return vscode.l10n.t('The name is too long.');
        }

        if (existingFileNames.has(name)) {
            return vscode.l10n.t('{0} already exists.', name);
        }

        if (/^\s|\s$/.test(name)) {
            return vscode.l10n.t('Leading or trailing whitespace detected in file or folder name.');
        }
        return undefined;
    };
}
