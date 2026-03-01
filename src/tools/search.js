const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { getWorkspaceRoot, resolvePath, relativePath } = require('../utils/helpers');
const logger = require('../utils/logger');

const MAX_RESULTS = 50;

async function searchFiles({ pattern, glob: fileGlob, path: searchPath }) {
  try {
    const root = getWorkspaceRoot();
    if (!root) return { success: false, error: 'No workspace open' };

    const searchDir = searchPath ? resolvePath(searchPath) : root;
    const regex = new RegExp(pattern, 'gi');
    const includeGlob = fileGlob || '**/*';
    const relPattern = new vscode.RelativePattern(searchDir, includeGlob);
    const files = await vscode.workspace.findFiles(relPattern, '**/node_modules/**', 500);

    const results = [];

    for (const uri of files) {
      if (results.length >= MAX_RESULTS) break;

      try {
        const content = fs.readFileSync(uri.fsPath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push({
              file: relativePath(uri.fsPath),
              line: i + 1,
              content: lines[i].trim().slice(0, 200),
            });
            if (results.length >= MAX_RESULTS) break;
          }
          regex.lastIndex = 0;
        }
      } catch {
        // skip binary / unreadable files
      }
    }

    const formatted = results.map(r => `${r.file}:${r.line}: ${r.content}`).join('\n');
    return {
      success: true,
      count: results.length,
      results: formatted || 'No matches found.',
    };
  } catch (err) {
    logger.error('searchFiles error', err);
    return { success: false, error: err.message };
  }
}

async function listFiles({ glob: fileGlob, path: searchPath }) {
  try {
    const root = getWorkspaceRoot();
    if (!root) return { success: false, error: 'No workspace open' };

    const searchDir = searchPath ? resolvePath(searchPath) : root;
    const relPattern = new vscode.RelativePattern(searchDir, fileGlob || '**/*');
    const files = await vscode.workspace.findFiles(relPattern, '**/node_modules/**', 200);

    const list = files.map(f => relativePath(f.fsPath)).sort();
    return {
      success: true,
      count: list.length,
      files: list.join('\n'),
    };
  } catch (err) {
    logger.error('listFiles error', err);
    return { success: false, error: err.message };
  }
}

module.exports = { searchFiles, listFiles };
