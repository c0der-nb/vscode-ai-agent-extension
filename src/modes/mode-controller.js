const { runAgent } = require('./agent');
const { runPlan } = require('./plan');
const { runAsk } = require('./ask');
const config = require('../utils/config');
const logger = require('../utils/logger');

const MODES = {
  agent: { label: 'Agent', description: 'Full access — reads, edits, creates, deletes files and runs commands', run: runAgent },
  plan: { label: 'Plan', description: 'Read-only — analyzes code and produces an actionable plan', run: runPlan },
  ask: { label: 'Ask', description: 'Read-only — answers questions about code and programming', run: runAsk },
};

class ModeController {
  constructor() {
    this._mode = config.getDefaultMode();
    this._abortController = null;
    this._onModeChange = [];
  }

  getMode() {
    return this._mode;
  }

  getModeInfo() {
    return MODES[this._mode] || MODES.agent;
  }

  setMode(mode) {
    if (!MODES[mode]) {
      logger.warn(`Invalid mode: ${mode}`);
      return false;
    }
    this._mode = mode;
    for (const cb of this._onModeChange) cb(mode);
    logger.info(`Mode switched to: ${mode}`);
    return true;
  }

  onModeChange(callback) {
    this._onModeChange.push(callback);
  }

  abort() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  async run(userMessage, contextManager, provider, callbacks) {
    this.abort();
    this._abortController = new AbortController();

    const modeInfo = MODES[this._mode];
    if (!modeInfo) {
      callbacks.onText('Unknown mode. Please select Agent, Plan, or Ask.');
      callbacks.onDone();
      return;
    }

    try {
      await modeInfo.run(userMessage, contextManager, provider, {
        ...callbacks,
        signal: this._abortController.signal,
      });
    } catch (err) {
      logger.error(`Mode ${this._mode} error`, err);
      callbacks.onText(`\n\n**Error:** ${err.message}`);
      callbacks.onDone();
    } finally {
      this._abortController = null;
    }
  }

  static getModes() {
    return Object.entries(MODES).map(([id, info]) => ({
      id,
      label: info.label,
      description: info.description,
    }));
  }
}

module.exports = ModeController;
