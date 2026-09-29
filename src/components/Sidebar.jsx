import Avatar from './Avatar.jsx';

export default function Sidebar({
  agents, activeAgentId, onSelect, onNewAgent, onSearch, onSettings,
  onContextMenu, collapsed = false,
}) {
  return (
    <aside className="sidebar">
      <div className="side-top">
        <div className="appmark">
          <span className="appmark-glyph" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="16" height="16"><circle cx="10" cy="10" r="4.2" fill="none" stroke="#e7eaf1" strokeWidth="1.8"/><ellipse cx="10" cy="10" rx="8" ry="3.2" fill="none" stroke="#5b8cff" strokeWidth="1.4" transform="rotate(-24 10 10)"/></svg>
          </span>
          <span className="appmark-name">Northdesk</span>
        </div>
        <div className="side-actions">
          <button className="icon-btn" title="Search (Ctrl+K)" onClick={onSearch} aria-label="Search">
            <svg viewBox="0 0 16 16" width="15" height="15"><circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M10.5 10.5 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          <button className="icon-btn" title="Settings" onClick={onSettings} aria-label="Settings">
            <svg viewBox="0 0 16 16" width="15" height="15"><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      <button className="new-agent" onClick={onNewAgent}>
        <span className="plus" aria-hidden="true">+</span> New Agent
        <kbd>Ctrl+N</kbd>
      </button>

      <div className="roster-label">
        <span>Agents</span>
        <span className="count">{agents.length}</span>
      </div>

      <div className="roster" role="listbox" aria-label="Agents">
        {agents.map((a) => {
          const active = a.id === activeAgentId;
          const last = a.conversations[0];
          return (
            <button
              key={a.id}
              role="option"
              aria-selected={active}
              className={`agent-row${active ? ' active' : ''}`}
              onClick={() => onSelect(a.id)}
              onContextMenu={(e) => onContextMenu(e, a.id)}
            >
              <Avatar avatarId={a.avatar} status={a.status} name={a.name} size={32} />
              <span className="agent-meta">
                <span className="agent-name">{a.name}</span>
                <span className={`agent-sub sub-${a.status.toLowerCase().replace(/[^a-z]/g, '')}`}>{a.status}</span>
              </span>
              {a.status === 'Working' || a.status === 'Thinking' ? <span className="pulse" aria-hidden="true" /> : null}
            </button>
          );
        })}
        {agents.length === 0 && (
          <div className="roster-empty">No agents yet.<br />Create your first coworker.</div>
        )}
      </div>

      <div className="side-footer">
        <button className="footer-row" onClick={onSettings} title="Preferences">
          <span className="footer-ava">K</span>
          <span className="footer-meta"><span className="footer-name">Workspace</span><span className="footer-sub">Local prototype</span></span>
        </button>
      </div>
    </aside>
  );
}
