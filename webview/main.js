(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const messagesEl = document.getElementById('messages');
  const welcomeEl = document.getElementById('welcome');
  const inputEl = document.getElementById('input');
  const sendBtn = document.getElementById('sendBtn');
  const clearBtn = document.getElementById('clearBtn');
  const modeSelect = document.getElementById('modeSelect');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');

  let isStreaming = false;
  let currentAssistantEl = null;
  let currentContentEl = null;
  let streamBuffer = '';
  let toolCallCounter = 0;

  function init() {
    sendBtn.addEventListener('click', sendMessage);
    clearBtn.addEventListener('click', () => vscode.postMessage({ type: 'clearChat' }));
    modeSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setMode', mode: modeSelect.value });
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    inputEl.addEventListener('input', autoResize);

    if (settingsBtn) {
      settingsBtn.addEventListener('click', toggleSettings);
    }

    const settingsSaveBtn = document.getElementById('settingsSaveBtn');
    if (settingsSaveBtn) {
      settingsSaveBtn.addEventListener('click', saveSettings);
    }

    const providerSelect = document.getElementById('settingsProvider');
    if (providerSelect) {
      providerSelect.addEventListener('change', updateSettingsVisibility);
    }
  }

  // --- Settings panel ---

  function toggleSettings() {
    if (!settingsPanel) return;
    const visible = settingsPanel.style.display !== 'none';
    if (visible) {
      settingsPanel.style.display = 'none';
    } else {
      settingsPanel.style.display = 'block';
      vscode.postMessage({ type: 'getSettings' });
    }
  }

  function populateSettings(data) {
    const providerEl = document.getElementById('settingsProvider');
    const modelEl = document.getElementById('settingsModel');
    const endpointEl = document.getElementById('settingsEndpoint');
    const deploymentEl = document.getElementById('settingsDeployment');
    const apiVersionEl = document.getElementById('settingsApiVersion');
    const foundryEndpointEl = document.getElementById('settingsFoundryEndpoint');
    const foundryModelEl = document.getElementById('settingsFoundryModel');
    const awsRegionEl = document.getElementById('settingsAwsRegion');
    const awsModelEl = document.getElementById('settingsAwsModel');
    const jiraBaseUrlEl = document.getElementById('settingsJiraBaseUrl');

    if (providerEl) providerEl.value = data.provider || 'openai';
    if (modelEl) modelEl.value = data.model || '';
    if (endpointEl) endpointEl.value = data.azureEndpoint || '';
    if (deploymentEl) deploymentEl.value = data.azureDeploymentName || '';
    if (apiVersionEl) apiVersionEl.value = data.azureApiVersion || '';
    if (foundryEndpointEl) foundryEndpointEl.value = data.azureFoundryEndpoint || '';
    if (foundryModelEl) foundryModelEl.value = data.azureFoundryModelName || '';
    if (awsRegionEl) awsRegionEl.value = data.awsRegion || '';
    if (awsModelEl) awsModelEl.value = data.awsModelId || '';
    if (jiraBaseUrlEl) jiraBaseUrlEl.value = data.jiraBaseUrl || '';

    updateSettingsVisibility();
  }

  function updateSettingsVisibility() {
    const providerEl = document.getElementById('settingsProvider');
    if (!providerEl) return;
    const provider = providerEl.value;

    const azureGroup = document.getElementById('azureSettingsGroup');
    const foundryGroup = document.getElementById('foundrySettingsGroup');
    const awsGroup = document.getElementById('awsSettingsGroup');

    if (azureGroup) azureGroup.style.display = provider === 'azure' ? 'block' : 'none';
    if (foundryGroup) foundryGroup.style.display = provider === 'azureFoundry' ? 'block' : 'none';
    if (awsGroup) awsGroup.style.display = provider === 'bedrock' ? 'block' : 'none';
  }

  function saveSettings() {
    const data = {
      provider: document.getElementById('settingsProvider')?.value,
      model: document.getElementById('settingsModel')?.value,
      apiKey: document.getElementById('settingsApiKey')?.value,
      azureEndpoint: document.getElementById('settingsEndpoint')?.value,
      azureDeploymentName: document.getElementById('settingsDeployment')?.value,
      azureApiVersion: document.getElementById('settingsApiVersion')?.value,
      azureFoundryEndpoint: document.getElementById('settingsFoundryEndpoint')?.value,
      azureFoundryModelName: document.getElementById('settingsFoundryModel')?.value,
      awsRegion: document.getElementById('settingsAwsRegion')?.value,
      awsModelId: document.getElementById('settingsAwsModel')?.value,
      awsAccessKeyId: document.getElementById('settingsAwsAccessKey')?.value,
      awsSecretAccessKey: document.getElementById('settingsAwsSecretKey')?.value,
      jiraBaseUrl: document.getElementById('settingsJiraBaseUrl')?.value,
      jiraEmail: document.getElementById('settingsJiraEmail')?.value,
      jiraToken: document.getElementById('settingsJiraToken')?.value,
    };

    vscode.postMessage({ type: 'updateSettings', data });

    const apiKeyEl = document.getElementById('settingsApiKey');
    if (apiKeyEl) apiKeyEl.value = '';
    const awsAkEl = document.getElementById('settingsAwsAccessKey');
    if (awsAkEl) awsAkEl.value = '';
    const awsSkEl = document.getElementById('settingsAwsSecretKey');
    if (awsSkEl) awsSkEl.value = '';
    const jiraTokenEl = document.getElementById('settingsJiraToken');
    if (jiraTokenEl) jiraTokenEl.value = '';
    const jiraEmailEl = document.getElementById('settingsJiraEmail');
    if (jiraEmailEl) jiraEmailEl.value = '';

    settingsPanel.style.display = 'none';
  }

  // --- Chat ---

  function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
  }

  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isStreaming) return;

    vscode.postMessage({ type: 'sendMessage', text });
    inputEl.value = '';
    autoResize();
  }

  function addUserMessage(text) {
    hideWelcome();
    const el = document.createElement('div');
    el.className = 'message';
    el.innerHTML =
      '<div class="message-role user">You</div>' +
      '<div class="message-content">' + escapeHtml(text) + '</div>';
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function startAssistantMessage() {
    hideWelcome();
    currentAssistantEl = document.createElement('div');
    currentAssistantEl.className = 'message';

    const roleEl = document.createElement('div');
    roleEl.className = 'message-role assistant';
    roleEl.textContent = 'Assistant';

    currentContentEl = document.createElement('div');
    currentContentEl.className = 'message-content';

    const typingEl = document.createElement('div');
    typingEl.className = 'typing';
    typingEl.id = 'typingIndicator';
    typingEl.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

    currentAssistantEl.appendChild(roleEl);
    currentAssistantEl.appendChild(currentContentEl);
    currentAssistantEl.appendChild(typingEl);
    messagesEl.appendChild(currentAssistantEl);

    streamBuffer = '';
    isStreaming = true;
    sendBtn.disabled = true;
    scrollToBottom();
  }

  function appendStreamText(text) {
    if (!currentContentEl) return;
    streamBuffer += text;
    currentContentEl.innerHTML = renderMarkdown(streamBuffer);
    highlightCodeBlocks(currentContentEl);
    scrollToBottom();
  }

  function endAssistantMessage() {
    if (currentAssistantEl) {
      const typing = currentAssistantEl.querySelector('#typingIndicator');
      if (typing) typing.remove();

      // Mark all remaining in-progress tool calls as done
      currentAssistantEl.querySelectorAll('.tool-call-inline.in-progress').forEach((el) => {
        el.classList.remove('in-progress');
        el.classList.add('completed');
        const icon = el.querySelector('.tool-call-status');
        if (icon) icon.innerHTML = '&#x2713;';
      });
    }
    if (currentContentEl && streamBuffer) {
      currentContentEl.innerHTML = renderMarkdown(streamBuffer);
      highlightCodeBlocks(currentContentEl);
    }
    currentAssistantEl = null;
    currentContentEl = null;
    streamBuffer = '';
    isStreaming = false;
    sendBtn.disabled = false;
    scrollToBottom();
  }

  function addToolCall(name, args) {
    toolCallCounter++;
    const callId = 'tc-' + toolCallCounter;

    const argsPreview = typeof args === 'string' ? args : JSON.stringify(args);
    const short = argsPreview.length > 60 ? argsPreview.slice(0, 60) + '...' : argsPreview;

    const el = document.createElement('div');
    el.className = 'tool-call-inline in-progress';
    el.id = callId;
    el.setAttribute('data-tool-name', name);

    const header = document.createElement('div');
    header.className = 'tool-call-header';
    header.innerHTML =
      '<span class="tool-call-status"><span class="spinner"></span></span>' +
      '<span class="tool-call-name">' + escapeHtml(name) + '</span>' +
      '<span class="tool-call-summary">' + escapeHtml(short) + '</span>' +
      '<span class="tool-call-chevron">&#x25B6;</span>';

    header.addEventListener('click', () => {
      const detail = el.querySelector('.tool-call-detail');
      const chevron = el.querySelector('.tool-call-chevron');
      if (detail.style.display === 'none') {
        detail.style.display = 'block';
        chevron.innerHTML = '&#x25BC;';
      } else {
        detail.style.display = 'none';
        chevron.innerHTML = '&#x25B6;';
      }
    });

    const detail = document.createElement('div');
    detail.className = 'tool-call-detail';
    detail.style.display = 'none';
    detail.innerHTML = '<pre>' + escapeHtml(
      typeof args === 'string' ? args : JSON.stringify(args, null, 2)
    ) + '</pre>';

    el.appendChild(header);
    el.appendChild(detail);

    // Insert inside the current assistant message, before the typing indicator
    if (currentAssistantEl) {
      const typing = currentAssistantEl.querySelector('#typingIndicator');
      if (typing) {
        currentAssistantEl.insertBefore(el, typing);
      } else {
        currentAssistantEl.appendChild(el);
      }
    } else {
      messagesEl.appendChild(el);
    }

    scrollToBottom();
  }

  function markToolCallDone(name) {
    // Find the most recent in-progress tool call matching this name
    const selector = '.tool-call-inline.in-progress[data-tool-name="' + name + '"]';
    const candidates = document.querySelectorAll(selector);
    const el = candidates.length > 0 ? candidates[candidates.length - 1] : null;
    if (el) {
      el.classList.remove('in-progress');
      el.classList.add('completed');
      const icon = el.querySelector('.tool-call-status');
      if (icon) icon.innerHTML = '&#x2713;';
    }
  }

  function clearMessages() {
    messagesEl.innerHTML = '';
    showWelcome();
    currentAssistantEl = null;
    currentContentEl = null;
    streamBuffer = '';
    isStreaming = false;
    sendBtn.disabled = false;
    toolCallCounter = 0;
  }

  function hideWelcome() {
    if (welcomeEl) welcomeEl.style.display = 'none';
  }

  function showWelcome() {
    const w = document.createElement('div');
    w.className = 'welcome';
    w.id = 'welcome';
    w.innerHTML = '<h2>AI Coding Agent</h2><p>Ask questions, plan changes, or let the agent code for you.</p>';
    messagesEl.appendChild(w);
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderMarkdown(text) {
    let html = text;

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return '<pre><code class="language-' + (lang || 'plaintext') + '">' + escapeHtml(code.trim()) + '</code></pre>';
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Unordered lists
    html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Numbered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Paragraphs
    html = html.replace(/^(?!<[a-z])((?!<\/?(h[1-6]|ul|ol|li|pre|blockquote|div|table|tr|td|th)[ >]).+)$/gm, '<p>$1</p>');

    return html;
  }

  function highlightCodeBlocks(container) {
    if (typeof hljs !== 'undefined') {
      container.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  }

  // Message handler from extension
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'addUserMessage':
        addUserMessage(msg.text);
        break;
      case 'startAssistant':
        startAssistantMessage();
        break;
      case 'streamText':
        appendStreamText(msg.text);
        break;
      case 'endAssistant':
        endAssistantMessage();
        break;
      case 'toolCall':
        addToolCall(msg.name, msg.args);
        break;
      case 'toolCallDone':
        markToolCallDone(msg.name);
        break;
      case 'clearChat':
        clearMessages();
        break;
      case 'setMode':
        modeSelect.value = msg.mode;
        break;
      case 'settingsData':
        populateSettings(msg.data);
        break;
      case 'settingsSaved':
        break;
      case 'error':
        endAssistantMessage();
        addErrorMessage(msg.text);
        break;
    }
  });

  function addErrorMessage(text) {
    const el = document.createElement('div');
    el.className = 'message';
    el.innerHTML =
      '<div class="message-role" style="color: var(--vscode-errorForeground, #f44)">Error</div>' +
      '<div class="message-content">' + escapeHtml(text) + '</div>';
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  init();
})();
