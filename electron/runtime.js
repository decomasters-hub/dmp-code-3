import { OpenCode } from '@opencode/client';
import { Service } from '@opencode/client/service';
import { detectCli, serviceCommand } from './opencode-env.js';
import { agentDir } from './store.js';
import { normalizeTools, buildPermissions, toolsSummary } from './tools.js';

// Runtime owner for the user's REAL OpenCode installation.
// Unlike the embedded @opencode/sdk server, this connects to the local
// OpenCode background service (the genuine CLI binary), which is why
// provider auth — including the free tier — works here.
//
// Lifecycle: singleton HTTP client. The background service belongs to the
// user (shared with their CLI); we never stop it on app quit.

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const cli = await detectCli();
      if (!cli.found) throw new Error('OpenCode CLI not detected on this system.');
      const endpoint = await Service.ensure({ command: serviceCommand(cli.path) });
      return OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
    })().catch((e) => {
      clientPromise = null;
      throw e;
    });
  }
  return clientPromise;
}

export async function closeRuntime() {
  if (eventAbort) {
    try { eventAbort.abort(); } catch { /* ignore */ }
    eventAbort = null;
  }
  chunkHandlers.clear();
  // NOTE: the background service is the user's (shared with their CLI) —
  // never stopped here. Just drop our client so a fresh one is built next.
  clientPromise = null;
  sessionByKey.clear();
}

// Only real "provider/model" refs are passed through; anything else means
// "use the server default model".
function isMockModel(ref) {
  return !ref || !ref.includes('/');
}

// "provider/model" -> { providerID, id }. Returns undefined for mock ids
// so the server falls back to its configured default model.
export function parseModelRef(ref) {
  if (isMockModel(ref)) return undefined;
  const slash = ref.indexOf('/');
  if (slash <= 0 || slash === ref.length - 1) return undefined;
  const hash = ref.indexOf('#');
  const id = hash === -1 ? ref.slice(slash + 1) : ref.slice(slash + 1, hash);
  const variant = hash === -1 ? undefined : ref.slice(hash + 1);
  if (!id) return undefined;
  const out = { providerID: ref.slice(0, slash), id };
  if (variant) out.variant = variant;
  return out;
}

export async function listModels() {
  try {
    const c = await getClient();
    const { models, def } = await settledSnapshot(c);
    return {
      ok: true,
      live: true,
      models: models?.data ?? [],
      defaultModel: def?.data ?? null,
    };
  } catch (e) {
    return { ok: false, live: false, models: [], defaultModel: null, error: String(e?.message ?? e) };
  }
}

const sessionByKey = new Map(); // dmp conversation id -> opencode session id

// Per-agent tool policy is built by buildPermissions() in tools.js.
// (Proven constraint: a blanket deny-all breaks the provider call with a
// 403, so policy is always scoped rules plus a tail allow-all.)

// Per-agent tool policy lives in electron/tools.js (buildPermissions).
// A blanket deny-all breaks the provider call with a 403 (verified), so
// policy is always scoped allows/denies plus a tail allow-all.

// Directive prefix kept separate from the user's persona entry so the two
// never mix. Denials alone stop execution, but the model still sees tool
// schemas and may otherwise claim actions it never performed.
function runtimeDirective(tools, memoryPath) {
  const summary = toolsSummary(tools);
  const lines = [`[DMP runtime: tools for this agent — ${summary}.`];
  if (summary.startsWith('no tools')) {
    lines.push('You are a chat-only agent: do not call any tools. Answer from knowledge and say plainly when a task would need real tools.]');
  } else {
    lines.push('Only use the allowed tools, staying inside the agent workspace.');
    lines.push(`Agent memory file: ${memoryPath} — record durable user preferences there with your file tools when they change, and re-read it when relevant.]`);
  }
  lines.push('[DMP runtime: approvals exist — ask-first tools pause for the user to approve in the app and then run, so always attempt them when the task needs them. Never call the question tool itself: nothing can answer it. If you feel confirmation is needed, state what you are about to do and proceed.]');
  return lines.join(' ');
}

function logErr(scope, e) {
  console.error(`[dmp:${scope}]`, e?.message ?? e);
}

