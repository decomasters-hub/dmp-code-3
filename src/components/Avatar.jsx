import { useMemo } from 'react';
import { resolveAvatar, avatarUri } from '../lib/avatar.js';

export default function Avatar({ avatar, avatarId, size = 32, status = 'Ready', name = '' }) {
  const face = resolveAvatar(avatar ?? avatarId);
  const src = useMemo(() => avatarUri(face.seed, face.background), [face.seed, face.background]);
  const st = (status || 'Ready').toLowerCase().replace(/[^a-z]/g, '');
  return (
    <span
      className={`avatar st-${st}`}
      style={{ width: size, height: size }}
      title={name}
      aria-label={name}
    >
      <img src={src} alt="" width={size} height={size} draggable={false} />
      <span className="avatar-dot" />
    </span>
  );
}
