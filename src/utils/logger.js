const vscode = require('vscode');

let outputChannel = null;

function getChannel() {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('AI Agent');
  }
  return outputChannel;
}

function info(message) {
  getChannel().appendLine(`[INFO] ${new Date().toISOString()} ${message}`);
}

function warn(message) {
  getChannel().appendLine(`[WARN] ${new Date().toISOString()} ${message}`);
}

function error(message, err) {
  const line = err ? `${message}: ${err.message || err}` : message;
  getChannel().appendLine(`[ERROR] ${new Date().toISOString()} ${line}`);
}

function show() {
  getChannel().show(true);
}

function dispose() {
  if (outputChannel) {
    outputChannel.dispose();
    outputChannel = null;
  }
}

module.exports = { info, warn, error, show, dispose };