// Read provider/model state, tolerating slow service starts: poll briefly
// until something appears or the budget runs out (genuinely unauthenticated
// machines correctly resolve to empty after the budget).
async function settledSnapshot(c, budgetMs = 6000) {
  const deadline = Date.now() + budgetMs;
  let providers = { data: [] };
  let models = { data: [] };
  let def = { data: null };
  for (;;) {
    const [p, m, d] = await Promise.all([
      c.provider.list().catch((e) => { throw new Error(`provider.list: ${e?.message ?? e}`); }),
      c.model.list().catch((e) => { throw new Error(`model.list: ${e?.message ?? e}`); }),
      c.model.default().catch(() => ({ data: null })),
    ]);
    providers = p;
    models = m;
    def = d;
    if ((p?.data?.length ?? 0) > 0 || (m?.data?.length ?? 0) > 0 || d?.data) break;
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, 750));
  }
  return { providers, models, def };
}
// --- OpenCode status -------------------------------------------------
// Detects CLI presence via opencode-env, then reads live provider/model
// state through the user's real background service.
export async function getStatus({ refresh = false } = {}) {
  const cli = await detectCli({ refresh });
  const base = {
    installed: cli.found,
    executable: cli.path ?? null,
    version: cli.version ?? null,
    configDir: cli.configDir,
    authenticated: false,
    providers: 0,
    models: 0,
    state: 'not-installed',
    error: null,
  };
  if (!cli.found) return base;
  try {
    const c = await getClient();
    const { providers, models, def } = await settledSnapshot(c);
    const providerList = providers?.data ?? [];
    const modelList = models?.data ?? [];
    const authenticated = providerList.length > 0 || modelList.length > 0 || !!def?.data;
    return {
      ...base,
      authenticated,
      providers: providerList.length,
      models: modelList.length,
      defaultModel: def?.data ? `${def.data.providerID}/${def.data.modelID ?? def.data.id}` : null,
      state: !authenticated ? 'installed-not-authenticated' : modelList.length === 0 ? 'no-models' : 'connected',
    };
  } catch (e) {
    logErr('status', e);
    return { ...base, state: 'error', error: String(e?.message ?? e) };
  }
}

// --- session map persistence ------------------------------------------
export function getSessionMap() {
  return Object.fromEntries(sessionByKey);
}

export function forgetSession(key) {
  sessionByKey.delete(key);
}

// Load a persisted conv->session map, keeping only sessions the server
// still knows about. Returns the count of reused mappings.
export async function restoreSessionMap(saved) {
  if (!saved || typeof saved !== 'object') return { restored: 0 };
  let c;
  try {
    c = await getClient();
  } catch (e) {
    logErr('restore-sessions', e);
    return { restored: 0, error: String(e?.message ?? e) };
  }
  let restored = 0;
  for (const [key, sid] of Object.entries(saved)) {
    if (typeof sid !== 'string') continue;
    try {
      await c.session.get({ sessionID: sid });
      sessionByKey.set(key, sid);
      restored += 1;
    } catch {
      // stale session id — drop it; next send creates a fresh session
    }
  }
  return { restored };
}

async function readMemory(agentDirPath) {
  if (!agentDirPath) return '';
  try {
    const fs = await import('node:fs');
    const p = (await import('node:path')).join(agentDirPath, 'memory.md');
    const text = fs.readFileSync(p, 'utf8');
    return typeof text === 'string' ? text.slice(0, 8000) : '';
  } catch {
    return '';
  }
}

async function putPersona(c, sessionID, { instructions, tools, dir }) {
  // Durable per-session entries without touching OpenCode agent ids:
  // user persona, runtime directive (tool-aware), and agent memory file.
  // Failures are logged; chat still proceeds so one bad write can't
  // silently kill a conversation.
  const memory = await readMemory(dir);
  const entries = [
    instructions ? ['dmp-persona', instructions] : null,
    ['dmp-runtime', runtimeDirective(tools, dir ? `${dir}\\memory.md` : 'memory.md')],
    memory ? ['dmp-memory', memory] : null,
  ].filter(Boolean);
  for (const [key, value] of entries) {
    try {
      await c.session.instructions.entry.put({ sessionID, key, value });
    } catch (e) {
      logErr('put-persona', e);
    }
  }
}

export async function ensureSession({ key, title, instructions, model, agentId, tools }) {
  const hit = sessionByKey.get(key);
  if (hit) {
    // Re-validate cheaply: a server restart may have dropped the session.
    try {
      const c = await getClient();
      await c.session.get({ sessionID: hit });
      return hit;
    } catch {
      sessionByKey.delete(key);
    }
  }
  const c = await getClient();
  // Root the session in the agent's own data folder so the working
  // directory is truthful per agent. Falls back to server default when
  // the folder can't be prepared.
  let dir;
  try {
    if (agentId) dir = agentDir(agentId);
  } catch (e) {
    logErr('agent-dir', e);
  }
  const policy = normalizeTools({ id: agentId, tools });
  const perms = buildPermissions(policy, dir || null);
  let created;
  try {
    created = await c.session.create({
      title: (title || 'DMP conversation').slice(0, 80),
      model: parseModelRef(model),
      permissions: perms,
      ...(dir ? { location: { directory: dir } } : {}),
    });
  } catch (e) {
    logErr('session.create', e);
    throw new Error(`Session creation failed: ${e?.message ?? e}`);
  }
  // Note: unlike list endpoints, create unwraps to the session info directly.
  const id = created?.id;
  if (!id) throw new Error('session.create returned no id');
  sessionByKey.set(key, id);
  await putPersona(c, id, { instructions, tools: policy, dir });
  return id;
}

