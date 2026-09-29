import { useEffect, useMemo, useState } from 'react';
import Avatar from './Avatar.jsx';
import { AVATAR_PRESETS, BACKGROUNDS, randomFace } from '../lib/avatar.js';

function AvatarPicker({ value, onPick }) {
  const setFace = (seed) => onPick({ ...value, seed });
  const setBg = (background) => onPick({ ...value, background });

  return (
    <div className="ava-section">
      <div className="ava-row">
        <span className="ava-preview"><Avatar avatar={value} size={60} status="Ready" name="preview" /></span>
        <div className="ava-btns">
          <button type="button" className="btn ghost sm" onClick={() => onPick(randomFace())}>
            <svg viewBox="0 0 16 16" width="13" height="13"><path d="M13.5 2.5v3h-3M2.5 13.5v-3h3M13.5 5.5A6 6 0 0 0 3.2 4.2M2.5 10.5a6 6 0 0 0 10.3 1.3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Shuffle face
          </button>
        </div>
      </div>

      <div className="ava-label">Face</div>
      <div className="face-grid">
        {AVATAR_PRESETS.map((p) => {
          const sel = value.seed === p.seed;
          return (
            <button
              key={p.id}
              type="button"
              className={`face${sel ? ' sel' : ''}`}
              onClick={() => setFace(p.seed)}
              title={p.label}
              aria-pressed={sel}
            >
              <Avatar avatar={{ seed: p.seed, background: value.background }} size={38} status="Ready" name={p.label} />
            </button>
          );
        })}
      </div>

      <div className="ava-label">Background</div>
      <div className="bg-row">
        {BACKGROUNDS.map((bg) => (
          <button
            key={bg}
            type="button"
            className={`swatch${value.background === bg ? ' sel' : ''}`}
            style={{ background: `#${bg}` }}
            onClick={() => setBg(bg)}
            title={`#${bg}`}
            aria-label={`Background #${bg}`}
            aria-pressed={value.background === bg}
          />
        ))}
      </div>
      <p className="field-help">One open-source face family — every agent stays distinct but visually related.</p>
    </div>
  );
}

export default function AgentModal({ mode, initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [instructions, setInstructions] = useState(initial?.instructions || '');
  const [avatar, setAvatar] = useState(initial?.avatar || { seed: 'Atlas', background: '2b3a5e' });

  useEffect(() => {
    setName(initial?.name || '');
    setTitle(initial?.title || '');
    setInstructions(initial?.instructions || '');
    setAvatar(initial?.avatar || { seed: 'Atlas', background: '2b3a5e' });
  }, [initial, mode]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const valid = useMemo(() => name.trim().length >= 2 && instructions.trim().length >= 8, [name, instructions]);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={mode === 'edit' ? 'Edit agent' : 'Create new agent'}>
        <div className="modal-head">
          <div>
            <h2>{mode === 'edit' ? 'Edit agent' : 'Create new agent'}</h2>
            <p>Give your agent an identity and define how it should behave.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-grid">
            <div className="modal-main">
              <div className="field-block">
                <div className="field-label">Identity</div>
                <AvatarPicker value={avatar} onPick={setAvatar} />
              </div>
              <label className="field">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" maxLength={32} /></label>
              <label className="field">Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Creative Director" maxLength={48} /></label>
              <div className="field">
                <div className="field-label">Instructions <span className="req">required</span></div>
                <p className="field-help">Define how this agent should think, communicate, and behave. This is the agent’s “brain”.</p>
                <textarea
                  className="brain"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Describe this agent's role, personality, preferences, and rules..."
                />
              </div>
            </div>
            <div className="modal-side">
              <div className="field-label">Live preview</div>
              <div className="preview-card">
                <Avatar avatar={avatar} size={40} status="Ready" name={name || 'Agent'} />
                <div><div className="preview-name">{name.trim() || 'Unnamed agent'}</div><div className="preview-title">{title.trim() || 'Untitled role'}</div></div>
              </div>
              <div className="preview-note">This is how the agent appears in the sidebar and header.</div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary-sm big" disabled={!valid} onClick={() => onSave({ name: name.trim(), title: title.trim(), instructions: instructions.trim(), avatar })} title={!valid ? 'Name (2+ chars) and instructions (8+ chars) required' : ''}>
            {mode === 'edit' ? 'Save changes' : 'Create agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
