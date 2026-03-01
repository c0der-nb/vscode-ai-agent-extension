const { getToolsForMode } = require('../tools/definitions');
const { executeTool } = require('../tools/executor');
const logger = require('../utils/logger');

const SYSTEM_PROMPT = `You are an AI coding assistant inside VS Code. You answer questions about the codebase and programming.

CAPABILITIES:
- Read files to understand code
- Search for code patterns
- List workspace files

RULES:
- You MUST NOT make any changes to files or run commands
- Provide clear, accurate answers with code examples when helpful
- Reference specific file paths and line numbers
- If you're unsure, say so rather than guessing`;

const MAX_TOOL_ROUNDS = 10;

async function runAsk(userMessage, contextManager, provider, { onText, onToolCall, onToolCallDone, onDone, signal }) {
  const tools = getToolsForMode('ask');

  const workspaceCtx = contextManager.getWorkspaceContext();
  contextManager.addSystemMessage(
    `${SYSTEM_PROMPT}\n\nWORKSPACE:\n${workspaceCtx}`
  );
  contextManager.addUserMessage(userMessage);

  let rounds = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    if (signal?.aborted) break;
    rounds++;

    await contextManager.ensureWithinBudget(tools);
    const messages = contextManager.getMessages();

    let textContent = '';
    const toolCalls = [];

    for await (const chunk of provider.streamChat(messages, tools)) {
      if (signal?.aborted) break;

      if (chunk.type === 'retry') {
        textContent = '';
        toolCalls.length = 0;
        continue;
      } else if (chunk.type === 'text') {
        textContent += chunk.content;
        onText(chunk.content);
      } else if (chunk.type === 'tool_call') {
        toolCalls.push(chunk.content);
      } else if (chunk.type === 'error') {
        const msg = (chunk.content || '').toLowerCase();
        if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
          onText(`\n\n*Rate limit error. Will retry this round...*\n\n`);
          textContent = '';
          toolCalls.length = 0;
          break;
        }
        onText(`\n\n**Error:** ${chunk.content}`);
        onDone();
        return;
      }
    }

    if (toolCalls.length === 0) {
      contextManager.addAssistantMessage(textContent);
      onDone();
      return;
    }

    contextManager.addAssistantMessage(textContent, toolCalls);

    for (const tc of toolCalls) {
      if (signal?.aborted) break;
      onToolCall(tc.name, tc.arguments);
      const result = await executeTool(tc.name, tc.arguments);
      contextManager.addToolResult(tc.id, result);
      if (onToolCallDone) onToolCallDone(tc.name);
    }
  }

  if (rounds >= MAX_TOOL_ROUNDS) {
    onText('\n\n*Reached maximum research rounds. Generating answer...*\n\n');
    contextManager.addUserMessage('You have reached the maximum number of research rounds. Based on everything you have gathered so far, please provide your complete answer now. Do not make any more tool calls.');
    await contextManager.ensureWithinBudget([]);
    const finalMessages = contextManager.getMessages();

    for await (const chunk of provider.streamChat(finalMessages, [])) {
      if (signal?.aborted) break;
      if (chunk.type === 'text') {
        onText(chunk.content);
      }
    }
  }
  onDone();
}

module.exports = { runAsk, SYSTEM_PROMPT };
