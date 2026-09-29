import { useMemo, useState } from 'react';
import { dayLabel } from '../lib/utils.js';

export default function HistoryPanel({ agent, activeConvId, onSelect, onNew, onRename, onDelete, onClose }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...agent.conversations]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((c) => !needle || c.title.toLowerCase().includes(needle));
  }, [agent, q]);

  return (
    <aside className="history" aria-label="Conversation history">
      <div className="history-head">
        <span>Conversations</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close history">✕</button>
      </div>
      <div className="history-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations…" aria-label="Search conversations" /></div>
      <button className="history-new" onClick={onNew}>+ New conversation</button>
      <div className="history-list">
        {list.map((c) => (
          <div key={c.id} className={`history-row${c.id === activeConvId ? ' active' : ''}`}>
            <button className="history-main" onClick={() => onSelect(c.id)}>
              <span className="history-title">{c.title}</span>
              <span className="history-sub">{dayLabel(c.updatedAt)} · {c.messages.length} messages</span>
            </button>
            <span className="history-ops">
              <button title="Rename conversation" aria-label="Rename conversation" onClick={() => onRename(c.id)}>
                <svg viewBox="0 0 16 16" width="13" height="13"><path d="M11 2l3 3L6 13H3v-3l8-8z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
              </button>
              <button title="Delete conversation" aria-label="Delete conversation" onClick={() => onDelete(c.id)}>
                <svg viewBox="0 0 16 16" width="13" height="13"><path d="M3 4h10M6 4V2.8h4V4M5 4l.7 9h4.6L11 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              </button>
            </span>
          </div>
        ))}
        {list.length === 0 && <div className="pal-empty">No conversations yet.</div>}
      </div>
    </aside>
  );
}
