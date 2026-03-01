/**
 * Abstract base class for LLM providers.
 * Every provider must implement streamChat and getModelInfo.
 */
class BaseProvider {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Stream a chat completion.
   * @param {Array} messages - Array of {role, content} or tool-result messages
   * @param {Array} tools - Tool definitions in OpenAI-compatible format
   * @param {object} options - Extra options (temperature, maxTokens, etc.)
   * @yields {{ type: 'text'|'tool_call'|'error'|'done', content: any }}
   */
  async *streamChat(_messages, _tools, _options) {
    throw new Error('streamChat() must be implemented by subclass');
  }

  /**
   * @returns {{ name: string, provider: string, maxTokens: number }}
   */
  getModelInfo() {
    throw new Error('getModelInfo() must be implemented by subclass');
  }

  /**
   * Normalize messages from internal format to the provider's expected format.
   * Default implementation returns messages as-is (OpenAI-compatible).
   */
  normalizeMessages(messages) {
    return messages;
  }

  /**
   * Normalize tool definitions from OpenAI format to provider-specific format.
   * Default passes through.
   */
  normalizeTools(tools) {
    return tools;
  }
}

module.exports = BaseProvider;
