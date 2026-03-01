const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { getNonce } = require('../utils/helpers');
const config = require('../utils/config');
const logger = require('../utils/logger');

class SidebarProvider {
  /**
   * @param {vscode.ExtensionContext} context
   * @param {import('../modes/mode-controller')} modeController
   * @param {import('../context/manager')} contextManager
   * @param {function} getProvider - returns current LLM provider
   */
  constructor(context, modeController, contextManager, getProvider) {
    this._context = context;
    this._modeController = modeController;
    this._contextManager = contextManager;
    this._getProvider = getProvider;
    this._view = null;
  }

  resolveWebviewView(webviewView, _context, _token) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this._context.extensionPath, 'webview')),
        vscode.Uri.file(path.join(this._context.extensionPath, 'node_modules', 'highlight.js', 'styles')),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      undefined,
      this._context.subscriptions,
    );

    this._modeController.onModeChange((mode) => {
      this._postMessage({ type: 'setMode', mode });
    });

    this._postMessage({ type: 'setMode', mode: this._modeController.getMode() });
  }

  _getHtmlForWebview(webview) {
    const nonce = getNonce();

    const stylesPath = vscode.Uri.file(path.join(this._context.extensionPath, 'webview', 'styles.css'));
    const stylesUri = webview.asWebviewUri(stylesPath);

    const hlStylePath = vscode.Uri.file(
      path.join(this._context.extensionPath, 'node_modules', 'highlight.js', 'styles', 'github-dark.min.css')
    );
    const highlightUri = webview.asWebviewUri(hlStylePath);

    const hljsBundlePath = path.join(this._context.extensionPath, 'webview', 'hljs-bundle.js');
    const hljsScript = fs.readFileSync(hljsBundlePath, 'utf-8');

    const mainScriptPath = path.join(this._context.extensionPath, 'webview', 'main.js');
    const mainScript = fs.readFileSync(mainScriptPath, 'utf-8');

    const htmlPath = path.join(this._context.extensionPath, 'webview', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');

    html = html.replace(/\{\{nonce\}\}/g, nonce);
    html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);
    html = html.replace(/\{\{stylesUri\}\}/g, stylesUri.toString());
    html = html.replace(/\{\{highlightUri\}\}/g, highlightUri.toString());
    html = html.replace(/\{\{hljsScript\}\}/g, hljsScript);
    html = html.replace(/\{\{mainScript\}\}/g, mainScript);

    return html;
  }

  async _handleMessage(msg) {
    switch (msg.type) {
      case 'sendMessage':
        await this._handleUserMessage(msg.text);
        break;
      case 'setMode':
        this._modeController.setMode(msg.mode);
        break;
      case 'clearChat':
        this._contextManager.clear();
        this._postMessage({ type: 'clearChat' });
        break;
      case 'getSettings':
        await this._sendCurrentSettings();
        break;
      case 'updateSettings':
        await this._applySettings(msg.data);
        break;
    }
  }

  async _sendCurrentSettings() {
    const azureCfg = config.getAzureConfig();
    const foundryCfg = config.getAzureFoundryConfig();
    const awsCfg = config.getAwsConfig();
    const jiraCfg = config.getJiraConfig();

    this._postMessage({
      type: 'settingsData',
      data: {
        provider: config.getProvider(),
        model: config.getModel(),
        azureEndpoint: azureCfg.endpoint,
        azureDeploymentName: azureCfg.deploymentName,
        azureApiVersion: azureCfg.apiVersion,
        azureFoundryEndpoint: foundryCfg.endpoint,
        azureFoundryModelName: foundryCfg.modelName,
        awsRegion: awsCfg.region,
        awsModelId: awsCfg.modelId,
        jiraBaseUrl: jiraCfg.baseUrl,
      },
    });
  }

  async _applySettings(data) {
    try {
      const cfg = vscode.workspace.getConfiguration('aiAgent');

      if (data.provider) await cfg.update('provider', data.provider, vscode.ConfigurationTarget.Global);
      if (data.model) await cfg.update('model', data.model, vscode.ConfigurationTarget.Global);

      if (data.azureEndpoint !== undefined) await cfg.update('azure.endpoint', data.azureEndpoint, vscode.ConfigurationTarget.Global);
      if (data.azureDeploymentName !== undefined) await cfg.update('azure.deploymentName', data.azureDeploymentName, vscode.ConfigurationTarget.Global);
      if (data.azureApiVersion) await cfg.update('azure.apiVersion', data.azureApiVersion, vscode.ConfigurationTarget.Global);

      if (data.azureFoundryEndpoint !== undefined) await cfg.update('azureFoundry.endpoint', data.azureFoundryEndpoint, vscode.ConfigurationTarget.Global);
      if (data.azureFoundryModelName !== undefined) await cfg.update('azureFoundry.modelName', data.azureFoundryModelName, vscode.ConfigurationTarget.Global);

      if (data.awsRegion) await cfg.update('aws.region', data.awsRegion, vscode.ConfigurationTarget.Global);
      if (data.awsModelId) await cfg.update('aws.modelId', data.awsModelId, vscode.ConfigurationTarget.Global);

      if (data.apiKey) {
        await config.setApiKey(data.provider, data.apiKey);
      }

      if (data.provider === 'bedrock') {
        if (data.awsAccessKeyId) {
          await config.setSecret('aiAgent.secrets.awsAccessKeyId', data.awsAccessKeyId);
        }
        if (data.awsSecretAccessKey) {
          await config.setSecret('aiAgent.secrets.awsSecretAccessKey', data.awsSecretAccessKey);
        }
      }

      if (data.jiraBaseUrl !== undefined) await cfg.update('jira.baseUrl', data.jiraBaseUrl, vscode.ConfigurationTarget.Global);

      if (data.jiraEmail) {
        await config.setSecret('aiAgent.secrets.jiraEmail', data.jiraEmail);
      }
      if (data.jiraToken) {
        await config.setSecret('aiAgent.secrets.jiraApiToken', data.jiraToken);
      }

      this._postMessage({ type: 'settingsSaved' });
      vscode.window.showInformationMessage('AI Agent: Settings saved.');
      logger.info('Settings updated from panel');
    } catch (err) {
      logger.error('Failed to save settings', err);
      this._postMessage({ type: 'error', text: 'Failed to save settings: ' + err.message });
    }
  }

  async _handleUserMessage(text) {
    const provider = this._getProvider();
    if (!provider) {
      this._postMessage({ type: 'error', text: 'No LLM provider configured. Use "AI Agent: Set API Key" to set up a provider.' });
      return;
    }

    this._postMessage({ type: 'addUserMessage', text });
    await this._runAssistant(text, provider);
  }

  async _runAssistant(text, provider) {
    this._postMessage({ type: 'startAssistant' });

    await this._modeController.run(text, this._contextManager, provider, {
      onText: (chunk) => {
        this._postMessage({ type: 'streamText', text: chunk });
      },
      onToolCall: (name, args) => {
        this._postMessage({ type: 'toolCall', name, args });
      },
      onToolCallDone: (name) => {
        this._postMessage({ type: 'toolCallDone', name });
      },
      onDone: () => {
        this._postMessage({ type: 'endAssistant' });
      },
    });
  }

  sendSelectionContext(text, action) {
    const provider = this._getProvider();
    if (!provider) {
      this._postMessage({ type: 'error', text: 'No LLM provider configured. Use "AI Agent: Set API Key" to set up a provider.' });
      return;
    }

    const prefix = action === 'explain'
      ? 'Explain the following code:\n\n```\n' + text + '\n```'
      : action === 'refactor'
        ? 'Refactor the following code:\n\n```\n' + text + '\n```'
        : text;

    this._postMessage({ type: 'addUserMessage', text: prefix });
    this._runAssistant(prefix, provider);
  }

  _postMessage(msg) {
    if (this._view) {
      this._view.webview.postMessage(msg);
    }
  }

  get view() {
    return this._view;
  }
}

module.exports = SidebarProvider;
