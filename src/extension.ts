import * as vscode from 'vscode';
import { QuarkdownLanguageClient } from './client';
import { QuarkdownPreviewManager } from './previewManager';

let client: QuarkdownLanguageClient;

export function activate(context: vscode.ExtensionContext): void {
    client = new QuarkdownLanguageClient();
    client.start(context);

    vscode.languages.setLanguageConfiguration('quarkdown', {
        wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('quarkdown.insertTemplate', insertTemplate),
        vscode.commands.registerCommand('quarkdown.startPreview', startPreview),
        vscode.commands.registerCommand('quarkdown.stopPreview', stopPreview),
        vscode.commands.registerCommand('quarkdown.restartLanguageServer', () => restart(context))
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            const mgr = QuarkdownPreviewManager.getInstance();
            if (document.fileName === mgr.getCurrentPreviewFile()) {
                mgr.stopPreview();
            }
        })
    );
}

function insertTemplate(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('Please open a file first.');
        return;
    }

    editor.insertSnippet(new vscode.SnippetString('# Retrieve this from LSP\n'));
}

async function startPreview(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.fileName.endsWith('.qd')) {
        vscode.window.showWarningMessage('Please open a Quarkdown (.qd) file first.');
        return;
    }

    if (editor.document.isDirty && !(await editor.document.save())) {
        vscode.window.showErrorMessage('Please save the file before starting preview.');
        return;
    }

    QuarkdownPreviewManager.getInstance().startPreview(editor.document.fileName);
}

async function stopPreview(): Promise<void> {
    const previewManager = QuarkdownPreviewManager.getInstance();
    if (previewManager.isPreviewRunning()) {
        previewManager.stopPreview();
        vscode.window.showInformationMessage('Live preview stopped.');
    } else {
        vscode.window.showInformationMessage('No preview is currently running.');
    }
}

async function restart(context: vscode.ExtensionContext): Promise<void> {
    try {
        if (client) await client.stop();
        client = new QuarkdownLanguageClient();
        await client.start(context);
        vscode.window.showInformationMessage('Quarkdown Language Server restarted successfully.');
    } catch {
        vscode.window.showErrorMessage('Failed to restart Language Server.');
    }
}

export async function deactivate(): Promise<void> {
    await QuarkdownPreviewManager.getInstance().stopPreview();
    return client.stop();
}
