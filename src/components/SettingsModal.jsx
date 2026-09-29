import { useEffect, useState } from 'react';

const STATE_LABEL = {
  'connected': 'Connected',
  'installed-not-authenticated': 'Installed — not authenticated',
  'not-installed': 'Not detected',
  'no-models': 'Connected — no models',
  'web-dev-mode': 'Dev browser mode',
  'error': 'Error',
};

function OpenCodeSection({ opencode, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const oc = opencode || null;
  const label = oc ? (STATE_LABEL[oc.state] || oc.state) : 'Checking…';
  return (
    <div className="set-group">
      <div className="field-label">OpenCode</div>
      <div className="shortcut"><span>Status</span><span>{label}</span></div>
      {oc?.version && <div className="shortcut"><span>CLI</span><span>v{oc.version}</span></div>}
      {oc?.installed && <div className="shortcut"><span>Providers</span><span>{oc.providers ?? '—'}</span></div>}
      {oc?.installed && <div className="shortcut"><span>Models</span><span>{oc.models ?? '—'}</span></div>}
      {oc?.state === 'not-installed' && (
        <p className="field-help">The OpenCode CLI is not available on this system. Install OpenCode, then reopen Settings and refresh.</p>
      )}
      {oc?.state === 'installed-not-authenticated' && (
        <p className="field-help">No authenticated provider detected. Authenticate using the OpenCode CLI itself (this app never asks for provider keys).</p>
      )}
      {oc?.state === 'no-models' && (
        <p className="field-help">OpenCode is reachable but reports no usable models. Check provider authentication and configuration.</p>
      )}
      {oc?.state === 'error' && oc?.error && (
        <p className="field-help">Runtime error: {oc.error}</p>
      )}
      <div><button
        className="btn ghost sm"
        disabled={busy}
        onClick={async () => { setBusy(true); try { await onRefresh?.(); } finally { setBusy(false); } }}
      >{busy ? 'Refreshing…' : 'Refresh status'}</button></div>
    </div>
  );
}

export default function SettingsModal({ settings, onChange, onClose, opencode, onRefreshStatus }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const set = (k, v) => onChange({ ...settings, [k]: v });

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal medium" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="modal-head">
          <div><h2>Settings</h2><p>Local UI preferences, plus live OpenCode runtime status.</p></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body settings">
          <OpenCodeSection opencode={opencode} onRefresh={onRefreshStatus} />
          <div className="set-group">
            <div className="field-label">Appearance</div>
            <div className="seg" role="radiogroup" aria-label="Theme">
              {['Dark', 'Light', 'System'].map((t) => (
                <button key={t} className={`seg-btn${settings.theme === t ? ' sel' : ''}`} onClick={() => set('theme', t)}>{t}</button>
              ))}
            </div>
            <div className="seg" role="radiogroup" aria-label="Density">
              {['Comfortable', 'Compact'].map((d) => (
                <button key={d} className={`seg-btn${settings.density === d ? ' sel' : ''}`} onClick={() => set('density', d)}>{d}</button>
              ))}
            </div>
          </div>
          <div className="set-group">
            <div className="field-label">General</div>
            <label className="check"><input type="checkbox" checked={settings.enterToSend} onChange={(e) => set('enterToSend', e.target.checked)} /> Enter sends, Shift+Enter for newline</label>
            <label className="check"><input type="checkbox" checked={settings.showStatus} onChange={(e) => set('showStatus', e.target.checked)} /> Show agent status chips</label>
          </div>
          <div className="set-group">
            <div className="field-label">Shortcuts</div>
            <div className="shortcut"><span>Search</span><kbd>Ctrl + K</kbd></div>
            <div className="shortcut"><span>New agent</span><kbd>Ctrl + N</kbd></div>
            <div className="shortcut"><span>New chat</span><kbd>Ctrl + Shift + O</kbd></div>
            <div className="shortcut"><span>Close dialog</span><kbd>Esc</kbd></div>
          </div>
        </div>
        <div className="modal-foot end"><button className="btn primary-sm big" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
