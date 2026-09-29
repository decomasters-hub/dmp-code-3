import { useEffect, useRef, useState } from 'react';
import { hasRuntime } from '../lib/runtime.js';

function ModelMenu({ current, onPick, onClose, models, foot }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [onClose]);

  return (
    <div ref={ref} className="model-menu" role="menu" aria-label="Choose model">
      <div className="model-menu-label">Model</div>
      {models.length === 0 && <div className="pal-empty">No models available.</div>}
      {models.map((m) => (
        <button
          key={m.id}
          role="menuitemradio"
          aria-checked={m.id === current}
          className={`model-item${m.id === current ? ' sel' : ''}`}
          onClick={() => { onPick(m.id); onClose(); }}
        >
          <span className="model-check" aria-hidden="true">{m.id === current ? '●' : ''}</span>
          <span className="model-text">
            <span className="model-name">{m.name} <em>{m.tag}</em></span>
            <span className="model-desc">{m.desc}</span>
          </span>
        </button>
      ))}
      <div className="model-foot">{foot}</div>
    </div>
  );
}

export default function Composer({ onSend, onStop, sending, focusKey, initialValue = '', onConsumed, model, models, live, enterToSend = true, onModelChange }) {
  const [value, setValue] = useState(initialValue);
  const [menuOpen, setMenuOpen] = useState(false);
  const taRef = useRef(null);
  const inElectron = hasRuntime();
  // Source of truth: OpenCode model.list in Electron, empty shelf in the
  // dev browser. No mock models anywhere.
  const showList = inElectron ? (models || []) : [];
  const active = showList.find((m) => m.id === model) || showList[0] || null;
  const foot = !inElectron
    ? 'Dev browser — real chat runs in the Electron app.'
    : live ? 'Live — via local runtime.' : 'No models — authenticate OpenCode to enable chat.';
  const noModels = showList.length === 0;

  useEffect(() => {
    if (initialValue) { setValue(initialValue); onConsumed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    taRef.current?.focus();
  }, [focusKey]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [value]);

  function send() {
    if (sending || noModels) return;
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue('');
  }

  const pillLabel = active ? active.name : 'No models';
  const sendDisabled = sending || noModels || !value.trim();

  return (
    <div className="composer-wrap">
      <div className="composer composer-bezel">
        <div className="composer-core composer-row">
          <div className="model-anchor">
            <button
              className="model-pill"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={noModels ? 'No models available' : 'Choose model'}
            >
              <span className="model-pill-dot" aria-hidden="true" />
              {pillLabel}
              <svg viewBox="0 0 12 12" width="11" height="11"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            {menuOpen && <ModelMenu current={active?.id} models={showList} foot={foot} onPick={onModelChange} onClose={() => setMenuOpen(false)} />}
          </div>
          <textarea
            ref={taRef}
            rows={1}
            placeholder={active ? `Message ${active.name}…` : 'No model available…'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && enterToSend) { e.preventDefault(); send(); }
            }}
            aria-label="Message composer"
            title={enterToSend ? 'Enter to send, Shift+Enter for newline' : 'Shift+Enter for newline'}
          />
          <button className="icon-btn bar-btn" title="Attachments aren't supported yet" aria-label="Attach (unavailable)" disabled>
            <svg viewBox="0 0 16 16" width="15" height="15"><path d="M6.5 9.5l4-4a1.8 1.8 0 0 1 2.6 2.6l-5 5a3 3 0 0 1-4.3-4.3l5.2-5.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          {sending ? (
            <button
              className="send ready"
              onClick={onStop}
              title="Stop generation"
              aria-label="Stop generation"
            >
              <svg viewBox="0 0 16 16" width="13" height="13"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor" /></svg>
            </button>
          ) : (
            <button
              className={`send${value.trim() && !noModels ? ' ready' : ''}`}
              disabled={sendDisabled}
              onClick={send}
              title={noModels ? 'No model available' : 'Send'}
              aria-label="Send message"
            >
              <svg viewBox="0 0 16 16" width="15" height="15"><path d="M2 8l12-5-4.5 12-2.3-4.7L2 8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
