// Per-agent tool policy — shared by the renderer (defaults, display) and
// the Electron main process (session permissions). Pure: no node/browser
// dependencies so both sides import the same source of truth.

export const TOOL_ACTIONS = [
  'read', 'write', 'edit', 'glob', 'grep', 'bash', 'shell',
  'webfetch', 'websearch', 'question', 'subagent', 'task',
  'skill', 'command', 'external_directory',
];

export const DENY_ALL = Object.fromEntries(TOOL_ACTIONS.map((a) => [a, 'deny']));

const READ_SET = {
  ...DENY_ALL,
  read: 'allow',
  glob: 'allow',
  grep: 'allow',
  webfetch: 'allow',
  websearch: 'allow',
};

// Role defaults for the built-in roster. New custom agents start chat-only.
export const ROLE_TOOLS = {
  ag_atlas: { ...READ_SET, write: 'allow', edit: 'allow', bash: 'ask' },
  ag_mira: { ...READ_SET },
  ag_nova: { ...READ_SET, write: 'allow', edit: 'allow', bash: 'ask' },
  ag_echo: { ...DENY_ALL },
  ag_orion: { ...READ_SET, bash: 'ask' },
};

export function defaultTools(agentId) {
  if (agentId && ROLE_TOOLS[agentId]) return { ...ROLE_TOOLS[agentId] };
  return { ...DENY_ALL };
}

export function normalizeTools(agent) {
  const base = defaultTools(agent?.id);
  return { ...base, ...(agent?.tools || {}) };
}

// Short human-readable summary for directives and future UI.
export function toolsSummary(tools) {
  const t = { ...DENY_ALL, ...(tools || {}) };
  const allowed = TOOL_ACTIONS.filter((a) => t[a] === 'allow' && a !== 'external_directory');
  const asked = TOOL_ACTIONS.filter((a) => t[a] === 'ask');
  if (allowed.length === 0 && asked.length === 0) return 'no tools (chat only)';
  const parts = [];
  if (allowed.length) parts.push(`allowed: ${allowed.join(', ')}`);
  if (asked.length) parts.push(`ask-first: ${asked.join(', ')}`);
  return parts.join('; ');
}
