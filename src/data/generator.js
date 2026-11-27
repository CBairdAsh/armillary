// ─── GENERATION ENGINE ────────────────────────────────────────────────────────
// Procedural generation based on GURPS Space 4e. Every random roll in a
// system comes through this file, so a seed can replay the same system.
//
// A fresh system is built in one pass: neighborhood, stars, habitable zone,
// orbits, worlds, biospheres, species, comets. Redraw Free rerolls the
// unlocked cards and keeps locked ones in the same slot.
//
// Eject removes a world from that ladder and keeps the same body on
// system.ejected, as a rogue with no host star. The stored orbitalAU is 0
// because the body has no orbit. It does not mean the body sits on a star.
// The stored habitable zone is 0–0 for the same reason.

import { getRandom, runWithSeed, generateRandomSeed } from './rng.js';
import { APP_VERSION } from '../config.js';
import { apparentSuns, formatAU, sunMeasure } from './orrery.js';
import { diskTilt, orbitCrossing, outerBelt, worldOrbit, INCLINATION_PRINT_DEGREES } from './orbit.js';
import {
  SPECTRAL_CLASSES,
  WORLD_TYPE_BY_ZONE,
  WORLD_TYPES,
  WORLD_HAZARDS,
  CRUSH_DEBRIS,
  MOON_TYPES,
  NEIGHBORHOOD_DENSITY,
  DISTANCE_RANGES,
  BIOLOGICAL_ORIGINS,
  BODY_PLANS,
  PRIMARY_SENSES,
  SOCIAL_STRUCTURES,
  TECH_LEVELS,
  DISPOSITIONS,
  DISTINCTIVE_TRAITS,
  COMET_COUNTS,
  COMET_COMPOSITIONS,
  COMET_ORBITAL_PERIODS,
  NEIGHBORHOOD_EXOTIC_TYPES,
  RUINS_CHANCE,
  RUINS_COLLAPSE_CAUSES,
  RUINS_AGE_RANGES,
  RUINS_TECH_LEVELS,
  TIDAL_LOCK_SPECTRAL_CLASSES,
  TIDAL_LOCK_PARTIAL_CLASSES,
  BIOSIGNATURE_CHANCE,
  BIOSIGNATURE_TYPES,
  atmosphereWeightPairs,
  CIRCUMBINARY_CHANCE,
  PULSAR_PLANET_CHANCE,
  calculateHabitableZone,
  estimateTemperature,
} from './stellarData.js';

// ─── UTILITY ─────────────────────────────────────────────────────────────────
function rnd(min, max) {
  return getRandom() * (max - min) + min;
}
function rndInt(min, max) {
  return Math.floor(rnd(min, max + 1));
}
function rndFrom(arr) {
  return arr[Math.floor(getRandom() * arr.length)];
}
function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + (Array.isArray(item) ? item[1] : item.weight), 0);
  let roll = getRandom() * total;
  for (const item of items) {
    const w = Array.isArray(item) ? item[1] : item.weight;
    roll -= w;
    if (roll <= 0) return Array.isArray(item) ? item[0] : item;
  }
  return Array.isArray(items[0]) ? items[0][0] : items[0];
}
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => getRandom() - 0.5);
  return shuffled.slice(0, n);
}
function round2(n) { return Math.round(n * 100) / 100; }

function applyWeightBoosts(items, boosts = {}) {
  if (!Object.keys(boosts).length) return items;
  return items.map(item => ({
    ...item,
    weight: item.weight * (boosts[item.label] ?? 1),
  }));
}

// ─── SPECTRAL CLASS GENERATION ────────────────────────────────────────────────
// GURPS Space uses a weighted roll favoring common stellar types
const SPECTRAL_WEIGHTS = [
  ['M',  76.5],
  ['K',  12.1],
  ['G',   7.6],
  ['F',   3.0],
  ['A',   0.6],
  ['B',   0.13],
  ['O',   0.003],
  ['WD',  3.0],  // slightly boosted for interest
  ['BD',  2.0],
  ['NS',  0.5],
];

function generateSpectralClass(allowExotic = true) {
  const pool = allowExotic
    ? SPECTRAL_WEIGHTS
    : SPECTRAL_WEIGHTS.filter(([k]) => !SPECTRAL_CLASSES[k].exotic);
  return weightedPick(pool);
}

function generateLuminosityFromMass(spectralClass, mass) {
  const sc = SPECTRAL_CLASSES[spectralClass];
  if (!sc) return 1.0;
  const [minM, maxM] = sc.massRange;
  const [minL, maxL] = sc.luminosityRange;
  const span = maxM - minM || 1;
  const t    = Math.min(1, Math.max(0, (mass - minM) / span));
  const logL = Math.log10(minL) + t * (Math.log10(maxL) - Math.log10(minL));
  const jitter = rnd(-0.06, 0.06);
  return round2(Math.pow(10, logL + jitter));
}

function generateMass(spectralClass) {
  const sc = SPECTRAL_CLASSES[spectralClass];
  if (!sc) return 1.0;
  const [min, max] = sc.massRange;
  return round2(rnd(min, max));
}

function generateAge(spectralClass) {
  const sc = SPECTRAL_CLASSES[spectralClass];
  if (!sc) return round2(rnd(1, 10));
  const maxAge = sc.lifespan;
  return round2(rnd(0.1, Math.min(maxAge, 13.8))); // universe age cap
}

// ─── SINGLE STAR GENERATION ───────────────────────────────────────────────────
function generateStar(index = 0, allowExotic = true, forcedSpectralClass = null) {
  const spectralClass = forcedSpectralClass || generateSpectralClass(index === 0 ? allowExotic : false);
  const mass          = generateMass(spectralClass);
  const luminosity    = generateLuminosityFromMass(spectralClass, mass);
  const age           = generateAge(spectralClass);
  const hz            = calculateHabitableZone(luminosity);
  const sc            = SPECTRAL_CLASSES[spectralClass];

  return {
    id:            crypto.randomUUID(),
    index,
    spectralClass,
    luminosity,
    mass,
    age,
    color:         sc?.color || '#FFFFFF',
    description:   sc?.description || 'Unknown',
    habitableZone: hz,
    notes:         sc?.notes || '',
    exotic:        sc?.exotic || false,
    locked:        false,
  };
}

// ─── MULTI-STAR SYSTEM ────────────────────────────────────────────────────────
// Companion distance is logarithmic, from a close pair out to a wide one.
// The span matches the companion table in GURPS Space. The period is Kepler
// from that distance and the masses already rolled. A triple is a pair,
// then the third star at least five times farther out.
function rollSeparationAU() {
  const min = Math.log(0.05);
  const max = Math.log(2000);
  return round2(Math.exp(min + getRandom() * (max - min)));
}

function stellarSeparation(stars) {
  if (!stars || stars.length < 2) return null;
  const inner = rollSeparationAU();
  const pairMass = (stars[0].mass || 0) + (stars[1].mass || 0);
  const pairs = [{
    label: 'A–B',
    au: inner,
    periodYears: orbitalPeriodYears(inner, pairMass),
  }];
  if (stars.length >= 3) {
    const outer = round2(inner * rnd(5, 40));
    pairs.push({
      label: 'C',
      au: outer,
      periodYears: orbitalPeriodYears(outer, pairMass + (stars[2].mass || 0)),
    });
  }
  return pairs;
}

function separationFits(stars, separation) {
  if (!Array.isArray(separation)) return false;
  if (stars.length === 2) return separation.length === 1;
  if (stars.length === 3) return separation.length === 2;
  return false;
}

// A circumbinary world orbits past the pair. The stable floor is about
// three times the outer separation. An old system with no separation
// keeps the habitable-zone multiple it was built with.
function circumbinaryOrbitAU(separation, combinedHZ) {
  const outer = separation?.[separation.length - 1]?.au;
  if (outer > 0) return round2(outer * rnd(3, 5));
  return round2(combinedHZ.outer * rnd(1.5, 4.0));
}

function enforceSecondaryMassLimits(stars) {
  if (stars.length <= 1) return stars;
  for (let i = 1; i < stars.length; i++) {
    if (stars[i].mass > stars[0].mass) {
      stars[i].mass = round2(stars[0].mass * rnd(0.3, 0.99));
    }
  }
  return stars;
}

function syncStarHabitableZones(stars) {
  return stars.map(s => ({
    ...s,
    habitableZone: calculateHabitableZone(s.luminosity),
  }));
}

function buildStarsArray(count, { locked = null, primarySpectralClass = null } = {}) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    if (locked?.[i]) {
      stars.push(locked[i]);
    } else {
      stars.push(generateStar(i, i === 0, i === 0 ? primarySpectralClass : null));
    }
  }
  enforceSecondaryMassLimits(stars);
  return syncStarHabitableZones(stars);
}

// ─── ORBITAL ZONES ────────────────────────────────────────────────────────────
// Inner is everything sunward of the habitable zone. Fringe is beyond
// three times the outer edge. A zone with no width is not a zone: rogue
// systems store 0–0 to mean "no star", and 0 <= 0 would otherwise count
// the unbound body as habitable.
function determineOrbitalZone(orbitalAU, hz) {
  if (!hz || !(hz.outer > hz.inner)) return 'FRINGE';
  if (orbitalAU < hz.inner * 0.5) return 'INNER';
  if (orbitalAU < hz.inner) return 'INNER';
  if (orbitalAU <= hz.outer) return 'HABITABLE';
  if (orbitalAU <= hz.outer * 3) return 'OUTER';
  return 'FRINGE';
}

// ─── ORBITAL SPACING ─────────────────────────────────────────────────────────
// Titius-Bode inspired spacing with randomization
function generateOrbitalPositions(count, hz) {
  const positions = [];
  let current = rnd(0.05, 0.2); // innermost orbit
  for (let i = 0; i < count; i++) {
    positions.push(round2(current));
    current *= rnd(1.4, 2.2); // Titius-Bode style spacing
  }
  return positions;
}

function resolveWorldType(zone, index, primarySpectralClass, forcedWorldType = null) {
  if (forcedWorldType) return forcedWorldType;
  if (primarySpectralClass === 'NS' && index === 0 && getRandom() < PULSAR_PLANET_CHANCE) {
    return 'Pulsar Planet';
  }
  const typePool = WORLD_TYPE_BY_ZONE[zone] || WORLD_TYPE_BY_ZONE.OUTER;
  return weightedPick(typePool);
}

function getSpeciesWeightBoosts(worldType, zone, { tidallyLocked = false, tidalResonance = false, metabolism = null } = {}) {
  const origin = {};
  const sense  = {};
  const social = {};
  const body   = {};
  const disp   = {};

  if (worldType === 'Ocean Planet' || worldType === 'Hycean') {
    origin['Carbon-based'] = 1.25;
    sense['Chemoreception'] = 2.2;
    sense['Echolocation'] = 1.4;
  }
  if (worldType === 'Desert') {
    sense['Thermoreception'] = 2.2;
    origin['Silicon-based'] = 1.5;
  }
  if (worldType === 'Ice Planet') {
    origin['Carbon/Ammonia'] = 2.0;
    sense['Mechanoreception'] = 1.6;
  }
  if (worldType === 'Double Planet') {
    body['Modular'] = 1.5;
  }
  if (zone === 'OUTER' || zone === 'FRINGE') {
    origin['Carbon/Ammonia'] = (origin['Carbon/Ammonia'] ?? 1) * 1.3;
    origin['Exotic'] = 1.4;
  }
  if (tidallyLocked || tidalResonance) {
    social['Hive'] = 1.6;
    social['Networked'] = 1.4;
    disp['Absorbed/Isolated'] = 1.7;
    sense['Thermoreception'] = (sense['Thermoreception'] ?? 1) * 1.8;
  }
  // Same scale as the other origin nudges. Oxygenic life is carbon-and-water.
  // Chemotrophic life favors the sulfur origin that can live without a star.
  if (metabolism === 'oxygenic') {
    origin['Carbon-based'] = (origin['Carbon-based'] ?? 1) * 1.5;
  }
  if (metabolism === 'chemotrophic') {
    origin['Sulfur-based'] = (origin['Sulfur-based'] ?? 1) * 2.5;
  }

  return { origin, sense, social, body, disp };
}

