import Avatar from './Avatar.jsx';
import { STARTERS } from '../lib/mock.js';
import { renderAssistantMarkdown } from '../lib/markdown.js';
import { timeLabel } from '../lib/utils.js';

export function EmptyAgentState({ agent, onStarter }) {
  return (
    <div className="empty-state">
      <Avatar avatarId={agent.avatar} status={agent.status} name={agent.name} size={72} />
      <h2>{agent.name}</h2>
      <p className="empty-title">{agent.title}</p>
      <p className="empty-line">Ready when you are.</p>
      <div className="starters">
        {STARTERS.map((s) => (
          <button key={s} className="starter" onClick={() => onStarter(s)}>{s}</button>
        ))}
      </div>
      <p className="empty-hint">Selecting a starter fills the composer — nothing is sent until you press Enter.</p>
    </div>
  );
}

function MessageRow({ m, agent }) {
  if (m.role === 'tool') {
    const ok = m.status === 'completed';
    return (
      <div className="msg tool">
        <div className="msg-body">
          <div className="tool-receipt" title={`Tool ${m.name}: ${m.status}`}>
            <span aria-hidden="true">{ok ? '✓' : '•'}</span>
            <span className="tool-name">{m.name}</span>
            <span className="msg-ts">{m.status}</span>
          </div>
        </div>
      </div>
    );
  }
  const isUser = m.role === 'user';
  const html = !isUser ? renderAssistantMarkdown(m.content) : null;
  return (
    <div className={`msg ${isUser ? 'user' : 'agent'}`}>
      {!isUser && <Avatar avatarId={agent.avatar} status={agent.status} name={agent.name} size={26} />}
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-who">{isUser ? 'You' : agent.name}</span>
          <span className="msg-ts">{timeLabel(m.ts)}</span>
        </div>
        {html ? (
          <div className="msg-text md" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="msg-text">{m.content}</div>
        )}
      </div>
    </div>
  );
}

export default function ConversationView({ agent, conversation, typing }) {
  if (!conversation || conversation.messages.length === 0) {
    return null;
  }
  return (
    <div className="transcript" aria-live="polite">
      {conversation.messages.map((m) => (
        <MessageRow key={m.id} m={m} agent={agent} />
      ))}
      {typing && (
        <div className="msg agent">
          <Avatar avatarId={agent.avatar} status="Thinking" name={agent.name} size={26} />
          <div className="msg-body">
            <div className="msg-head"><span className="msg-who">{agent.name}</span><span className="msg-ts">typing</span></div>
            <div className="typing"><span /><span /><span /></div>
          </div>
        </div>
      )}
    </div>
  );
}
