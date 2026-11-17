import { useId } from 'react';
import { C } from '../tokens.js';

// These four are drawn here so a phone and a desktop show the same mark.
// Emoji fonts turn the desert into an empty box and draw the rogue and the
// coreless world as squares. Pulsar planets and disintegrating worlds keep
// the sparkle character.

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
      <circle cx="3.6" cy="12" r="1.15" fill={C.COLD} />
      <circle cx="7.4" cy="12" r="1.7" fill={C.COLD} />
      <circle cx="16" cy="12" r="5.2" fill={C.TEXT_FAINT} />
    </Frame>
  );
}

function EmptyCore({ size }) {
  return (
    <Frame size={size} label="Coreless world">
      <circle cx="12" cy="12" r="8.2" fill="none" stroke={C.TEXT_DIM} strokeWidth="2.1" />
      <circle cx="12" cy="12" r="2.7" fill="none" stroke={C.COLD} strokeWidth="1.8" strokeDasharray="2.5 1.7" />
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
  core: EmptyCore,
  pair: Pair,
};

export function worldMarkKind(worldType) {
  if (worldType === 'Desert') return 'dune';
  if (worldType === 'Rogue/Captured') return 'drift';
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
