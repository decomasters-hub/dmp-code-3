import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import AgentHeader from './components/AgentHeader.jsx';
import ConversationView, { EmptyAgentState } from './components/ConversationView.jsx';
import Composer from './components/Composer.jsx';
import AgentModal from './components/AgentModal.jsx';
import ApprovalModal from './components/ApprovalModal.jsx';
import { DeleteConfirm, RenamePrompt } from './components/ConfirmModals.jsx';
import SearchPalette from './components/SearchPalette.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import { seedAgents } from './lib/mock.js';
import { fetchShelf, fetchStatus, sendChat, abortChat, forgetSession, fetchHistory, pushInstructions, loadPersistedState, persistState, hasRuntime, onApproval, replyApproval } from './lib/runtime.js';
import { normalizeTools } from './lib/toolPolicy.js';
import { uid, now } from './lib/utils.js';
import './App.css';

const AGENT_MENU = [
  { key: 'edit', label: 'Edit agent' },
  { key: 'newconv', label: 'New conversation', hint: 'Ctrl+Shift+O' },
  { key: 'history', label: 'View conversations' },
  { key: 'sep1', sep: true },
  { key: 'duplicate', label: 'Duplicate' },
  { key: 'rename', label: 'Rename' },
  { key: 'sep2', sep: true },
  { key: 'delete', label: 'Delete agent', danger: true },
];

const SEED = seedAgents();

// Every agent carries its own selected model id (null = server default)
// and its own tool policy (normalized against role defaults).
// Persisted agents keep theirs; seeds start unresolved.
function withModel(a) {
  return a.model !== undefined ? a : { ...a, model: null };
}

function withTools(a) {
  return { ...a, tools: normalizeTools(a) };
}

function normalizeAgent(a) {
  return withTools(withModel(a));
}

