// Visible color of a body, from the cloud deck or the rock, not the zone ink.
//
// Gas giants are hydrogen and helium. Ammonia ice is cream. The ammonium
// hydrosulfide under it is tan and brown. A hot giant has no ammonia ice,
// so the haze is a dusky rust. A cold one is paler, closer to Saturn,
// because those clouds sit deeper.
//
// Ice giants carry enough methane to absorb red light. They stay a pale
// blue-green, deeper when colder. Voyager's saturated blue is not the
// color the eye records.
//
// Asteroid belts follow the classes spacecraft actually saw. About three
// quarters are C-type, dark gray and carbonaceous, like Mathilde and
// Ceres to the eye. S-types are stony and gray-brown, and they dominate
// closer in, like Eros, Ida, and Gaspra. Vesta is gray.

const GAS = {
  INNER: '#8d5a3c',
  HABITABLE: '#c4924a',
  OUTER: '#c4a06a',
  FRINGE: '#d4c09a',
};

const ICE = {
  INNER: '#b7d6d4',
  HABITABLE: '#8ec4c8',
  OUTER: '#9ec9cf',
  FRINGE: '#6eafc0',
};

const DWARF = {
  INNER: '#a89078',
  HABITABLE: '#b5aa96',
  OUTER: '#9aa8a4',
  FRINGE: '#a8b4b0',
};

const BELT = {
  INNER: '#9a8472',
  HABITABLE: '#8a7b70',
  OUTER: '#6e6862',
  FRINGE: '#5f5c58',
};

const BY_TYPE = {
  'Gas Giant': GAS,
  'Ice Giant': ICE,
  'Gas Dwarf': DWARF,
  'Asteroid Belt': BELT,
};

function hash(text) {
  let value = 2166136261;
  const source = String(text);
  for (let i = 0; i < source.length; i += 1) {
    value ^= source.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 4294967296;
}

function channels(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgb(r, g, b) {
  const clamp = channel => Math.max(0, Math.min(255, Math.round(channel)));
  return `#${[r, g, b].map(channel => clamp(channel).toString(16).padStart(2, '0')).join('')}`;
}

function nudge(hex, key, worldType) {
  const unit = hash(key) - 0.5;
  const [r, g, b] = channels(hex);
  if (worldType === 'Ice Giant') {
    const depth = unit * 18;
    return rgb(r - depth * 0.15, g - depth * 0.05, b + depth * 0.4);
  }
  if (worldType === 'Asteroid Belt') {
    const warm = unit * 22;
    return rgb(r + warm, g + warm * 0.3, b - warm * 0.35);
  }
  const warm = unit * 18;
  return rgb(r + warm, g + warm * 0.2, b - warm * 0.45);
}

/**
 * The color to paint this body. Null for types that still take the zone ink.
 * A small nudge keeps two worlds of one type from sharing one disc.
 * @param {string} worldType
 * @param {string} zone
 * @param {string} [id]
 * @returns {string|null}
 */
export function bodyColor(worldType, zone, id = '') {
  const table = BY_TYPE[worldType];
  const base = table?.[zone] || table?.OUTER;
  if (!base) return null;
  return nudge(base, `${worldType}|${zone}|${id}`, worldType);
}
