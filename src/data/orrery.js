// The orrery is a schematic of one system. Distances are the AU already
// stored: world orbit, habitable zone, stellar separation. Nothing here
// assigns a world to one star. A mark sits on its ring so the ring can
// be selected. The view starts face-on and can pitch toward the edge, so
// a tilted orbit separates from the disk. The pitch is a camera angle.
// It is not the orbit's inclination.
//
// Ring radius is logarithmic. A linear drawing hides the inner worlds
// behind a companion at hundreds of AU. The labels stay in AU. The
// radius span is wide enough that a disc, a ring lying along the orbit,
// and a belt do not reach the next path.
//
// A comet's semi-major axis comes from its stored period and the stellar
// mass. The shape, the tilt, and the place on that orbit are a hash of
// the comet's id, so nothing here consumes the generator's random stream.
// The far end of a long orbit is left off the chart, so a cloud comet
// does not shrink the worlds.
//
// A moon has no stored distance. Its plate is a second chart, centered
// on the parent world. The rings are a stable schematic of the moon's
// id: spread by index, with a small tilt so a pitched view still
// separates them. Those radii are not distances and are not labeled.
//
// Apparent size needs a radius. Main-sequence radius comes from luminosity
// and a temperature for the class (Stefan–Boltzmann). A white dwarf, a
// neutron star, and a brown dwarf do not follow that relation, so each
// uses a fixed radius. The number is derived. It is not a rolled fact.
// It is shown only for an orbit that encloses the stars. Inside the pair
// the distance to each star depends on which star the world circles, and
// the ladder does not record that.

import { SPECTRAL_CLASSES } from './stellarData.js';
import { outerBelt, worldOrbit } from './orbit.js';

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
  width: 832,
  height: 832,
  cx: 416,
  cy: 416,
  rMin: 48,
  rMax: 380,
};

const WORLD_LABEL_ANGLE = -Math.PI / 5;
const HZ_LABEL_ANGLE = Math.PI + Math.PI / 5;
const BELT_LABEL_ANGLE = Math.PI / 2;

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

const ORBIT_SAMPLES = 72;

function orbitElements(world, stars) {
  const orbit = world && stars ? worldOrbit(world, stars) : null;
  return {
    a: world?.orbitalAU || 0,
    e: orbit?.eccentricity || 0,
    i: (orbit?.inclination || 0) * Math.PI / 180,
    node: orbit?.node || 0,
    peri: orbit?.periapsis || 0,
    inclination: orbit?.inclination || 0,
  };
}

function orbitVector(elements, anomaly) {
  const e = elements.e;
  const radius = e > 0
    ? (elements.a * (1 - e * e)) / (1 + e * Math.cos(anomaly))
    : elements.a;
  const cPeri = Math.cos(elements.peri);
  const sPeri = Math.sin(elements.peri);
  const x0 = radius * Math.cos(anomaly);
  const y0 = radius * Math.sin(anomaly);
  const x1 = x0 * cPeri - y0 * sPeri;
  const y1 = x0 * sPeri + y0 * cPeri;
  const cInc = Math.cos(elements.i);
  const sInc = Math.sin(elements.i);
  const y2 = y1 * cInc;
  const z2 = y1 * sInc;
  const cNode = Math.cos(elements.node);
  const sNode = Math.sin(elements.node);
  return {
    x: x1 * cNode - y2 * sNode,
    y: x1 * sNode + y2 * cNode,
    z: z2,
  };
}

function projectVector(vector, scale, pitch) {
  const rho = Math.hypot(vector.x, vector.y, vector.z);
  if (!(rho > 0)) return { x: scale.cx, y: scale.cy };
  const radial = radiusFor(rho, scale);
  const x = vector.x / rho * radial;
  const y = vector.y / rho * radial;
  const z = vector.z / rho * radial;
  const beta = (pitch || 0) * Math.PI / 180;
  return {
    x: scale.cx + x,
    y: scale.cy + y * Math.cos(beta) - z * Math.sin(beta),
  };
}

function ringPoints(elements, scale, pitch) {
  const points = [];
  for (let step = 0; step < ORBIT_SAMPLES; step += 1) {
    const anomaly = (step / ORBIT_SAMPLES) * Math.PI * 2;
    points.push(projectVector(orbitVector(elements, anomaly), scale, pitch));
  }
  return points;
}

