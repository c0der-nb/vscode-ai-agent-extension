(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const messagesEl = document.getElementById('messages');
  const welcomeEl = document.getElementById('welcome');
  const inputEl = document.getElementById('input');
  const sendBtn = document.getElementById('sendBtn');
  const clearBtn = document.getElementById('clearBtn');
  const modeSelect = document.getElementById('modeSelect');

  let isStreaming = false;
  let currentAssistantEl = null;
  let currentContentEl = null;
  let streamBuffer = '';

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
  }

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
    el.innerHTML = `
      <div class="message-role user">You</div>
      <div class="message-content">${escapeHtml(text)}</div>
    `;
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
    hideWelcome();
    const el = document.createElement('div');
    el.className = 'tool-call';

    const argsPreview = typeof args === 'string' ? args : JSON.stringify(args);
    const short = argsPreview.length > 80 ? argsPreview.slice(0, 80) + '...' : argsPreview;

    el.innerHTML = `
      <span class="tool-call-icon">&#x2699;</span>
      <span class="tool-call-name">${escapeHtml(name)}</span>
      <span>${escapeHtml(short)}</span>
    `;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function clearMessages() {
    messagesEl.innerHTML = '';
    showWelcome();
    currentAssistantEl = null;
    currentContentEl = null;
    streamBuffer = '';
    isStreaming = false;
    sendBtn.disabled = false;
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
    // Minimal markdown renderer inlined to avoid CSP issues with external marked lib
    let html = text;

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="language-${lang || 'plaintext'}">${escapeHtml(code.trim())}</code></pre>`;
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

    // Paragraphs — wrap remaining loose lines
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
      case 'clearChat':
        clearMessages();
        break;
      case 'setMode':
        modeSelect.value = msg.mode;
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
    el.innerHTML = `
      <div class="message-role" style="color: var(--vscode-errorForeground, #f44)">Error</div>
      <div class="message-content">${escapeHtml(text)}</div>
    `;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  init();
})();
