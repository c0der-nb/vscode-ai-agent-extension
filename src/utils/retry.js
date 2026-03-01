const logger = require('./logger');

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 10000;
const MAX_DELAY_MS = 60000;

function isRateLimitError(err) {
  if (err.status === 429) return true;
  if (err.code === 429) return true;
  if (err.type === 'rate_limit_error') return true;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests');
}

function getRetryDelay(err, attempt) {
  const retryAfter = err.headers?.['retry-after']
    || err.headers?.get?.('retry-after')
    || err.error?.retry_after;

  if (retryAfter) {
    const seconds = parseFloat(retryAfter);
    if (!isNaN(seconds)) {
      return Math.min(seconds * 1000, MAX_DELAY_MS);
    }
  }

  return Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { MAX_RETRIES, isRateLimitError, getRetryDelay, sleep };