// One orbit becomes one body. The zone comes from the star's habitable
// zone, and habitability still requires air and a temperate surface on
// top of sitting in that zone.
function generateWorld(orbitalAU, hz, starLuminosity, index, primarySpectralClass = 'G', forcedWorldType = null) {
  const zone      = determineOrbitalZone(orbitalAU, hz);
  const worldType = resolveWorldType(zone, index, primarySpectralClass, forcedWorldType);
  const worldDef  = WORLD_TYPES[worldType] || WORLD_TYPES['Terrestrial'];

  const atmosphere = weightedPick(
    atmosphereWeightPairs(worldDef, primarySpectralClass, zone, worldType)
  );
  const hydrosphere = weightedPick(
    worldDef.hydrosphereTypes.map((t, i) => [t, worldDef.hydrosphereWeights[i]])
  );

  const gravityMin = worldDef.gravityRange[0];
  const gravityMax = worldDef.gravityRange[1];
  const gravity    = gravityMin === gravityMax ? gravityMin : round2(rnd(gravityMin, gravityMax));

  const temperature = estimateTemperature(worldType, zone, starLuminosity, orbitalAU, hz);

  // Habitable check
  const inHZ        = zone === 'HABITABLE';
  const hasAtmo     = !['None', 'Trace', 'N/A', 'Exotic'].includes(atmosphere);
  const notTooHot   = temperature < 60;
  const notTooCold  = temperature > -40;
  const isHabitable = worldDef.canSupportLife && inHZ && hasAtmo && notTooHot && notTooCold;

  // ── Tidal lock ──────────────────────────────────────────────────────────────
  // M-dwarf and brown dwarf HZ worlds: fully tidally locked
  // K-dwarf HZ worlds: possible spin-orbit resonance
  const tidallyLocked = inHZ && TIDAL_LOCK_SPECTRAL_CLASSES.has(primarySpectralClass);
  const tidalResonance = inHZ && !tidallyLocked && TIDAL_LOCK_PARTIAL_CLASSES.has(primarySpectralClass) && getRandom() < 0.4;

  // ── Biosignature ────────────────────────────────────────────────────────────
  // Only Hycean worlds in the HZ get a biosignature roll. DMS stays a disputed candidate.
  // Methane beside oxygen is not drawn: a hydrogen envelope cannot hold free oxygen.
  // The chance and the pick are still one call each, so later rolls stay put.
  let biosignature = null;
  if (worldType === 'Hycean' && inHZ && getRandom() < BIOSIGNATURE_CHANCE) {
    biosignature = rndFrom(BIOSIGNATURE_TYPES.filter(type => type.forHycean));
  }

  // Hazards
  const hazardPool  = WORLD_HAZARDS[worldType] || WORLD_HAZARDS['default'];
  const hazardCount = rndInt(0, 2);
  const hazards     = pickN(hazardPool.filter(h => h !== 'None'), hazardCount);

  // Moons for gas giants etc
  let moons = [];
  if (worldDef.moonRange) {
    const moonCount = rndInt(worldDef.moonRange[0], worldDef.moonRange[1]);
    moons = Array.from({ length: moonCount }, (_, i) => {
      const moonType   = weightedPick(MOON_TYPES);
      const moonHabit  = moonSupportsLife(moonType.type, zone);
      return {
        id:             crypto.randomUUID(),
        index:          i,
        type:           moonType.type,
        description:    moonType.description,
        canSupportLife: moonHabit,
        lifeNote:       moonHabit ? moonType.lifeNote || null : null,
        biosphere:      null,
        species:        [],
      };
    });
  }

  return {
    id:            crypto.randomUUID(),
    index,
    orbitalAU,
    zone,
    worldType,
    atmosphere,
    hydrosphere,
    gravity,
    temperature,
    isHabitable,
    tidallyLocked,
    tidalResonance,
    biosignature,
    biosphere:     null, // assigned with species, after the body is fixed
    hazards,
    moons,
    worldNotes:    worldDef.notes || null,
    locked:        false,
    species:       [], // populated separately if habitable
  };
}

// ─── SPECIES GENERATION ───────────────────────────────────────────────────────
// A port is a place, not a welcome. Only a people already able to leave
// the world can have one. Transcendent technology does not look like a dock.
const PORT_TABLES = {
  Advanced:        [[null, 55], ['Surface', 30], ['Orbital', 15]],
  Stellar:         [[null, 30], ['Surface', 30], ['Orbital', 40]],
  'Post-Scarcity': [[null, 25], ['Surface', 25], ['Orbital', 50]],
};

function rollPort(techLabel) {
  const table = PORT_TABLES[techLabel];
  if (!table) return null;
  return weightedPick(table);
}

function generateSpecies(worldType, zone, context = {}) {
  const boosts = getSpeciesWeightBoosts(worldType, zone, context);

  const origin       = weightedPick(applyWeightBoosts(BIOLOGICAL_ORIGINS, boosts.origin));
  const bodyPlan     = weightedPick(applyWeightBoosts(BODY_PLANS, boosts.body));
  const primarySense = weightedPick(applyWeightBoosts(PRIMARY_SENSES, boosts.sense));
  const social       = weightedPick(applyWeightBoosts(SOCIAL_STRUCTURES, boosts.social));
  const tech         = weightedPick(TECH_LEVELS);
  const disposition  = weightedPick(applyWeightBoosts(DISPOSITIONS, boosts.disp));
  const traitCount  = rndInt(1, 2);
  const traits      = pickN(DISTINCTIVE_TRAITS, traitCount);

  return {
    id:           crypto.randomUUID(),
    origin:       origin.label,
    originDesc:   origin.description,
    bodyPlan:     bodyPlan.label,
    bodyPlanDesc: bodyPlan.description,
    primarySense: primarySense.label,
    senseDesc:    primarySense.description,
    social:       social.label,
    socialDesc:   social.description,
    tech:         tech.label,
    techDesc:     tech.description,
    port:         rollPort(tech.label),
    disposition:  disposition.label,
    dispositionDesc: disposition.description,
    traits,
    locked:       false,
  };
}

// ─── SPECIES COUNT ────────────────────────────────────────────────────────────
// Weighted toward 1, rare for 2+
const SPECIES_COUNT_WEIGHTS = [[0, 30], [1, 50], [2, 15], [3, 4], [4, 1]];

function generateSpeciesCount() {
  return parseInt(weightedPick(SPECIES_COUNT_WEIGHTS));
}

function speciesContextForWorld(world) {
  return {
    tidallyLocked:  world.tidallyLocked,
    tidalResonance: world.tidalResonance,
    metabolism:     world.biosphere?.metabolism || null,
  };
}

/**
 * Where the biosphere is allowed to live. Oxygenic life needs land or a
 * sunlit ocean. A hydrogen envelope, and ice, do not sustain free oxygen.
 * @param {object} world
 * @returns {'hycean'|'under-ice'|'ice'|'ocean'|'land'}
 */
function biosphereSetting(world) {
  if (world.worldType === 'Hycean') return 'hycean';
  if (world.hydrosphere === 'Subsurface Ocean') return 'under-ice';
  if (world.hydrosphere === 'Ice Cap' || world.hydrosphere === 'Ice Sheet') return 'ice';
  if (world.worldType === 'Ocean Planet' || world.hydrosphere?.startsWith('Global Ocean')) return 'ocean';
  return 'land';
}

function metabolismTable(world, complexity) {
  const setting = biosphereSetting(world);
  if (setting === 'hycean' || setting === 'under-ice' || setting === 'ice') {
    return complexity === 'complex'
      ? [['chemotrophic', 100]]
      : [['chemotrophic', 60], ['anoxygenic', 40]];
  }
  if (complexity === 'complex') {
    return setting === 'ocean'
      ? [['oxygenic', 80], ['chemotrophic', 20]]
      : [['oxygenic', 100]];
  }
  return setting === 'ocean'
    ? [['chemotrophic', 45], ['anoxygenic', 40], ['oxygenic', 15]]
    : [['chemotrophic', 35], ['anoxygenic', 45], ['oxygenic', 20]];
}

function biosphereCover(world, complexity, metabolism) {
  if (complexity === 'none' || !metabolism) return null;
  if (world.hydrosphere === 'Subsurface Ocean') return 'under ice';
  if (metabolism === 'oxygenic' && biosphereSetting(world) === 'ocean') return 'plankton skin';
  if (complexity !== 'complex' || metabolism !== 'oxygenic') return null;
  const water = world.hydrosphere || '';
  if (water.startsWith('Arid') || water.startsWith('Dry')) return 'open cover';
  if (water.startsWith('Moderate')) return 'mixed cover';
  if (water.startsWith('Wet') || water.startsWith('Oceanic')) return 'closed cover';
  return null;
}

function biosphereLabel(complexity, metabolism, cover) {
  if (complexity === 'none') return 'No life';
  const head = complexity === 'microbial' ? 'Microbial' : 'Complex';
  return cover ? `${head} · ${metabolism} · ${cover}` : `${head} · ${metabolism}`;
}

/**
 * Complexity, then metabolism. A world that already has people is complex.
 * Cover is read from the water already on the world.
 * Rolls happen here, after the body is fixed, so orbits and hazards do not move.
 * @param {object} world
 * @param {number} speciesCount
 * @returns {{ complexity: string, metabolism: string|null, cover: string|null, label: string }}
 */
function generateBiosphere(world, speciesCount) {
  const complexity = speciesCount > 0
    ? 'complex'
    : weightedPick([['none', 10], ['microbial', 70], ['complex', 20]]);
  if (complexity === 'none') {
    return { complexity, metabolism: null, cover: null, label: 'No life' };
  }
  const metabolism = weightedPick(metabolismTable(world, complexity));
  const cover = biosphereCover(world, complexity, metabolism);
  return { complexity, metabolism, cover, label: biosphereLabel(complexity, metabolism, cover) };
}

function biosphereWithComplexity(world, biosphere, complexity) {
  const metabolism = biosphere?.metabolism || weightedPick(metabolismTable(world, complexity));
  const cover = biosphereCover(world, complexity, metabolism);
  return { complexity, metabolism, cover, label: biosphereLabel(complexity, metabolism, cover) };
}

const TIDAL_MOON_TYPES = new Set(['Subsurface Ocean', 'Cryovolcanic']);

/**
 * A terrestrial moon needs the star's habitable zone. An ocean under ice,
 * and a cryovolcanic moon, live on tidal heat and can do so in any zone.
 * A thin atmosphere stays without a water biosphere.
 * @param {string} type
 * @param {string} zone
 * @returns {boolean}
 */