// Re-apply agent instructions to existing sessions (e.g. after the user
// edits them). Refreshes persona, runtime directive, and memory entries.
// Returns per-key results; failures are reported, not thrown.
export async function updateSessionInstructions(keys, instructions, tools) {
  const c = await getClient();
  const updated = [];
  const failed = [];
  for (const key of keys || []) {
    const sessionID = sessionByKey.get(key);
    if (!sessionID) continue;
    try {
      const info = await c.session.get({ sessionID }).catch(() => null);
      const dir = info?.location?.directory ?? null;
      const policy = normalizeTools({ tools });
      if (instructions) {
        await c.session.instructions.entry.put({ sessionID, key: 'dmp-persona', value: instructions });
      }
      await c.session.instructions.entry.put({ sessionID, key: 'dmp-runtime', value: runtimeDirective(policy, dir ? `${dir}\\memory.md` : 'memory.md') });
      const memory = await readMemory(dir);
      if (memory) {
        await c.session.instructions.entry.put({ sessionID, key: 'dmp-memory', value: memory });
      }
      updated.push(key);
    } catch (e) {
      logErr('update-instructions', e);
      failed.push({ key, error: String(e?.message ?? e) });
    }
  }
  return { updated, failed };
}

// Transcript of a session as plain {id, role, content, ts} rows.
// Used to hydrate conversations whose local transcript is empty.
export async function getHistory(key) {
  const sessionID = sessionByKey.get(key);
  if (!sessionID) return { messages: [], sessionID: null };
  const c = await getClient();
  const res = await c.message.list({ sessionID, limit: 200, order: 'asc' });
  const out = [];
  for (const m of res?.data ?? []) {
    if (m?.type === 'user' && typeof m.text === 'string') {
      out.push({ id: m.id, role: 'user', content: m.text, ts: m.time?.created ?? Date.now() });
    } else if (m?.type === 'assistant') {
      const text = assistantText(m);
      if (text) out.push({ id: m.id, role: 'agent', content: text, ts: m.time?.created ?? Date.now() });
    }
  }
  return { messages: out, sessionID };
}

function assistantText(msg) {
  if (!msg || msg.type !== 'assistant' || !Array.isArray(msg.content)) return '';
  return msg.content
    .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
}

function toolRuns(msg) {
  if (!msg || msg.type !== 'assistant' || !Array.isArray(msg.content)) return [];
  return msg.content
    .filter((p) => p && p.type === 'tool')
    .map((p) => ({ name: p.name, status: p.state?.status ?? 'unknown' }));
}

export async function chat({ key, text, title, instructions, model, agentId, tools, onChunk }) {
  const c = await getClient();
  const sessionID = await ensureSession({ key, title, instructions, model, agentId, tools });
  // Keep model selection in sync when the user switches mid-conversation.
  const ref = parseModelRef(model);
  if (ref) {
    try {
      await c.session.switchModel({ sessionID, model: ref });
    } catch {
      // non-fatal: prompt will use the session's current model
    }
  }
  // Stream interim assistant text via the global event loop when the caller
  // wants progress. Final text still comes from message.list after wait().
  let entry = null;
  if (typeof onChunk === 'function') {
    await ensureEventLoop();
    entry = { fn: onChunk, last: '', parts: new Map() };
    let set = chunkHandlers.get(sessionID);
    if (!set) {
      set = new Set();
      chunkHandlers.set(sessionID, set);
    }
    set.add(entry);
  }
  try {
    try {
      await c.session.prompt({ sessionID, text });
    } catch (e) {
      logErr('prompt', e);
      throw new Error(`Prompt failed: ${e?.message ?? e}`);
    }
    try {
      // Guard against runs that stall forever (e.g. an interactive tool
      // with no UI to answer it): stop the session and fail loudly.
      const TIMEOUT_MS = 6 * 60 * 1000;
      let timedOut = false;
      const timer = setTimeout(async () => {
        timedOut = true;
        try { await c.session.interrupt({ sessionID }); } catch { /* ignore */ }
      }, TIMEOUT_MS);
      try {
        await c.session.wait({ sessionID });
      } finally {
        clearTimeout(timer);
      }
      if (timedOut) throw new Error(`Generation timed out after ${TIMEOUT_MS / 1000}s and was interrupted.`);
    } catch (e) {
      logErr('wait', e);
      throw new Error(`Generation failed: ${e?.message ?? e}`);
    }
    const res = await c.message.list({ sessionID, limit: 20, order: 'desc' });
    const msgs = res?.data ?? [];
    const latest = msgs.find((m) => m?.type === 'assistant' && assistantText(m));
    if (!latest) {
      const errMsg = [...msgs].reverse().find((m) => m?.type === 'assistant' && m?.error);
      const detail = errMsg?.error?.message ?? errMsg?.error?.code ?? 'empty reply';
      throw new Error(`Model returned no text (${detail}). Check provider auth (opencode auth login).`);
    }
    return { sessionID, text: assistantText(latest), toolRuns: toolRuns(latest) };
  } finally {
    if (entry) chunkHandlers.get(sessionID)?.delete(entry);
  }
}

