// ─── GENERATION ENGINE ────────────────────────────────────────────────────────
// Procedural generation logic based on GURPS Space 4e
// All randomness flows through this module; seeded via runWithSeed (v1.3+)

import { getRandom, runWithSeed, generateRandomSeed } from './rng.js';
import { APP_VERSION } from '../config.js';
import {
  SPECTRAL_CLASSES,
  WORLD_TYPE_BY_ZONE,
  WORLD_TYPES,
  WORLD_HAZARDS,
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
function determineOrbitalZone(orbitalAU, hz) {
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

function getSpeciesWeightBoosts(worldType, zone, { tidallyLocked = false, tidalResonance = false } = {}) {
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

  return { origin, sense, social, body, disp };
}

function generateWorld(orbitalAU, hz, starLuminosity, index, primarySpectralClass = 'G', forcedWorldType = null) {
  const zone      = determineOrbitalZone(orbitalAU, hz);
  const worldType = resolveWorldType(zone, index, primarySpectralClass, forcedWorldType);
  const worldDef  = WORLD_TYPES[worldType] || WORLD_TYPES['Terrestrial'];

  const atmosphere = weightedPick(
    worldDef.atmosphereTypes.map((t, i) => [t, worldDef.atmosphereWeights[i]])
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
  // Only Hycean worlds in the HZ get a biosignature roll (inspired by K2-18b DMS detection)
  let biosignature = null;
  if (worldType === 'Hycean' && inHZ && getRandom() < BIOSIGNATURE_CHANCE) {
    biosignature = rndFrom(BIOSIGNATURE_TYPES);
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
      const moonHabit  = moonType.canSupportLife && inHZ;
      return {
        id:             crypto.randomUUID(),
        index:          i,
        type:           moonType.type,
        description:    moonType.description,
        canSupportLife: moonHabit,
        lifeNote:       moonHabit ? moonType.lifeNote || null : null,
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
    hazards,
    moons,
    worldNotes:    worldDef.notes || null,
    locked:        false,
    species:       [], // populated separately if habitable
  };
}

// ─── SPECIES GENERATION ───────────────────────────────────────────────────────
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
  };
}

function assignWorldLife(world) {
  if (!world.isHabitable) {
    world.species = world.species || [];
    return world;
  }
  if (world.locked && world.species?.length > 0) return world;

  const ctx   = speciesContextForWorld(world);
  const count = generateSpeciesCount();
  world.species = Array.from({ length: count }, () =>
    generateSpecies(world.worldType, world.zone, ctx)
  );

  if (count === 0 && !world.ruins) {
    world.ruins = getRandom() < RUINS_CHANCE ? generateRuins() : null;
  } else if (count > 0) {
    world.ruins = null;
  }

  world.moons = (world.moons || []).map(moon => {
    if (!moon.canSupportLife) return { ...moon, species: moon.species || [] };
    const moonSpeciesCount = getRandom() < 0.2 ? 1 : 0;
    return {
      ...moon,
      species: Array.from({ length: moonSpeciesCount }, () =>
        generateSpecies('Ice Planet', 'OUTER')
      ),
    };
  });

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

  const regenerated = {
    ...fresh,
    id:    world.id,
    index: world.index ?? index,
    locked: false,
  };
  return assignWorldLife(regenerated);
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
function generateRuins() {
  const ageRange = weightedPick(
    RUINS_AGE_RANGES.map((r, i) => [i, [35, 30, 20, 15][i]])
  );
  const range    = RUINS_AGE_RANGES[ageRange];
  const age      = rndInt(range.range[0], range.range[1]);
  const cause    = weightedPick(RUINS_COLLAPSE_CAUSES);
  const tech     = rndFrom(RUINS_TECH_LEVELS);
  return {
    ageLabel:    range.label,
    ageYears:    age,
    ageDesc:     range.description,
    cause:       cause.label,
    causeDesc:   cause.description,
    tech:        tech.label,
    techDesc:    tech.description,
  };
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

  // Combined luminosity for binary/triple affects HZ
  const totalLuminosity = stars.reduce((sum, s) => sum + s.luminosity, 0);
  const combinedHZ      = calculateHabitableZone(totalLuminosity);

  // World count from star type
  const sc          = SPECTRAL_CLASSES[primaryStar.spectralClass];
  const [minW, maxW] = sc?.planetBodyRange || [3, 8];
  const worldCount  = locked.worldCount ?? rndInt(minW, maxW);

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
  if (stars.length > 1 && getRandom() < CIRCUMBINARY_CHANCE) {
    circumbinaryWorld = generateCircumbinaryWorld(null, combinedHZ, totalLuminosity, worlds.length);
  }

  // Combine regular worlds with circumbinary world if present
  const allWorlds = circumbinaryWorld ? [...worlds, circumbinaryWorld] : worlds;

  // Generate species for habitable worlds + ruins for empty habitable worlds
  allWorlds.forEach(world => assignWorldLife(world));

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
// Redraws only unlocked components, preserving locked ones
export function redrawSystem(existingSystem, { redrawnStarCount } = {}) {
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
    },
  };

  // Fresh RNG for unlocked parts — do not replay the stored seed (that would repeat the same roll)
  const result = generateSystem(opts);
  return { ...result, name: existingSystem.name, id: existingSystem.id };
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

  const worlds = system.worlds.map(world => {
    if (world.locked) return world;
    return regenerateWorldAtAU(world, { ...system, stars, hz: combinedHZ });
  });

  return {
    ...system,
    stars,
    hz:        combinedHZ,
    worlds,
    timestamp: Date.now(),
  };
}

export function redrawWorld(system, worldId) {
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
    orbitalAU:       0,
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
export function regenerateSpeciesForWorld(world) {
  if (!world.isHabitable) return world;
  const ctx     = speciesContextForWorld(world);
  const count   = generateSpeciesCount();
  const species = world.species.map(s =>
    s.locked ? s : generateSpecies(world.worldType, world.zone, ctx)
  );
  while (species.length < count) {
    species.push(generateSpecies(world.worldType, world.zone, ctx));
  }
  const finalSpecies = species.slice(0, Math.max(count, species.filter(s => s.locked).length));
  // If no species left after regen, roll for ruins
  const ruins = finalSpecies.length === 0
    ? (getRandom() < RUINS_CHANCE ? generateRuins() : null)
    : null;
  return { ...world, species: finalSpecies, ruins };
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

  // Stars
  lines.push('PRIMARY SYSTEM');
  stars.forEach((star, i) => {
    const label = stars.length > 1 ? `Star ${String.fromCharCode(65 + i)}` : 'Primary Star';
    lines.push(`${label}: ${star.spectralClass}-type (${star.description})`);
    lines.push(`  Luminosity: ${star.luminosity} L☉  |  Mass: ${star.mass} M☉  |  Age: ${star.age} Gyr`);
  });
  lines.push(`Habitable Zone: ${hz.inner}–${hz.outer} AU`);
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
    lines.push(`[${i + 1}] ${world.worldType} at ${world.orbitalAU} AU (${world.zone.replace('_', ' ')})${world.isCircumbinary ? ' ★ CIRCUMBINARY' : ''}${world.worldType === 'Pulsar Planet' ? ' ★ PULSAR ORBIT' : ''}`);
    lines.push(`  Atmosphere: ${world.atmosphere}  |  Hydrosphere: ${world.hydrosphere}`);
    lines.push(`  Gravity: ${world.gravity}g  |  Temperature: ${world.temperature}°C`);
    if (world.tidallyLocked)  lines.push(`  ⟳ TIDALLY LOCKED — permanent day/night hemispheres`);
    if (world.tidalResonance) lines.push(`  ⟳ SPIN-ORBIT RESONANCE — slow rotation, extreme day/night temperature swings`);
    if (world.hazards.length) lines.push(`  Hazards: ${world.hazards.join(', ')}`);
    if (world.isHabitable)    lines.push(`  ★ HABITABLE`);
    if (world.biosignature)   lines.push(`  🔬 BIOSIGNATURE: ${world.biosignature.label} (${world.biosignature.confidence})`);
    if (world.moons.length)   lines.push(`  Moons: ${world.moons.length} (${world.moons.map(m => m.type).join(', ')})`);
    if (world.worldNotes)     lines.push(`  Note: ${world.worldNotes}`);
    if (world.ruins) {
      lines.push(`  ☠ RUINS: ${world.ruins.tech} civilization (${world.ruins.ageLabel}, ~${world.ruins.ageYears.toLocaleString()} yrs ago)`);
      lines.push(`    Collapse: ${world.ruins.cause} — ${world.ruins.causeDesc}`);
    }

    if (world.species.length) {
      lines.push('  SAPIENT SPECIES:');
      world.species.forEach((sp, si) => {
        lines.push(`  Species ${si + 1}:`);
        lines.push(`    Origin: ${sp.origin} — ${sp.originDesc}`);
        lines.push(`    Body Plan: ${sp.bodyPlan}  |  Primary Sense: ${sp.primarySense}`);
        lines.push(`    Society: ${sp.social}  |  Technology: ${sp.tech}`);
        lines.push(`    Disposition: ${sp.disposition}`);
        lines.push(`    Traits: ${sp.traits.join('; ')}`);
      });
    }
    lines.push('');
  });

  return lines.join('\n');
}
