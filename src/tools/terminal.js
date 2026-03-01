const { exec } = require('child_process');
const { resolvePath, getWorkspaceRoot } = require('../utils/helpers');
const { compactToolResult } = require('../context/compactor');
const logger = require('../utils/logger');

const TIMEOUT_MS = 30000;
const MAX_OUTPUT = 4000;

function runCommand({ command, cwd }) {
  return new Promise((resolve) => {
    const workDir = cwd ? resolvePath(cwd) : getWorkspaceRoot() || process.cwd();

    logger.info(`runCommand: ${command} (cwd: ${workDir})`);

    const proc = exec(command, {
      cwd: workDir,
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: '0' },
    }, (error, stdout, stderr) => {
      const output = [];
      if (stdout) output.push(stdout);
      if (stderr) output.push(`[stderr]\n${stderr}`);
      if (error && error.killed) {
        output.push(`[timeout after ${TIMEOUT_MS}ms]`);
      } else if (error && !stderr) {
        output.push(`[error] ${error.message}`);
      }

      const raw = output.join('\n') || '(no output)';
      const compacted = compactToolResult(raw, MAX_OUTPUT);

      resolve({
        success: !error || error.code === 0,
        exitCode: error ? error.code || 1 : 0,
        output: compacted,
      });
    });
  });
}

module.exports = { runCommand };
