const BaseProvider = require('./base');
const logger = require('../utils/logger');

class AzureOpenAIProvider extends BaseProvider {
  constructor(apiKey, endpoint, deploymentName, apiVersion = '2024-10-21', model = 'gpt-4o') {
    super({ apiKey, endpoint, deploymentName, apiVersion, model });
    const OpenAI = require('openai');
    this.client = new OpenAI({
      apiKey,
      baseURL: `${endpoint.replace(/\/+$/, '')}/openai/deployments/${deploymentName}`,
      defaultHeaders: { 'api-key': apiKey },
      defaultQuery: { 'api-version': apiVersion },
    });
    this.model = model;
    this.deploymentName = deploymentName;
  }

  getModelInfo() {
    return { name: this.model, provider: 'azure', maxTokens: 128000 };
  }

  async *streamChat(messages, tools, options = {}) {
    const { MAX_RETRIES, isRateLimitError, getRetryDelay, sleep } = require('../utils/retry');
    const params = {
      model: this.deploymentName,
      messages,
      stream: true,
      ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    };

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
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
        return;
      } catch (err) {
        if (isRateLimitError(err) && attempt < MAX_RETRIES - 1) {
          const waitMs = getRetryDelay(err, attempt);
          logger.warn(`Azure OpenAI rate limit hit (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${Math.ceil(waitMs / 1000)}s`);
          yield { type: 'text', content: `\n\n*Rate limit reached. Waiting ${Math.ceil(waitMs / 1000)}s before retrying (attempt ${attempt + 2}/${MAX_RETRIES})...*\n\n` };
          await sleep(waitMs);
          continue;
        }
        logger.error('Azure OpenAI streaming error', err);
        yield { type: 'error', content: err.message };
        return;
      }
    }
  }
}

module.exports = AzureOpenAIProvider;
