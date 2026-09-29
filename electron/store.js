import fs from 'node:fs';
import path from 'node:path';

// First-class on-disk layout (OpenClaw-style: one folder per agent):
//
//   <userData>/
//     config.json                  app settings + selection + savedAt
//     agents/
//       <agent-id>/
//         agent.json               identity, instructions, model, avatar, status
//         conversations/
//           <conv-id>.json         transcript per conversation
//     sessions.json                conversation -> OpenCode session map
//     dmp-state.json               LEGACY v1/v2 blob (imported once, then removed)
//
// Synchronous fs: payloads are small and renderer calls are debounced.
const VERSION = 3;
const LEGACY_FILE = 'dmp-state.json';

let dir = null;

export function initStore(userDataDir) {
  dir = userDataDir;
  adoptSiblingData();
}

// One-time adoption: dev builds previously stored data under the default
// "Electron" userData dir. If our fixed dir has no data yet, copy it over
// so current conversations survive the rename. Never overwrites.
function adoptSiblingData() {
  try {
    const hasOurs = fs.existsSync(path.join(dir, 'config.json'))
      || fs.existsSync(path.join(dir, LEGACY_FILE))
      || fs.existsSync(path.join(dir, 'agents'));
    if (hasOurs) return;
    const sibling = path.join(path.dirname(dir), 'Electron');
    const hasSibling = fs.existsSync(path.join(sibling, 'config.json'))
      || fs.existsSync(path.join(sibling, LEGACY_FILE))
      || fs.existsSync(path.join(sibling, 'agents'));
    if (!hasSibling) return;
    for (const name of ['config.json', 'sessions.json', 'agents', LEGACY_FILE]) {
      const src = path.join(sibling, name);
      if (!fs.existsSync(src)) continue;
      fs.cpSync(src, path.join(dir, name), { recursive: true });
    }
    console.log('[dmp] adopted data from dev Electron userData dir');
  } catch (e) {
    console.error('[dmp] data adoption failed:', e?.message ?? e);
  }
}

function safeId(id) {
  return String(id || 'x').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'x';
}

// Absolute data directory of one agent; created on demand so a session can
// be rooted there even before the first persisted save.
export function agentDir(agentId) {
  if (!dir) throw new Error('store not initialized');
  const p = path.join(dir, 'agents', safeId(agentId));
  fs.mkdirSync(path.join(p, 'conversations'), { recursive: true });
  return p;
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

export function saveState(state) {
  if (!dir) throw new Error('store not initialized');
  const { agents = [], activeAgentId = null, activeConv = {}, sessions = {} } = state || {};
  const savedAt = Date.now();

  writeJson(path.join(dir, 'config.json'), {
    version: VERSION, savedAt, activeAgentId, activeConv,
    settings: state?.settings ?? undefined,
  });

  // Agents + conversations, pruning anything no longer present.
  const agentsDir = path.join(dir, 'agents');
  const liveAgentIds = new Set();
  for (const a of agents) {
    const aid = safeId(a?.id);
    liveAgentIds.add(aid);
    const adir = path.join(agentsDir, aid);
    const { conversations = [], ...identity } = a || {};
    writeJson(path.join(adir, 'agent.json'), { ...identity, id: a?.id ?? aid });
    const cdir = path.join(adir, 'conversations');
    const liveConvIds = new Set();
    for (const c of conversations) {
      const cid = safeId(c?.id);
      liveConvIds.add(cid);
      writeJson(path.join(cdir, `${cid}.json`), c);
    }
    // Prune deleted conversations (compare by safe filename).
    let existing = [];
    try {
      existing = fs.readdirSync(cdir);
    } catch {
      existing = [];
    }
    for (const f of existing) {
      if (f.endsWith('.json') && !liveConvIds.has(f.slice(0, -5))) {
        try { fs.unlinkSync(path.join(cdir, f)); } catch { /* ignore */ }
      }
    }
  }
  // Prune deleted agents.
  let existingAgents = [];
  try {
    existingAgents = fs.readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    existingAgents = [];
  }
  for (const e of existingAgents) {
    if (e.isDirectory() && !liveAgentIds.has(e.name)) rmrf(path.join(agentsDir, e.name));
  }

  // Session map: keep only entries for conversations that still exist.
  const liveConvs = new Set();
  for (const a of agents) for (const c of a?.conversations || []) liveConvs.add(String(c?.id));
  const prunedSessions = Object.fromEntries(
    Object.entries(sessions || {}).filter(([k]) => liveConvs.has(String(k))),
  );
  writeJson(path.join(dir, 'sessions.json'), { version: VERSION, savedAt, sessions: prunedSessions });

  // Legacy blob served its migration purpose (if any) — remove it.
  try { fs.unlinkSync(path.join(dir, LEGACY_FILE)); } catch { /* already gone */ }

  return { ok: true, savedAt };
}

function loadNewLayout() {
  const config = readJson(path.join(dir, 'config.json'));
  if (!config || config.version !== VERSION) return null;
  let agentDirs = [];
  try {
    agentDirs = fs.readdirSync(path.join(dir, 'agents'), { withFileTypes: true });
  } catch {
    return null;
  }
  const agents = [];
  for (const e of agentDirs) {
    if (!e.isDirectory()) continue;
    const identity = readJson(path.join(dir, 'agents', e.name, 'agent.json'));
    if (!identity) continue;
    let convFiles = [];
    try {
      convFiles = fs.readdirSync(path.join(dir, 'agents', e.name, 'conversations'));
    } catch {
      convFiles = [];
    }
    const conversations = [];
    for (const f of convFiles) {
      if (!f.endsWith('.json')) continue;
      const conv = readJson(path.join(dir, 'agents', e.name, 'conversations', f));
      if (conv && conv.id) conversations.push(conv);
    }
    conversations.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    agents.push({ ...identity, conversations });
  }
  if (agents.length === 0) return null;
  const sessions = readJson(path.join(dir, 'sessions.json'));
  return {
    version: VERSION,
    savedAt: config.savedAt ?? null,
    agents,
    activeAgentId: config.activeAgentId ?? null,
    activeConv: config.activeConv ?? {},
    sessions: sessions?.sessions ?? {},
    settings: config.settings ?? undefined,
  };
}

function loadLegacy() {
  const data = readJson(path.join(dir, LEGACY_FILE));
  if (!data || data.version !== 2 || !Array.isArray(data.agents)) return null;
  return {
    version: 2,
    savedAt: data.savedAt ?? null,
    agents: data.agents,
    activeAgentId: data.activeAgentId ?? null,
    activeConv: data.activeConv ?? {},
    sessions: data.sessions ?? {},
  };
}

export function loadState() {
  if (!dir) throw new Error('store not initialized');
  return loadNewLayout() ?? loadLegacy();
}
