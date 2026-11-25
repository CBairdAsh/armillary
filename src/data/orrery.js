// The orrery is a face-on schematic of one system. Positions are the
// distances already stored: world AU, habitable zone, stellar separation.
// Nothing here assigns a world to one star, and nothing picks a place
// along an orbit. A mark sits on its ring so the ring can be selected.
//
// Ring radius is logarithmic. A linear drawing hides the inner worlds
// behind a companion at hundreds of AU. The labels stay in AU.
//
// Apparent size needs a radius. Main-sequence radius comes from luminosity
// and a temperature for the class (Stefan–Boltzmann). A white dwarf, a
// neutron star, and a brown dwarf do not follow that relation, so each
// uses a fixed radius. The number is derived. It is not a rolled fact.
// It is shown only for an orbit that encloses the stars. Inside the pair
// the distance to each star depends on which star the world circles, and
// the ladder does not record that.

import { SPECTRAL_CLASSES } from './stellarData.js';

const SOL_TEMPERATURE_K = 5772;
const SOLAR_RADIUS_AU = 0.00465047;
const ENCLOSE_FACTOR = 3;

// Earth-sized white dwarf, a 12 km neutron star, a Jupiter-sized brown dwarf.
const FIXED_RADIUS_SOLAR = {
  WD: 0.009,
  NS: 12 / 695700,
  BD: 0.09,
};

const VIEW = {
  width: 460,
  height: 420,
  cx: 196,
  cy: 208,
  rMin: 34,
  rMax: 152,
};

const WORLD_LABEL_ANGLE = -Math.PI / 5;
const HZ_LABEL_ANGLE = Math.PI + Math.PI / 5;

const DISC_RADIUS = {
  'Gas Giant': 8,
  'Ice Giant': 6.5,
  'Gas Dwarf': 6.5,
};

/**
 * @param {number} au
 * @returns {string}
 */
export function formatAU(au) {
  if (!(au > 0)) return '0';
  if (au >= 100) return String(Math.round(au));
  const digits = au >= 10 ? 1 : au >= 0.1 ? 2 : 3;
  return String(Math.round(au * 10 ** digits) / 10 ** digits);
}

/**
 * Angular diameter, in degrees, of a star with `radiusSolar` at `distanceAU`.
 * @param {number} radiusSolar
 * @param {number} distanceAU
 * @returns {number|null}
 */
export function angularDiameterDegrees(radiusSolar, distanceAU) {
  if (!(radiusSolar > 0) || !(distanceAU > 0)) return null;
  const radiusAU = radiusSolar * SOLAR_RADIUS_AU;
  return 2 * Math.atan(radiusAU / distanceAU) * (180 / Math.PI);
}

export const SOL_ANGULAR_DEGREES = angularDiameterDegrees(1, 1);

/**
 * @param {number|null} degrees
 * @returns {string}
 */
