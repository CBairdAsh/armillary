import { useId } from 'react';
import { C } from '../tokens.js';

// Drawn here so a phone and a desktop show the same mark. Emoji fonts turn
// the desert into an empty box, the rogue and the coreless world into
// squares, and give a pulsar planet and a disintegrating world the same sparkle.

function Frame({ size, label, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <title>{label}</title>
      {children}
    </svg>
  );
}

function Dune({ size }) {
  const id = `dune-${useId().replace(/:/g, '')}`;
  return (
    <Frame size={size} label="Desert">
      <circle cx="12" cy="12" r="9" fill={C.HAZARD} />
      <clipPath id={id}>
        <circle cx="12" cy="12" r="9" />
      </clipPath>
      <path
        clipPath={`url(#${id})`}
        d="M2 16 C6 11 8.5 15 12 13.5 C15.5 12 18 15.5 22 12.5 L22 24 L2 24 Z"
        fill={C.STAR_K}
      />
    </Frame>
  );
}

function Drift({ size }) {
  return (
    <Frame size={size} label="Rogue planet">
      <circle cx="12" cy="12" r="8" fill="#5a3228" />
      <circle cx="8.6" cy="9.4" r="2.5" fill="#8c5a42" />
      <circle cx="14.6" cy="14.4" r="2.15" fill="#d5dee4" />
    </Frame>
  );
}

function Glass({ size }) {
  return (
    <Frame size={size} label="Pulsar planet">
      <circle cx="12" cy="12" r="8.2" fill="#10141a" />
      <circle cx="9.1" cy="9" r="3" fill="#5c7084" />
      <circle cx="14.8" cy="14.6" r="1.15" fill="#1a222c" />
    </Frame>
  );
}

function Shed({ size }) {
  return (
    <Frame size={size} label="Disintegrating world">
      <path d="M15.4 10.4 C19.6 9.2 23.2 11.4 23.6 12.4 C23.2 13.6 19.4 15.4 15.4 14.2 Z" fill="#c4a078" />
      <circle cx="10.2" cy="12" r="7.1" fill="#6a3c2c" />
      <circle cx="8.2" cy="10" r="1.45" fill="#e07838" />
      <circle cx="12" cy="13.6" r="1.05" fill="#3a2018" />
    </Frame>
  );
}

function EmptyCore({ size }) {
  return (
    <Frame size={size} label="Coreless world">
      <circle cx="12" cy="12" r="8.2" fill="#6d8248" />
      <circle cx="8.6" cy="9.4" r="3.2" fill="#314028" />
      <circle cx="14.8" cy="14.4" r="1.35" fill="#c9c2ac" />
    </Frame>
  );
}

function Pair({ size }) {
  return (
    <Frame size={size} label="Double planet">
      <circle cx="7.2" cy="12" r="4.7" fill={C.PRIMARY} />
      <circle cx="16.8" cy="12" r="4.7" fill={C.HAZARD} />
    </Frame>
  );
}

const MARKS = {
  dune: Dune,
  drift: Drift,
  glass: Glass,
  shed: Shed,
  core: EmptyCore,
  pair: Pair,
};

export function worldMarkKind(worldType) {
  if (worldType === 'Desert') return 'dune';
  if (worldType === 'Rogue/Captured') return 'drift';
  if (worldType === 'Pulsar Planet') return 'glass';
  if (worldType === 'Disintegrating') return 'shed';
  if (worldType === 'Coreless') return 'core';
  if (worldType === 'Double Planet') return 'pair';
  return null;
}

export function WorldMark({ kind, size = 15 }) {
  const Draw = MARKS[kind];
  if (!Draw) return null;
  return <Draw size={size} />;
}

export function MarkSlot({ kind, glyph, size = 15 }) {
  if (kind) return <WorldMark kind={kind} size={size} />;
  return <span style={{ fontSize: size, lineHeight: 1 }}>{glyph || ''}</span>;
}
