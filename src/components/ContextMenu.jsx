import { useEffect, useRef } from 'react';

export default function ContextMenu({ menu, onClose, onAction }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('[data-menu-btn]')) onClose();
    };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  if (!menu) return null;
  const style = {
    left: Math.min(menu.x, window.innerWidth - 220),
    top: Math.min(menu.y, window.innerHeight - menu.items.length * 36 - 16),
  };

  return (
    <div ref={ref} className="ctx" style={style} role="menu">
      {menu.items.map((it) => (
        it.sep ? <div key={it.key} className="ctx-sep" /> : (
          <button key={it.key} role="menuitem" className={`ctx-item${it.danger ? ' danger' : ''}`} onClick={() => onAction(it.key)}>
            {it.label}
            {it.hint && <kbd>{it.hint}</kbd>}
          </button>
        )
      ))}
    </div>
  );
}
