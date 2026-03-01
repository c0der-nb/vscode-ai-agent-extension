const ALL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: 'Read the contents of a file. Optionally specify start/end lines to read a range.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          startLine: { type: 'number', description: 'Start line (1-based, optional)' },
          endLine: { type: 'number', description: 'End line (1-based, optional)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'writeFile',
      description: 'Overwrite the entire contents of a file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          content: { type: 'string', description: 'New file content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'editFile',
      description: 'Search and replace text in a file. oldText must match exactly.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          oldText: { type: 'string', description: 'Exact text to find' },
          newText: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'oldText', 'newText'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createFile',
      description: 'Create a new file with the given content. Fails if the file already exists.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          content: { type: 'string', description: 'File content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteFile',
      description: 'Delete a file at the given path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchFiles',
      description: 'Search for a regex pattern across workspace files. Returns matching lines with file paths and line numbers.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          glob: { type: 'string', description: 'Glob to filter files (e.g. "**/*.js")' },
          path: { type: 'string', description: 'Directory to search in (relative to workspace)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listFiles',
      description: 'List files in the workspace matching a glob pattern.',
      parameters: {
        type: 'object',
        properties: {
          glob: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts", "src/**")' },
          path: { type: 'string', description: 'Directory to search in (relative to workspace)' },
        },
        required: ['glob'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'runCommand',
      description: 'Execute a shell command in the workspace. Returns stdout and stderr.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          cwd: { type: 'string', description: 'Working directory (relative to workspace root)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'jiraGetTicket',
      description: 'Fetch a Jira ticket by its ID (e.g. PROJ-1234). Returns summary, status, description, and recent comments.',
      parameters: {
        type: 'object',
        properties: {
          ticketId: { type: 'string', description: 'Jira ticket ID (e.g. PROJ-1234)' },
        },
        required: ['ticketId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'jiraSearchTickets',
      description: 'Search Jira tickets using JQL (Jira Query Language). Returns a list of matching tickets with key, summary, status, and assignee.',
      parameters: {
        type: 'object',
        properties: {
          jql: { type: 'string', description: 'JQL query (e.g. "project = PROJ AND status = Open")' },
          maxResults: { type: 'number', description: 'Max results to return (default 10, max 20)' },
        },
        required: ['jql'],
      },
    },
  },
];

const READ_ONLY_TOOLS = ALL_TOOLS.filter(t =>
  ['readFile', 'searchFiles', 'listFiles', 'jiraGetTicket', 'jiraSearchTickets'].includes(t.function.name)
);

function getToolsForMode(mode) {
  switch (mode) {
    case 'agent': return ALL_TOOLS;
    case 'plan': return READ_ONLY_TOOLS;
    case 'ask': return READ_ONLY_TOOLS;
    default: return ALL_TOOLS;
  }
}

module.exports = { ALL_TOOLS, READ_ONLY_TOOLS, getToolsForMode };
