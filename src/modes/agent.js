const { getToolsForMode } = require('../tools/definitions');
const { executeTool } = require('../tools/executor');
const logger = require('../utils/logger');

const SYSTEM_PROMPT = `You are an expert AI coding agent running inside VS Code. You have full access to the user's workspace.

CAPABILITIES:
- Read, create, edit, and delete files
- Search code with regex patterns
- List files with glob patterns
- Run shell commands in the terminal

RULES:
- Always read a file before editing it
- Use editFile for surgical changes (search & replace), writeFile for full rewrites
- Explain what you're doing before making changes
- If a command might be destructive, confirm with the user first
- Keep your responses concise and focused on the task`;

const MAX_TOOL_ROUNDS = 25;

/**
 * Run the agent mode tool-call loop.
 * @param {string} userMessage
 * @param {import('../context/manager')} contextManager
 * @param {import('../providers/base')} provider
 * @param {function} onText - callback for streaming text chunks
 * @param {function} onToolCall - callback when a tool is called
 * @param {function} onDone - callback when agent finishes
 * @param {AbortSignal} signal
 */
async function runAgent(userMessage, contextManager, provider, { onText, onToolCall, onToolCallDone, onDone, signal }) {
  const tools = getToolsForMode('agent');

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
    onText('\n\n*Reached maximum tool call rounds. Summarizing...*\n\n');
    contextManager.addUserMessage('You have reached the maximum number of tool call rounds. Please summarize what you have accomplished so far and what remains to be done. Do not make any more tool calls.');
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

module.exports = { runAgent, SYSTEM_PROMPT };
