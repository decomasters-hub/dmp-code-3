import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';

export default function SearchPalette({ agents, onClose, onPickAgent, onPickConv }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const aList = agents.filter((a) => !needle || a.name.toLowerCase().includes(needle) || (a.title || '').toLowerCase().includes(needle));
    const cList = [];
    agents.forEach((a) => a.conversations.forEach((c) => {
      if (!needle || c.title.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle)) cList.push({ agent: a, conv: c });
    }));
    return { aList: aList.slice(0, 6), cList: cList.slice(0, 8) };
  }, [agents, q]);

  const flat = useMemo(() => ([
    ...results.aList.map((a) => ({ kind: 'agent', agent: a })),
    ...results.cList.map((c) => ({ kind: 'conv', ...c })),
  ]), [results]);

  useEffect(() => { setIdx(0); }, [q]);

  function choose(item) {
    if (!item) return;
    if (item.kind === 'agent') onPickAgent(item.agent.id);
    else onPickConv(item.agent.id, item.conv.id);
  }

  return (
    <div className="overlay top" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="palette-input">
          <svg viewBox="0 0 16 16" width="15" height="15"><circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M10.5 10.5 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search agents and conversations…"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, flat.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); choose(flat[idx]); }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-body">
          {results.aList.length > 0 && (
            <>
              <div className="pal-label">Agents</div>
              {results.aList.map((a, i) => {
                const fi = i;
                return (
                  <button key={a.id} className={`pal-row${fi === idx ? ' hot' : ''}`} onClick={() => choose({ kind: 'agent', agent: a })} onMouseEnter={() => setIdx(fi)}>
                    <Avatar avatarId={a.avatar} size={26} status={a.status} name={a.name} />
                    <span><b>{a.name}</b><i>{a.title}</i></span>
                  </button>
                );
              })}
            </>
          )}
          {results.cList.length > 0 && (
            <>
              <div className="pal-label">Conversations</div>
              {results.cList.map(({ agent, conv }, j) => {
                const fi = results.aList.length + j;
                return (
                  <button key={conv.id} className={`pal-row${fi === idx ? ' hot' : ''}`} onClick={() => choose({ kind: 'conv', agent, conv })} onMouseEnter={() => setIdx(fi)}>
                    <span className="pal-conv-dot" />
                    <span><b>{conv.title}</b><i>{agent.name} — {conv.messages.length} messages</i></span>
                  </button>
                );
              })}
            </>
          )}
          {flat.length === 0 && <div className="pal-empty">No matches. Try an agent name or topic.</div>}
        </div>
        <div className="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> select</span></div>
      </div>
    </div>
  );
}
