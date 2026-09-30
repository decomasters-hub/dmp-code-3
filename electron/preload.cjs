const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer (React) side.
// Narrowly scoped: no ipcRenderer, fs, child_process, or SDK leaks.
// - opencode: CLI/runtime discovery (status, models)
// - runtime: chat generation + abort + streamed chunks
// - sessions: conversation<->OpenCode-session mapping helpers
// - state: persisted UI state (agents, conversations, selection)
//
// NOTE: CommonJS on purpose — preload scripts must load reliably in every
// Electron version; ESM preload support is inconsistent.
contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  version: '0.1.0',
  opencode: {
    // { installed, executable, version, configDir, authenticated,
    //   providers, models, defaultModel, state, error }
    // state: not-installed | installed-not-authenticated | connected |
    //         no-models | error
    status: (opts) => ipcRenderer.invoke('dmp:status', opts || {}),
    // { ok, live, models, defaultModel, error? }
    models: () => ipcRenderer.invoke('dmp:models'),
  },
  runtime: {
    // { sessionID, text } or throws
    chat: (payload) => ipcRenderer.invoke('dmp:chat', payload),
    // { interrupted, error? } — best-effort cancel of a running generation
    abort: (payload) => ipcRenderer.invoke('dmp:abort', payload),
    // Subscribe to streamed text snapshots: cb({ key, text }). Returns unsub.
    onChatChunk: (cb) => {
      const h = (_evt, data) => cb(data);
      ipcRenderer.on('dmp:chat-chunk', h);
      return () => ipcRenderer.removeListener('dmp:chat-chunk', h);
    },
  },
  sessions: {
    // { messages, sessionID, error? } — server transcript for a conversation
    history: (key) => ipcRenderer.invoke('dmp:session:history', { key }),
    // Drop the conversation->session mapping (stale-cleanup on delete)
    forget: (key) => ipcRenderer.invoke('dmp:session:forget', { key }),
    // Re-apply instructions to mapped sessions: { updated, failed }
    updateInstructions: (keys, instructions, tools) => ipcRenderer.invoke('dmp:session:instructions', { keys, instructions, tools }),
  },
  approvals: {
    // Subscribe to tool-approval requests: cb({ key, requestID, sessionID,
    // action, resources, message }). Returns unsub.
    onAsked: (cb) => {
      const h = (_evt, data) => cb(data);
      ipcRenderer.on('dmp:permission-asked', h);
      return () => ipcRenderer.removeListener('dmp:permission-asked', h);
    },
    // Answer one: decision once | always | reject. Resolves { ok }.
    reply: (payload) => ipcRenderer.invoke('dmp:permission:reply', payload || {}),
  },
  state: {
    // Persist UI state; main merges in the live session map.
    save: (payload) => ipcRenderer.invoke('dmp:state:save', payload || {}),
    // { ok, state|null, error? }
    load: () => ipcRenderer.invoke('dmp:state:load'),
  },
});
