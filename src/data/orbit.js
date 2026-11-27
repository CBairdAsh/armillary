// Inclination and eccentricity are properties of the orbit, not the body.
// They are a hash of the slot (index, distance, zone) and the stars, so a
// redraw of the world keeps the orbit and a replay of the seed does too.
// The id is left out: a fresh roll of the same seed assigns new ids.
// Nothing here consumes the generator's random stream.
//
// Inner and habitable orbits stay under 3°. An outer orbit is usually
// flat, and about one in eight is tilted 5–15°. A fringe orbit is the
// hot population: about one in three is tilted 10–30°, with a thin tail
// toward 45°. Eccentricity appears only once the tilt reaches 8°.
// A circumbinary orbit and a belt stay in the plane.

const HOT_INCLINATION = 8;
const PRINT_INCLINATION = 5;

function hashUnit(text) {
  let hash = 2166136261;
  const value = String(text);
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function starKey(stars) {
  return (stars || [])
    .map(star => `${star?.spectralClass}|${star?.mass}|${star?.luminosity}`)
    .join('/');
}

function slotKey(world, stars) {
  const index = Number.isInteger(world.index) ? world.index : 0;
  return `${index}|${world.orbitalAU}|${world.zone}|${starKey(stars)}`;
}

function inclinationDegrees(zone, unit) {
  if (zone === 'OUTER') {
    if (unit < 7 / 8) return unit * 4;
    const t = (unit - 7 / 8) / (1 / 8);
    return 5 + t * 10;
  }
  if (zone === 'FRINGE') {
    if (unit < 2 / 3) return unit * 5;
    const t = (unit - 2 / 3) / (1 / 3);
    if (t < 0.85) return 10 + (t / 0.85) * 20;
    return 30 + ((t - 0.85) / 0.15) * 15;
  }
  return unit * 3;
}

/**
 * Derived orbit shape. Null for a belt, a circumbinary world, or a body
 * with no orbit. Angles are in radians. Distances are AU.
 * @param {object} world
 * @param {Array} stars
 * @returns {{ inclination: number, eccentricity: number, node: number, periapsis: number, perihelion: number, aphelion: number }|null}
 */
export function worldOrbit(world, stars) {
  if (!world || !(world.orbitalAU > 0)) return null;
  if (world.worldType === 'Asteroid Belt' || world.isCircumbinary) return null;
  const key = slotKey(world, stars);
  const inclination = inclinationDegrees(world.zone, hashUnit(`incl|${key}`));
  const eccentricity = inclination >= HOT_INCLINATION
    ? 0.15 + hashUnit(`ecc|${key}`) * 0.2
    : 0;
  const a = world.orbitalAU;
  return {
    inclination,
    eccentricity,
    node: hashUnit(`node|${key}`) * Math.PI * 2,
    periapsis: hashUnit(`peri|${key}`) * Math.PI * 2,
    perihelion: a * (1 - eccentricity),
    aphelion: a * (1 + eccentricity),
  };
}

/**
 * The next real body inward. Belts and circumbinary worlds are skipped.
 * @param {object} world
 * @param {Array} worlds
 * @returns {{ world: object, index: number }|null}
 */
function nextInnerBody(world, worlds) {
  let best = null;
  (worlds || []).forEach((entry, index) => {
    if (!entry || entry === world || entry.id === world.id) return;
    if (!(entry.orbitalAU > 0) || entry.orbitalAU >= world.orbitalAU) return;
    if (entry.worldType === 'Asteroid Belt' || entry.isCircumbinary) return;
    if (!best || entry.orbitalAU > best.world.orbitalAU) {
      best = { world: entry, index: Number.isInteger(entry.index) ? entry.index : index };
    }
  });
  return best;
}

/**
 * The inner body this orbit crosses, when perihelion reaches past that
 * body's aphelion. Null when the orbit is circular or stays outside.
 * @param {object} world
 * @param {Array} worlds
 * @param {Array} stars
 * @returns {{ world: object, index: number }|null}
 */
export function orbitCrossing(world, worlds, stars) {
  const orbit = worldOrbit(world, stars);
  if (!orbit || !(orbit.eccentricity > 0)) return null;
  const inner = nextInnerBody(world, worlds);
  if (!inner) return null;
  const innerOrbit = worldOrbit(inner.world, stars);
  const reach = innerOrbit?.aphelion || inner.world.orbitalAU;
  const clearance = Math.max(0.02, reach * 0.01);
  if (!(orbit.perihelion < reach - clearance)) return null;
  return inner;
}

/**
 * Whole-disk tilt against the star's equator. About one system in twelve
 * is misaligned, and a quarter of those are retrograde. Null for a rogue
 * and for a disk that still shares the star's equator.
 * @param {{ isRoguePlanet?: boolean, stars?: Array }} system
 * @returns {{ degrees: number, retrograde: boolean }|null}
 */
export function diskTilt(system) {
  if (!system || system.isRoguePlanet || !(system.stars || []).length) return null;
  const unit = hashUnit(`disk|${starKey(system.stars)}`);
  if (unit >= 0.08) return null;
  const t = unit / 0.08;
  const retrograde = t < 0.25;
  const degrees = retrograde
    ? Math.round(100 + (t / 0.25) * 70)
    : Math.round(15 + ((t - 0.25) / 0.75) * 45);
  return { degrees, retrograde };
}

const COLD_GIANT = new Set(['Gas Giant', 'Ice Giant']);
// The classical belt starts beyond the outermost cold giant and thins at
// the 2:1 resonance. Sol's Neptune puts that at about 42–48 AU.
const BELT_INNER = 1.4;
const BELT_OUTER = 2 ** (2 / 3);

/**
 * The outermost cold giant. A hot giant, a gas dwarf, and a belt are not
 * the edge of this disk.
 * @param {{ worlds?: Array }} system
 * @returns {object|null}
 */
function outermostColdGiant(system) {
  let best = null;
  for (const world of system?.worlds || []) {
    if (!COLD_GIANT.has(world?.worldType)) continue;
    if (world.zone !== 'OUTER' && world.zone !== 'FRINGE') continue;
    if (!(world.orbitalAU > 0)) continue;
    if (!best || world.orbitalAU > best.orbitalAU) best = world;
  }
  return best;
}

/**
 * A flat outer belt beyond the last cold giant. Derived, so a saved
 * system grows it. Null when the system has no such giant. Dust past
 * the outer edge is rare, about one system in twelve, and is not drawn.
 * @param {{ isRoguePlanet?: boolean, stars?: Array, worlds?: Array }} system
 * @returns {{ inner: number, outer: number, dust: boolean }|null}
 */
export function outerBelt(system) {
  if (!system || system.isRoguePlanet || !(system.stars || []).length) return null;
  const giant = outermostColdGiant(system);
  if (!giant) return null;
  return {
    inner: giant.orbitalAU * BELT_INNER,
    outer: giant.orbitalAU * BELT_OUTER,
    dust: hashUnit(`belt-dust|${starKey(system.stars)}`) < 0.08,
  };
}

export const INCLINATION_PRINT_DEGREES = PRINT_INCLINATION;
export const INCLINATION_DRAW_DEGREES = HOT_INCLINATION;
