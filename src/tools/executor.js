const fileOps = require('./file-ops');
const search = require('./search');
const terminal = require('./terminal');
const logger = require('../utils/logger');

const TOOL_MAP = {
  readFile: fileOps.readFile,
  writeFile: fileOps.writeFile,
  editFile: fileOps.editFile,
  createFile: fileOps.createFile,
  deleteFile: fileOps.deleteFile,
  searchFiles: search.searchFiles,
  listFiles: search.listFiles,
  runCommand: terminal.runCommand,
};

/**
 * Execute a tool call and return the result as a string.
 */
async function executeTool(name, args) {
  const fn = TOOL_MAP[name];
  if (!fn) {
    logger.warn(`Unknown tool: ${name}`);
    return JSON.stringify({ success: false, error: `Unknown tool: ${name}` });
  }

  try {
    logger.info(`Executing tool: ${name}(${JSON.stringify(args).slice(0, 200)})`);
    const result = await fn(args);
    return JSON.stringify(result);
  } catch (err) {
    logger.error(`Tool execution error: ${name}`, err);
    return JSON.stringify({ success: false, error: err.message });
  }
}

module.exports = { executeTool };