function moonSupportsLife(type, zone) {
  const entry = MOON_TYPES.find(moon => moon.type === type);
  if (!entry?.canSupportLife) return false;
  if (type === 'Terrestrial') return zone === 'HABITABLE';
  return true;
}

function tidalMoonBiosphere(complexity) {
  const head = complexity === 'complex' ? 'Complex' : 'Microbial';
  return {
    complexity,
    metabolism: 'chemotrophic',
    cover: 'under ice',
    label: `${head} · chemotrophic · under ice`,
  };
}

/**
 * One species roll, at 20%. A tidal moon's biosphere is chemotrophic and
 * derived, so it adds no second roll. A terrestrial moon rolls a land
 * biosphere. People make the biosphere complex.
 * @param {object} moon
 * @param {string} zone
 * @returns {object}
 */
function assignMoonLife(moon, zone) {
  if (!moon.canSupportLife) return { ...moon, species: moon.species || [], biosphere: null };
  const count = getRandom() < 0.2 ? 1 : 0;
  if (TIDAL_MOON_TYPES.has(moon.type)) {
    const species = Array.from({ length: count }, () =>
      generateSpecies('Ice Planet', zone, { metabolism: 'chemotrophic' })
    );
    return { ...moon, species, biosphere: tidalMoonBiosphere(count > 0 ? 'complex' : 'microbial') };
  }
  const standIn = { worldType: 'Terrestrial', hydrosphere: '' };
  const biosphere = generateBiosphere(standIn, count);
  if (biosphere.complexity === 'none') return { ...moon, species: [], biosphere };
  const species = Array.from({ length: count }, () =>
    generateSpecies('Terrestrial', zone, { metabolism: biosphere.metabolism })
  );
  return { ...moon, species, biosphere };
}

function assignWorldLife(world, stars) {
  if (!world.isHabitable) {
    world.species = world.species || [];
    // Giants are not habitable, and their moons still get a life roll.
    // A locked card keeps the moons already rolled.
    if (!world.locked) world.moons = (world.moons || []).map(moon => assignMoonLife(moon, world.zone));
    return world;
  }
  // A locked card keeps the life already rolled, including a biosphere.
  if (world.locked && (world.species?.length > 0 || world.biosphere)) return world;

  const count = generateSpeciesCount();
  world.biosphere = generateBiosphere(world, count);

  if (world.biosphere.complexity === 'none') {
    world.species = [];
    world.ruins = null;
    // The gas roll already happened. A sterile world has no biological source.
    world.biosignature = null;
  } else {
    const ctx = speciesContextForWorld(world);
    world.species = Array.from({ length: count }, () =>
      generateSpecies(world.worldType, world.zone, ctx)
    );

    if (count === 0 && !world.ruins) {
      world.ruins = getRandom() < RUINS_CHANCE ? generateRuins(ruinAgeLimit(world, stars)) : null;
    } else if (count > 0) {
      world.ruins = null;
    }
  }

  world.moons = (world.moons || []).map(moon => assignMoonLife(moon, world.zone));

  return world;
}

function generateCircumbinaryWorld(orbitalAU, combinedHZ, totalLuminosity, index) {
  const cbAU   = orbitalAU ?? round2(combinedHZ.outer * rnd(1.5, 4.0));
  const cbZone = cbAU > combinedHZ.outer * 2 ? 'FRINGE' : 'OUTER';
  const cbTypePool = WORLD_TYPE_BY_ZONE[cbZone];
  const cbType     = weightedPick(cbTypePool);
  const cbDef      = WORLD_TYPES[cbType] || WORLD_TYPES['Gas Giant'];
  const cbAtmo     = weightedPick(cbDef.atmosphereTypes.map((t, i) => [t, cbDef.atmosphereWeights[i]]));
  const cbHydro    = weightedPick(cbDef.hydrosphereTypes.map((t, i) => [t, cbDef.hydrosphereWeights[i]]));
  const cbGravity  = round2(rnd(cbDef.gravityRange[0], cbDef.gravityRange[1]));
  const cbTemp     = estimateTemperature(cbType, cbZone, totalLuminosity, cbAU, combinedHZ);
  return {
    id:              crypto.randomUUID(),
    index,
    orbitalAU:       cbAU,
    zone:            cbZone,
    worldType:       cbType,
    atmosphere:      cbAtmo,
    hydrosphere:     cbHydro,
    gravity:         cbGravity,
    temperature:     cbTemp,
    isHabitable:     false,
    isCircumbinary:  true,
    tidallyLocked:   false,
    tidalResonance:  false,
    biosignature:    null,
    biosphere:       null,
    hazards:         ['Stellar perturbation', 'Radiation from multiple sources'],
    moons:           [],
    worldNotes:      'Orbits the combined center of mass of all stars in the system. Tatooine-class world.',
    locked:          false,
    species:         [],
    ruins:           null,
  };
}

function regenerateWorldAtAU(world, system) {
  const totalLuminosity = system.stars.reduce((sum, s) => sum + s.luminosity, 0);
  const hz              = system.hz || calculateHabitableZone(totalLuminosity);
  const primaryClass    = system.stars[0]?.spectralClass || 'G';
  const index           = world.index ?? 0;

  let fresh;
  if (world.isCircumbinary) {
    fresh = generateCircumbinaryWorld(world.orbitalAU, hz, totalLuminosity, index);
  } else {
    fresh = generateWorld(world.orbitalAU, hz, totalLuminosity, index, primaryClass);
  }

  // A new body in the same slot. A name typed for the previous body is not copied.
  const regenerated = {
    ...fresh,
    id:    world.id,
    index: world.index ?? index,
    locked: false,
  };
  return assignWorldLife(regenerated, system.stars);
}

// ─── COMET GENERATION ────────────────────────────────────────────────────────
function generateComets() {
  const count = parseInt(weightedPick(COMET_COUNTS));
  return Array.from({ length: count }, (_, i) => {
    const composition = weightedPick(COMET_COMPOSITIONS);
    const periodType  = rndFrom(COMET_ORBITAL_PERIODS);
    const period      = rndInt(periodType.range[0], periodType.range[1]);
    return {
      id:          crypto.randomUUID(),
      index:       i,
      composition: composition.label,
      compDesc:    composition.description,
      periodType:  periodType.label,
      period,
      periodDesc:  periodType.description,
    };
  });
}

// ─── RUINS GENERATION ────────────────────────────────────────────────────────
// A ruin is a civilization that lived under this star, so its age has to
// fall inside the star's age. Star age is stored in billions of years.
// A circumbinary world uses the younger star. A captured rogue does not.
// That body came from somewhere else, and its ruins can predate this star.
// The roll itself is unchanged. Only an age that would outlive this star
// is brought back inside it, keeping its place in that age band.
const YEARS_PER_GYR = 1_000_000_000;

export function starAgeYears(stars, world) {
  const ages = (stars || []).map(star => star?.age).filter(age => age > 0);
  if (!ages.length) return null;
  const gyr = world?.isCircumbinary ? Math.min(...ages) : ages[0];
  return Math.round(gyr * YEARS_PER_GYR);
}

export function ruinsWithinStarAge(ruins, maxYears) {
  if (!ruins || !(maxYears > 0) || ruins.ageYears < maxYears) return ruins;
  const limit = maxYears - 1;
  const youngest = RUINS_AGE_RANGES[0].range[0];
  if (limit < youngest) return null;

  const rolled = RUINS_AGE_RANGES.find(entry => entry.label === ruins.ageLabel)
    || RUINS_AGE_RANGES.find(entry => ruins.ageYears >= entry.range[0] && ruins.ageYears <= entry.range[1])
    || RUINS_AGE_RANGES[RUINS_AGE_RANGES.length - 1];
  const fitting = [...RUINS_AGE_RANGES].reverse().find(entry => entry.range[0] <= limit) || RUINS_AGE_RANGES[0];
  const range = rolled.range[0] <= limit ? rolled : fitting;
  const low = range.range[0];
  const high = Math.min(range.range[1], limit);
  const span = rolled.range[1] - rolled.range[0];
  const fraction = span > 0
    ? Math.min(1, Math.max(0, (ruins.ageYears - rolled.range[0]) / span))
    : 1;
  const ageYears = Math.min(limit, Math.max(low, Math.round(low + fraction * (high - low))));
  return {
    ...ruins,
    ageYears,
    ageLabel: range.label,
    ageDesc:  range.label === ruins.ageLabel ? ruins.ageDesc : range.description,
  };
}

// A captured rogue arrived from another system. Its ruins keep the age
// they came with, which can be older than the star that holds it now.
function ruinAgeLimit(world, stars) {
  if (world?.worldType === 'Rogue/Captured') return null;
  return starAgeYears(stars, world);
}

export function worldRuins(world, stars) {
  if (!world?.ruins) return null;
  return ruinsWithinStarAge(world.ruins, ruinAgeLimit(world, stars));
}

function generateRuins(maxYears) {
  const ageRange = weightedPick(
    RUINS_AGE_RANGES.map((r, i) => [i, [35, 30, 20, 15][i]])
  );
  const range    = RUINS_AGE_RANGES[ageRange];
  const age      = rndInt(range.range[0], range.range[1]);
  const cause    = weightedPick(RUINS_COLLAPSE_CAUSES);
  const tech     = rndFrom(RUINS_TECH_LEVELS);
  return ruinsWithinStarAge({
    ageLabel:    range.label,
    ageYears:    age,
    ageDesc:     range.description,
    cause:       cause.label,
    causeDesc:   cause.description,
    tech:        tech.label,
    techDesc:    tech.description,
  }, maxYears);
}

// ─── EXOTIC NEIGHBORHOOD OBJECT GENERATION ───────────────────────────────────
function generateExoticObject(distance) {
  const type = weightedPick(NEIGHBORHOOD_EXOTIC_TYPES);

  if (type.type === 'Interstellar Transient') {
    const composition = rndFrom(type.compositions);
    const origin      = rndFrom(type.originDirections);
    const speed       = rndInt(type.speedRange[0], type.speedRange[1]);
    // Departure window: 10–500 years from now (narratively useful range)
    const departureYears = rndInt(10, 500);
    return {
      id:          crypto.randomUUID(),
      objectType:  'Interstellar Transient',
      navigable:   false,
      icon:        type.icon,
      color:       type.color,
      distance,
      label:       `Interstellar Object (${composition.label})`,
      description: composition.description,
      origin,
      speed,
      departureYears,
      notes:       type.notes,
    };
  }

  if (type.type === 'Nebula') {
    const subtype = rndFrom(type.subtypes);
    const size    = rndInt(type.sizeRange[0], type.sizeRange[1]);
    return {
      id:         crypto.randomUUID(),
      objectType: 'Nebula',
      navigable:  false,
      icon:       type.icon,
      color:      subtype.color,
      distance,
      label:      subtype.label,
      description: subtype.description,
      size,
      notes:      type.notes,
    };
  }

  if (type.type === 'Rogue Planet') {
    return {
      id:          crypto.randomUUID(),
      objectType:  'Rogue Planet',
      navigable:   true,
      icon:        type.icon,
      color:       type.color,
      distance,
      label:       'Rogue Planet',
      description: type.description,
      notes:       type.notes,
      // spectralClass stub so navigation code doesn't break
      spectralClass: null,
    };
  }

  if (type.type === 'Black Hole') {
    const subtype = rndFrom(type.subtypes);
    const mass    = rndInt(type.massRange[0], type.massRange[1]);
    return {
      id:          crypto.randomUUID(),
      objectType:  'Black Hole',
      navigable:   false,
      icon:        type.icon,
      color:       type.color,
      distance,
      label:       subtype.label,
      description: subtype.description,
      mass,
      notes:       type.notes,
    };
  }

  return null;
}

