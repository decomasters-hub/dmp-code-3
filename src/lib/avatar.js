import { createAvatar } from '@dicebear/core';
import * as botttsNeutral from '@dicebear/bottts-neutral';

// Open-source face family (DiceBear "Bottts Neutral", Pablo Stanley).
// Rendered locally to SVG data URIs — no network, no photos, one coherent family.
// Avatar value shape: { seed: string, background: string(hex without '#') }

export const BACKGROUNDS = [
  '2b3a5e',
  '23443c',
  '4a2f3d',
  '3d3a24',
  '2e3d5c',
  '3a2c50',
  '1f4a4e',
  '4e3220',
];

export const AVATAR_PRESETS = [
  { id: 'a1', seed: 'Atlas', background: '2b3a5e', label: 'Atlas' },
  { id: 'a2', seed: 'Mira', background: '23443c', label: 'Mira' },
  { id: 'a3', seed: 'Echo', background: '4a2f3d', label: 'Echo' },
  { id: 'a4', seed: 'Dune', background: '3d3a24', label: 'Dune' },
  { id: 'a5', seed: 'Nova', background: '2e3d5c', label: 'Nova' },
  { id: 'a6', seed: 'Violet', background: '3a2c50', label: 'Violet' },
  { id: 'a7', seed: 'Tide', background: '1f4a4e', label: 'Tide' },
  { id: 'a8', seed: 'Ember', background: '4e3220', label: 'Ember' },
  { id: 'a9', seed: 'Fern', background: '23443c', label: 'Fern' },
  { id: 'a10', seed: 'Bloom', background: '4a2f3d', label: 'Bloom' },
  { id: 'a11', seed: 'Orion', background: '2b3a5e', label: 'Orion' },
  { id: 'a12', seed: 'Mono', background: '3f3f46', label: 'Mono' },
];

const cache = new Map();

export function avatarUri(seed, background) {
  const key = `${seed}|${background}`;
  if (!cache.has(key)) {
    const uri = createAvatar(botttsNeutral, {
      seed,
      backgroundColor: [background],
      backgroundType: ['solid'],
    }).toDataUri();
    cache.set(key, String(uri));
  }
  return cache.get(key);
}

/** Normalize legacy string ids ('a1') or face objects to { seed, background }. */
export function resolveAvatar(av) {
  if (av && typeof av === 'object' && av.seed) {
    return { seed: av.seed, background: av.background || BACKGROUNDS[0] };
  }
  const p = AVATAR_PRESETS.find((x) => x.id === av) || AVATAR_PRESETS[0];
  return { seed: p.seed, background: p.background };
}

const SEED_WORDS = ['Ash', 'Birch', 'Cinder', 'Drift', 'Flint', 'Grove', 'Harbor', 'Iris', 'Juniper', 'Koda', 'Lumen', 'Marble', 'Nix', 'Onyx', 'Peregrine', 'Quill', 'Rowan', 'Sable', 'Tarn', 'Umber', 'Vesper', 'Wren', 'Yara', 'Zephyr'];

export function randomFace() {
  return {
    seed: SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)] + Math.floor(Math.random() * 90 + 10),
    background: BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)],
  };
}

export function randomAvatar() {
  return randomFace();
}

export function avatarById(id) {
  const p = AVATAR_PRESETS.find((a) => a.id === id) || AVATAR_PRESETS[0];
  return { seed: p.seed, background: p.background };
}
