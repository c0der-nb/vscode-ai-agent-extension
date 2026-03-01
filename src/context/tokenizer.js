const logger = require('../utils/logger');

let _encoder = null;

function getEncoder() {
  if (!_encoder) {
    try {
      const { encodingForModel } = require('js-tiktoken');
      _encoder = encodingForModel('gpt-4o');
    } catch {
      const { getEncoding } = require('js-tiktoken');
      _encoder = getEncoding('cl100k_base');
    }
  }
  return _encoder;
}

function countTokens(text) {
  if (!text) return 0;
  try {
    return getEncoder().encode(text).length;
  } catch (err) {
    logger.warn(`Token counting fallback (char/4): ${err.message}`);
    return Math.ceil(text.length / 4);
  }
}

function countMessageTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    total += 4; // per-message overhead
    if (typeof msg.content === 'string') {
      total += countTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.text) total += countTokens(part.text);
        else total += countTokens(JSON.stringify(part));
      }
    }
    if (msg.role) total += countTokens(msg.role);
    if (msg.tool_calls) {
      total += countTokens(JSON.stringify(msg.tool_calls));
    }
  }
  total += 2; // reply priming
  return total;
}

function countToolTokens(tools) {
  if (!tools || tools.length === 0) return 0;
  return countTokens(JSON.stringify(tools));
}

module.exports = { countTokens, countMessageTokens, countToolTokens };
