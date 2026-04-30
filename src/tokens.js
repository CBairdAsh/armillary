// ─── ARMILLARY DESIGN TOKENS ─────────────────────────────────────────────────
// Aesthetic: ship's nav console, geologist's field terminal
// Dark steel, amber hazard, cool green for life, ice blue for cold

const cssVar = (name) => 
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const C = {
  // Backgrounds
  BG:        cssVar('--color-bg'),   // near-black, slight blue tint
  PANEL:     cssVar('--color-panel'),   // card/panel background
  PANEL_ALT: cssVar('--color-panel-alt'),   // slightly lighter panel
  BORDER:    cssVar('--color-border'),   // default border
  BORDER_HI: cssVar('--color-border-hi'),   // highlighted border

  // Primary UI — steel blue
  PRIMARY:   cssVar('--color-primary'),
  PRIMARY_D: cssVar('--color-primary-d'),
  PRIMARY_L: cssVar('--color-primary-l'),

  // Stellar type colors
  STAR_O:    cssVar('--color-star-o'),
  STAR_B:    cssVar('--color-star-b'),
  STAR_A:    cssVar('--color-star-a'),
  STAR_F:    cssVar('--color-star-f'),
  STAR_G:    cssVar('--color-star-g'),
  STAR_K:    cssVar('--color-star-k'),
  STAR_M:    cssVar('--color-star-m'),
  STAR_WD:   cssVar('--color-star-wd'),
  STAR_NS:   cssVar('--color-star-ns'),
  STAR_BD:   cssVar('--color-star-bd'),

  // Semantic
  HABITABLE: cssVar('--color-habitable'),   // cool green — life possible
  HAZARD:    cssVar('--color-hazard'),   // amber — danger/heat
  COLD:      cssVar('--color-cold'),   // ice blue — cold/frozen
  EXOTIC:    cssVar('--color-exotic'),   // purple — exotic/unknown
  DANGER:    cssVar('--color-danger'),   // red — hostile/danger

  // Text
  TEXT:      cssVar('--color-text'),   // primary text — slightly brighter
  TEXT_DIM:  cssVar('--color-text-dim'),   // secondary text — was too dark, now ADA-compliant
  TEXT_FAINT:cssVar('--color-text-faint'),   // subtle labels — was #3a5a70, now readable

  // Zone colors
  ZONE_INNER:     cssVar('--color-inner'),
  ZONE_HABITABLE: cssVar('--color-habitable'),
  ZONE_OUTER:     cssVar('--color-outer'),
  ZONE_FRINGE:    cssVar('--color-fringe'),
};

export const ZONE_COLORS = {
  INNER:     C.ZONE_INNER,
  HABITABLE: C.ZONE_HABITABLE,
  OUTER:     C.ZONE_OUTER,
  FRINGE:    C.ZONE_FRINGE,
};

// ─── TYPOGRAPHY ───────────────────────────────────────────────────────────────
export const FONTS = {
  MONO:  cssVar('--font-mono'),
  LABEL: cssVar('--font-mono'),
};

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────
export function navBtn(active, color = C.PRIMARY, small = false) {
  return {
    background:    active ? color + '33' : 'transparent',
    border:        `1px solid ${active ? color : color + '44'}`,
    borderRadius:  3,
    color:         active ? color : C.TEXT_DIM,
    fontFamily:    FONTS.MONO,
    fontSize:      small ? 11 : 12,
    letterSpacing: 2,
    padding:       small ? '3px 10px' : '5px 14px',
    cursor:        'pointer',
    transition:    'all 0.15s',
    whiteSpace:    'nowrap',
    textTransform: 'uppercase',
  };
}

export function dataField(label, value, color = C.TEXT) {
  return { label, value, color };
}

export function panelStyle(highlight = false) {
  return {
    background:   C.PANEL,
    border:       `1px solid ${highlight ? C.BORDER_HI : C.BORDER}`,
    borderRadius: 4,
    padding:      '12px 14px',
  };
}

// ─── CARD COMPONENTS ─────────────────────────────────────────────────────────
export function cardStyle(locked = false, accentColor = C.PRIMARY) {
  return {
    background:   C.PANEL,
    border:       `1px solid ${locked ? accentColor + '99' : C.BORDER}`,
    borderRadius: 4,
    boxShadow:    locked
      ? `0 0 12px ${accentColor}33, 0 2px 12px #00000066`
      : `0 2px 8px #00000044`,
    display:      'flex',
    flexDirection: 'row',
    overflow:     'hidden',
    transition:   'all 0.2s',
    position:     'relative',
  };
}

export function lockStripeStyle(locked = false, color = C.PRIMARY) {
  return {
    width:      8,
    flexShrink: 0,
    background: locked ? color : C.BORDER,
    cursor:     'pointer',
    transition: 'background 0.2s',
  };
}

export function lockBtnStyle(locked = false, color = C.PRIMARY, small = false) {
  return {
    background:    locked ? color : 'transparent',
    border:        `1px solid ${color + '66'}`,
    borderRadius:  2,
    color:         locked ? '#000' : color + '88',
    fontFamily:    FONTS.MONO,
    fontSize:      small ? 9 : 10,
    letterSpacing: 2,
    padding:       small ? '2px 6px' : '3px 8px',
    cursor:        'pointer',
    transition:    'all 0.15s',
    fontWeight:    locked ? 700 : 400,
  };
}

export function sectionLabel(text, color = C.TEXT_DIM) {
  return {
    color,
    fontFamily:    FONTS.MONO,
    fontSize:      10,
    letterSpacing: 3,
    textTransform: 'uppercase',
  };
}

// ─── DIVIDER ─────────────────────────────────────────────────────────────────
// Nav console style divider with center diamond
export function ConsoleDivider({ color = C.BORDER, label = '' }) {
  return null; // Implemented as component in App
}
