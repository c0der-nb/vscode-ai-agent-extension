const config = require('../utils/config');
const logger = require('../utils/logger');
const { countMessageTokens, countToolTokens } = require('./tokenizer');
const { compactConversation, compactToolResult, compactFileContent } = require('./compactor');
const FileIndexer = require('./file-indexer');

class ContextManager {
  constructor() {
    this.messages = [];
    this.fileIndexer = new FileIndexer();
    this._provider = null;
  }

  setProvider(provider) {
    this._provider = provider;
  }

  async init() {
    await this.fileIndexer.buildIndex();
  }

  clear() {
    this.messages = [];
  }

  getMessages() {
    return this.messages;
  }

  addSystemMessage(content) {
    const existing = this.messages.findIndex(m => m.role === 'system' && !m.content.startsWith('[Conversation Summary]'));
    if (existing >= 0) {
      this.messages[existing].content = content;
    } else {
      this.messages.unshift({ role: 'system', content });
    }
  }

  addUserMessage(content) {
    this.messages.push({ role: 'user', content });
  }

  addAssistantMessage(content, toolCalls = null) {
    const msg = { role: 'assistant', content: content || '' };
    if (toolCalls && toolCalls.length > 0) {
      msg.tool_calls = toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
        },
      }));
    }
    this.messages.push(msg);
  }

  addToolResult(toolCallId, result) {
    const compacted = compactToolResult(result, 2000);
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content: compacted,
    });
  }

  getCurrentTokenCount(tools = []) {
    const msgTokens = countMessageTokens(this.messages);
    const toolTokens = countToolTokens(tools);
    return msgTokens + toolTokens;
  }

  async ensureWithinBudget(tools = []) {
    const maxTokens = config.getMaxContextTokens();
    const threshold = config.getCompactionThreshold();
    const budget = Math.floor(maxTokens * threshold);
    const toolTokens = countToolTokens(tools);
    const messageBudget = budget - toolTokens;

    const current = countMessageTokens(this.messages);
    if (current > messageBudget) {
      logger.info(`Context at ${current}/${messageBudget} tokens — triggering compaction`);
      this.messages = await compactConversation(this.messages, messageBudget, this._provider);
    }
  }

  getWorkspaceContext() {
    if (!this.fileIndexer.isReady()) return '';
    const files = this.fileIndexer.getFileList();
    if (files.length === 0) return 'No workspace files indexed.';
    const tree = this.fileIndexer.getFileTree();
    return `Workspace structure:\n${tree}`;
  }

  processFileContent(content) {
    return compactFileContent(content);
  }
}

module.exports = ContextManager;