// ─── INTERSTELLAR NEIGHBORHOOD ───────────────────────────────────────────────
function generateNeighborhood() {
  const density      = rndFrom(NEIGHBORHOOD_DENSITY);
  const [minD, maxD] = DISTANCE_RANGES[density.label];
  const starCount    = rndInt(density.nearbyStarRange[0], density.nearbyStarRange[1]);

  // Generate regular star neighbors
  const starNeighbors = Array.from({ length: Math.min(starCount, 6) }, () => {
    const distance = round2(rnd(minD, maxD));
    const spectral = generateSpectralClass(false);
    const sc       = SPECTRAL_CLASSES[spectral];
    return {
      id:            crypto.randomUUID(),
      objectType:    'Star',
      navigable:     true,
      distance,
      spectralClass: spectral,
      color:         sc?.color || '#FFFFFF',
      description:   sc?.description || 'Unknown',
    };
  });

  // Chance to include 1–2 exotic objects based on density
  const exoticCount   = density.label === 'Dense' || density.label === 'Cluster'
    ? rndInt(0, 2)
    : getRandom() < 0.3 ? 1 : 0;

  const exoticObjects = Array.from({ length: exoticCount }, () => {
    const distance = round2(rnd(minD, maxD));
    return generateExoticObject(distance);
  }).filter(Boolean);

  // Combine and sort by distance
  const neighbors = [...starNeighbors, ...exoticObjects]
    .sort((a, b) => a.distance - b.distance);

  return {
    id:          crypto.randomUUID(),
    density:     density.label,
    densityDesc: density.description,
    neighbors,
    locked:      false,
  };
}

// ─── FULL SYSTEM GENERATION ───────────────────────────────────────────────────
function generateSystemCore({ starCount = 1, locked = {}, primarySpectralClass = null } = {}) {
  // Neighborhood
  const neighborhood = locked.neighborhood || generateNeighborhood();

  // Stars — force primary spectral class if provided (for neighbor navigation)
  const stars = locked.stars
    ? buildStarsArray(starCount, { locked: locked.stars, primarySpectralClass })
    : buildStarsArray(starCount, { primarySpectralClass });

  // Primary star drives HZ and world count
  const primaryStar = stars[0];
  const hz          = primaryStar.habitableZone;

  // Combined luminosity for binary/triple affects HZ.
  // Separation is rolled after the stars and before the worlds. A redraw
  // that keeps every star keeps the stored distance. An old save has none
  // until the stars are redrawn.
  const totalLuminosity = stars.reduce((sum, s) => sum + s.luminosity, 0);
  const combinedHZ      = calculateHabitableZone(totalLuminosity);
  const starsWereKept = Array.isArray(locked.stars)
    && locked.stars.length === stars.length
    && locked.stars.every(Boolean);
  const separation = stars.length < 2
    ? null
    : (starsWereKept && separationFits(stars, locked.separation)
      ? locked.separation
      : stellarSeparation(stars));

  // World count from star type. A locked world past the roll is kept,
  // so a crushed belt (or any lock) cannot vanish on Redraw Free.
  const sc          = SPECTRAL_CLASSES[primaryStar.spectralClass];
  const [minW, maxW] = sc?.planetBodyRange || [3, 8];
  const lastLocked  = Array.isArray(locked.worlds)
    ? locked.worlds.reduce((max, world, i) => (world ? i : max), -1)
    : -1;
  const worldCount  = Math.max(locked.worldCount ?? rndInt(minW, maxW), lastLocked + 1);

  // Generate orbital positions
  const orbitalPositions = generateOrbitalPositions(worldCount, combinedHZ);

  // Generate worlds — pass primary spectral class for tidal lock calculation
  const worlds = orbitalPositions.map((au, i) => {
    if (locked.worlds?.[i]) return locked.worlds[i];
    return generateWorld(au, combinedHZ, totalLuminosity, i, primaryStar.spectralClass);
  });

  // ── Circumbinary planet ──────────────────────────────────────────────────────
  // For binary/triple systems: chance of a world orbiting all stars combined
  // Orbits beyond the outermost star's influence — typically 3–5× the binary separation
  let circumbinaryWorld = null;
  const hasLockedCircumbinary = locked.worlds?.some(world => world?.isCircumbinary);
  if (stars.length > 1 && !hasLockedCircumbinary && getRandom() < CIRCUMBINARY_CHANCE) {
    const orbitAU = circumbinaryOrbitAU(separation, combinedHZ);
    circumbinaryWorld = generateCircumbinaryWorld(orbitAU, combinedHZ, totalLuminosity, worlds.length);
  }

  // Combine regular worlds with circumbinary world if present
  const allWorlds = circumbinaryWorld ? [...worlds, circumbinaryWorld] : worlds;

  // Generate species for habitable worlds + ruins for empty habitable worlds
  allWorlds.forEach(world => assignWorldLife(world, stars));

  // Generate comets
  const comets = generateComets();

  return {
    id:           crypto.randomUUID(),
    timestamp:    Date.now(),
    neighborhood,
    stars,
    hz:           combinedHZ,
    worldCount,
    worlds:       allWorlds,
    comets,
    separation,
  };
}

export function generateSystem({ starCount = 1, locked = {}, primarySpectralClass = null, seed } = {}) {
  const hasExplicitSeed = seed != null && String(seed).trim() !== '';

  const build = () => {
    const system = generateSystemCore({ starCount, locked, primarySpectralClass });
    const assignedSeed = hasExplicitSeed ? String(seed).trim() : generateRandomSeed();
    return {
      ...system,
      seed:       assignedSeed,
      starCount,
      appVersion: APP_VERSION,
    };
  };

  if (hasExplicitSeed) {
    return runWithSeed(String(seed).trim(), build);
  }

  // Fresh random roll (Generate New, Redraw Free, etc.)
  return build();
}

/** Regenerate a fresh primary system from seed + star count (ignores locks). */
export function generateSystemFromSeed(seed, starCount = 1) {
  return generateSystem({ seed: String(seed).trim(), starCount });
}

// ─── PARTIAL REGENERATION ─────────────────────────────────────────────────────
// Redraw Free keeps locked stars and worlds in their current slots and
// rerolls everything else. Ejected rogues are copied onto the new system
// so a redraw of the star does not delete a world that already left.
export function redrawSystem(existingSystem, { redrawnStarCount } = {}) {
  if (existingSystem.isRoguePlanet || !existingSystem.stars?.length) return existingSystem;

  const starCount = redrawnStarCount || existingSystem.stars.length;

  const lockedNeighborhood = existingSystem.neighborhood?.locked
    ? existingSystem.neighborhood : null;

  // Build locked stars array sized to the NEW starCount
  // - Existing locked stars are preserved in position
  // - New slots (adding stars) are null → will be generated fresh
  // - Removed slots (reducing stars) are trimmed
  const existingLocked = existingSystem.stars.map(s => s.locked ? s : null);
  const lockedStars = Array.from({ length: starCount }, (_, i) =>
    existingLocked[i] ?? null  // null = generate fresh
  );

  const lockedWorlds = existingSystem.worlds.map(w => w.locked ? w : null);

  const opts = {
    starCount,
    locked: {
      neighborhood: lockedNeighborhood,
      stars:        lockedStars,
      worlds:       lockedWorlds,
      separation:   existingSystem.separation || null,
    },
  };

  // Fresh RNG for unlocked parts — do not replay the stored seed (that would repeat the same roll)
  const result = generateSystem(opts);
  return {
    ...result,
    name:    existingSystem.name,
    id:      existingSystem.id,
    ejected: existingSystem.ejected,
    // An opened neighbor belongs to a star still in the list. A new
    // neighborhood has new ids, so those opened systems are dropped.
    // A locked neighborhood keeps its ids, and the opened systems stay.
    explored: keepOpenedNeighbors(existingSystem.explored, result.neighborhood),
  };
}

// Keep opened neighbor systems whose star is still in this neighborhood.
// The seed does not carry these. They are a saved edit, like a typed name.
function keepOpenedNeighbors(explored, neighborhood) {
  if (!explored || typeof explored !== 'object') return undefined;
  const ids = new Set((neighborhood?.neighbors || []).map(neighbor => neighbor?.id).filter(Boolean));
  const kept = {};
  for (const [id, neighborSystem] of Object.entries(explored)) {
    if (ids.has(id) && neighborSystem && typeof neighborSystem === 'object') kept[id] = neighborSystem;
  }
  return Object.keys(kept).length ? kept : undefined;
}

// ─── TARGETED REDRAW (single star or world) ───────────────────────────────────
export function redrawStar(system, starId) {
  const starIndex = system.stars.findIndex(s => s.id === starId);
  if (starIndex === -1) return system;

  const existing = system.stars[starIndex];
  if (existing.locked) return system;

  const freshStar = generateStar(starIndex, starIndex === 0);
  let stars = system.stars.map((s, i) =>
    i === starIndex ? { ...freshStar, id: starId, locked: false } : s
  );
  enforceSecondaryMassLimits(stars);
  stars = syncStarHabitableZones(stars);

  const totalLuminosity = stars.reduce((sum, s) => sum + s.luminosity, 0);
  const combinedHZ      = calculateHabitableZone(totalLuminosity);
  const separation      = stellarSeparation(stars);

  const worlds = system.worlds.map(world => {
    if (world.locked) return world;
    return regenerateWorldAtAU(world, { ...system, stars, hz: combinedHZ });
  });

  return {
    ...system,
    stars,
    hz:        combinedHZ,
    separation,
    worlds,
    timestamp: Date.now(),
  };
}

const DEBRIS_HAZARD = 'Debris from a disrupted neighbor';

/**
 * Crush an unlocked world into an asteroid belt in the same orbit.
 * Debris is the world's remaining material. Atmosphere, hydrosphere,
 * moons, species, ruins, and a typed name are discarded. The belt is locked.
 * Each unlocked neighbor gains a debris hazard. Locked neighbors are left untouched.
 * @param {object} system
 * @param {string} worldId
 * @returns {object} The same system when the world is missing, locked, or already a belt.
 */
