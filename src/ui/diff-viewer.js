const vscode = require('vscode');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Show a diff between the original content and proposed new content.
 * Uses VS Code's built-in diff editor.
 */
async function showDiff(filePath, originalContent, newContent) {
  try {
    const fileName = path.basename(filePath);

    const originalUri = vscode.Uri.parse(`ai-agent-original:${filePath}`);
    const modifiedUri = vscode.Uri.parse(`ai-agent-modified:${filePath}`);

    const provider = new DiffContentProvider();
    provider.set(originalUri.toString(), originalContent);
    provider.set(modifiedUri.toString(), newContent);

    const disposable1 = vscode.workspace.registerTextDocumentContentProvider('ai-agent-original', provider);
    const disposable2 = vscode.workspace.registerTextDocumentContentProvider('ai-agent-modified', provider);

    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      modifiedUri,
      `${fileName} (Proposed Changes)`,
      { preview: true }
    );

    setTimeout(() => {
      disposable1.dispose();
      disposable2.dispose();
    }, 60000);
  } catch (err) {
    logger.error('Failed to show diff', err);
  }
}

class DiffContentProvider {
  constructor() {
    this._contents = new Map();
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;
  }

  set(uri, content) {
    this._contents.set(uri, content);
  }

  provideTextDocumentContent(uri) {
    return this._contents.get(uri.toString()) || '';
  }
}

module.exports = { showDiff };
