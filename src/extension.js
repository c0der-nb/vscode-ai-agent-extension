const vscode = require('vscode');
const config = require('./utils/config');
const logger = require('./utils/logger');
const ContextManager = require('./context/manager');
const ModeController = require('./modes/mode-controller');
const SidebarProvider = require('./ui/sidebar-provider');
const InlineActionProvider = require('./ui/inline-provider');
const OpenAIProvider = require('./providers/openai');
const AnthropicProvider = require('./providers/anthropic');
const AzureOpenAIProvider = require('./providers/azure-openai');
const AzureFoundryProvider = require('./providers/azure-foundry');
const AWSBedrockProvider = require('./providers/aws-bedrock');

let contextManager;
let modeController;
let sidebarProvider;
let currentProvider = null;
let _suppressConfigReinit = false;

async function activate(context) {
  logger.info('AI Coding Agent activating...');

  config.init(context);

  contextManager = new ContextManager();
  modeController = new ModeController();

  await contextManager.init();
  await initProvider();

  contextManager.setProvider(currentProvider);

  sidebarProvider = new SidebarProvider(
    context,
    modeController,
    contextManager,
    () => currentProvider,
    async (suppress) => {
      if (suppress === true) { _suppressConfigReinit = true; return; }
      if (suppress === false) { _suppressConfigReinit = false; return; }
      await initProvider();
      contextManager.setProvider(currentProvider);
    },
  );

  const sidebarRegistration = vscode.window.registerWebviewViewProvider(
    'aiAgent.chatView',
    sidebarProvider,
    { webviewOptions: { retainContextWhenHidden: true } },
  );

  const inlineProvider = new InlineActionProvider();
  const codeActionRegistration = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file' },
    inlineProvider,
    InlineActionProvider.metadata,
  );

  const newChatCmd = vscode.commands.registerCommand('aiAgent.newChat', () => {
    contextManager.clear();
    if (sidebarProvider.view) {
      sidebarProvider._postMessage({ type: 'clearChat' });
    }
  });

  const clearChatCmd = vscode.commands.registerCommand('aiAgent.clearChat', () => {
    contextManager.clear();
    if (sidebarProvider.view) {
      sidebarProvider._postMessage({ type: 'clearChat' });
    }
  });

  const setModeCmd = vscode.commands.registerCommand('aiAgent.setMode', async () => {
    const modes = ModeController.getModes();
    const picked = await vscode.window.showQuickPick(
      modes.map(m => ({ label: m.label, description: m.description, id: m.id })),
      { placeHolder: 'Select AI Agent mode' },
    );
    if (picked) {
      modeController.setMode(picked.id);
    }
  });

  const setApiKeyCmd = vscode.commands.registerCommand('aiAgent.setApiKey', async () => {
    const provider = config.getProvider();

    if (provider === 'bedrock') {
      const accessKey = await vscode.window.showInputBox({
        prompt: 'Enter AWS Access Key ID',
        password: true,
        ignoreFocusOut: true,
      });
      if (!accessKey) return;

      const secretKey = await vscode.window.showInputBox({
        prompt: 'Enter AWS Secret Access Key',
        password: true,
        ignoreFocusOut: true,
      });
      if (!secretKey) return;

      await config.setSecret('aiAgent.secrets.awsAccessKeyId', accessKey);
      await config.setSecret('aiAgent.secrets.awsSecretAccessKey', secretKey);
    } else {
      const key = await vscode.window.showInputBox({
        prompt: `Enter API key for ${provider}`,
        password: true,
        ignoreFocusOut: true,
      });
      if (!key) return;

      await config.setApiKey(provider, key);
    }

    await initProvider();
    contextManager.setProvider(currentProvider);
    vscode.window.showInformationMessage(`AI Agent: API key saved for ${provider}.`);
  });

  const setJiraCredsCmd = vscode.commands.registerCommand('aiAgent.setJiraCredentials', async () => {
    const email = await vscode.window.showInputBox({
      prompt: 'Enter your Jira email address',
      ignoreFocusOut: true,
    });
    if (!email) return;

    const token = await vscode.window.showInputBox({
      prompt: 'Enter your Jira API token',
      password: true,
      ignoreFocusOut: true,
    });
    if (!token) return;

    await config.setSecret('aiAgent.secrets.jiraEmail', email);
    await config.setSecret('aiAgent.secrets.jiraApiToken', token);
    vscode.window.showInformationMessage('AI Agent: Jira credentials saved.');
  });

  const askSelectionCmd = vscode.commands.registerCommand('aiAgent.askAboutSelection', () => {
    handleSelectionAction('ask');
  });

  const explainSelectionCmd = vscode.commands.registerCommand('aiAgent.explainSelection', () => {
    handleSelectionAction('explain');
  });

  const refactorSelectionCmd = vscode.commands.registerCommand('aiAgent.refactorSelection', () => {
    handleSelectionAction('refactor');
  });

  const configChangeListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (_suppressConfigReinit) return;
    if (e.affectsConfiguration('aiAgent')) {
      await initProvider();
      contextManager.setProvider(currentProvider);
      logger.info('Configuration updated, provider re-initialized');
    }
  });

  context.subscriptions.push(
    sidebarRegistration,
    codeActionRegistration,
    newChatCmd,
    clearChatCmd,
    setModeCmd,
    setApiKeyCmd,
    setJiraCredsCmd,
    askSelectionCmd,
    explainSelectionCmd,
    refactorSelectionCmd,
    configChangeListener,
  );

  logger.info('AI Coding Agent activated');
}