export function crushWorld(system, worldId) {
  const index = system.worlds.findIndex(world => world.id === worldId);
  if (index === -1) return system;

  const world = system.worlds[index];
  if (world.locked || world.worldType === 'Asteroid Belt') return system;

  const debris = CRUSH_DEBRIS[world.worldType] || 'rock';
  const moonCount = world.moons?.length || 0;
  const hadAtmosphere = Boolean(world.atmosphere) && !['None', 'N/A'].includes(world.atmosphere);
  const former = world.name ? `${world.name} (${world.worldType})` : world.worldType;
  const note = [
    `Former ${former}, crushed in place.`,
    `Debris: ${debris}.`,
    hadAtmosphere ? 'Atmosphere lost.' : null,
    moonCount === 1 ? '1 former moon folded into the belt.' : null,
    moonCount > 1 ? `${moonCount} former moons folded into the belt.` : null,
  ].filter(Boolean).join(' ');

  const totalLuminosity = (system.stars || []).reduce((sum, star) => sum + (star.luminosity || 0), 0);
  const hz = system.hz || calculateHabitableZone(totalLuminosity || 1);

  const crushed = {
    ...world,
    worldType:       'Asteroid Belt',
    atmosphere:      'N/A',
    hydrosphere:     'N/A',
    gravity:         0,
    temperature:     estimateTemperature('Asteroid Belt', world.zone, totalLuminosity, world.orbitalAU, hz),
    isHabitable:     false,
    tidallyLocked:   false,
    tidalResonance:  false,
    biosignature:    null,
    biosphere:       null,
    hazards:         [...WORLD_HAZARDS['Asteroid Belt']],
    moons:           [],
    species:         [],
    ruins:           null,
    debris,
    worldNotes:      note,
    name:            '',
    locked:          true,
  };

  const worlds = system.worlds.map((entry, i) => {
    if (i === index) return crushed;
    const adjacent = i === index - 1 || i === index + 1;
    if (!adjacent || entry.locked) return entry;
    if (entry.hazards?.includes(DEBRIS_HAZARD)) return entry;
    return { ...entry, hazards: [...(entry.hazards || []), DEBRIS_HAZARD] };
  });

  return { ...system, worlds, timestamp: Date.now() };
}

function nextEjectedDistance(system) {
  const listed = [
    ...(system.neighborhood?.neighbors || []).map(neighbor => neighbor.distance),
    ...(system.ejected || []).map(entry => entry.neighbor?.distance),
  ].filter(distance => typeof distance === 'number' && distance > 0);
  if (!listed.length) return 0.2;
  const nearest = Math.min(...listed);
  const inside = round2(nearest - 0.05);
  if (inside > 0 && inside < nearest) return inside;
  return round2(Math.max(0.01, nearest * 0.5));
}

const STAR_BOUND_HAZARDS = new Set([
  'Solar flare exposure',
  'Intense radiation',
  'X-ray bursts',
  'Magnetosphere stripping',
  'Tidal flexing',
  'Stellar perturbation',
  'Radiation from multiple sources',
]);

const STAR_BOUND_NOTES = new Set([
  WORLD_TYPES['Pulsar Planet']?.notes,
  WORLD_TYPES['Disintegrating']?.notes,
  'Orbits the combined center of mass of all stars in the system. Tatooine-class world.',
].filter(Boolean));

/**
 * Drop hazards that only exist because of a host star.
 * A double planet keeps tidal stress and an unstable mutual orbit: the companion is still there.
 * @param {object} world
 * @returns {{ hazards: string[], stripped: string[] }}
 */
function hazardsForRogue(world) {
  const stripped = [];
  const hazards = [];
  for (const hazard of world.hazards || []) {
    const fromCompanion = world.worldType === 'Double Planet'
      && (hazard === 'Tidal stress' || hazard === 'Unstable orbits');
    if (!fromCompanion && (STAR_BOUND_HAZARDS.has(hazard) || hazard === 'Tidal stress' || hazard === 'Unstable orbits')) {
      stripped.push(hazard);
    } else {
      hazards.push(hazard);
    }
  }
  if (!hazards.includes('No solar energy')) hazards.push('No solar energy');
  return { hazards, stripped };
}

function rogueHazardNote(stripped) {
  if (!stripped.length) return '';
  const head = stripped.slice(0, -1).join(', ');
  const list = stripped.length === 1
    ? stripped[0]
    : `${head}${stripped.length > 2 ? ',' : ''} and ${stripped[stripped.length - 1]}`;
  return `${list} no longer ${stripped.length === 1 ? 'applies' : 'apply'}. There is no host star.`;
}

const CHEMOSYNTHETIC_ORIGIN = 'Sulfur-based';

/**
 * A dark ocean that does not need sunlight.
 * Ice Planet + Subsurface Ocean is geothermal under ice.
 * Hycean keeps a surface ocean liquid under its hydrogen atmosphere.
 * @param {object} world
 * @returns {'subsurface'|'hycean'|null}
 */
function darkOceanKind(world) {
  if (world.worldType === 'Ice Planet' && world.hydrosphere === 'Subsurface Ocean') return 'subsurface';
  if (world.worldType === 'Hycean') return 'hycean';
  return null;
}

function moonKeepsDarkOcean(moon) {
  return moon.type === 'Subsurface Ocean' || moon.type === 'Cryovolcanic';
}

/**
 * Which species would still be alive after this world loses its star.
 * Only a chemosynthetic species in a dark ocean continues, and its civilization with it.
 * @param {object} world
 * @returns {{ darkOcean: 'subsurface'|'hycean'|null, survivors: object[], lostCount: number }}
 */
export function ejectionLifeFate(world) {
  const darkOcean = darkOceanKind(world);
  const species = world.species || [];
  const survivors = darkOcean
    ? species.filter(sp => sp.origin === CHEMOSYNTHETIC_ORIGIN)
    : [];
  return {
    darkOcean,
    survivors,
    lostCount: species.length - survivors.length,
  };
}

const TECH_RANK = new Map(TECH_LEVELS.map((entry, index) => [entry.label, index]));
const INDUSTRIAL_RANK = TECH_RANK.get('Industrial');
const ADVANCED_RANK = TECH_RANK.get('Advanced');
const CLOSED_DISPOSITION = new Set(['Openly Hostile', 'Absorbed/Isolated']);

function joinWorldNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * One relation among every world that has a living people. Null when fewer
 * than two such worlds exist. Tech and disposition already on those species
 * decide it. A moon's people stay with their world and do not open a line.
 * @param {{ worlds?: Array }} system
 * @returns {{ kind: 'unaware'|'aware'|'trade'|'closed', text: string }|null}
 */
export function livingWorldsRelation(system) {
  const worlds = (system?.worlds || [])
    .map((world, index) => ({ world, index }))
    .filter(entry => (entry.world.species || []).length > 0);
  if (worlds.length < 2) return null;

  let tech = -1;
  let closed = false;
  for (const { world } of worlds) {
    for (const species of world.species) {
      tech = Math.max(tech, TECH_RANK.get(species.tech) ?? -1);
      if (CLOSED_DISPOSITION.has(species.disposition)) closed = true;
    }
  }

  let kind = 'trade';
  if (tech < INDUSTRIAL_RANK) kind = 'unaware';
  else if (tech < ADVANCED_RANK) kind = 'aware';
  else if (closed) kind = 'closed';

  const names = joinWorldNames(worlds.map(entry => (
    entry.world.name || `[${entry.index + 1}] ${entry.world.worldType}`
  )));
  const text = {
    unaware: `${names} are unaware of each other.`,
    aware: `${names} are aware of each other.`,
    trade: `${names} trade.`,
    closed: `${names} know of each other. Contact is closed.`,
  }[kind];
  return { kind, text };
}

function highestCivilizationTech(speciesList) {
  const rank = new Map(TECH_LEVELS.map((entry, index) => [entry.label, index]));
  let best = speciesList[0]?.tech || 'Primitive';
  for (const species of speciesList) {
    if ((rank.get(species.tech) ?? -1) > (rank.get(best) ?? -1)) best = species.tech;
  }
  if (best === 'Transcendent') best = 'Post-Scarcity';
  return RUINS_TECH_LEVELS.find(entry => entry.label === best) || RUINS_TECH_LEVELS[0];
}

function ruinsFromLostCivilization(speciesList) {
  const tech = highestCivilizationTech(speciesList);
  const recent = RUINS_AGE_RANGES[0];
  return {
    ageLabel:  recent.label,
    ageYears:  recent.range[0],
    ageDesc:   'The collapse is the ejection. Structures are intact. The dead are recent.',
    cause:     'Loss of star',
    causeDesc: 'The world was ejected and sunlight ended. The biosphere that depended on the star died, and its civilization remains as ruins.',
    tech:      tech.label,
    techDesc:  tech.description,
  };
}

function ejectedLifeNote(kind, hadSpecies, survivors, lostCount) {
  if (!hadSpecies) {
    if (kind === 'hycean') return 'The hydrogen atmosphere can hold the ocean liquid on internal heat.';
    if (kind === 'subsurface') return 'A dark ocean may persist under the ice on geothermal heat.';
    return '';
  }
  if (survivors.length && lostCount === 0) {
    if (kind === 'hycean') {
      return 'Chemosynthetic species persist in the dark ocean. The hydrogen atmosphere holds that ocean liquid on internal heat, and their civilization remains.';
    }
    return 'Chemosynthetic species persist in the subsurface ocean on geothermal heat, and their civilization remains.';
  }
  if (survivors.length) {
    if (kind === 'hycean') {
      return 'Sunlight-dependent species died with the loss of the star. Chemosynthetic species persist in the dark ocean. The hydrogen atmosphere holds that ocean liquid on internal heat, and their civilization remains.';
    }
    return 'Sunlight-dependent species died with the loss of the star. Chemosynthetic species persist in the subsurface ocean on geothermal heat, and their civilization remains.';
  }
  if (kind === 'hycean') {
    return 'The hydrogen atmosphere can hold the ocean liquid on internal heat, but the species here depended on sunlight. Their civilization remains as ruins.';
  }
  if (kind === 'subsurface') {
    return 'A dark ocean persists under the ice on geothermal heat, but the species here depended on sunlight. Their civilization remains as ruins.';
  }
  return 'The biosphere died with the loss of the star. The civilization remains as ruins.';
}

// A terrestrial moon's life needed the star. A subsurface ocean or a
// cryovolcanic moon keeps its chemotrophic biosphere on tidal heat, and only
// a chemosynthetic species there is still alive.
function settleMoonLife(moon) {
  const species = moon.species || [];
  const keeps = moonKeepsDarkOcean(moon);
  const survivors = keeps ? species.filter(sp => sp.origin === CHEMOSYNTHETIC_ORIGIN) : [];
  const note = !keeps
    ? (species.length ? 'Life here depended on sunlight and died when the world was ejected.' : '')
    : survivors.length
      ? 'Chemosynthetic life persists in the dark ocean on internal heat.'
      : (species.length ? 'Life here depended on sunlight and died when the world was ejected.' : '');
  let biosphere = null;
  if (keeps) biosphere = tidalMoonBiosphere(survivors.length ? 'complex' : 'microbial');
  return {
    ...moon,
    canSupportLife: keeps,
    species: survivors,
    biosphere,
    lifeNote: note ? [moon.lifeNote, note].filter(Boolean).join(' ') : moon.lifeNote,
  };
}

/**
 * Drop sunlight-dependent life. Keep a chemosynthetic civilization only in a dark ocean.
 * @param {object} world
 * @returns {{ species: object[], ruins: object|null, moons: object[], note: string }}
 */
function settleEjectedLife(world) {
  const fate = ejectionLifeFate(world);
  const hadSpecies = (world.species || []).length > 0;
  const moons = (world.moons || []).map(settleMoonLife);
  if (!hadSpecies) {
    return {
      species: [],
      ruins:   world.ruins || null,
      moons,
      note:    ejectedLifeNote(fate.darkOcean, false, [], 0),
    };
  }
  if (fate.survivors.length) {
    return {
      species: fate.survivors,
      ruins:   null,
      moons,
      note:    ejectedLifeNote(fate.darkOcean, true, fate.survivors, fate.lostCount),
    };
  }
  return {
    species: [],
    ruins:   ruinsFromLostCivilization(world.species),
    moons,
    note:    ejectedLifeNote(fate.darkOcean, true, [], fate.lostCount),
  };
}

