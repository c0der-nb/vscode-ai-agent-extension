const BaseProvider = require('./base');
const logger = require('../utils/logger');

class AWSBedrockProvider extends BaseProvider {
  constructor(credentials, region = 'us-east-1', modelId = 'anthropic.claude-3-5-sonnet-20241022-v2:0') {
    super({ credentials, region, modelId });
    const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
    this.client = new BedrockRuntimeClient({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });
    this.modelId = modelId;
  }

  getModelInfo() {
    return { name: this.modelId, provider: 'bedrock', maxTokens: 200000 };
  }

  normalizeMessages(messages) {
    const systemParts = [];
    const conversation = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push({ text: msg.content });
      } else if (msg.role === 'tool') {
        conversation.push({
          role: 'user',
          content: [{
            toolResult: {
              toolUseId: msg.tool_call_id,
              content: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }],
            },
          }],
        });
      } else if (msg.role === 'assistant' && msg.tool_calls) {
        const content = [];
        if (msg.content) {
          content.push({ text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          const args = typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments;
          content.push({
            toolUse: { toolUseId: tc.id, name: tc.function.name, input: args },
          });
        }
        conversation.push({ role: 'assistant', content });
      } else {
        conversation.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }],
        });
      }
    }

    return { system: systemParts, messages: conversation };
  }

  normalizeTools(tools) {
    if (!tools || tools.length === 0) return [];
    return tools.map(t => {
      const fn = t.function || t;
      return {
        toolSpec: {
          name: fn.name,
          description: fn.description || '',
          inputSchema: { json: fn.parameters || { type: 'object', properties: {} } },
        },
      };
    });
  }

  async *streamChat(messages, tools, options = {}) {
    try {
      const { ConverseStreamCommand } = require('@aws-sdk/client-bedrock-runtime');
      const { system, messages: normalized } = this.normalizeMessages(messages);
      const bedrockTools = this.normalizeTools(tools);

      const params = {
        modelId: this.modelId,
        system: system.length > 0 ? system : undefined,
        messages: normalized,
        inferenceConfig: {
          maxTokens: options.maxTokens || 8192,
          ...(options.temperature != null ? { temperature: options.temperature } : {}),
        },
        ...(bedrockTools.length > 0 ? { toolConfig: { tools: bedrockTools } } : {}),
      };

      const command = new ConverseStreamCommand(params);
      const response = await this.client.send(command);

      let currentToolUse = null;
      let toolInputBuffer = '';

      for await (const event of response.stream) {
        if (event.contentBlockStart?.start?.toolUse) {
          currentToolUse = {
            id: event.contentBlockStart.start.toolUse.toolUseId,
            name: event.contentBlockStart.start.toolUse.name,
          };
          toolInputBuffer = '';
        } else if (event.contentBlockDelta) {
          const delta = event.contentBlockDelta.delta;
          if (delta?.text) {
            yield { type: 'text', content: delta.text };
          }
          if (delta?.toolUse?.input) {
            toolInputBuffer += delta.toolUse.input;
          }
        } else if (event.contentBlockStop) {
          if (currentToolUse) {
            let args = {};
            try { args = JSON.parse(toolInputBuffer); } catch { /* malformed */ }
            yield {
              type: 'tool_call',
              content: { id: currentToolUse.id, name: currentToolUse.name, arguments: args },
            };
            currentToolUse = null;
            toolInputBuffer = '';
          }
        }
      }

      yield { type: 'done', content: null };
    } catch (err) {
      logger.error('AWS Bedrock streaming error', err);
      yield { type: 'error', content: err.message };
    }
  }
}

module.exports = AWSBedrockProvider;
