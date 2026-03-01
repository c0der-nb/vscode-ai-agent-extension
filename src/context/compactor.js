const { countTokens, countMessageTokens } = require('./tokenizer');
const logger = require('../utils/logger');

const SUMMARY_PROMPT = `Summarize the conversation so far into a concise paragraph. 
Preserve: key decisions, file paths mentioned, code changes made, current task context, and any errors encountered.
Omit: redundant details, repeated content, verbose tool outputs.
Be factual and specific. Keep under 500 tokens.`;

/**
 * Compact conversation history to fit within token budget.
 * Strategy: keep system prompt + last N turns verbatim, summarize older turns.
 */
async function compactConversation(messages, maxTokens, provider) {
  const current = countMessageTokens(messages);
  if (current <= maxTokens) return messages;

  logger.info(`Compacting: ${current} tokens -> target ${maxTokens}`);

  const systemMsgs = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');

  const groups = groupToolBoundaries(nonSystem);
  const keepGroups = findKeepGroups(groups, maxTokens, systemMsgs);

  const kept = [];
  for (let i = groups.length - keepGroups; i < groups.length; i++) {
    kept.push(...groups[i]);
  }

  if (kept.length >= nonSystem.length) return messages;

  const toSummarize = [];
  for (let i = 0; i < groups.length - keepGroups; i++) {
    toSummarize.push(...groups[i]);
  }

  const summaryText = await generateSummary(toSummarize, provider);

  const compacted = [
    ...systemMsgs,
    {
      role: 'system',
      content: `[Conversation Summary]\n${summaryText}`,
    },
    ...kept,
  ];

  logger.info(`Compacted to ${countMessageTokens(compacted)} tokens (kept ${kept.length} recent messages in ${keepGroups} groups)`);
  return compacted;
}

/**
 * Group messages into atomic units that must not be split.
 * An assistant message with tool_calls and its following tool result messages
 * form one indivisible group. Other messages are individual groups.
 */
function groupToolBoundaries(messages) {
  const groups = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const group = [msg];
      i++;
      while (i < messages.length && messages[i].role === 'tool') {
        group.push(messages[i]);
        i++;
      }
      groups.push(group);
    } else {
      groups.push([msg]);
      i++;
    }
  }

  return groups;
}

function findKeepGroups(groups, budget, systemMsgs) {
  const systemTokens = countMessageTokens(systemMsgs);
  const summaryOverhead = 600;
  const available = budget - systemTokens - summaryOverhead;

  let keep = 0;
  let tokens = 0;

  for (let i = groups.length - 1; i >= 0; i--) {
    const groupTokens = countMessageTokens(groups[i]);
    if (tokens + groupTokens > available) break;
    tokens += groupTokens;
    keep++;
  }

  return Math.max(keep, 1);
}

async function generateSummary(messages, provider) {
  if (!provider) {
    return buildFallbackSummary(messages);
  }

  try {
    const summaryMessages = [
      { role: 'system', content: SUMMARY_PROMPT },
      {
        role: 'user',
        content: messages.map(m => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n'),
      },
    ];

    let text = '';
    for await (const chunk of provider.streamChat(summaryMessages, [], { maxTokens: 600 })) {
      if (chunk.type === 'text') text += chunk.content;
    }
    return text || buildFallbackSummary(messages);
  } catch (err) {
    logger.warn(`LLM summary failed, using fallback: ${err.message}`);
    return buildFallbackSummary(messages);
  }
}

function buildFallbackSummary(messages) {
  const lines = [];
  for (const m of messages) {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    const preview = content.length > 200 ? content.slice(0, 200) + '...' : content;
    lines.push(`[${m.role}]: ${preview}`);
  }
  return lines.join('\n');
}

/**
 * Truncate file content to relevant sections.
 * Files over maxLines get reduced to function/class signatures.
 */
function compactFileContent(content, maxLines = 500) {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;

  const signaturePattern = /^(export\s+)?(function|class|const|let|var|interface|type|enum|module|def |async )/;
  const signatures = [];

  for (let i = 0; i < lines.length; i++) {
    if (signaturePattern.test(lines[i].trim())) {
      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length - 1, i + 2);
      signatures.push(`L${i + 1}: ${lines.slice(start, end + 1).join('\n')}`);
    }
  }

  return `[File truncated: ${lines.length} lines -> showing ${signatures.length} signatures]\n\n${signatures.join('\n\n')}`;
}

/**
 * Truncate tool output (terminal, search results).
 */
function compactToolResult(result, maxChars = 2000) {
  if (!result || result.length <= maxChars) return result;
  const totalLines = result.split('\n').length;
  const truncated = result.slice(0, maxChars);
  const keptLines = truncated.split('\n').length;
  return `${truncated}\n[truncated: showing ${keptLines} of ${totalLines} lines]`;
}

module.exports = { compactConversation, compactFileContent, compactToolResult };
