// Renderer-side wrapper around the Electron runtime bridge.
//
// Two modes, explicit:
// - Electron (window.api present): REAL OpenCode ONLY. No mock replies,
//   no mock models. Failures surface as errors.
// - Browser dev (no window.api): empty shelf, explicit unavailable notice.
//   No fake models, no fake AI responses anywhere.

export function hasRuntime() {
  return typeof window !== 'undefined' && !!window.api?.runtime;
}

// Server Model.Info -> Composer shelf item { id, name, tag, desc }.
// Server id form is "provider/model" (stable ref string for chat calls).
// Only metadata OpenCode actually provides is used.
export function toShelfItems(serverModels) {
  if (!Array.isArray(serverModels) || serverModels.length === 0) return [];
  return serverModels
    .filter((m) => m && m.enabled !== false && m.status !== 'deprecated')
    .map((m) => {
      const bits = [m.family, m.status === 'active' ? null : m.status].filter(Boolean);
      if (Array.isArray(m.variants) && m.variants.length > 0) bits.push(`${m.variants.length} variant${m.variants.length === 1 ? '' : 's'}`);
      return {
        id: `${m.providerID}/${m.modelID ?? m.id}`,
        name: m.name || m.modelID || m.id,
        tag: m.providerID,
        desc: bits.join(' · ') || 'Live model',
      };
    });
}

export function defaultShelfId(serverModels, defaultModel) {
  if (defaultModel?.providerID && (defaultModel?.modelID || defaultModel?.id)) {
    return `${defaultModel.providerID}/${defaultModel.modelID ?? defaultModel.id}`;
  }
  const items = toShelfItems(serverModels);
  return items[0]?.id ?? null;
}

// OpenCode CLI/runtime status. In browser dev returns a synthetic
// not-installed state so Settings renders honestly.
export async function fetchStatus(refresh = false) {
  if (!hasRuntime()) return { installed: false, state: 'web-dev-mode', providers: 0, models: 0 };
  try {
    return await window.api.opencode.status({ refresh });
  } catch (e) {
    return { installed: false, state: 'error', providers: 0, models: 0, error: String(e?.message ?? e) };
  }
}

export async function fetchShelf() {
  // No runtime (dev browser): empty shelf. No fake models anywhere.
  if (!hasRuntime()) return { live: false, models: [], defaultId: null, dev: true };
  try {
    const res = await window.api.opencode.models();
    const items = toShelfItems(res?.models);
    if (!res?.ok || items.length === 0) {
      // Live path: NO mock fallback. Empty shelf + error reason.
      return { live: false, models: [], defaultId: null, error: res?.error ?? 'no-models' };
    }
    return { live: true, models: items, defaultId: defaultShelfId(res.models, res.defaultModel) };
  } catch (e) {
    return { live: false, models: [], defaultId: null, error: String(e?.message ?? e) };
  }
}

// Anything that is not a real "provider/model" ref (empty, legacy ids)
// means "use the server default model".
function isMockId(id) {
  return !id || !id.includes('/');
}

// One shared chunk subscription, demultiplexed by conversation key.
const chunkSubs = new Map(); // key -> Set<fn>
let chunkListening = false;

function ensureChunkListener() {
  if (chunkListening || !hasRuntime()) return;
  chunkListening = true;
  window.api.runtime.onChatChunk(({ key, text } = {}) => {
    const set = chunkSubs.get(key);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(text);
      } catch {
        // subscriber errors must not break other conversations
      }
    }
  });
}

export async function sendChat({ agent, conversationKey, text, model, onChunk }) {
  // Electron: real runtime only — throws on failure, never mocks.
  if (hasRuntime()) {
    let unsub = null;
    if (typeof onChunk === 'function') {
      ensureChunkListener();
      let set = chunkSubs.get(conversationKey);
      if (!set) {
        set = new Set();
        chunkSubs.set(conversationKey, set);
      }
      set.add(onChunk);
      unsub = () => {
        set.delete(onChunk);
        if (set.size === 0) chunkSubs.delete(conversationKey);
      };
    }
    try {
      const res = await window.api.runtime.chat({
        key: conversationKey,
        text,
        title: agent?.name ? `${agent.name} — chat` : 'DMP conversation',
        instructions: agent?.instructions ?? '',
        agentId: agent?.id ?? null,
        // Mock shelf ids are UI-only; send undefined so the server uses default.
        model: isMockId(model) ? undefined : model,
      });
      return { text: res.text, live: true, sessionID: res.sessionID };
    } finally {
      unsub?.();
    }
  }
  // Browser dev only: no fake replies. The user message is still recorded
  // by the caller; the assistant row states the limitation explicitly.
  await new Promise((r) => setTimeout(r, 300));
  return {
    text: 'Dev browser mode — real chat only runs inside the Electron app with OpenCode configured. This message was not sent anywhere and no model replied.',
    live: false,
  };
}

// Best-effort cancel of a running generation. No-op outside Electron.
export function abortChat(conversationKey) {
  if (!hasRuntime() || !conversationKey) return Promise.resolve({ interrupted: false });
  return window.api.runtime.abort({ key: conversationKey }).catch(() => ({ interrupted: false }));
}

export async function fetchHistory(conversationKey) {
  if (!hasRuntime()) return { messages: [], sessionID: null };
  try {
    return await window.api.sessions.history(conversationKey);
  } catch {
    return { messages: [], sessionID: null };
  }
}

export function forgetSession(conversationKey) {
  if (!hasRuntime() || !conversationKey) return Promise.resolve({ ok: true });
  return window.api.sessions.forget(conversationKey).catch(() => ({ ok: false }));
}

export async function pushInstructions(convKeys, instructions) {
  if (!hasRuntime()) return { updated: [], failed: [] };
  try {
    return await window.api.sessions.updateInstructions(convKeys, instructions);
  } catch (e) {
    return { updated: [], failed: [{ key: '*', error: String(e?.message ?? e) }] };
  }
}

export async function loadPersistedState() {
  if (!hasRuntime()) return null;
  try {
    const res = await window.api.state.load();
    return res?.ok ? res.state : null;
  } catch {
    return null;
  }
}

export function persistState(payload) {
  if (!hasRuntime()) return Promise.resolve({ ok: false, skipped: true });
  return window.api.state.save(payload).catch((e) => ({ ok: false, error: String(e?.message ?? e) }));
}