export default function App() {
  const [agents, setAgents] = useState(() => SEED.map(normalizeAgent));
  const [activeAgentId, setActiveAgentId] = useState('ag_atlas');
  const [activeConv, setActiveConv] = useState(() => {
    const m = {};
    SEED.forEach((a) => { m[a.id] = a.conversations[0]?.id ?? null; });
    return m;
  });
  const [modal, setModal] = useState(null); // {kind:'create'|'edit'} | null
  const [delAgent, setDelAgent] = useState(null);
  const [delConv, setDelConv] = useState(null);
  const [rename, setRename] = useState(null); // {kind:'agent'|'conv', id, value}
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({ theme: 'Dark', density: 'Comfortable', enterToSend: true, showStatus: true });
  const [ctx, setCtx] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const [composerDraft, setComposerDraft] = useState('');
  const [shelf, setShelf] = useState([]);
  const [shelfDefault, setShelfDefault] = useState(null);
  const [live, setLive] = useState(false);
  const [booted, setBooted] = useState(false);
  const [ocStatus, setOcStatus] = useState(null);
  const [approvals, setApprovals] = useState([]); // queued permission.asked requests
  const timers = useRef([]);
  const reqs = useRef(new Map()); // convId -> { stopped } while a generation runs

  // Boot: persisted UI state + OpenCode status + model shelf, once.
  useEffect(() => {
    let on = true;
    (async () => {
      const [saved, status, sh] = await Promise.all([
        loadPersistedState(),
        fetchStatus(),
        fetchShelf(),
      ]);
      if (!on) return;
      if (saved && Array.isArray(saved.agents) && saved.agents.length > 0) {
        const validIds = new Set(saved.agents.map((a) => a.id));
        setAgents(saved.agents.map(normalizeAgent));
        if (saved.activeAgentId && validIds.has(saved.activeAgentId)) setActiveAgentId(saved.activeAgentId);
        if (saved.activeConv) {
          setActiveConv((prev) => {
            const next = { ...prev };
            for (const [aid, cid] of Object.entries(saved.activeConv)) {
              if (validIds.has(aid)) next[aid] = cid;
            }
            return next;
          });
        }
      }
      setOcStatus(status);
      setShelf(sh.models);
      setLive(sh.live);
      if (sh.defaultId) setShelfDefault(sh.defaultId);
      if (saved && saved.settings && typeof saved.settings === 'object') {
        setSettings((prev) => ({ ...prev, ...saved.settings }));
      }
      setBooted(true);
    })();
    return () => { on = false; };
  }, []);

  // Persist UI state (debounced). Main merges in the live session map.
  // Web dev mode: nothing to persist to.
  const persistT = useRef(null);
  useEffect(() => {
    if (!booted || !hasRuntime()) return;
    clearTimeout(persistT.current);
    persistT.current = setTimeout(() => {
      persistState({ agents, activeAgentId, activeConv, settings });
    }, 600);
    return () => clearTimeout(persistT.current);
  }, [agents, activeAgentId, activeConv, settings, booted]);

  async function refreshStatus() {
    const s = await fetchStatus(true);
    setOcStatus(s);
    const sh = await fetchShelf();
    setShelf(sh.models);
    setLive(sh.live);
    if (sh.defaultId) setShelfDefault(sh.defaultId);
    return s;
  }

  // Tool-approval requests from any conversation land here; the modal shows
  // the first, the rest queue. Decisions resume the paused run server-side.
  useEffect(() => {
    if (!hasRuntime()) return;
    return onApproval(null, (req) => {
      setApprovals((p) => (p.some((r) => r.requestID === req.requestID) ? p : [...p, req]));
    });
  }, [booted]);

  async function decideApproval(decision) {
    const [head, ...rest] = approvals;
    if (!head) return;
    setApprovals(rest);
    const res = await replyApproval({ requestID: head.requestID, sessionID: head.sessionID, decision });
    if (!res?.ok) setStatus(activeAgentId, 'Needs attention');
  }

  const agent = useMemo(() => agents.find((a) => a.id === activeAgentId) || agents[0], [agents, activeAgentId]);
  const convId = agent ? activeConv[agent.id] ?? null : null;
  const conversation = useMemo(() => agent?.conversations.find((c) => c.id === convId) || null, [agent, convId]);

  // Per-agent model, resolved against the current shelf.
  const agentModelId = useMemo(() => {
    if (agent?.model && shelf.some((m) => m.id === agent.model)) return agent.model;
    return shelf.some((m) => m.id === shelfDefault) ? shelfDefault : shelf[0]?.id ?? null;
  }, [agent, shelf, shelfDefault]);

  function setAgentModel(id) {
    if (!agent) return;
    const aid = agent.id;
    setAgents((p) => p.map((a) => (a.id === aid ? { ...a, model: id } : a)));
  }

  const sending = !!convId && reqs.current.has(convId);

  // Fill an empty conversation from its OpenCode session transcript.
  async function maybeHydrate(conv) {
    if (!conv || conv.messages.length > 0 || !hasRuntime()) return;
    const h = await fetchHistory(conv.id);
    if (h.messages?.length) {
      setAgents((p) => p.map((a) => ({
        ...a,
        conversations: a.conversations.map((c) => (c.id === conv.id && c.messages.length === 0
          ? { ...c, messages: h.messages, updatedAt: now() }
          : c)),
      })));
    }
  }

  function selectConversation(aid, cid) {
    setActiveAgentId(aid);
    setActiveConv((p) => ({ ...p, [aid]: cid }));
    setHistoryOpen(false);
    setTyping(false);
    const ag = agents.find((a) => a.id === aid);
    const conv = ag?.conversations.find((c) => c.id === cid);
    if (conv) maybeHydrate(conv);
  }

  // Theme + density
  useEffect(() => {
    const root = document.documentElement;
    const theme = settings.theme === 'System'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : settings.theme.toLowerCase();
    root.dataset.theme = theme;
    root.dataset.density = settings.density.toLowerCase();
  }, [settings]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const setStatus = useCallback((agentId, status) => {
    setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, status } : a)));
  }, []);

  // ---------- agent ops ----------
  function createAgent(data) {
    const id = uid('ag');
    const a = { id, status: 'Ready', activity: 'Just now', conversations: [], model: agentModelId, ...data };
    const normalized = { ...a, tools: normalizeTools({ id, ...(a.tools || {}) }) };
    setAgents((p) => [normalized, ...p]);
    setActiveAgentId(id);
    setActiveConv((p) => ({ ...p, [id]: null }));
    setModal(null);
    setHistoryOpen(false);
    setFocusKey((k) => k + 1);
  }

  function saveEdit(data) {
    const prev = agents.find((a) => a.id === agent.id);
    setAgents((p) => p.map((a) => (a.id === agent.id ? { ...a, ...data } : a)));
    setModal(null);
    // Instructions must reach OpenCode, not just React state: re-apply the
    // persona entry on every mapped session of this agent's conversations.
    if (prev && typeof data.instructions === 'string' && data.instructions !== prev.instructions) {
      const keys = (prev.conversations || []).map((c) => c.id);
      if (keys.length > 0) {
        pushInstructions(keys, data.instructions, prev.tools).then((res) => {
          if (res?.failed?.length) setStatus(agent.id, 'Needs attention');
        });
      }
    }
  }

  function confirmDeleteAgent() {
    const id = delAgent;
    const doomed = agents.find((a) => a.id === id);
    doomed?.conversations.forEach((c) => { abortChat(c.id); forgetSession(c.id); });
    const rest = agents.filter((a) => a.id !== id);
    setAgents(rest);
    setDelAgent(null);
    if (activeAgentId === id && rest[0]) setActiveAgentId(rest[0].id);
  }

  function duplicateAgent(id) {
    const src = agents.find((a) => a.id === id);
    if (!src) return;
    const copy = { ...src, id: uid('ag'), name: `${src.name} Copy`, status: 'Ready', conversations: src.conversations.map((c) => ({ ...c, id: uid('c'), messages: c.messages.map((m) => ({ ...m })) })) };
    setAgents((p) => [copy, ...p]);
  }

  // ---------- conversation ops ----------
  function newConversation(agentId = agent.id) {
    const c = { id: uid('c'), title: 'New conversation', updatedAt: now(), messages: [] };
    setAgents((p) => p.map((a) => (a.id === agentId ? { ...a, conversations: [c, ...a.conversations] } : a)));
    setActiveConv((p) => ({ ...p, [agentId]: null }));
    setHistoryOpen(false);
    setFocusKey((k) => k + 1);
  }

  function stopSending() {
    if (!convId) return;
    const req = reqs.current.get(convId);
    if (!req) return;
    req.stopped = true;
    abortChat(convId).then((res) => {
      if (res && res.interrupted === false && res.error) setStatus(agent.id, 'Needs attention');
    });
  }

  async function send(text) {
    const targetId = agent.id;
    const agentSnap = agent;
    const modelSnap = agentModelId;
    let cid = convId;
    if (!cid) {
      cid = uid('c');
      const title = text.length > 42 ? text.slice(0, 42) + '…' : text;
      const fresh = { id: cid, title, updatedAt: now(), messages: [] };
      setAgents((p) => p.map((a) => (a.id === targetId ? { ...a, conversations: [fresh, ...a.conversations] } : a)));
      setActiveConv((p) => ({ ...p, [targetId]: cid }));
    }
    const um = { id: uid('m'), role: 'user', content: text, ts: now() };
    setAgents((p) => p.map((a) => (a.id === targetId
      ? { ...a, conversations: a.conversations.map((c) => (c.id === cid ? { ...c, messages: [...c.messages, um], updatedAt: now(), title: c.title === 'New conversation' ? (text.length > 42 ? text.slice(0, 42) + '…' : text) : c.title } : c)) }
      : a)));
    setStatus(targetId, 'Thinking');
    setTyping(true);
    const req = { stopped: false };
    reqs.current.set(cid, req);
    // Streamed reply row: created on the first chunk, updated as snapshots
    // arrive, finalized when chat() resolves. Same id throughout.
    const replyId = uid('m');
    let streamed = false;
    let lastPartial = '';
    const upsertReply = (content) => {
      setAgents((p) => p.map((a) => (a.id === targetId
        ? {
          ...a,
          conversations: a.conversations.map((c) => {
            if (c.id !== cid) return c;
            const i = c.messages.findIndex((m) => m.id === replyId);
            const row = { id: replyId, role: 'agent', content, ts: now() };
            const messages = i === -1 ? [...c.messages, row] : c.messages.map((m) => (m.id === replyId ? row : m));
            return { ...c, messages, updatedAt: now() };
          }),
        }
        : a)));
    };
    try {
      const res = await sendChat({
        agent: agentSnap,
        conversationKey: cid,
        text,
        model: modelSnap,
        onChunk: (partial) => {
          streamed = true;
          lastPartial = partial;
          setTyping(false);
          setStatus(targetId, 'Working');
          upsertReply(partial);
        },
      });
      upsertReply(res.text);
      if (Array.isArray(res.toolRuns) && res.toolRuns.length > 0) {
        const rows = res.toolRuns.map((t) => ({ id: uid('m'), role: 'tool', name: t.name, status: t.status, ts: now() }));
        setAgents((p) => p.map((a) => (a.id === targetId
          ? { ...a, conversations: a.conversations.map((c) => (c.id === cid ? { ...c, messages: [...c.messages, ...rows], updatedAt: now() } : c)) }
          : a)));
      }
      setStatus(targetId, req.stopped ? 'Ready' : 'Done');
      if (!req.stopped) timers.current.push(setTimeout(() => setStatus(targetId, 'Ready'), 1400));
    } catch (e) {
      const detail = e?.message ?? String(e);
      if (req.stopped) {
        // User-initiated stop: keep the partial reply, no error styling.
        upsertReply(lastPartial ? `${lastPartial}\n\n[Stopped]` : 'Stopped.');
        setStatus(targetId, 'Ready');
      } else {
        upsertReply(streamed && lastPartial
          ? `${lastPartial}\n\n[request ended early: ${detail}]`
          : `Couldn't reach the local runtime.\n\n${detail}\n\nTo enable live replies, authenticate a provider (run \`opencode auth login\` in a terminal), then send again.`);
        setStatus(targetId, 'Needs attention');
      }
    } finally {
      reqs.current.delete(cid);
      setTyping(false);
    }
  }

  // ---------- menus / shortcuts ----------
  function openCtx(e, agentId, items = null) {
    e.preventDefault();
    e.stopPropagation();
    const list = items || [
      { key: 'newconv', label: 'New conversation' },
      { key: 'edit', label: 'Edit agent' },
      { key: 'rename', label: 'Rename' },
      { key: 'duplicate', label: 'Duplicate' },
      { key: 'sep', sep: true },
      { key: 'delete', label: 'Delete', danger: true },
    ];
    setCtx({ x: e.clientX, y: e.clientY, agentId, items: list });
  }

  function ctxAction(key) {
    const id = ctx?.agentId || agent.id;
    setCtx(null);
    if (key === 'edit') { setActiveAgentId(id); setModal({ kind: 'edit', agentId: id }); }
    if (key === 'newconv') { setActiveAgentId(id); newConversation(id); }
    if (key === 'history') setHistoryOpen(true);
    if (key === 'duplicate') duplicateAgent(id);
    if (key === 'rename') {
      const a = agents.find((x) => x.id === id);
      setRename({ kind: 'agent', id, value: a.name });
    }
    if (key === 'delete') setDelAgent(id);
  }

  useEffect(() => {
    const h = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((v) => !v); }
      if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); setModal({ kind: 'create' }); }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); newConversation(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, convId, agents]);

  const transcriptRef = useRef(null);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [conversation?.messages.length, typing]);

  if (!booted) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (!agent) return <div className="shell"><p className="muted">No agents.</p></div>;
  const editingAgent = modal?.kind === 'edit' ? agents.find((a) => a.id === (modal.agentId || agent.id)) : null;

  return (
    <div className="shell">
      <Sidebar
        agents={agents}
        activeAgentId={agent.id}
        onSelect={(id) => { setActiveAgentId(id); setHistoryOpen(false); setTyping(false); }}
        onNewAgent={() => setModal({ kind: 'create' })}
        onSearch={() => setSearchOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onContextMenu={(e, id) => openCtx(e, id)}
      />

      <main className="main">
        <AgentHeader
          agent={agent}
          showStatus={settings.showStatus}
          convCount={agent.conversations.length}
          onNewChat={() => newConversation()}
          onHistory={() => setHistoryOpen((v) => !v)}
          showHistory={historyOpen}
          onMenu={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setCtx({ x: r.left - 140, y: r.bottom + 6, agentId: agent.id, items: AGENT_MENU });
          }}
        />

        <div className="workspace">
          <div className="conv-col" ref={transcriptRef}>
            {conversation ? (
              <ConversationView agent={agent} conversation={conversation} typing={typing} />
            ) : (
              <EmptyAgentState agent={agent} onStarter={(s) => { setComposerDraft(s); setFocusKey((k) => k + 1); }} />
            )}
          </div>
          {historyOpen && (
            <HistoryPanel
              agent={agent}
              activeConvId={convId}
              onSelect={(cid) => selectConversation(agent.id, cid)}
              onNew={() => newConversation()}
              onRename={(cid) => {
                const c = agent.conversations.find((x) => x.id === cid);
                setRename({ kind: 'conv', id: cid, value: c.title });
              }}
              onDelete={(cid) => setDelConv(cid)}
              onClose={() => setHistoryOpen(false)}
            />
          )}
        </div>

        <Composer
          key={agent.id + focusKey}
          focusKey={focusKey}
          initialValue={composerDraft}
          onConsumed={() => setComposerDraft('')}
          model={agentModelId}
          models={shelf}
          live={live}
          enterToSend={settings.enterToSend}
          sending={sending}
          onStop={stopSending}
          onModelChange={setAgentModel}
          onSend={send}
        />
      </main>

      {modal?.kind === 'create' && (
        <AgentModal mode="create" initial={null} onClose={() => setModal(null)} onSave={createAgent} />
      )}
      {modal?.kind === 'edit' && editingAgent && (
        <AgentModal mode="edit" initial={editingAgent} onClose={() => setModal(null)} onSave={saveEdit} />
      )}
      {delAgent && (
        <DeleteConfirm
          name={agents.find((a) => a.id === delAgent)?.name || ''}
          kind="agent"
          onCancel={() => setDelAgent(null)}
          onConfirm={confirmDeleteAgent}
        />
      )}
      {delConv && (
        <DeleteConfirm
          name={agent.conversations.find((c) => c.id === delConv)?.title || ''}
          kind="conversation"
          onCancel={() => setDelConv(null)}
          onConfirm={() => {
            abortChat(delConv);
            forgetSession(delConv);
            setAgents((p) => p.map((a) => (a.id === agent.id ? { ...a, conversations: a.conversations.filter((c) => c.id !== delConv) } : a)));
            if (convId === delConv) setActiveConv((p) => ({ ...p, [agent.id]: null }));
            setDelConv(null);
          }}
        />
      )}
      {rename && (
        <RenamePrompt
          label={rename.kind === 'agent' ? 'Rename agent' : 'Rename conversation'}
          value={rename.value}
          onCancel={() => setRename(null)}
          onConfirm={(v) => {
            if (rename.kind === 'agent') setAgents((p) => p.map((a) => (a.id === rename.id ? { ...a, name: v } : a)));
            else setAgents((p) => p.map((a) => (a.id === agent.id ? { ...a, conversations: a.conversations.map((c) => (c.id === rename.id ? { ...c, title: v } : c)) } : a)));
            setRename(null);
          }}
        />
      )}
      {searchOpen && (
        <SearchPalette
          agents={agents}
          onClose={() => setSearchOpen(false)}
          onPickAgent={(id) => { setActiveAgentId(id); setSearchOpen(false); setHistoryOpen(false); }}
          onPickConv={(aid, cid) => { setSearchOpen(false); selectConversation(aid, cid); }}
        />
      )}
      {settingsOpen && <SettingsModal settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} opencode={ocStatus} onRefreshStatus={refreshStatus} />}
      {approvals.length > 0 && (
        <ApprovalModal
          request={approvals[0]}
          queueCount={approvals.length - 1}
          onDecision={decideApproval}
        />
      )}
      {ctx && <ContextMenu menu={ctx} onClose={() => setCtx(null)} onAction={ctxAction} />}
    </div>
  );
}

// Starter population is handled via Composer initialValue — no DOM hacks.
