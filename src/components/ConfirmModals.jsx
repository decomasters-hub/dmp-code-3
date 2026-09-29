import { useEffect } from 'react';

export function DeleteConfirm({ name, kind, onCancel, onConfirm }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCancel]);
  return (
    <div className="overlay slim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal small" role="alertdialog" aria-modal="true" aria-label={`Delete ${kind}`}>
        <h2>Delete “{name}”?</h2>
        <p className="muted">{kind === 'agent' ? 'This will remove this agent and its conversations from your workspace.' : 'This will remove this conversation. The agent stays.'}</p>
        <div className="modal-foot end">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export function RenamePrompt({ label, value, onCancel, onConfirm }) {
  return (
    <div className="overlay slim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form
        className="modal small"
        onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get('v').toString().trim(); if (v) onConfirm(v); }}
      >
        <h2>{label}</h2>
        <input name="v" defaultValue={value} autoFocus maxLength={60} className="text-input" />
        <div className="modal-foot end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary-sm big">Save</button>
        </div>
      </form>
    </div>
  );
}