function diskElements(au) {
  return { a: au, e: 0, i: 0, node: 0, peri: 0, inclination: 0 };
}

function hashUnit(text) {
  let hash = 2166136261;
  const value = String(text);
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function cometColor(composition) {
  if (composition === 'Rocky-Icy') return '#e4d2b4';
  if (composition === 'Metallic') return '#d5dde4';
  if (composition === 'Carbon-rich') return '#b7aea4';
  if (composition === 'Exotic') return '#e4d4f2';
  return '#e7f4fb';
}

function cometElements(comet, mass, scale) {
  const stellar = mass > 0 ? mass : 1;
  const period = comet.period > 0 ? comet.period : 10;
  const axis = Math.cbrt(period * period * stellar);
  const unit = hashUnit;
  const id = comet.id || `${comet.index}|${period}`;
  const qMax = comet.periodType === 'Long-period' ? 4.5 : comet.periodType === 'Medium-period' ? 3.2 : 2.2;
  const room = Math.min(qMax, Math.max(scale.minAU * 6, scale.maxAU * 0.45));
  let perihelion = scale.minAU * 3 + unit(`${id}|q`) * Math.max(0.2, room - scale.minAU * 3);
  if (perihelion > axis * 0.55) perihelion = axis * 0.55;
  const eccentricity = Math.min(0.985, Math.max(0.45, 1 - perihelion / axis));
  const tilt = comet.periodType === 'Short-period'
    ? unit(`${id}|i`) * 28
    : comet.periodType === 'Medium-period'
      ? unit(`${id}|i`) * 60
      : unit(`${id}|i`) * 165;
  return {
    a: axis,
    e: eccentricity,
    i: tilt * Math.PI / 180,
    node: unit(`${id}|node`) * Math.PI * 2,
    peri: unit(`${id}|peri`) * Math.PI * 2,
    anomaly: (unit(`${id}|nu`) - 0.5) * 1.2,
    color: cometColor(comet.composition),
  };
}

function openPath(points, close) {
  if (points.length < 2) return '';
  const body = points.map((point, index) => (
    `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
  )).join(' ');
  return close ? `${body} Z` : body;
}

function cometTracks(elements, scale, pitch) {
  const samples = 128;
  const inside = [];
  for (let step = 0; step <= samples; step += 1) {
    const anomaly = (step / samples) * Math.PI * 2;
    const vector = orbitVector(elements, anomaly);
    const rho = Math.hypot(vector.x, vector.y, vector.z);
    inside.push(rho > 0 && rho <= scale.maxAU ? projectVector(vector, scale, pitch) : null);
  }
  const runs = [];
  let run = [];
  for (let step = 0; step < samples; step += 1) {
    const point = inside[step];
    if (!point) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    run.push(point);
  }
  if (run.length > 1) runs.push(run);
  if (runs.length >= 2 && inside[0] && inside[samples - 1]) {
    const wrapped = runs.pop();
    runs[0] = wrapped.concat(runs[0]);
  }
  const full = inside.slice(0, samples).every(Boolean);
  return runs.map(points => openPath(points, full)).filter(Boolean);
}

function layoutComets(system, scale, pitch) {
  const list = system?.comets || [];
  if (!list.length || system?.isRoguePlanet) return [];
  const mass = (system.stars || []).reduce((sum, star) => sum + (star.mass > 0 ? star.mass : 0), 0);
  return list.map(comet => {
    const elements = cometElements(comet, mass, scale);
    const vector = orbitVector(elements, elements.anomaly);
    const mark = projectVector(vector, scale, pitch);
    const tail = Math.atan2(mark.y - scale.cy, mark.x - scale.cx) * 180 / Math.PI;
    const name = `C${(comet.index ?? 0) + 1}`;
    return {
      id: comet.id,
      index: comet.index ?? 0,
      x: mark.x,
      y: mark.y,
      tail,
      color: elements.color,
      paths: cometTracks(elements, scale, pitch),
      title: `${name} ${comet.composition || 'Comet'}, ${comet.periodType || 'comet'}, ${comet.period} yr`,
    };
  });
}

function ringPath(points) {
  if (!points.length) return '';
  const body = points.map((point, index) => (
    `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
  )).join(' ');
  return `${body} Z`;
}

function growPoints(points, scale, pixels) {
  return points.map(point => {
    const dx = point.x - scale.cx;
    const dy = point.y - scale.cy;
    const distance = Math.hypot(dx, dy) || 1;
    return {
      x: point.x + (dx / distance) * pixels,
      y: point.y + (dy / distance) * pixels,
    };
  });
}

function labelFrom(point, scale) {
  const dx = point.x - scale.cx;
  const dy = point.y - scale.cy;
  const distance = Math.hypot(dx, dy) || 1;
  const pad = 12;
  return {
    x: Math.min(scale.width - pad, Math.max(pad, point.x + (dx / distance) * 14)),
    y: Math.min(scale.height - pad, Math.max(pad, point.y + (dy / distance) * 14)),
    anchor: dx >= 0 ? 'start' : 'end',
  };
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

function settleLabels(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  let lastY = -Infinity;
  for (const item of sorted) {
    if (item.y - lastY < 13) item.y = lastY + 13;
    lastY = item.y;
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
        // The extra gap is for the bloom. Disc edges that only clear by a
        // few units still read as one star once the halo is drawn.
        const need = a.r + b.r + 18;
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
 * @param {number} [pitch]
 */
export function buildOrrery(system, selectedId = null, pitch = 0) {
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
  const belt = outerBelt(system);
  if (belt) {
    distances.push(belt.inner);
    distances.push(belt.outer);
  }

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
    const elements = orbitElements(entry.world, stars);
    const points = ringPoints(elements, scale, pitch);
    const angle = bodyAngles[index];
    const mark = projectVector(orbitVector(elements, angle), scale, pitch);
    const tangent = Math.atan2(mark.y - scale.cy, mark.x - scale.cx) * 180 / Math.PI + 90;
    const onRing = projectVector(orbitVector(elements, WORLD_LABEL_ANGLE), scale, pitch);
    const selected = entry.world.id === selectedId;
    const showLabel = labeled.has(entry.world.id);
    const degrees = Math.round(elements.inclination);
    const label = showLabel ? {
      ...labelFrom(onRing, scale),
      text: selected
        ? `${shortName(entry.world)}  ${formatAU(entry.world.orbitalAU)}`
        : formatAU(entry.world.orbitalAU),
      selected,
    } : null;
    if (label) bodyLabels.push(label);
    const specks = entry.world.worldType === 'Asteroid Belt'
      ? [0.05, 0.14, 0.23, 0.33, 0.42, 0.52, 0.61, 0.71, 0.8, 0.89, 0.96].map((fraction, speckIndex) => {
        const at = projectVector(orbitVector(elements, fraction * Math.PI * 2), scale, pitch);
        return {
          x: at.x,
          y: at.y,
          r: 0.95 + (speckIndex % 4) * 0.38,
          shade: 0.08 + (speckIndex % 5) * 0.1,
        };
      })
      : null;
    return {
      id: entry.world.id,
      index: entry.index,
      worldType: entry.world.worldType,
      zone: entry.world.zone,
      habitable: !!entry.world.isHabitable,
      circumbinary: !!entry.world.isCircumbinary,
      belt: entry.world.worldType === 'Asteroid Belt',
      au: entry.world.orbitalAU,
      inclination: degrees >= 5 ? degrees : 0,
      path: ringPath(points),
      outerPath: entry.world.isCircumbinary ? ringPath(growPoints(points, scale, 3)) : null,
      markX: mark.x,
      markY: mark.y,
      tangent,
      outward: Math.atan2(mark.y - scale.cy, mark.x - scale.cx) * 180 / Math.PI,
      hydrosphere: entry.world.hydrosphere || '',
      ringX: onRing.x,
      ringY: onRing.y,
      specks,
      selected,
      label,
    };
  });
  settleLabels(bodyLabels);

  let beltLayout = null;
  if (belt) {
    const innerPoints = ringPoints(diskElements(belt.inner), scale, pitch);
    const outerPoints = ringPoints(diskElements(belt.outer), scale, pitch);
    const mid = Math.sqrt(belt.inner * belt.outer);
    const midPoints = ringPoints(diskElements(mid), scale, pitch);
    const at = projectVector(orbitVector(diskElements(belt.outer), BELT_LABEL_ANGLE), scale, pitch);
    const label = {
      ...labelFrom(at, scale),
      text: `${formatAU(belt.inner)}–${formatAU(belt.outer)}`,
    };
    const drawn = radiusFor(belt.outer, scale) - radiusFor(belt.inner, scale);
    beltLayout = {
      innerPath: ringPath(innerPoints),
      outerPath: ringPath(outerPoints),
      midPath: ringPath(midPoints),
      bandPath: `${ringPath(outerPoints)} ${ringPath([...innerPoints].reverse())}`,
      narrow: drawn < 8,
      label,
    };
  }

  let hzLayout = null;
  if (hz?.inner > 0 && hz?.outer > 0) {
    const innerPoints = ringPoints(diskElements(hz.inner), scale, pitch);
    const outerPoints = ringPoints(diskElements(hz.outer), scale, pitch);
    const labels = [hz.inner, hz.outer].map(au => {
      const at = projectVector(orbitVector(diskElements(au), HZ_LABEL_ANGLE), scale, pitch);
      return { ...labelFrom(at, scale), text: formatAU(au) };
    });
    settleLabels(labels);
    hzLayout = {
      innerPath: ringPath(innerPoints),
      outerPath: ringPath(outerPoints),
      bandPath: `${ringPath(outerPoints)} ${ringPath([...innerPoints].reverse())}`,
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
      spectralClass: entry.star.spectralClass || '',
      primary: index === 0,
      x: at.x,
      y: at.y,
      ringR: at.r,
      ringPath: at.r > 0 ? ringPath(ringPoints(diskElements(Math.abs(entry.xAU)), scale, pitch)) : '',
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
    belt: beltLayout,
    stars: fittedStars,
    comets: layoutComets(system, scale, pitch),
    bodies,
  };
}

const MOON_FACE = {
  Rocky: { glyph: 'Terrestrial', color: '#9a9288' },
  Icy: { glyph: 'Ice Planet', color: '#d7e6f0' },
  'Subsurface Ocean': { glyph: 'Ice Planet', color: '#b7d0dc' },
  Cryovolcanic: { glyph: 'Ice Planet', color: '#e7f3f6' },
  Volcanic: { glyph: 'Chthonian', color: '#e2b15a' },
  Terrestrial: { glyph: 'Terrestrial', color: '#8f9a74' },
  // Nitrogen and methane. The haze is orange. The ground stays hidden.
  'Thin Atmosphere': { glyph: 'Desert', color: '#d4894a' },
};

function moonFace(type) {
  return MOON_FACE[type] || MOON_FACE.Rocky;
}

function parentDiscRadius(worldType) {
  if (worldType === 'Gas Giant') return 32;
  if (worldType === 'Ice Giant') return 27;
  if (worldType === 'Gas Dwarf') return 22;
  return 18;
}

/**
 * Schematic elements for one moon. Spread by index so a crowded giant
 * stays readable. The hash only jitters that slot.
 * @param {{ id?: string, type?: string }} moon
 * @param {number} index
 * @param {number} count
 */
function moonElements(moon, index, count) {
  const id = moon.id || String(index);
  const t = count <= 1 ? 0.5 : index / (count - 1);
  const axis = 1.7 * Math.exp(t * Math.log(12 / 1.7));
  const irregular = hashUnit(`${id}|class`) > 0.8;
  const tilt = irregular
    ? 14 + hashUnit(`${id}|i`) * 26
    : hashUnit(`${id}|i`) * 7;
  const spread = -Math.PI / 2 + ((index + 0.5) * Math.PI * 2) / Math.max(1, count);
  return {
    a: axis * (0.94 + hashUnit(`${id}|a`) * 0.12),
    e: hashUnit(`${id}|e`) * 0.07,
    i: tilt * Math.PI / 180,
    node: hashUnit(`${id}|node`) * Math.PI * 2,
    peri: hashUnit(`${id}|peri`) * Math.PI * 2,
    anomaly: spread + (hashUnit(`${id}|nu`) - 0.5) * 0.4,
    inclination: tilt,
  };
}

function moonDiscRadius(moon, selected) {
  const unit = hashUnit(`${moon.id || moon.index}|r`);
  const large = moon.type === 'Terrestrial' || moon.type === 'Thin Atmosphere';
  return (large ? 8.6 : 6.8) + unit * 1.8 + (selected ? 1.1 : 0);
}

/**
 * Moon chart for one world. Same view box as the system plate, so the
 * camera math does not change. Null when the world has no moons.
 * @param {{ id?: string, name?: string, worldType?: string, zone?: string, moons?: Array }} world
 * @param {string|null} [selectedMoonId]
 * @param {number} [pitch]
 * @param {string|null} [hoverId]
 */
export function buildMoonPlate(world, selectedMoonId = null, pitch = 0, hoverId = null) {
  const moons = world?.moons || [];
  if (!moons.length) return null;
  const laid = moons.map((moon, index) => ({
    moon,
    index,
    elements: moonElements(moon, index, moons.length),
  }));
  const axes = laid.map(entry => entry.elements.a);
  // The parent disc and its rings own the middle. One moon gets a single
  // open ring. A crowd starts just outside the rings and runs outward.
  const alone = moons.length === 1;
  const scale = {
    ...VIEW,
    rMin: alone ? 196 : 142,
    rMax: alone ? 214 : 328,
    minAU: Math.min(...axes) / (alone ? 1.2 : 1.18),
    maxAU: Math.max(...axes) * (alone ? 1.08 : 1.1),
  };

  const labeled = new Set();
  labeled.add(laid[0].moon.id);
  labeled.add(laid[laid.length - 1].moon.id);
  if (selectedMoonId) labeled.add(selectedMoonId);
  if (hoverId) labeled.add(hoverId);

  const bodyLabels = [];
  const bodies = laid.map(entry => {
    const { moon, elements } = entry;
    const face = moonFace(moon.type);
    const points = ringPoints(elements, scale, pitch);
    const mark = projectVector(orbitVector(elements, elements.anomaly), scale, pitch);
    const onRing = projectVector(orbitVector(elements, WORLD_LABEL_ANGLE), scale, pitch);
    const selected = moon.id === selectedMoonId;
    const label = labeled.has(moon.id) ? {
      ...labelFrom(onRing, scale),
      text: selected || moon.id === hoverId
        ? `M${entry.index + 1}  ${moon.type}`
        : `M${entry.index + 1}`,
      selected,
    } : null;
    if (label) bodyLabels.push(label);
    return {
      id: moon.id,
      index: entry.index,
      moon: true,
      moonType: moon.type,
      worldType: face.glyph,
      zone: world.zone,
      color: face.color,
      habitable: !!(moon.canSupportLife || moon.biosphere),
      belt: false,
      au: null,
      inclination: 0,
      path: ringPath(points),
      outerPath: null,
      markX: mark.x,
      markY: mark.y,
      tangent: Math.atan2(mark.y - scale.cy, mark.x - scale.cx) * 180 / Math.PI + 90,
      outward: Math.atan2(mark.y - scale.cy, mark.x - scale.cx) * 180 / Math.PI,
      ringX: onRing.x,
      ringY: onRing.y,
      specks: null,
      radius: moonDiscRadius(moon, selected),
      selected,
      label,
    };
  });
  settleLabels(bodyLabels);

  const count = moons.length;
  return {
    mode: 'moons',
    width: VIEW.width,
    height: VIEW.height,
    cx: scale.cx,
    cy: scale.cy,
    span: count === 1 ? '1 moon' : `${count} moons`,
    pair: null,
    hz: null,
    belt: null,
    stars: [],
    comets: [],
    parent: {
      id: world.id,
      worldType: world.worldType,
      zone: world.zone,
      label: shortName(world),
      markX: scale.cx,
      markY: scale.cy,
      tangent: 0,
      outward: 0,
      hydrosphere: world.hydrosphere || '',
      radius: parentDiscRadius(world.worldType),
      selected: !selectedMoonId,
    },
    bodies,
  };
}