/**
 * Sunlight-dependent life dies with the star. A chemotrophic biosphere in a
 * dark ocean stays. Survivors there are that biosphere, so the line becomes
 * chemotrophic and complex even if the old line was anoxygenic.
 * @param {object} world
 * @param {object[]} survivors
 * @returns {object|null}
 */
function biosphereAfterEjection(world, survivors) {
  const dark = darkOceanKind(world);
  if (survivors.length && dark) {
    const metabolism = 'chemotrophic';
    const cover = biosphereCover(world, 'complex', metabolism);
    return {
      complexity: 'complex',
      metabolism,
      cover,
      label: biosphereLabel('complex', metabolism, cover),
    };
  }
  const bio = world.biosphere;
  if (!bio) return null;
  if (bio.complexity === 'none') return bio;
  if (bio.metabolism === 'chemotrophic' && dark) return bio;
  return null;
}

/**
 * Eject an unlocked world from the ladder. Other orbits stay put.
 * The body is appended to system.ejected as a neighborhood rogue that is
 * that world: type, gravity, hydrosphere, and moons stay.
 * Sunlight-dependent species die and their civilization becomes ruins.
 * A chemosynthetic species on an Ice Planet with a subsurface ocean, or on a
 * Hycean world, keeps living and keeps its civilization.
 * A biosphere that needed sunlight clears. A chemotrophic biosphere in a dark
 * ocean stays. Survivors there keep a chemotrophic biosphere.
 * Hazards that needed the host star are removed. A double planet keeps tidal
 * stress and an unstable mutual orbit, because the companion is still there.
 * Habitability clears, the zone becomes Fringe, and the rogue world is locked
 * so a later redraw cannot replace it. orbitalAU is stored as 0 to mean
 * unbound, and the rogue habitable zone is stored as 0–0. Neither number is
 * an orbit or a zone. A locked world is refused.
 * An asteroid belt is refused. A belt is not a body that can leave as a rogue.
 * @param {object} system
 * @param {string} worldId
 * @returns {object} The same system when the world is missing, locked, or a belt.
 */
export function ejectWorld(system, worldId) {
  const index = system.worlds.findIndex(world => world.id === worldId);
  if (index === -1) return system;

  const world = system.worlds[index];
  if (world.locked || world.worldType === 'Asteroid Belt') return system;

  const zoneLabel = String(world.zone || 'FRINGE').replaceAll('_', ' ');
  const ejectionNote = world.isCircumbinary
    ? `Ejected from ${world.orbitalAU} AU (${zoneLabel}, circumbinary orbit).`
    : `Ejected from ${world.orbitalAU} AU (${zoneLabel}).`;
  const life = settleEjectedLife(world);
  const unbound = hazardsForRogue(world);
  const priorNotes = STAR_BOUND_NOTES.has(world.worldNotes) ? null : world.worldNotes;

  const rogueWorld = {
    ...world,
    index:           0,
    orbitalAU:       0, // unbound. Not an orbit at the star.
    zone:            'FRINGE',
    // The fringe bin is already a distant orbit. A cold world type subtracts
    // again, and with no star that sum can fall through absolute zero.
    temperature:     Math.max(-273, estimateTemperature(world.worldType, 'FRINGE', 0, null, { inner: 0, outer: 0 })),
    isHabitable:     false,
    tidallyLocked:   false,
    tidalResonance:  false,
    isCircumbinary:  false,
    // A biosignature with no living species is a reading of a dead world.
    biosignature:    life.species.length ? world.biosignature : null,
    biosphere:       biosphereAfterEjection(world, life.species),
    locked:          true,
    hazards:         unbound.hazards,
    species:         life.species,
    ruins:           life.ruins,
    moons:           life.moons,
    worldNotes:      [ejectionNote, life.note, rogueHazardNote(unbound.stripped), priorNotes].filter(Boolean).join(' '),
  };

  const rogueType = NEIGHBORHOOD_EXOTIC_TYPES.find(type => type.type === 'Rogue Planet');
  const neighbor = {
    id:            crypto.randomUUID(),
    objectType:    'Rogue Planet',
    navigable:     true,
    icon:          rogueType?.icon || '⬛',
    color:         rogueType?.color || '#6688AA',
    distance:      nextEjectedDistance(system),
    label:         `Ejected ${world.worldType}`,
    description:   `Former ${world.worldType} ejected from this system at ${world.orbitalAU} AU.`,
    notes:         ejectionNote,
    spectralClass: null,
    ejected:       true,
  };

  const rogueSystem = {
    id:            crypto.randomUUID(),
    timestamp:     Date.now(),
    isRoguePlanet: true,
    ejectedFrom: {
      worldType: world.worldType,
      orbitalAU: world.orbitalAU,
      zone:      world.zone,
    },
    stars:         [],
    hz:            { inner: 0, outer: 0 },
    worldCount:    1,
    worlds:        [rogueWorld],
    comets:        [],
    neighborhood: {
      id:          crypto.randomUUID(),
      density:     'N/A',
      densityDesc: 'Interstellar void',
      neighbors:   [],
      locked:      false,
    },
  };

  return {
    ...system,
    ...dropWorld(system, index),
    ejected:    [...(system.ejected || []), { neighbor, rogueSystem }],
    timestamp:  Date.now(),
  };
}

function dropWorld(system, index) {
  const worlds = system.worlds
    .filter((_, i) => i !== index)
    .map((entry, i) => (entry.index === i ? entry : { ...entry, index: i }));
  return {
    worlds,
    worldCount: worlds.filter(entry => !entry.isCircumbinary).length,
  };
}

/**
 * Remove an unlocked asteroid belt from the ladder. Other orbits stay put.
 * Nothing is added to the neighborhood. A locked belt, or any non-belt, is refused.
 * @param {object} system
 * @param {string} worldId
 * @returns {object} The same system when the world is missing, locked, or not a belt.
 */
export function destroyBelt(system, worldId) {
  const index = system.worlds.findIndex(world => world.id === worldId);
  if (index === -1) return system;

  const world = system.worlds[index];
  if (world.locked || world.worldType !== 'Asteroid Belt') return system;

  return {
    ...system,
    ...dropWorld(system, index),
    timestamp: Date.now(),
  };
}

const MIN_ORBIT_AU = 0.01;

function betweenAU(inner, outer) {
  if (!(outer > inner)) return null;
  let au = round2(Math.sqrt(inner * outer));
  if (au <= inner) au = round2(inner + 0.01);
  if (au >= outer) au = round2(outer - 0.01);
  if (au <= inner || au >= outer) return null;
  return au;
}

function openInnerAU(au) {
  let next = round2(au / 1.8);
  if (next >= au) next = round2(au - 0.01);
  if (next < MIN_ORBIT_AU || next >= au) return null;
  return next;
}

function openOuterAU(au, ceiling) {
  let next = round2(au * 1.8);
  if (ceiling != null && next >= ceiling) next = betweenAU(au, ceiling);
  if (next == null || next <= au) return null;
  if (ceiling != null && next >= ceiling) return null;
  return next;
}

/**
 * Orbits where a new world can be placed without moving anyone.
 * Between two worlds the AU is the geometric mean. Open ends use the
 * same 1.8 spacing step the ladder uses. A circumbinary world is a ceiling,
 * not a slot of its own.
 * @param {object} system
 * @returns {{ au: number, zone: string, afterId: string|null }[]}
 */
export function insertionSlots(system) {
  if (!system?.stars?.length || system.isRoguePlanet) return [];
  const worlds = system.worlds || [];
  const regular = worlds.filter(world => !world.isCircumbinary).sort((a, b) => a.orbitalAU - b.orbitalAU);
  const ceiling = worlds
    .filter(world => world.isCircumbinary)
    .reduce((min, world) => Math.min(min, world.orbitalAU), Infinity);
  const hz = system.hz || { inner: 1, outer: 1.5 };
  const taken = au => au == null || worlds.some(world => world.orbitalAU === au);
  const slot = (au, afterId) => taken(au) ? null : { au, zone: determineOrbitalZone(au, hz), afterId };

  if (!regular.length) {
    const au = ceiling < Infinity
      ? betweenAU(MIN_ORBIT_AU, ceiling)
      : round2(Math.sqrt(hz.inner * hz.outer));
    const only = slot(au, null);
    return only ? [only] : [];
  }

  const slots = [];
  const inner = slot(openInnerAU(regular[0].orbitalAU), null);
  if (inner) slots.push(inner);
  for (let i = 0; i < regular.length - 1; i++) {
    const gap = slot(betweenAU(regular[i].orbitalAU, regular[i + 1].orbitalAU), regular[i].id);
    if (gap) slots.push(gap);
  }
  const outer = slot(openOuterAU(regular[regular.length - 1].orbitalAU, ceiling < Infinity ? ceiling : null), regular[regular.length - 1].id);
  if (outer) slots.push(outer);
  return slots;
}

/**
 * Generate one world at an open AU and lock it. Every other orbit stays put.
 * A rogue system, or an AU that is already taken, is refused.
 * @param {object} system
 * @param {number} orbitalAU
 * @returns {object} The same system when the AU cannot be used.
 */
export function insertWorld(system, orbitalAU) {
  if (!system?.stars?.length || system.isRoguePlanet) return system;
  const au = round2(Number(orbitalAU));
  if (!Number.isFinite(au) || au < MIN_ORBIT_AU) return system;
  if ((system.worlds || []).some(world => world.orbitalAU === au)) return system;

  const totalLuminosity = system.stars.reduce((sum, star) => sum + star.luminosity, 0);
  const hz = system.hz || calculateHabitableZone(totalLuminosity);
  const primaryClass = system.stars[0]?.spectralClass || 'G';
  const index = (system.worlds || []).filter(world => !world.isCircumbinary && world.orbitalAU < au).length;
  const fresh = generateWorld(au, hz, totalLuminosity, index, primaryClass);
  assignWorldLife(fresh, system.stars);
  fresh.locked = true;
  fresh.worldNotes = [fresh.worldNotes, 'Inserted into this orbit.'].filter(Boolean).join(' ');

  const worlds = [...(system.worlds || []), fresh]
    .sort((a, b) => a.orbitalAU - b.orbitalAU)
    .map((entry, i) => (entry.index === i ? entry : { ...entry, index: i }));

  return {
    ...system,
    worlds,
    worldCount: worlds.filter(entry => !entry.isCircumbinary).length,
    timestamp: Date.now(),
  };
}

export function redrawWorld(system, worldId) {
  // An ejected body has no star to roll against. Replacing it would invent
  // a habitable world at AU 0, which is not an orbit.
  if (system.isRoguePlanet || !system.stars?.length) return system;

  const worldIndex = system.worlds.findIndex(w => w.id === worldId);
  if (worldIndex === -1) return system;

  const existing = system.worlds[worldIndex];
  if (existing.locked) return system;

  const worlds = [...system.worlds];
  worlds[worldIndex] = regenerateWorldAtAU(existing, system);

  return {
    ...system,
    worlds,
    timestamp: Date.now(),
  };
}

