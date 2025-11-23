/*---------------------------------------------------------------------------------------------
 *  Original work: Copyright (c) Microsoft Corporation. All rights reserved.
 *  Modified work: Copyright (c) 2023-2025 TAKASE Arihiro - enhancements and new features.
 *
 *  This code is licensed under the MIT License.
 *  See LICENSE file in the project root for complete license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { IS_WINDOWS, normalizePath } from './utils';

// Reference: https://en.wikipedia.org/wiki/Filename
const WINDOWS_INVALID_FILE_CHARS = /[\\/:*?"<>|]/;
const UNIX_INVALID_FILE_CHARS = /[\\/]/;
const WINDOWS_FORBIDDEN_NAMES = /^(con|prn|aux|clock\$|nul|lpt[0-9]|com[0-9])(\.(.*?))?$/i;

export function makeValidator(
    existingFileNames: Set<string> = new Set<string>(),
    originalName?: string
): (name: string) => string | undefined {
    return (name: string): string | undefined => {
        if (!name || name !== name.trim()) {
            return vscode.l10n.t('File name cannot be empty or contain leading/trailing whitespace.');
        }

        if (name === '.' || name === '..') {
            return vscode.l10n.t('File names "." and ".." are reserved by the system and cannot be used.');
        }

        if (name.length > 255) {
            return vscode.l10n.t(
                'File name is too long ({0} characters). Maximum allowed is 255 characters.',
                name.length
            );
        }

        if (IS_WINDOWS) {
            if (WINDOWS_INVALID_FILE_CHARS.test(name)) {
                const invalidChars = '\\, /, :, *, ?, ", <, >, |';
                return vscode.l10n.t('File name contains invalid characters ({0}) on Windows.', invalidChars);
            }

            if (WINDOWS_FORBIDDEN_NAMES.test(name)) {
                return vscode.l10n.t(
                    'File name is reserved by Windows (CON, PRN, AUX, etc.). Please choose a different name.'
                );
            }

            if (name.endsWith('.')) {
                return vscode.l10n.t('File name cannot end with a "." on Windows.');
            }
        } else {
            if (UNIX_INVALID_FILE_CHARS.test(name)) {
                return vscode.l10n.t('File name cannot contain "/" or "\\" characters on Unix-based systems.');
            }
        }

        let nameAlreadyExists = existingFileNames.has(normalizePath(name));
        if (originalName) {
            nameAlreadyExists &&= normalizePath(name) !== normalizePath(originalName);
        }

        if (nameAlreadyExists) {
            return vscode.l10n.t(
                'A file or folder named "{0}" already exists in this location. Please choose a different name.',
                name
            );
        }

        return undefined;
    };
}
