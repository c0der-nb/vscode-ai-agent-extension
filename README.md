# AI Coding Agent — VS Code Extension

A Cursor-like AI coding assistant for VS Code with **Agent**, **Plan**, and **Ask** modes. Supports multiple LLM providers (OpenAI, Anthropic, Azure OpenAI, Azure AI Foundry, AWS Bedrock) with streaming responses and smart context compaction.

## Features

- **Agent Mode** — Full access to read, edit, create, and delete files plus terminal commands. The AI operates in an autonomous tool-call loop to complete tasks.
- **Plan Mode** — Read-only analysis of your codebase producing actionable implementation plans with specific file paths and line numbers.
- **Ask Mode** — Answer questions about code, explain snippets, and provide programming help without modifying anything.
- **Context Compaction** — Automatically summarizes older conversation turns when approaching the context window limit, keeping recent context intact while reducing token usage.
- **Streaming Responses** — Token-by-token streaming for real-time feedback.
- **Multi-Provider Support** — Switch between OpenAI, Anthropic Claude, Azure OpenAI, Azure AI Foundry, and AWS Bedrock.

## Setup

1. Open the extension's sidebar panel (AI Agent icon in the activity bar).
2. Run **AI Agent: Set API Key** from the command palette (`Cmd+Shift+P`) to store your API key securely.
3. Configure your provider in VS Code settings under `aiAgent.*`.

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `aiAgent.provider` | `openai` | LLM provider (`openai`, `anthropic`, `azure`, `azureFoundry`, `bedrock`) |
| `aiAgent.model` | `gpt-4o` | Model name |
| `aiAgent.azure.endpoint` | — | Azure OpenAI endpoint URL |
| `aiAgent.azure.deploymentName` | — | Azure deployment name |
| `aiAgent.azure.apiVersion` | `2024-10-21` | Azure API version |
| `aiAgent.azureFoundry.endpoint` | -- | Azure AI Foundry server URL |
| `aiAgent.azureFoundry.modelName` | -- | Optional model name override for the Foundry endpoint |
| `aiAgent.aws.region` | `us-east-1` | AWS region for Bedrock |
| `aiAgent.aws.modelId` | `anthropic.claude-3-5-sonnet-...` | Bedrock model ID |
| `aiAgent.maxContextTokens` | `128000` | Context window size in tokens |
| `aiAgent.compactionThreshold` | `0.7` | Context usage ratio that triggers compaction |
| `aiAgent.defaultMode` | `agent` | Default mode on startup |

### API Keys

API keys are stored using VS Code's SecretStorage (OS keychain), not in plain-text settings files. Use **AI Agent: Set API Key** to store them.

## Architecture

```
src/
├── extension.js           # Entry point
├── providers/             # LLM provider implementations
├── modes/                 # Agent/Plan/Ask mode logic
├── context/               # Context window management & compaction
├── tools/                 # File ops, search, terminal tools
├── ui/                    # Sidebar webview & inline code actions
└── utils/                 # Config, logging, helpers
```

## Development

```bash
npm install
# Press F5 in VS Code to launch Extension Development Host
```

## Commands

- **AI Agent: New Chat** — Clear conversation and start fresh
- **AI Agent: Switch Mode** — Pick Agent, Plan, or Ask mode
- **AI Agent: Set API Key** — Store API credentials securely
- **AI Agent: Ask About Selection** — Send selected code to chat
- **AI Agent: Explain This Code** — Explain the selected code
- **AI Agent: Refactor Selection** — Request a refactor of selected code


Here's the step-by-step guide to spin up and configure this extension with your Azure Foundry endpoint.

---

## Step 1: Open the project in VS Code

You already have the project at `/Users/aditya/Documents/Projects/vscode-ext`. Make sure it's the active workspace. Dependencies (`node_modules`) are already installed.

## Step 2: Launch the Extension Development Host

1. Press **F5** in VS Code (or go to **Run > Start Debugging**)
2. This opens a **new VS Code window** called the "Extension Development Host" -- that's where your extension runs
3. In that new window, open any project folder you want the AI agent to work on (e.g., a test project)

If VS Code asks which configuration to use, pick **"Run Extension"** or **"Extension"**. If no launch config exists yet, you'll need to create one first -- a `.vscode/launch.json` file with:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"]
    }
  ]
}
```

## Step 3: Configure the provider to Azure Foundry

In the **Extension Development Host** window (the new one that opened):

1. Open Settings: `Cmd + ,`
2. Search for `aiAgent`
3. Set these values:~

| Setting | Value |
|---------|-------|
| **AI Agent: Provider** | `azureFoundry` |
| **AI Agent: Azure Foundry > Endpoint** | Your Foundry server URL, e.g. `https://my-model-xxx.eastus.models.ai.azure.com` |
| **AI Agent: Azure Foundry > Model Name** | Your model name (e.g. `claude-3-5-sonnet`, `gpt-4o`, `Llama-3`, etc.) |

Alternatively, you can set them via `settings.json` directly:

```json
{
  "aiAgent.provider": "azureFoundry",
  "aiAgent.azureFoundry.endpoint": "https://your-model-endpoint.eastus.models.ai.azure.com",
  "aiAgent.azureFoundry.modelName": "your-model-name"
}
```

## Step 4: Store your API key

1. Open the Command Palette: `Cmd + Shift + P`
2. Type and select: **AI Agent: Set API Key**
3. A password input box appears -- paste your Azure Foundry API key and press Enter
4. You'll see a confirmation: *"AI Agent: API key saved for azureFoundry."*

The key is stored securely in your OS keychain via VS Code's SecretStorage -- it never goes into a plain-text settings file.

## Step 5: Start using it

1. Click the **AI Agent** icon in the left activity bar (the sidebar icon) to open the chat panel
2. Select your mode from the dropdown at the top:
   - **Agent** -- can read/edit/create/delete files and run terminal commands
   - **Plan** -- reads your code and produces a plan without modifying anything
   - **Ask** -- answers questions about your code
3. Type a message and press Enter (or click Send)

You should see a streaming response from your Azure Foundry model.

## Troubleshooting

If something goes wrong:

- **"No LLM provider configured"** -- The API key wasn't stored. Run `AI Agent: Set API Key` again from the command palette.
- **Blank responses or errors** -- Open the **Output** panel (`Cmd + Shift + U`), then select **AI Agent** from the dropdown to see detailed logs. Common issues:
  - Wrong endpoint URL (make sure it doesn't have a trailing `/v1` -- the provider adds that automatically)
  - Expired or invalid API key
  - Model name mismatch (check `aiAgent.azureFoundry.modelName` matches what Foundry expects)
- **Extension not showing up** -- Make sure you pressed F5 and are looking at the Extension Development Host window, not the original window.