// ─── ROGUE PLANET SYSTEM (navigable neighbor) ────────────────────────────────
function generateRogueWorld(index = 0) {
  const worldType = 'Ice Planet';
  const worldDef  = WORLD_TYPES[worldType];
  const atmosphere = getRandom() < 0.3 ? 'Trace' : 'None';
  const hydrosphere = weightedPick(
    worldDef.hydrosphereTypes.map((t, i) => [t, worldDef.hydrosphereWeights[i]])
  );
  const gravity = round2(rnd(0.1, 0.5));
  const temperature = rndInt(-250, -150);

  return {
    id:              crypto.randomUUID(),
    index,
    orbitalAU:       0, // unbound. Not an orbit at the star.
    zone:            'FRINGE',
    worldType,
    atmosphere,
    hydrosphere,
    gravity,
    temperature,
    isHabitable:     false,
    tidallyLocked:   false,
    tidalResonance:  false,
    biosignature:    null,
    biosphere:       null,
    hazards:         ['Extreme cold', 'No solar energy', 'Radiation from cosmic sources'],
    moons:           [],
    worldNotes:      'Unbound planetary body. Geothermal heat from radioactive decay may sustain subsurface liquid water.',
    locked:          false,
    species:         [],
    ruins:           null,
    isCircumbinary:  false,
  };
}

export function generateRoguePlanetSystem() {
  const hasBody = getRandom() < 0.4;
  const worlds  = hasBody ? [generateRogueWorld()] : [];

  return {
    id:            crypto.randomUUID(),
    timestamp:     Date.now(),
    isRoguePlanet: true,
    stars:         [],
    hz:            { inner: 0, outer: 0 },
    worldCount:    worlds.length,
    worlds,
    comets:        [],
    neighborhood: {
      id:          crypto.randomUUID(),
      density:     'N/A',
      densityDesc: 'Interstellar void',
      neighbors:   [],
      locked:      false,
    },
  };
}

// ─── SPECIES REGENERATION ─────────────────────────────────────────────────────
// Keeps the metabolism. A new people upgrades the biosphere to complex.
// A world rolled with no life stays sterile.
export function regenerateSpeciesForWorld(world, stars) {
  if (!world.isHabitable) return world;

  const lockedSpecies = (world.species || []).filter(species => species.locked);
  if (world.biosphere?.complexity === 'none' && lockedSpecies.length === 0) {
    return { ...world, species: [], ruins: null };
  }

  const count = generateSpeciesCount();
  const people = Math.max(count, lockedSpecies.length);
  let biosphere = world.biosphere;
  if (!biosphere) {
    biosphere = generateBiosphere(world, people);
  } else if (people > 0 && biosphere.complexity !== 'complex') {
    biosphere = biosphereWithComplexity(world, biosphere, 'complex');
  }

  if (biosphere.complexity === 'none') {
    return { ...world, biosphere, species: [], ruins: null };
  }

  const next = { ...world, biosphere };
  const ctx = speciesContextForWorld(next);
  const species = (world.species || []).map(entry =>
    entry.locked ? entry : generateSpecies(world.worldType, world.zone, ctx)
  );
  while (species.length < count) {
    species.push(generateSpecies(world.worldType, world.zone, ctx));
  }
  // An unlocked species is a new people, so a typed name is not kept.
  // A locked species is the same people and keeps its name.
  const finalSpecies = species.slice(0, Math.max(count, lockedSpecies.length));
  // Ruins roll only while the biosphere is alive and no one is living there.
  const ruins = finalSpecies.length === 0
    ? (getRandom() < RUINS_CHANCE ? generateRuins(ruinAgeLimit(world, stars)) : null)
    : null;
  return { ...next, species: finalSpecies, ruins };
}

/**
 * Reroll one moon's people. A tidal moon keeps its chemotrophic biosphere.
 * A terrestrial moon keeps its metabolism, and a new people makes it complex.
 * A terrestrial moon rolled with no life stays sterile.
 * @param {object} world
 * @param {string} moonId
 * @returns {object}
 */
export function regenerateMoonSpecies(world, moonId) {
  const zone = world.zone;
  const moons = (world.moons || []).map(moon => {
    if (moon.id !== moonId || !moon.canSupportLife) return moon;
    const lockedSpecies = (moon.species || []).filter(species => species.locked);
    if (TIDAL_MOON_TYPES.has(moon.type)) {
      if (lockedSpecies.length > 0) {
        return { ...moon, species: lockedSpecies, biosphere: tidalMoonBiosphere('complex') };
      }
      const count = getRandom() < 0.2 ? 1 : 0;
      const species = Array.from({ length: count }, () =>
        generateSpecies('Ice Planet', zone, { metabolism: 'chemotrophic' })
      );
      return { ...moon, species, biosphere: tidalMoonBiosphere(count > 0 ? 'complex' : 'microbial') };
    }

    if (moon.biosphere?.complexity === 'none' && lockedSpecies.length === 0) {
      return { ...moon, species: [], biosphere: moon.biosphere };
    }
    const count = getRandom() < 0.2 ? 1 : 0;
    const people = Math.max(count, lockedSpecies.length);
    const standIn = { worldType: 'Terrestrial', hydrosphere: '' };
    let biosphere = moon.biosphere;
    if (!biosphere) biosphere = generateBiosphere(standIn, people);
    else if (people > 0 && biosphere.complexity !== 'complex') {
      biosphere = biosphereWithComplexity(standIn, biosphere, 'complex');
    }
    if (biosphere.complexity === 'none') return { ...moon, biosphere, species: [] };
    const ctx = { metabolism: biosphere.metabolism };
    const species = (moon.species || []).map(entry =>
      entry.locked ? entry : generateSpecies('Terrestrial', zone, ctx)
    );
    while (species.length < count) species.push(generateSpecies('Terrestrial', zone, ctx));
    const finalSpecies = species.slice(0, Math.max(count, lockedSpecies.length));
    return { ...moon, biosphere, species: finalSpecies };
  });
  return { ...world, moons };
}

// Kepler's third law. P is Earth years, a is AU, M is solar masses.
// A circumbinary world orbits every star, so M is their combined mass.
// Every other world uses the primary. The ladder does not record which
// star a binary world circles. Stellar separation is stored on the system.
// The year is computed when the card is drawn. It is not stored, so a
// seed does not change.
const EARTH_DAYS_PER_YEAR = 365.25;

export function orbitalPeriodYears(au, solarMasses) {
  if (!(au > 0) || !(solarMasses > 0)) return null;
  return Math.sqrt((au ** 3) / solarMasses);
}

/**
 * One line per pair. A binary is a single separation. A triple names the
 * close pair, then the third star's distance from that pair.
 * @param {Array<{ label: string, au: number, periodYears: number }>|null} pairs
 * @returns {string[]}
 */
export function formatSeparation(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return [];
  return pairs.map((pair, index) => {
    const period = formatOrbitalPeriod(pair.periodYears);
    const periodText = period ? ` · period ${period}` : '';
    if (pairs.length === 1) return `SEPARATION: ${pair.au} AU${periodText}`;
    if (index === 0) return `${pair.label}: ${pair.au} AU${periodText}`;
    return `${pair.label}: ${pair.au} AU from the pair${periodText}`;
  });
}

export function formatOrbitalPeriod(years) {
  if (years == null || !Number.isFinite(years) || years <= 0) return null;
  if (years >= 1) return `${(Math.round(years * 10) / 10).toFixed(1)} yr`;
  const days = years * EARTH_DAYS_PER_YEAR;
  if (days >= 1) {
    const rounded = Math.round(days);
    return `${rounded} day${rounded === 1 ? '' : 's'}`;
  }
  const hours = Math.max(1, Math.round(days * 24));
  return `${hours} hr`;
}

function stellarMassForWorld(world, stars) {
  if (world?.isCircumbinary) {
    return (stars || []).reduce((sum, star) => sum + (star.mass || 0), 0);
  }
  return stars?.[0]?.mass || 0;
}

export function worldYearLabel(world, stars) {
  if (!world || !(world.orbitalAU > 0)) return null;
  return formatOrbitalPeriod(orbitalPeriodYears(world.orbitalAU, stellarMassForWorld(world, stars)));
}

// A day is the sunrise-to-sunrise period. It is computed for display.
// A locked world keeps one face sunward, so its day is its year.
// A resonant world is the Mercury case: the solar day is twice the year.
// Every other spin is a hash of the body the seed already fixed:
// type, air, water, and gravity. Those four survive ejection, so the
// spin stays with the body. A redraw replaces the body and the spin
// changes. The id is left out, because a fresh roll of the same seed
// assigns new ids. The orbit is left out, because ejection clears it.
const FAST_SPIN_TYPES = new Set(['Gas Giant', 'Ice Giant', 'Gas Dwarf']);

