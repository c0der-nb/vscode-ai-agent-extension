const vscode = require('vscode');
const path = require('path');
const logger = require('../utils/logger');
const { getWorkspaceRoot } = require('../utils/helpers');

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.vscode', 'dist', 'build', 'out',
  '__pycache__', '.next', '.nuxt', 'coverage', '.cache',
]);

const CODE_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift',
  '.kt', '.scala', '.vue', '.svelte', '.html', '.css', '.scss',
  '.json', '.yaml', '.yml', '.toml', '.md', '.sql', '.sh',
]);

class FileIndexer {
  constructor() {
    this._index = new Map();
    this._ready = false;
  }

  async buildIndex() {
    const root = getWorkspaceRoot();
    if (!root) return;

    try {
      const pattern = new vscode.RelativePattern(root, '**/*');
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 5000);

      this._index.clear();
      for (const uri of files) {
        const rel = path.relative(root, uri.fsPath);
        const parts = rel.split(path.sep);
        if (parts.some(p => IGNORE_DIRS.has(p))) continue;

        const ext = path.extname(uri.fsPath).toLowerCase();
        if (!CODE_EXTENSIONS.has(ext) && ext !== '') continue;

        this._index.set(rel, { uri, ext });
      }

      this._ready = true;
      logger.info(`File index built: ${this._index.size} files`);
    } catch (err) {
      logger.error('Failed to build file index', err);
    }
  }

  getFileList() {
    return Array.from(this._index.keys()).sort();
  }

  getFileTree() {
    const tree = {};
    for (const rel of this._index.keys()) {
      const parts = rel.split(path.sep);
      let node = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!node[parts[i]]) node[parts[i]] = {};
        node = node[parts[i]];
      }
      node[parts[parts.length - 1]] = null;
    }
    return formatTree(tree, '');
  }

  isReady() {
    return this._ready;
  }

  hasFile(relPath) {
    return this._index.has(relPath);
  }
}

function formatTree(node, prefix) {
  const lines = [];
  const entries = Object.entries(node).sort(([a], [b]) => {
    const aDir = node[a] !== null;
    const bDir = node[b] !== null;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.localeCompare(b);
  });

  for (let i = 0; i < entries.length; i++) {
    const [name, child] = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    if (child === null) {
      lines.push(`${prefix}${connector}${name}`);
    } else {
      lines.push(`${prefix}${connector}${name}/`);
      lines.push(formatTree(child, prefix + childPrefix));
    }
  }

  return lines.join('\n');
}

module.exports = FileIndexer;
