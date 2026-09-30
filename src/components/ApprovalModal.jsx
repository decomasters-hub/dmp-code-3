import { useEffect } from 'react';

// Approval prompt for tool permission requests (permission.asked).
// One request at a time; the caller queues the rest.
export default function ApprovalModal({ request, queueCount, onDecision }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onDecision('reject'); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onDecision, request?.requestID]);

  if (!request) return null;
  const target = (request.resources || []).join(', ') || '—';
  return (
    <div className="overlay slim" onMouseDown={(e) => { if (e.target === e.currentTarget) onDecision('reject'); }}>
      <div className="modal small" role="dialog" aria-modal="true" aria-label="Approve tool use">
        <h2>Allow this action?</h2>
        <p className="muted">
          <b>{request.action}</b> wants to run{request.message ? ` — ${request.message}` : ''}.
        </p>
        <p className="muted" style={{ wordBreak: 'break-all' }}>Target: {target}</p>
        {queueCount > 0 && <p className="muted">+{queueCount} more waiting</p>}
        <div className="modal-foot" style={{ border: 0, paddingLeft: 0, paddingRight: 0 }}>
          <button className="btn ghost" onClick={() => onDecision('reject')}>Deny</button>
          <button className="btn ghost" onClick={() => onDecision('always')}>Always allow</button>
          <button className="btn primary-sm big" onClick={() => onDecision('once')}>Allow once</button>
        </div>
      </div>
    </div>
  );
}
