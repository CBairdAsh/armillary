import { useEffect, useRef } from 'react';
import { C, FONTS, navBtn } from '../tokens.js';
import { APP_VERSION, KOFI_URL, LINKTREE, RELEASE_NOTES, SUBSTACK_URL } from '../config.js';

const SEEN_KEY = 'armillary_seen_release';

export function releaseAlreadySeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === APP_VERSION;
  } catch {
    return true;
  }
}

export function markReleaseSeen() {
  try {
    localStorage.setItem(SEEN_KEY, APP_VERSION);
  } catch {
    // A failed write means the note may appear again next visit.
  }
}

export default function UpdateNotice({ onDismiss }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    buttonRef.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000000cc',
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-notice-title"
        onClick={event => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: 'min(80vh, 640px)',
          overflow: 'auto',
          background: C.PANEL,
          border: `1px solid ${C.PRIMARY}`,
          borderRadius: 4,
          padding: '18px 18px 16px',
          boxShadow: `0 12px 40px #000000aa`,
          fontFamily: FONTS.MONO,
        }}
      >
        <div id="update-notice-title" style={{ fontSize: 11, letterSpacing: 3, color: C.TEXT_FAINT, marginBottom: 6 }}>
          WHAT'S NEW
        </div>
        <div style={{ fontSize: 18, letterSpacing: 3, color: C.PRIMARY, marginBottom: 12 }}>
          v{APP_VERSION}
        </div>
        <p style={{ margin: '0 0 14px', color: C.TEXT, fontSize: 13, lineHeight: 1.6 }}>
          A finished system can be edited. Other orbits stay put. Each action asks first.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {RELEASE_NOTES.map(note => (
            <div key={note.label}>
              <div style={{ fontSize: 12, letterSpacing: 2, color: C.HABITABLE }}>{note.label.toUpperCase()}</div>
              <div style={{ fontSize: 13, color: C.TEXT_DIM, lineHeight: 1.55, marginTop: 2 }}>{note.detail}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${C.BORDER}`, marginTop: 4, paddingTop: 12 }}>
          <p style={{ margin: '0 0 12px', color: C.TEXT, fontSize: 13, lineHeight: 1.6 }}>
            Armillary is free and no account is required. Your current system saves automatically in your browser. If it's useful to you, a coffee is always appreciated.
          </p>
          <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{ ...navBtn(false, '#FF6B6B'), textDecoration: 'none', display: 'inline-block', fontSize: 13 }}>
            ☕ Buy me a coffee on Ko-fi
          </a>
          <p style={{ color: C.TEXT_DIM, fontSize: 13, margin: '14px 0 8px' }}>
            Built by Kummer Wolfe — fiction author and worldbuilder.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
            <a href={LINKTREE} target="_blank" rel="noopener noreferrer" style={{ ...navBtn(false, C.PRIMARY), textDecoration: 'none', display: 'inline-block', fontSize: 13 }}>
              ✦ My Linktr.ee
            </a>
            <a href={SUBSTACK_URL} target="_blank" rel="noopener noreferrer" style={{ ...navBtn(false, C.PRIMARY), textDecoration: 'none', display: 'inline-block', fontSize: 13 }}>
              ✦ Read my fiction on Substack
            </a>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button ref={buttonRef} type="button" onClick={onDismiss} style={navBtn(true, C.PRIMARY)}>Continue</button>
        </div>
      </div>
    </div>
  );
}
