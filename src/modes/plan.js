const { getToolsForMode } = require('../tools/definitions');
const { executeTool } = require('../tools/executor');
const logger = require('../utils/logger');

const SYSTEM_PROMPT = `You are an AI planning assistant inside VS Code. You help users plan code changes without executing them.

CAPABILITIES:
- Read files to understand the codebase
- Search for code patterns
- List workspace files

RULES:
- You MUST NOT make any changes to files or run commands
- Analyze the codebase and produce a clear, actionable plan
- Structure your plan with numbered steps
- Reference specific file paths and line numbers
- Identify potential risks or trade-offs
- Keep the plan concise and specific`;

const MAX_TOOL_ROUNDS = 15;

async function runPlan(userMessage, contextManager, provider, { onText, onToolCall, onToolCallDone, onDone, signal }) {
  const tools = getToolsForMode('plan');

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

      if (chunk.type === 'text') {
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
      if (onToolCallDone) onToolCallDone(tc.name);
      contextManager.addToolResult(tc.id, result);
    }
  }

  if (rounds >= MAX_TOOL_ROUNDS) {
    onText('\n\n*Reached maximum research rounds. Presenting plan with gathered information.*');
  }
  onDone();
}

module.exports = { runPlan, SYSTEM_PROMPT };