// Interrupt the running generation for a DMP conversation, if any.
// Used for cleanup (deleted conversation/agent). Overlapping sends in the
// same conversation stay queued server-side and are left alone.
export async function abort({ key }) {
  const sessionID = sessionByKey.get(key);
  if (!sessionID) return { interrupted: false };
  try {
    const c = await getClient();
    const res = await c.session.interrupt({ sessionID });
    return { interrupted: res?.interrupted ?? true };
  } catch (e) {
    logErr('interrupt', e);
    return { interrupted: false, error: String(e?.message ?? e) };
  }
}

// --- approval (HITL) plumbing ------------------------------------------
// effect:'ask' rules pause the run server-side with a `permission.asked`
// event. Main installs a sink that forwards the request to the UI; the UI
// answers through replyPermission(). Decisions: once | always | reject.
let approvalSink = null;
export function setApprovalSink(fn) {
  approvalSink = typeof fn === 'function' ? fn : null;
}

function sessionKey(sessionID) {
  for (const [k, v] of sessionByKey) if (v === sessionID) return k;
  return null;
}

export async function replyPermission({ requestID, sessionID, decision, message }) {
  if (!requestID || !sessionID) throw new Error('permission reply needs requestID + sessionID');
  if (!['once', 'always', 'reject'].includes(decision)) throw new Error(`bad decision: ${decision}`);
  const c = await getClient();
  try {
    await c.permission.reply({ sessionID, requestID, decision, ...(message ? { message } : {}) });
    return { ok: true };
  } catch (e) {
    logErr('permission.reply', e);
    throw new Error(`Permission reply failed: ${e?.message ?? e}`);
  }
}

// Single global SSE subscription; routes assistant text to per-session
// chunk handlers. Primary mechanism: `session.text.delta` token deltas,
// accumulated per assistant message. Fallback: full-content snapshots from
// `session.message.content.updated` (older/alternate servers).
let eventAbort = null;
const chunkHandlers = new Map(); // opencode session id -> Set<{fn, last, parts}>

function snapshotText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
}

function emit(entry, text) {
  if (!text || text === entry.last) return;
  entry.last = text;
  try {
    entry.fn(text);
  } catch {
    // renderer-side errors must not kill the loop
  }
}

function routeEvent(evt) {
  if (!evt) return;
  const d = evt.data ?? {};
  if (evt.type === 'permission.asked') {
    if (approvalSink && d.sessionID && d.id) {
      try {
        approvalSink({
          key: sessionKey(d.sessionID),
          requestID: d.id,
          sessionID: d.sessionID,
          action: d.action,
          resources: d.resources ?? [],
          message: d.message ?? null,
        });
      } catch (e) {
        logErr('approval-sink', e);
      }
    }
    return;
  }
  if (!d.sessionID) return;
  const set = chunkHandlers.get(d.sessionID);
  if (!set || set.size === 0) return;
  if (evt.type === 'session.text.delta' && typeof d.delta === 'string') {
    const key = d.assistantMessageID ?? 'default';
    for (const h of set) {
      h.parts.set(key, (h.parts.get(key) ?? '') + d.delta);
      emit(h, [...h.parts.values()].join('').trim());
    }
    return;
  }
  if (evt.type === 'session.text.ended' && typeof d.text === 'string') {
    const key = d.assistantMessageID ?? 'default';
    for (const h of set) {
      h.parts.set(key, d.text);
      emit(h, [...h.parts.values()].join('').trim());
    }
    return;
  }
  if (evt.type === 'session.message.content.updated') {
    const text = snapshotText(d.content);
    for (const h of set) emit(h, text);
  }
}

async function ensureEventLoop() {
  if (eventAbort) return;
  const c = await getClient();
  eventAbort = new AbortController();
  const signal = eventAbort.signal;
  (async () => {
    try {
      for await (const evt of c.event.subscribe({ signal })) {
        routeEvent(evt);
      }
    } catch (e) {
      if (e?.name !== 'AbortError') console.error('[opencode] event loop ended:', e?.message ?? e);
    } finally {
      if (eventAbort?.signal === signal) eventAbort = null;
    }
  })();
}
