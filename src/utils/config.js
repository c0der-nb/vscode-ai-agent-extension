const vscode = require('vscode');

const SECRET_KEYS = {
  openai: 'aiAgent.secrets.openaiApiKey',
  anthropic: 'aiAgent.secrets.anthropicApiKey',
  azure: 'aiAgent.secrets.azureApiKey',
  azureFoundry: 'aiAgent.secrets.azureFoundryApiKey',
  'bedrock.accessKeyId': 'aiAgent.secrets.awsAccessKeyId',
  'bedrock.secretAccessKey': 'aiAgent.secrets.awsSecretAccessKey',
  'jira.email': 'aiAgent.secrets.jiraEmail',
  'jira.token': 'aiAgent.secrets.jiraApiToken',
};

let _secretStorage = null;

function init(context) {
  _secretStorage = context.secrets;
}

function get(key) {
  return vscode.workspace.getConfiguration('aiAgent').get(key);
}

function getProvider() {
  return get('provider') || 'openai';
}

function getModel() {
  return get('model') || 'gpt-4o';
}

function getMaxContextTokens() {
  return get('maxContextTokens') || 128000;
}

function getCompactionThreshold() {
  return get('compactionThreshold') || 0.7;
}

function getDefaultMode() {
  return get('defaultMode') || 'agent';
}

function getAzureConfig() {
  return {
    endpoint: get('azure.endpoint') || '',
    deploymentName: get('azure.deploymentName') || '',
    apiVersion: get('azure.apiVersion') || '2024-10-21',
  };
}

function getAzureFoundryConfig() {
  return {
    endpoint: get('azureFoundry.endpoint') || '',
    modelName: get('azureFoundry.modelName') || '',
  };
}

function getAwsConfig() {
  return {
    region: get('aws.region') || 'us-east-1',
    modelId: get('aws.modelId') || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  };
}

async function getSecret(key) {
  if (!_secretStorage) return undefined;
  return _secretStorage.get(key);
}

async function setSecret(key, value) {
  if (!_secretStorage) return;
  await _secretStorage.store(key, value);
}

async function getApiKey(provider) {
  const secretKey = SECRET_KEYS[provider];
  if (!secretKey) return undefined;
  return getSecret(secretKey);
}

async function setApiKey(provider, value) {
  const secretKey = SECRET_KEYS[provider];
  if (!secretKey) return;
  await setSecret(secretKey, value);
}

function getJiraConfig() {
  return { baseUrl: get('jira.baseUrl') || '' };
}

async function getJiraCredentials() {
  const email = await getSecret(SECRET_KEYS['jira.email']);
  const token = await getSecret(SECRET_KEYS['jira.token']);
  return { email, token };
}

async function getAwsCredentials() {
  const accessKeyId = await getSecret(SECRET_KEYS['bedrock.accessKeyId']);
  const secretAccessKey = await getSecret(SECRET_KEYS['bedrock.secretAccessKey']);
  return { accessKeyId, secretAccessKey };
}

module.exports = {
  init,
  get,
  getProvider,
  getModel,
  getMaxContextTokens,
  getCompactionThreshold,
  getDefaultMode,
  getAzureConfig,
  getAzureFoundryConfig,
  getAwsConfig,
  getApiKey,
  setApiKey,
  getSecret,
  setSecret,
  getAwsCredentials,
  getJiraConfig,
  getJiraCredentials,
};
