const path = require('path');
const vscode = require('vscode');

function getWorkspaceRoot() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
}

function resolvePath(filePath) {
  if (path.isAbsolute(filePath)) return filePath;
  const root = getWorkspaceRoot();
  return root ? path.join(root, filePath) : filePath;
}

function relativePath(absPath) {
  const root = getWorkspaceRoot();
  if (root && absPath.startsWith(root)) {
    return path.relative(root, absPath);
  }
  return absPath;
}

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function truncate(text, maxLen, suffix = '\n[truncated]') {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - suffix.length) + suffix;
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

module.exports = { getWorkspaceRoot, resolvePath, relativePath, debounce, truncate, getNonce };
