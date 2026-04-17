// ─── ARMILLARY DESIGN TOKENS ─────────────────────────────────────────────────
// Aesthetic: ship's nav console, geologist's field terminal
// Dark steel, amber hazard, cool green for life, ice blue for cold

export const C = {
  // Backgrounds
  BG:        '#080c10',   // near-black, slight blue tint
  PANEL:     '#0d1520',   // card/panel background
  PANEL_ALT: '#111c28',   // slightly lighter panel
  BORDER:    '#1e3048',   // default border
  BORDER_HI: '#2e4a6a',   // highlighted border

  // Primary UI — steel blue
  PRIMARY:   '#7B9BAF',
  PRIMARY_D: '#4a6a80',
  PRIMARY_L: '#a8c4d8',

  // Stellar type colors
  STAR_O:    '#9BB0FF',
  STAR_B:    '#AABFFF',
  STAR_A:    '#CAD7FF',
  STAR_F:    '#F8F7FF',
  STAR_G:    '#FFE680',
  STAR_K:    '#FFD2A1',
  STAR_M:    '#FF9C71',
  STAR_WD:   '#E8F4FF',
  STAR_NS:   '#B0E0FF',
  STAR_BD:   '#8B5E3C',

  // Semantic
  HABITABLE: '#4CAF7D',   // cool green — life possible
  HAZARD:    '#C8860A',   // amber — danger/heat
  COLD:      '#7EC8E3',   // ice blue — cold/frozen
  EXOTIC:    '#B07FCC',   // purple — exotic/unknown
  DANGER:    '#CC5555',   // red — hostile/danger

  // Text
  TEXT:      '#d4e4f0',   // primary text — slightly brighter
  TEXT_DIM:  '#8aafc8',   // secondary text — was too dark, now ADA-compliant
  TEXT_FAINT:'#6a94b0',   // subtle labels — was #3a5a70, now readable

  // Zone colors
  ZONE_INNER:     '#C8860A',
  ZONE_HABITABLE: '#4CAF7D',
  ZONE_OUTER:     '#7EC8E3',
  ZONE_FRINGE:    '#6a8aa0',
};

export const ZONE_COLORS = {
  INNER:     C.ZONE_INNER,
  HABITABLE: C.ZONE_HABITABLE,
  OUTER:     C.ZONE_OUTER,
  FRINGE:    C.ZONE_FRINGE,
};

// ─── TYPOGRAPHY ───────────────────────────────────────────────────────────────
export const FONTS = {
  MONO:  "'Share Tech Mono', 'Courier New', monospace",
  LABEL: "'Share Tech Mono', monospace",
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
