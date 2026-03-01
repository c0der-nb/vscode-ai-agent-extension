const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { resolvePath, relativePath } = require('../utils/helpers');
const { compactFileContent } = require('../context/compactor');
const logger = require('../utils/logger');

async function readFile({ path: filePath, startLine, endLine }) {
  try {
    const absPath = resolvePath(filePath);
    const content = fs.readFileSync(absPath, 'utf-8');
    const lines = content.split('\n');

    let result;
    if (startLine || endLine) {
      const start = Math.max(1, startLine || 1) - 1;
      const end = Math.min(lines.length, endLine || lines.length);
      const slice = lines.slice(start, end);
      result = slice.map((line, i) => `${start + i + 1}|${line}`).join('\n');
    } else {
      result = compactFileContent(content);
    }

    return { success: true, content: result, path: relativePath(absPath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function writeFile({ path: filePath, content }) {
  try {
    const absPath = resolvePath(filePath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const existed = fs.existsSync(absPath);
    let oldContent = '';
    if (existed) {
      oldContent = fs.readFileSync(absPath, 'utf-8');
    }

    fs.writeFileSync(absPath, content, 'utf-8');

    const doc = await vscode.workspace.openTextDocument(absPath);
    await vscode.window.showTextDocument(doc, { preview: true });

    logger.info(`writeFile: ${relativePath(absPath)} (${existed ? 'overwritten' : 'created'})`);
    return {
      success: true,
      path: relativePath(absPath),
      action: existed ? 'overwritten' : 'created',
      oldContent: existed ? oldContent.slice(0, 500) : undefined,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function editFile({ path: filePath, oldText, newText }) {
  try {
    const absPath = resolvePath(filePath);
    const content = fs.readFileSync(absPath, 'utf-8');

    if (!content.includes(oldText)) {
      return { success: false, error: 'oldText not found in file. Make sure it matches exactly.' };
    }

    const newContent = content.replace(oldText, newText);
    fs.writeFileSync(absPath, newContent, 'utf-8');

    const doc = await vscode.workspace.openTextDocument(absPath);
    await vscode.window.showTextDocument(doc, { preview: true });

    logger.info(`editFile: ${relativePath(absPath)}`);
    return { success: true, path: relativePath(absPath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function createFile({ path: filePath, content }) {
  try {
    const absPath = resolvePath(filePath);
    if (fs.existsSync(absPath)) {
      return { success: false, error: 'File already exists. Use writeFile to overwrite or editFile to modify.' };
    }

    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(absPath, content, 'utf-8');

    const doc = await vscode.workspace.openTextDocument(absPath);
    await vscode.window.showTextDocument(doc, { preview: true });

    logger.info(`createFile: ${relativePath(absPath)}`);
    return { success: true, path: relativePath(absPath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteFile({ path: filePath }) {
  try {
    const absPath = resolvePath(filePath);
    if (!fs.existsSync(absPath)) {
      return { success: false, error: 'File does not exist.' };
    }

    fs.unlinkSync(absPath);
    logger.info(`deleteFile: ${relativePath(absPath)}`);
    return { success: true, path: relativePath(absPath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { readFile, writeFile, editFile, createFile, deleteFile };
