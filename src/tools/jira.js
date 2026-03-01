const config = require('../utils/config');
const logger = require('../utils/logger');
const { compactToolResult } = require('../context/compactor');

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_COMMENT_LENGTH = 500;
const MAX_COMMENTS = 5;

async function getAuthHeader() {
  const { email, token } = await config.getJiraCredentials();
  if (!email || !token) return null;
  const encoded = Buffer.from(`${email}:${token}`).toString('base64');
  return `Basic ${encoded}`;
}

function getBaseUrl() {
  const { baseUrl } = config.getJiraConfig();
  return baseUrl ? baseUrl.replace(/\/+$/, '') : '';
}

/**
 * Flatten Atlassian Document Format (ADF) JSON to plain text.
 */
function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';

  let text = '';
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      text += adfToText(child);
    }
    if (['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote'].includes(node.type)) {
      text += '\n';
    }
    if (node.type === 'listItem') {
      text = '- ' + text;
    }
  }
  return text;
}

function compactTicket(issue) {
  const fields = issue.fields || {};

  let description = '';
  if (fields.description) {
    description = typeof fields.description === 'string'
      ? fields.description
      : adfToText(fields.description);
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      description = description.slice(0, MAX_DESCRIPTION_LENGTH) + '\n[truncated]';
    }
  }

  const comments = [];
  const commentList = fields.comment?.comments || [];
  const recentComments = commentList.slice(-MAX_COMMENTS);
  for (const c of recentComments) {
    let body = '';
    if (c.body) {
      body = typeof c.body === 'string' ? c.body : adfToText(c.body);
      if (body.length > MAX_COMMENT_LENGTH) {
        body = body.slice(0, MAX_COMMENT_LENGTH) + '...[truncated]';
      }
    }
    comments.push({
      author: c.author?.displayName || c.author?.emailAddress || 'Unknown',
      body,
      created: c.created,
    });
  }

  return {
    key: issue.key,
    summary: fields.summary || '',
    status: fields.status?.name || '',
    assignee: fields.assignee?.displayName || fields.assignee?.emailAddress || 'Unassigned',
    reporter: fields.reporter?.displayName || fields.reporter?.emailAddress || 'Unknown',
    priority: fields.priority?.name || '',
    labels: fields.labels || [],
    type: fields.issuetype?.name || '',
    description,
    comments,
  };
}

async function jiraGetTicket({ ticketId }) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return { success: false, error: 'Jira not configured. Set aiAgent.jira.baseUrl in settings and store credentials via "AI Agent: Set Jira Credentials".' };
  }

  const auth = await getAuthHeader();
  if (!auth) {
    return { success: false, error: 'Jira credentials not set. Use "AI Agent: Set Jira Credentials" to store your email and API token.' };
  }

  try {
    const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(ticketId)}?fields=summary,status,assignee,reporter,priority,labels,issuetype,description,comment`;
    logger.info(`Jira: fetching ${ticketId}`);

    const response = await fetch(url, {
      headers: {
        'Authorization': auth,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error(`Jira API error: ${response.status}`, text);
      return { success: false, error: `Jira API returned ${response.status}: ${text.slice(0, 200)}` };
    }

    const issue = await response.json();
    const result = compactTicket(issue);
    return { success: true, ...result };
  } catch (err) {
    logger.error('Jira fetch error', err);
    return { success: false, error: err.message };
  }
}

async function jiraSearchTickets({ jql, maxResults }) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return { success: false, error: 'Jira not configured. Set aiAgent.jira.baseUrl in settings.' };
  }

  const auth = await getAuthHeader();
  if (!auth) {
    return { success: false, error: 'Jira credentials not set. Use "AI Agent: Set Jira Credentials".' };
  }

  const limit = Math.min(maxResults || 10, 20);

  try {
    const url = `${baseUrl}/rest/api/3/search`;
    logger.info(`Jira: searching with JQL: ${jql}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jql,
        maxResults: limit,
        fields: ['summary', 'status', 'assignee', 'priority', 'issuetype', 'labels'],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error(`Jira search error: ${response.status}`, text);
      return { success: false, error: `Jira API returned ${response.status}: ${text.slice(0, 200)}` };
    }

    const data = await response.json();
    const tickets = (data.issues || []).map(issue => ({
      key: issue.key,
      summary: issue.fields?.summary || '',
      status: issue.fields?.status?.name || '',
      assignee: issue.fields?.assignee?.displayName || 'Unassigned',
      priority: issue.fields?.priority?.name || '',
      type: issue.fields?.issuetype?.name || '',
      labels: issue.fields?.labels || [],
    }));

    return {
      success: true,
      total: data.total || 0,
      count: tickets.length,
      tickets,
    };
  } catch (err) {
    logger.error('Jira search error', err);
    return { success: false, error: err.message };
  }
}

module.exports = { jiraGetTicket, jiraSearchTickets };