export function formatAngular(degrees) {
  if (!(degrees > 0)) return 'point';
  if (degrees >= 1) return `${(Math.round(degrees * 10) / 10).toFixed(1)}°`;
  const arcmin = degrees * 60;
  if (arcmin >= 1) {
    const rounded = Math.round(arcmin * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded.toFixed(0)}′` : `${rounded.toFixed(1)}′`;
  }
  const arcsec = degrees * 3600;
  if (arcsec >= 1) return `${Math.round(arcsec)}″`;
  return 'point';
}

function classTemperature(spectralClass) {
  const range = SPECTRAL_CLASSES[spectralClass]?.tempK;
  if (!range) return SOL_TEMPERATURE_K;
  return Math.sqrt(range[0] * range[1]);
}

/**
 * Solar radii. Exotic classes use a fixed radius. The others use
 * L = R²T⁴ with the class temperature.
 * @param {{ spectralClass?: string, luminosity?: number }} star
 * @returns {number|null}
 */
export function stellarRadiusSolar(star) {
  if (!star) return null;
  const fixed = FIXED_RADIUS_SOLAR[star.spectralClass];
  if (fixed) return fixed;
  // round2 stores a luminosity under 0.005 as 0. That is the floor of the
  // recorded value, not a star with no surface.
  const luminosity = star.luminosity > 0 ? star.luminosity : 0.0025;
  const temperature = classTemperature(star.spectralClass);
  return Math.sqrt(luminosity) * (SOL_TEMPERATURE_K / temperature) ** 2;
}

/**
 * Barycentric position of each star, in AU, on the pair axis.
 * Negative is toward A. A system with no stored separation keeps every
 * star at the barycenter and is marked unknown.
 * @param {Array<{ mass?: number, spectralClass?: string, luminosity?: number, color?: string }>} stars
 * @param {Array<{ au: number }>|null} separation
 */
export function placeStars(stars, separation) {
  const list = stars || [];
  if (list.length === 0) return [];
  const labels = ['A', 'B', 'C'];
  if (list.length === 1) {
    return [{ star: list[0], label: 'A', xAU: 0, unknown: false }];
  }

  const sepAB = separation?.[0]?.au;
  const mass = list.map(star => (star.mass > 0 ? star.mass : 0));
  const pair = mass[0] + mass[1];
  if (!(sepAB > 0) || !(pair > 0)) {
    return list.slice(0, 3).map((star, index) => ({
      star,
      label: labels[index],
      xAU: 0,
      unknown: true,
    }));
  }

  const aOffset = sepAB * mass[1] / pair;
  const bOffset = sepAB * mass[0] / pair;
  let shift = 0;
  let cAU = null;
  if (list.length >= 3 && separation?.[1]?.au > 0 && mass[2] > 0) {
    const sepC = separation[1].au;
    const total = pair + mass[2];
    shift = sepC * mass[2] / total;
    cAU = sepC * pair / total;
  }

  const placed = [
    { star: list[0], label: 'A', xAU: -shift - aOffset, unknown: false },
    { star: list[1], label: 'B', xAU: -shift + bOffset, unknown: false },
  ];
  if (cAU != null) {
    placed.push({ star: list[2], label: 'C', xAU: cAU, unknown: false });
  } else if (list.length >= 3) {
    placed.push({ star: list[2], label: 'C', xAU: 0, unknown: true });
  }
  return placed;
}

function orbitEncloses(au, placed) {
  if (!placed.length) return false;
  if (placed.some(star => star.unknown)) return placed.length < 2;
  const far = Math.max(0, ...placed.map(star => Math.abs(star.xAU)));
  if (far === 0) return true;
  return au >= far * ENCLOSE_FACTOR;
}

/**
 * Apparent size of each star from a world. `reliable` is false when the
 * orbit does not enclose the pair, or the separation was never stored.
 * @param {{ orbitalAU?: number }} world
 * @param {Array} stars
 * @param {Array|null} separation
 */
export function apparentSuns(world, stars, separation) {
  if (!world || !(world.orbitalAU > 0) || !stars?.length) return null;
  const placed = placeStars(stars, separation);
  if (!orbitEncloses(world.orbitalAU, placed)) {
    return {
      reliable: false,
      reason: placed.some(star => star.unknown) ? 'unseparated' : 'inside',
      discs: [],
    };
  }
  const discs = placed.map(entry => {
    const radiusSolar = stellarRadiusSolar(entry.star);
    const distance = Math.hypot(world.orbitalAU, entry.xAU || 0);
    const degrees = angularDiameterDegrees(radiusSolar, distance);
    return {
      label: entry.label,
      color: entry.star.color || '#ffffff',
      spectralClass: entry.star.spectralClass,
      radiusSolar,
      degrees,
      text: formatAngular(degrees),
    };
  });
  return { reliable: true, reason: null, discs };
}

/**
 * The measurement as shown on a card. Null when the orbit cannot support one number.
 * @param {{ reliable?: boolean, discs?: Array<{ label: string, text: string }> }|null} view
 * @returns {string|null}
 */
export function sunMeasure(view) {
  if (!view?.reliable || !view.discs?.length) return null;
  if (view.discs.length === 1) return view.discs[0].text;
  return view.discs.map(disc => `${disc.label} ${disc.text}`).join(' · ');
}

function radiusFor(au, scale) {
  if (!(au > 0)) return 0;
  const span = Math.log(scale.maxAU / scale.minAU);
  if (!(span > 0)) return (scale.rMin + scale.rMax) / 2;
  const t = (Math.log(au) - Math.log(scale.minAU)) / span;
  const clamped = Math.min(1, Math.max(0, t));
  return scale.rMin + clamped * (scale.rMax - scale.rMin);
}

function pointOn(au, angle, scale) {
  const r = au > 0 ? radiusFor(au, scale) : 0;
  return {
    r,
    x: scale.cx + Math.cos(angle) * r,
    y: scale.cy + Math.sin(angle) * r,
  };
}

function nudgeAngle(angle, blocked) {
  let next = angle;
  for (let pass = 0; pass < 3; pass += 1) {
    for (const block of blocked) {
      const d = Math.atan2(Math.sin(next - block), Math.cos(next - block));
      if (Math.abs(d) < 0.22) next += (d < 0 ? -1 : 1) * 0.26;
    }
  }
  return next;
}

function placeLabels(items, scale, angle) {
  const sorted = [...items].sort((a, b) => a.r - b.r);
  let lastY = Infinity;
  for (const item of sorted) {
    let r = item.r + 9;
    let x = scale.cx + Math.cos(angle) * r;
    let y = scale.cy + Math.sin(angle) * r;
    let guard = 0;
    while (Math.abs(y - lastY) < 13 && guard < 8) {
      r += 7;
      x = scale.cx + Math.cos(angle) * r;
      y = scale.cy + Math.sin(angle) * r;
      guard += 1;
    }
    const pad = 12;
    item.x = Math.min(scale.width - pad, Math.max(pad, x));
    item.y = Math.min(scale.height - pad, Math.max(pad, y));
    item.anchor = Math.cos(angle) >= 0 ? 'start' : 'end';
    lastY = y;
  }
  return items;
}

function starDiscRadius(star, index) {
  const table = { O: 13, B: 12, A: 10.5, F: 9.5, G: 8.5, K: 7.5, M: 6.5, BD: 6, WD: 4.2, NS: 3.4 };
  const base = table[star.spectralClass] ?? 8;
  return index === 0 ? base + 1.4 : base;
}

// A triple puts the close pair on the same side of the barycenter. Log
// radius then stacks those two discs. The split is perpendicular to the
// pair axis so both stars stay visible. It is not a distance.
function separateStars(stars) {
  const next = stars.map(star => ({ ...star }));
  for (let pass = 0; pass < 6; pass += 1) {
    for (let i = 0; i < next.length; i += 1) {
      for (let j = i + 1; j < next.length; j += 1) {
        const a = next[i];
        const b = next[j];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const need = a.r + b.r + 4;
        if (dist >= need) continue;
        const push = (need - dist) / 2 + 0.5;
        if (a.y <= b.y) {
          a.y -= push;
          b.y += push;
        } else {
          a.y += push;
          b.y -= push;
        }
      }
    }
  }
  return next;
}

function shortName(world) {
  const raw = world.name || world.worldType || 'World';
  return raw.length > 16 ? `${raw.slice(0, 15)}…` : raw;
}

/**
 * Layout for the instrument. Distances are in AU. x and y are in the viewBox.
 * @param {{ stars?: Array, worlds?: Array, separation?: Array|null, hz?: { inner: number, outer: number } }} system
 * @param {string|null} selectedId
 */
export function buildOrrery(system, selectedId = null) {
  const stars = system?.stars || [];
  const worlds = (system?.worlds || [])
    .map((world, index) => ({ world, index }))
    .filter(entry => entry.world.orbitalAU > 0);
  const placed = placeStars(stars, system?.separation);
  const distances = [];
  for (const entry of worlds) distances.push(entry.world.orbitalAU);
  for (const star of placed) if (Math.abs(star.xAU) > 0) distances.push(Math.abs(star.xAU));
  const hz = system?.hz;
  if (hz?.inner > 0) distances.push(hz.inner);
  if (hz?.outer > 0) distances.push(hz.outer);

  const positive = distances.filter(value => value > 0);
  const scale = positive.length
    ? {
      ...VIEW,
      minAU: Math.max(0.004, Math.min(...positive) / 4),
      maxAU: Math.max(...positive) * 1.5,
    }
    : { ...VIEW, minAU: 0.1, maxAU: 10 };

  const blocked = [0, Math.PI, -Math.PI, WORLD_LABEL_ANGLE, HZ_LABEL_ANGLE];
  const bodyAngles = worlds.map((_, index) => nudgeAngle(
    -Math.PI / 2 + ((index + 0.5) * 2 * Math.PI) / worlds.length,
    blocked,
  ));

  const labeled = new Set();
  const byDistance = [...worlds].sort((a, b) => a.world.orbitalAU - b.world.orbitalAU);
  if (byDistance[0]) labeled.add(byDistance[0].world.id);
  if (byDistance.length > 1) labeled.add(byDistance[byDistance.length - 1].world.id);
  if (selectedId) labeled.add(selectedId);

  const bodyLabels = [];
  const bodies = worlds.map((entry, index) => {
    const ring = pointOn(entry.world.orbitalAU, 0, scale);
    const angle = bodyAngles[index];
    const mark = pointOn(entry.world.orbitalAU, angle, scale);
    const selected = entry.world.id === selectedId;
    const showLabel = labeled.has(entry.world.id);
    const label = showLabel ? {
      r: ring.r,
      text: selected
        ? `${shortName(entry.world)}  ${formatAU(entry.world.orbitalAU)}`
        : formatAU(entry.world.orbitalAU),
      selected,
    } : null;
    if (label) bodyLabels.push(label);
    return {
      id: entry.world.id,
      index: entry.index,
      worldType: entry.world.worldType,
      zone: entry.world.zone,
      habitable: !!entry.world.isHabitable,
      circumbinary: !!entry.world.isCircumbinary,
      belt: entry.world.worldType === 'Asteroid Belt',
      au: entry.world.orbitalAU,
      ringR: ring.r,
      markX: mark.x,
      markY: mark.y,
      selected,
      label,
    };
  });
  placeLabels(bodyLabels, scale, WORLD_LABEL_ANGLE);

  let hzLayout = null;
  if (hz?.inner > 0 && hz?.outer > 0) {
    const innerR = radiusFor(hz.inner, scale);
    const outerR = radiusFor(hz.outer, scale);
    const labels = [
      { r: innerR, text: formatAU(hz.inner) },
      { r: Math.max(outerR, innerR + 1), text: formatAU(hz.outer) },
    ];
    placeLabels(labels, scale, HZ_LABEL_ANGLE);
    hzLayout = {
      rInner: Math.min(innerR, outerR),
      rOuter: Math.max(outerR, innerR + 1.2),
      labels,
    };
  }

  const starPoints = placed.map((entry, index) => {
    const angle = entry.xAU < 0 ? Math.PI : 0;
    const at = entry.unknown || entry.xAU === 0
      ? { x: scale.cx, y: scale.cy, r: 0 }
      : pointOn(Math.abs(entry.xAU), angle, scale);
    return {
      label: entry.label,
      color: entry.star.color || '#ffffff',
      x: at.x,
      y: at.y,
      ringR: at.r,
      r: starDiscRadius(entry.star, index),
      unknown: entry.unknown,
    };
  });

  if (starPoints.length > 1 && starPoints.every(star => star.ringR === 0)) {
    starPoints.forEach((star, index) => {
      star.x = scale.cx + (index - (starPoints.length - 1) / 2) * 18;
    });
  }

  const fittedStars = separateStars(starPoints);
  const spanValues = worlds.map(entry => entry.world.orbitalAU);
  const span = spanValues.length
    ? `${formatAU(Math.min(...spanValues))}–${formatAU(Math.max(...spanValues))} AU`
    : null;
  const pair = Array.isArray(system?.separation) && system.separation.length
    ? system.separation.map((entry, index) => {
      const name = system.separation.length === 1 ? 'pair' : (index === 0 ? 'A–B' : 'C');
      return `${name} ${formatAU(entry.au)} AU`;
    }).join(' · ')
    : null;

  return {
    width: VIEW.width,
    height: VIEW.height,
    cx: scale.cx,
    cy: scale.cy,
    span,
    pair,
    hz: hzLayout,
    stars: fittedStars,
    bodies,
    labelAngle: WORLD_LABEL_ANGLE,
  };
}
