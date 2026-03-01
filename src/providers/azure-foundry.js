const BaseProvider = require('./base');
const logger = require('../utils/logger');

class AzureFoundryProvider extends BaseProvider {
  constructor(apiKey, endpoint, model = 'default') {
    super({ apiKey, endpoint, model });
    const OpenAI = require('openai');
    this.client = new OpenAI({
      apiKey,
      baseURL: `${endpoint.replace(/\/+$/, '')}/v1`,
    });
    this.model = model;
  }

  getModelInfo() {
    return { name: this.model, provider: 'azureFoundry', maxTokens: 128000 };
  }

  async *streamChat(messages, tools, options = {}) {
    try {
      const params = {
        model: this.model,
        messages,
        stream: true,
        ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      };

      const stream = await this.client.chat.completions.create(params);

      let currentToolCalls = {};

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          yield { type: 'text', content: delta.content };
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!currentToolCalls[idx]) {
              currentToolCalls[idx] = { id: tc.id || '', name: '', arguments: '' };
            }
            if (tc.id) currentToolCalls[idx].id = tc.id;
            if (tc.function?.name) currentToolCalls[idx].name = tc.function.name;
            if (tc.function?.arguments) currentToolCalls[idx].arguments += tc.function.arguments;
          }
        }

        if (chunk.choices[0]?.finish_reason === 'tool_calls' || chunk.choices[0]?.finish_reason === 'stop') {
          for (const idx of Object.keys(currentToolCalls).sort((a, b) => a - b)) {
            const tc = currentToolCalls[idx];
            let args = {};
            try { args = JSON.parse(tc.arguments); } catch { /* malformed args */ }
            yield {
              type: 'tool_call',
              content: { id: tc.id, name: tc.name, arguments: args },
            };
          }
          currentToolCalls = {};
        }
      }

      yield { type: 'done', content: null };
    } catch (err) {
      logger.error('Azure Foundry streaming error', err);
      yield { type: 'error', content: err.message };
    }
  }
}

module.exports = AzureFoundryProvider;
