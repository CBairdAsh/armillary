import { useState, useEffect } from 'react';
import { C, FONTS } from '../tokens.js';

// Boot sequence lines — staged reveal, nav console flavor
const BOOT_LINES = [
  { text: 'ARMILLARY STELLAR CARTOGRAPHY SYSTEM',     color: C.PRIMARY,   delay: 0,    bold: true  },
  { text: 'v1.0.0 — INITIALIZING...',                 color: C.TEXT_DIM,  delay: 120,  bold: false },
  { text: '',                                          color: null,        delay: 200,  bold: false },
  { text: 'LOADING STELLAR CLASSIFICATION DATA',       color: C.TEXT_FAINT,delay: 320,  bold: false },
  { text: '  [OK] SPECTRAL CLASS TABLES',              color: C.HABITABLE, delay: 480,  bold: false },
  { text: '  [OK] ORBITAL MECHANICS ENGINE',           color: C.HABITABLE, delay: 560,  bold: false },
  { text: '  [OK] HABITABLE ZONE CALCULATOR',          color: C.HABITABLE, delay: 640,  bold: false },
  { text: '  [OK] PLANETARY BODY TABLES',              color: C.HABITABLE, delay: 720,  bold: false },
  { text: '  [OK] ATMOSPHERIC MODELS',                 color: C.HABITABLE, delay: 800,  bold: false },
  { text: '  [OK] SPECIES GENERATION MATRIX',          color: C.HABITABLE, delay: 900,  bold: false },
  { text: '  [OK] INTERSTELLAR NEIGHBORHOOD MAP',      color: C.HABITABLE, delay: 980,  bold: false },
  { text: '',                                          color: null,        delay: 1060, bold: false },
  { text: 'METHODOLOGY: GURPS SPACE 4E / NASA EXOPLANET DATA', color: C.TEXT_FAINT, delay: 1100, bold: false },
  { text: '',                                          color: null,        delay: 1180, bold: false },
  { text: 'CALIBRATING STELLAR NEIGHBORHOOD...',       color: C.TEXT_DIM,  delay: 1220, bold: false },
  { text: 'RESTORING PREVIOUS SESSION...',             color: C.TEXT_DIM,  delay: 1420, bold: false },
  { text: '',                                          color: null,        delay: 1540, bold: false },
  { text: 'ALL SYSTEMS NOMINAL.',                      color: C.PRIMARY,   delay: 1620, bold: true  },
  { text: 'READY.',                                    color: C.HABITABLE, delay: 1780, bold: true  },
];

const TOTAL_DURATION = 2200; // ms before auto-advance

export default function BootSequence({ onComplete }) {
  const [visibleLines, setVisibleLines] = useState([]);
  const [done,         setDone]         = useState(false);
  const [skipFade,     setSkipFade]     = useState(false);

  useEffect(() => {
    const timers = BOOT_LINES.map((line, i) =>
      setTimeout(() => {
        setVisibleLines(prev => [...prev, i]);
      }, line.delay)
    );

    // Auto-complete after all lines shown + brief pause
    const completeTimer = setTimeout(() => {
      setDone(true);
      setTimeout(onComplete, 500);
    }, TOTAL_DURATION);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  const handleSkip = () => {
    setSkipFade(true);
    setTimeout(onComplete, 200);
  };

  return (
    <div
      onClick={handleSkip}
      style={{
        position:        'fixed',
        inset:           0,
        background:      C.BG,
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'flex-start',
        justifyContent:  'center',
        padding:         '10vw',
        zIndex:          100,
        cursor:          'pointer',
        opacity:         skipFade ? 0 : 1,
        transition:      skipFade ? 'opacity 0.2s' : 'none',
      }}
    >
      {/* Scanline overlay for CRT feel */}
      <div style={{
        position:   'absolute',
        inset:      0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
        pointerEvents: 'none',
      }}/>

      {/* Top corner accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 80, height: 4, background: C.PRIMARY }}/>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: 80, background: C.PRIMARY }}/>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 4, background: C.PRIMARY }}/>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 4, height: 80, background: C.PRIMARY }}/>

      {/* Terminal output */}
      <div style={{ width: '100%', maxWidth: 680 }}>
        {BOOT_LINES.map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily:    FONTS.MONO,
              fontSize:      line.bold ? 16 : 13,
              color:         line.color || 'transparent',
              letterSpacing: line.bold ? 4 : 2,
              lineHeight:    line.text === '' ? '0.8' : '1.9',
              fontWeight:    line.bold ? 700 : 400,
              opacity:       visibleLines.includes(i) ? 1 : 0,
              transition:    'opacity 0.15s ease-in',
              textTransform: 'uppercase',
            }}
          >
            {line.text || '\u00A0'}
            {/* Blinking cursor on last visible line */}
            {visibleLines.length > 0 && visibleLines[visibleLines.length - 1] === i && !done && (
              <span style={{ animation: 'blink 0.8s step-end infinite' }}>█</span>
            )}
          </div>
        ))}
      </div>

      {/* Skip hint */}
      <div style={{
        position:      'absolute',
        bottom:        32,
        right:         40,
        fontFamily:    FONTS.MONO,
        fontSize:      12,
        color:         C.TEXT_FAINT,
        letterSpacing: 2,
        opacity:       visibleLines.length > 2 ? 1 : 0,
        transition:    'opacity 0.4s',
      }}>
        CLICK TO SKIP
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
