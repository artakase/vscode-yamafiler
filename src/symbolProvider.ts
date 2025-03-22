import * as vscode from 'vscode';

export class YamafilerSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const pathDisplayRange = new vscode.Range(0, 0, 0, Math.max(document.lineAt(0).text.length - 2, 1));
        const fullDocumentRange = document.lineCount > 1
            ? new vscode.Range(0, 0, document.lineCount - 1, 0)
            : pathDisplayRange;

        return [
            new vscode.DocumentSymbol(
                document.getText(pathDisplayRange),
                '',
                vscode.SymbolKind.Module,
                fullDocumentRange,
                pathDisplayRange
            ),
        ];
    }
}
