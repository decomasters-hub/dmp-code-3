import Avatar from './Avatar.jsx';

export default function AgentHeader({ agent, convCount, onNewChat, onMenu, onHistory, showHistory, showStatus = true }) {
  if (!agent) return <header className="agent-header empty" />;
  return (
    <header className="agent-header">
      <div className="ah-id">
        <Avatar avatarId={agent.avatar} status={agent.status} name={agent.name} size={36} />
        <div className="ah-text">
          <div className="ah-name">{agent.name}</div>
          <div className="ah-title">{agent.title || 'Untitled role'}</div>
        </div>
        {showStatus && <span className={`status-chip chip-${agent.status.toLowerCase().replace(/[^a-z]/g, '')}`}>{agent.status}</span>}
      </div>
      <div className="ah-actions">
        <button className="btn ghost" onClick={onHistory} title="Conversation history" aria-pressed={showHistory}>
          <svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          <span className="hide-narrow">History</span>
          <span className="history-count">{convCount}</span>
        </button>
        <button className="btn primary-sm" onClick={onNewChat} title="New conversation">
          <span aria-hidden="true">+</span> New chat
        </button>
        <button className="icon-btn" onClick={onMenu} title="Agent options" aria-label="Agent options" data-menu-btn="1">···</button>
      </div>
    </header>
  );
}