function hashUnit(text) {
  let hash = 2166136261;
  const value = String(text);
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function rotationHours(world) {
  const unit = hashUnit(`${world.worldType}|${world.atmosphere}|${world.hydrosphere}|${world.gravity}`);
  if (FAST_SPIN_TYPES.has(world.worldType)) return 6 + unit * 12;
  if (unit >= 5 / 6) {
    const slow = (unit - 5 / 6) / (1 / 6);
    return (2 + slow * 98) * 24;
  }
  const usual = unit / (5 / 6);
  return 10 * Math.pow(4.8, usual);
}

function formatHours(hours) {
  const rounded = Math.max(1, Math.round(hours));
  if (rounded >= 24) return formatOrbitalPeriod(rounded / 24 / EARTH_DAYS_PER_YEAR);
  return `${rounded} hr`;
}

// A locked or resonant day follows the year. Any other label is just the
// length. The card does not say the number was rolled.
export function worldSpinLabel(world, stars) {
  if (!world || world.worldType === 'Asteroid Belt') return null;
  const unbound = !(world.orbitalAU > 0);
  const yearYears = unbound
    ? null
    : orbitalPeriodYears(world.orbitalAU, stellarMassForWorld(world, stars));
  if (!unbound && yearYears && world.tidallyLocked) {
    return `day ${formatOrbitalPeriod(yearYears)}`;
  }
  if (!unbound && yearYears && world.tidalResonance) {
    return `day ${formatOrbitalPeriod(yearYears * 2)}`;
  }
  const period = formatHours(rotationHours(world));
  return `${unbound ? 'spin' : 'day'} ${period}`;
}

/**
 * Inclination, and perihelion and aphelion when the orbit is eccentric.
 * Null when the tilt is under 5°, which is the flat disk.
 * @param {object} world
 * @param {Array} stars
 * @returns {string|null}
 */
export function worldOrbitLabel(world, stars) {
  const orbit = worldOrbit(world, stars);
  if (!orbit) return null;
  const degrees = Math.round(orbit.inclination);
  if (degrees < INCLINATION_PRINT_DEGREES) return null;
  if (!(orbit.eccentricity > 0)) return `i ${degrees}°`;
  return `i ${degrees}° · peri ${formatAU(orbit.perihelion)} AU · aph ${formatAU(orbit.aphelion)} AU`;
}

/**
 * One line when this orbit crosses the next body inward.
 * @param {object} world
 * @param {Array} worlds
 * @param {Array} stars
 * @returns {string|null}
 */
export function orbitCrossingNote(world, worlds, stars) {
  const inner = orbitCrossing(world, worlds, stars);
  if (!inner) return null;
  const name = inner.world.name || `[${inner.index + 1}] ${inner.world.worldType}`;
  return `Crosses ${name}. A resonance keeps them apart.`;
}

/**
 * The disk against the star's equator. Null when they still agree.
 * @param {object} system
 * @returns {string|null}
 */
export function diskTiltLabel(system) {
  const tilt = diskTilt(system);
  if (!tilt) return null;
  if (tilt.retrograde) return `The planets orbit retrograde, ${tilt.degrees}° from the star's equator.`;
  return `The planetary plane is tilted ${tilt.degrees}° to the star's equator.`;
}

/**
 * The Kuiper belt as one sentence. Null when the belt was lost, or the
 * system has no star.
 * @param {object} system
 * @returns {string|null}
 */
export function outerBeltLabel(system) {
  const belt = outerBelt(system);
  if (!belt) return null;
  const span = `${formatAU(belt.inner)}–${formatAU(belt.outer)} AU`;
  if (!belt.stirred) return `A Kuiper belt from ${span}. Cold and flat. Nothing has stirred it.`;
  const base = `A Kuiper belt from ${span}. Cold and flat, with a hotter inclined population. The bodies thin past the outer resonance.`;
  if (!belt.dust) return base;
  return `${base} Dust is still dense past the outer edge.`;
}

/**
 * Fields for the Kuiper belt card. Null when the system has no belt.
 * @param {object} system
 * @returns {{ span: string, detail: string, stirred: boolean, dust: boolean }|null}
 */
export function kuiperBeltCard(system) {
  const belt = outerBelt(system);
  if (!belt) return null;
  const span = `${formatAU(belt.inner)}–${formatAU(belt.outer)} AU`;
  const detail = !belt.stirred
    ? 'Cold and flat. Nothing has stirred it.'
    : belt.dust
      ? 'Cold and flat, with a hotter inclined population. The bodies thin past the outer resonance. Dust is still dense past the outer edge.'
      : 'Cold and flat, with a hotter inclined population. The bodies thin past the outer resonance.';
  return { span, detail, stirred: belt.stirred, dust: belt.dust };
}

// ─── TEXT EXPORT ──────────────────────────────────────────────────────────────
export function generateTextSummary(system) {
  const lines = [];
  const { neighborhood, stars, worlds, hz, comets = [] } = system;

  lines.push('═══════════════════════════════════════════');
  lines.push('ARMILLARY — STAR SYSTEM RECORD');
  if (system.name) lines.push(`Name: ${system.name}`);
  lines.push(`Generated: ${new Date(system.timestamp).toLocaleString()}`);
  if (system.seed) {
    const sc = system.starCount ?? stars.length;
    lines.push(`Seed: ${system.seed} · Stars: ${sc} · App: ${system.appVersion || APP_VERSION}`);
    lines.push(`(Same seed + star count + app version reproduces this roll — not edits or locks.)`);
  }
  lines.push('═══════════════════════════════════════════');
  lines.push('');

  // Neighborhood
  lines.push('STELLAR NEIGHBORHOOD');
  lines.push(`Density: ${neighborhood.density} — ${neighborhood.densityDesc}`);
  lines.push(`Nearby Objects: ${neighborhood.neighbors.length}`);
  neighborhood.neighbors.forEach(n => {
    if (n.objectType === 'Star') {
      lines.push(`  ${n.distance} ly — ${n.spectralClass} (${n.description})`);
    } else if (n.objectType === 'Nebula') {
      lines.push(`  ${n.distance} ly — ${n.label} (${n.size} ly diameter)`);
    } else if (n.objectType === 'Rogue Planet') {
      lines.push(`  ${n.distance} ly — Rogue Planet`);
    } else if (n.objectType === 'Black Hole') {
      lines.push(`  ${n.distance} ly — Black Hole, ${n.mass} M☉ (${n.label})`);
    } else if (n.objectType === 'Interstellar Transient') {
      lines.push(`  ${n.distance} ly — Interstellar Object from ${n.origin}, ${n.speed} km/s, departs in ~${n.departureYears} yrs`);
    }
  });
  lines.push('');

  if (system.ejected?.length) {
    lines.push('EJECTED');
    system.ejected.forEach(entry => {
      const neighbor = entry.neighbor || {};
      const body = entry.rogueSystem?.worlds?.[0];
      const detail = body ? ` — ${body.worldType}, ${body.gravity}g, ${body.temperature}°C` : '';
      const named = body?.name ? `${body.name} — ` : '';
      lines.push(`  ${neighbor.distance} ly — ${named}${neighbor.label || 'Ejected world'}${detail}`);
      if (body?.worldNotes) lines.push(`    Note: ${body.worldNotes}`);
      const stillLiving = [
        ...(body?.species || []),
        ...(body?.moons || []).flatMap(moon => moon.species || []),
      ];
      if (stillLiving.length) {
        const names = stillLiving.map(species => species.name).filter(Boolean);
        lines.push(`    Species still living: ${stillLiving.length}${names.length ? ` (${names.join(', ')})` : ''}`);
      }
      if (body?.ruins) lines.push(`    Ruins: ${body.ruins.tech}${body.ruins.cause ? ` (${body.ruins.cause})` : ''}`);
    });
    lines.push('');
  }

  // Stars. A rogue has none, and its 0–0 zone is a sentinel, not a range.
  if (system.isRoguePlanet) {
    lines.push('ROGUE PLANET');
    lines.push('No host star. The body is unbound.');
    if (system.ejectedFrom) {
      const from = system.ejectedFrom;
      lines.push(`Ejected ${from.worldType} from ${from.orbitalAU} AU (${String(from.zone || '').replaceAll('_', ' ')}).`);
    }
  } else {
    lines.push('PRIMARY SYSTEM');
    stars.forEach((star, i) => {
      const label = stars.length > 1 ? `Star ${String.fromCharCode(65 + i)}` : 'Primary Star';
      lines.push(`${label}: ${star.spectralClass}-type (${star.description})`);
      lines.push(`  Luminosity: ${star.luminosity} L☉  |  Mass: ${star.mass} M☉  |  Age: ${star.age} Gyr`);
    });
    for (const line of formatSeparation(system.separation)) lines.push(line);
    lines.push(`Habitable Zone: ${hz.inner}–${hz.outer} AU`);
    if (stars.length > 1) {
      lines.push('Apparent solar size is given for an orbit that encloses the stars.');
    }
  }
  const relation = livingWorldsRelation(system);
  if (relation) lines.push(relation.text);
  const tilt = diskTiltLabel(system);
  if (tilt) lines.push(tilt);
  const belt = outerBeltLabel(system);
  if (belt) lines.push(belt);
  lines.push('');

  // Comets
  if (comets.length > 0) {
    lines.push(`COMETS (${comets.length})`);
    comets.forEach((c, i) => {
      lines.push(`  Comet ${i + 1}: ${c.composition} — ${c.periodType} (${c.period} yr period)`);
    });
    lines.push('');
  }

  // Worlds
  lines.push('PLANETARY BODIES');
  worlds.forEach((world, i) => {
    const year = worldYearLabel(world, stars);
    const spin = worldSpinLabel(world, stars);
    const place = system.isRoguePlanet
      ? `unbound${spin ? ` · ${spin}` : ''}`
      : `${world.orbitalAU} AU${year ? ` · year ${year}` : ''}${spin ? ` · ${spin}` : ''} (${world.zone.replace('_', ' ')})`;
    const title = world.name ? `${world.name} — ${world.worldType}` : world.worldType;
    lines.push(`[${i + 1}] ${title} at ${place}${world.isCircumbinary ? ' ★ CIRCUMBINARY' : ''}${world.worldType === 'Pulsar Planet' && world.orbitalAU > 0 ? ' ★ PULSAR ORBIT' : ''}`);
    const orbitLabel = worldOrbitLabel(world, stars);
    if (orbitLabel) lines.push(`  Orbit: ${orbitLabel}`);
    const crossing = orbitCrossingNote(world, worlds, stars);
    if (crossing) lines.push(`  ${crossing}`);
    lines.push(`  Atmosphere: ${world.atmosphere}  |  Hydrosphere: ${world.hydrosphere}`);
    lines.push(`  Gravity: ${world.gravity}g  |  Temperature: ${world.temperature}°C`);
    const sun = sunMeasure(apparentSuns(world, stars, system.separation));
    if (sun) lines.push(`  Sun: ${sun}`);
    if (world.tidallyLocked)  lines.push(`  ⟳ TIDALLY LOCKED — permanent day/night hemispheres`);
    if (world.tidalResonance) lines.push(`  ⟳ SPIN-ORBIT RESONANCE — slow rotation, extreme day/night temperature swings`);
    if (world.hazards.length) lines.push(`  Hazards: ${world.hazards.join(', ')}`);
    if (world.isHabitable)    lines.push(`  ★ HABITABLE`);
    if (world.biosphere?.label) lines.push(`  BIOSPHERE: ${world.biosphere.label}`);
    if (world.biosignature)   lines.push(`  🔬 BIOSIGNATURE: ${world.biosignature.label} (${world.biosignature.confidence})`);
    if (world.moons.length)   lines.push(`  Moons: ${world.moons.length} (${world.moons.map(m => m.type).join(', ')})`);
    for (const moon of world.moons) {
      if (!moon.biosphere?.label) continue;
      lines.push(`  MOON ${moon.index + 1} · ${moon.type} · ${moon.biosphere.label}`);
      (moon.species || []).forEach((sp, si) => {
        lines.push(sp.name ? `    Species ${si + 1}: ${sp.name}` : `    Species ${si + 1}:`);
        lines.push(`      Origin: ${sp.origin} — ${sp.originDesc}`);
        lines.push(`      Body Plan: ${sp.bodyPlan}  |  Primary Sense: ${sp.primarySense}`);
        lines.push(`      Society: ${sp.social}  |  Technology: ${sp.tech}`);
        if (sp.port) lines.push(`      Port: ${sp.port}`);
        lines.push(`      Disposition: ${sp.disposition}`);
        lines.push(`      Traits: ${sp.traits.join('; ')}`);
      });
    }
    if (world.debris)         lines.push(`  Debris: ${world.debris}`);
    if (world.worldNotes)     lines.push(`  Note: ${world.worldNotes}`);
    const ruins = worldRuins(world, stars);
    if (ruins) {
      lines.push(`  ☠ RUINS: ${ruins.tech} civilization (${ruins.ageLabel}, ~${ruins.ageYears.toLocaleString()} yrs ago)`);
      lines.push(`    Collapse: ${ruins.cause} — ${ruins.causeDesc}`);
    }

    if (world.species.length) {
      lines.push('  SAPIENT SPECIES:');
      world.species.forEach((sp, si) => {
        lines.push(sp.name ? `  Species ${si + 1}: ${sp.name}` : `  Species ${si + 1}:`);
        lines.push(`    Origin: ${sp.origin} — ${sp.originDesc}`);
        lines.push(`    Body Plan: ${sp.bodyPlan}  |  Primary Sense: ${sp.primarySense}`);
        lines.push(`    Society: ${sp.social}  |  Technology: ${sp.tech}`);
        if (sp.port) lines.push(`    Port: ${sp.port}`);
        lines.push(`    Disposition: ${sp.disposition}`);
        lines.push(`    Traits: ${sp.traits.join('; ')}`);
      });
    }
    lines.push('');
  });

  return lines.join('\n');
}
