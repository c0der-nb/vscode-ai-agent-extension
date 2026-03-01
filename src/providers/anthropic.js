const BaseProvider = require('./base');
const logger = require('../utils/logger');

class AnthropicProvider extends BaseProvider {
  constructor(apiKey, model = 'claude-sonnet-4-20250514') {
    super({ apiKey, model });
    const Anthropic = require('@anthropic-ai/sdk');
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  getModelInfo() {
    return { name: this.model, provider: 'anthropic', maxTokens: 200000 };
  }

  normalizeMessages(messages) {
    const systemParts = [];
    const conversation = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
      } else if (msg.role === 'tool') {
        const toolResult = {
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        };
        const last = conversation[conversation.length - 1];
        if (last && last.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
          last.content.push(toolResult);
        } else {
          conversation.push({ role: 'user', content: [toolResult] });
        }
      } else if (msg.role === 'assistant' && msg.tool_calls) {
        const content = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments,
          });
        }
        conversation.push({ role: 'assistant', content });
      } else {
        conversation.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    return { system: systemParts.join('\n\n'), messages: conversation };
  }

  normalizeTools(tools) {
    if (!tools || tools.length === 0) return [];
    return tools.map(t => {
      const fn = t.function || t;
      return {
        name: fn.name,
        description: fn.description || '',
        input_schema: fn.parameters || { type: 'object', properties: {} },
      };
    });
  }

  async *streamChat(messages, tools, options = {}) {
    const { MAX_RETRIES, isRateLimitError, getRetryDelay, sleep } = require('../utils/retry');
    const { system, messages: normalized } = this.normalizeMessages(messages);
    const anthropicTools = this.normalizeTools(tools);

    const params = {
      model: this.model,
      max_tokens: options.maxTokens || 8192,
      system: system || undefined,
      messages: normalized,
      ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
    };

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const stream = this.client.messages.stream(params);

        let currentToolUse = null;
        let toolArgBuffer = '';

        for await (const event of stream) {
          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'tool_use') {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
              };
              toolArgBuffer = '';
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              yield { type: 'text', content: event.delta.text };
            } else if (event.delta.type === 'input_json_delta') {
              toolArgBuffer += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop') {
            if (currentToolUse) {
              let args = {};
              try { args = JSON.parse(toolArgBuffer); } catch { /* malformed */ }
              yield {
                type: 'tool_call',
                content: { id: currentToolUse.id, name: currentToolUse.name, arguments: args },
              };
              currentToolUse = null;
              toolArgBuffer = '';
            }
          }
        }

        yield { type: 'done', content: null };
        return;
      } catch (err) {
        if (isRateLimitError(err) && attempt < MAX_RETRIES - 1) {
          const waitMs = getRetryDelay(err, attempt);
          logger.warn(`Anthropic rate limit hit (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${Math.ceil(waitMs / 1000)}s`);
          yield { type: 'retry', content: null };
          yield { type: 'text', content: `\n\n*Rate limit reached. Waiting ${Math.ceil(waitMs / 1000)}s before retrying (attempt ${attempt + 2}/${MAX_RETRIES})...*\n\n` };
          await sleep(waitMs);
          continue;
        }
        logger.error('Anthropic streaming error', err);
        yield { type: 'error', content: err.message };
        return;
      }
    }
  }
}

module.exports = AnthropicProvider;