async function initProvider() {
  const provider = config.getProvider();
  const model = config.getModel();

  try {
    switch (provider) {
      case 'openai': {
        const apiKey = await config.getApiKey('openai');
        if (!apiKey) {
          currentProvider = null;
          return;
        }
        currentProvider = new OpenAIProvider(apiKey, model);
        break;
      }
      case 'anthropic': {
        const apiKey = await config.getApiKey('anthropic');
        if (!apiKey) {
          currentProvider = null;
          return;
        }
        currentProvider = new AnthropicProvider(apiKey, model);
        break;
      }
      case 'azure': {
        const apiKey = await config.getApiKey('azure');
        const azureConfig = config.getAzureConfig();
        if (!apiKey || !azureConfig.endpoint || !azureConfig.deploymentName) {
          currentProvider = null;
          return;
        }
        currentProvider = new AzureOpenAIProvider(
          apiKey,
          azureConfig.endpoint,
          azureConfig.deploymentName,
          azureConfig.apiVersion,
          model,
        );
        break;
      }
      case 'azureFoundry': {
        const apiKey = await config.getApiKey('azureFoundry');
        const foundryConfig = config.getAzureFoundryConfig();
        if (!apiKey || !foundryConfig.endpoint) {
          currentProvider = null;
          return;
        }
        currentProvider = new AzureFoundryProvider(
          apiKey,
          foundryConfig.endpoint,
          foundryConfig.modelName || model,
        );
        break;
      }
      case 'bedrock': {
        const credentials = await config.getAwsCredentials();
        const awsConfig = config.getAwsConfig();
        if (!credentials.accessKeyId || !credentials.secretAccessKey) {
          currentProvider = null;
          return;
        }
        currentProvider = new AWSBedrockProvider(
          credentials,
          awsConfig.region,
          awsConfig.modelId,
        );
        break;
      }
      default:
        currentProvider = null;
    }

    if (currentProvider) {
      logger.info(`Provider initialized: ${provider} (${model})`);
    }
  } catch (err) {
    logger.error('Failed to initialize provider', err);
    currentProvider = null;
  }
}

function handleSelectionAction(action) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('No text selected.');
    return;
  }

  const selectedText = editor.document.getText(selection);
  const fileName = editor.document.fileName;
  const startLine = selection.start.line + 1;
  const endLine = selection.end.line + 1;

  const context = `File: ${fileName} (lines ${startLine}-${endLine})\n\n\`\`\`\n${selectedText}\n\`\`\``;

  if (action === 'explain') {
    modeController.setMode('ask');
    sidebarProvider.sendSelectionContext(selectedText, 'explain');
  } else if (action === 'refactor') {
    modeController.setMode('agent');
    sidebarProvider.sendSelectionContext(selectedText, 'refactor');
  } else {
    modeController.setMode('ask');
    sidebarProvider.sendSelectionContext(context, 'ask');
  }

  vscode.commands.executeCommand('aiAgent.chatView.focus');
}

function deactivate() {
  logger.info('AI Coding Agent deactivated');
  logger.dispose();
}

module.exports = { activate, deactivate };
