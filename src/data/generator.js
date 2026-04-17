// ─── GENERATION ENGINE ────────────────────────────────────────────────────────
// Procedural generation logic based on GURPS Space 4e
// All randomness is seeded through this module

import {
  SPECTRAL_CLASSES,
  ORBITAL_ZONES,
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
  calculateHabitableZone,
  estimateTemperature,
} from './stellarData.js';

// ─── UTILITY ─────────────────────────────────────────────────────────────────
function rnd(min, max) {
  return Math.random() * (max - min) + min;
}
function rndInt(min, max) {
  return Math.floor(rnd(min, max + 1));
}
function rndFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function weightedPick(items) {
  // items: array of { label, weight, ...rest } or [value, weight] tuples
  const total = items.reduce((sum, item) => sum + (Array.isArray(item) ? item[1] : item.weight), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    const w = Array.isArray(item) ? item[1] : item.weight;
    roll -= w;
    if (roll <= 0) return Array.isArray(item) ? item[0] : item;
  }
  return Array.isArray(items[0]) ? items[0][0] : items[0];
}
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
function round2(n) { return Math.round(n * 100) / 100; }

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

function generateLuminosity(spectralClass) {
  const sc = SPECTRAL_CLASSES[spectralClass];
  if (!sc) return 1.0;
  const [min, max] = sc.luminosityRange;
  // Log-uniform distribution for luminosity (GURPS approach)
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  return round2(Math.pow(10, rnd(logMin, logMax)));
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
  const luminosity    = generateLuminosity(spectralClass);
  const mass          = generateMass(spectralClass);
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
function generateStars(count) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push(generateStar(i, i === 0));
  }
  // Binary/triple: secondary stars are typically less massive
  if (count > 1) {
    for (let i = 1; i < stars.length; i++) {
      // Ensure secondary is not more massive than primary
      if (stars[i].mass > stars[0].mass) {
        stars[i].mass = round2(stars[0].mass * rnd(0.3, 0.99));
      }
    }
  }
  return stars;
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

function generateWorld(orbitalAU, hz, starLuminosity, index, primarySpectralClass = 'G') {
  const zone      = determineOrbitalZone(orbitalAU, hz);
  const typePool  = WORLD_TYPE_BY_ZONE[zone] || WORLD_TYPE_BY_ZONE.OUTER;
  const worldType = weightedPick(typePool);
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

  const temperature = estimateTemperature(worldType, zone, starLuminosity);

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
  const tidalResonance = inHZ && !tidallyLocked && TIDAL_LOCK_PARTIAL_CLASSES.has(primarySpectralClass) && Math.random() < 0.4;

  // ── Biosignature ────────────────────────────────────────────────────────────
  // Only Hycean worlds in the HZ get a biosignature roll (inspired by K2-18b DMS detection)
  let biosignature = null;
  if (worldType === 'Hycean' && inHZ && Math.random() < BIOSIGNATURE_CHANCE) {
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
        hasLife:        moonHabit && Math.random() < 0.15,
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
function generateSpecies(worldType, zone) {
  const origin      = weightedPick(BIOLOGICAL_ORIGINS);
  const bodyPlan    = weightedPick(BODY_PLANS);
  const primarySense = weightedPick(PRIMARY_SENSES);
  const social      = weightedPick(SOCIAL_STRUCTURES);
  const tech        = weightedPick(TECH_LEVELS);
  const disposition = weightedPick(DISPOSITIONS);
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
    : Math.random() < 0.3 ? 1 : 0;

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
export function generateSystem({ starCount = 1, locked = {}, primarySpectralClass = null } = {}) {
  // Neighborhood
  const neighborhood = locked.neighborhood || generateNeighborhood();

  // Stars — force primary spectral class if provided (for neighbor navigation)
  const stars = locked.stars
    ? locked.stars.map((s, i) => s || generateStar(i, i === 0))
    : (() => {
        const arr = [];
        for (let i = 0; i < starCount; i++) {
          arr.push(generateStar(i, i === 0, i === 0 ? primarySpectralClass : null));
        }
        // Binary/triple: secondary stars typically less massive than primary
        if (arr.length > 1) {
          for (let i = 1; i < arr.length; i++) {
            if (arr[i].mass > arr[0].mass) {
              arr[i].mass = round2(arr[0].mass * rnd(0.3, 0.99));
            }
          }
        }
        return arr;
      })();

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
  if (stars.length > 1 && Math.random() < CIRCUMBINARY_CHANCE) {
    const cbAU = round2(combinedHZ.outer * rnd(1.5, 4.0));
    const cbZone = cbAU > combinedHZ.outer * 2 ? 'FRINGE' : 'OUTER';
    const cbTypePool = WORLD_TYPE_BY_ZONE[cbZone];
    const cbType     = weightedPick(cbTypePool);
    const cbDef      = WORLD_TYPES[cbType] || WORLD_TYPES['Gas Giant'];
    const cbAtmo     = weightedPick(cbDef.atmosphereTypes.map((t, i) => [t, cbDef.atmosphereWeights[i]]));
    const cbHydro    = weightedPick(cbDef.hydrosphereTypes.map((t, i) => [t, cbDef.hydrosphereWeights[i]]));
    const cbGravity  = round2(rnd(cbDef.gravityRange[0], cbDef.gravityRange[1]));
    const cbTemp     = estimateTemperature(cbType, cbZone, totalLuminosity);
    circumbinaryWorld = {
      id:              crypto.randomUUID(),
      index:           worlds.length,
      orbitalAU:       cbAU,
      zone:            cbZone,
      worldType:       cbType,
      atmosphere:      cbAtmo,
      hydrosphere:     cbHydro,
      gravity:         cbGravity,
      temperature:     cbTemp,
      isHabitable:     false, // circumbinary worlds rarely habitable at this distance
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

  // Combine regular worlds with circumbinary world if present
  const allWorlds = circumbinaryWorld ? [...worlds, circumbinaryWorld] : worlds;

  // Generate species for habitable worlds + ruins for empty habitable worlds
  allWorlds.forEach(world => {
    if (!world.isHabitable) return;
    if (world.locked && world.species.length > 0) return;

    const count = generateSpeciesCount();
    world.species = Array.from({ length: count }, () =>
      generateSpecies(world.worldType, world.zone)
    );

    // Ruins — only on habitable worlds with NO current species
    if (count === 0 && !world.ruins) {
      world.ruins = Math.random() < RUINS_CHANCE ? generateRuins() : null;
    }

    // Moon species
    world.moons = world.moons.map(moon => {
      if (!moon.canSupportLife) return moon;
      const moonSpeciesCount = Math.random() < 0.2 ? 1 : 0;
      return {
        ...moon,
        species: Array.from({ length: moonSpeciesCount }, () =>
          generateSpecies('Ice Planet', 'OUTER')
        ),
      };
    });
  });

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

  const lockedWorldCount = existingSystem.worldCountLocked
    ? existingSystem.worldCount : undefined;

  return generateSystem({
    starCount,
    locked: {
      neighborhood: lockedNeighborhood,
      stars:        lockedStars,
      worlds:       lockedWorlds,
      worldCount:   lockedWorldCount,
    },
  });
}

// ─── SPECIES REGENERATION ─────────────────────────────────────────────────────
export function regenerateSpeciesForWorld(world) {
  if (!world.isHabitable) return world;
  const count   = generateSpeciesCount();
  const species = world.species.map(s =>
    s.locked ? s : generateSpecies(world.worldType, world.zone)
  );
  while (species.length < count) {
    species.push(generateSpecies(world.worldType, world.zone));
  }
  const finalSpecies = species.slice(0, Math.max(count, species.filter(s => s.locked).length));
  // If no species left after regen, roll for ruins
  const ruins = finalSpecies.length === 0
    ? (Math.random() < RUINS_CHANCE ? generateRuins() : null)
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
    lines.push(`[${i + 1}] ${world.worldType} at ${world.orbitalAU} AU (${world.zone.replace('_', ' ')})${world.isCircumbinary ? ' ★ CIRCUMBINARY' : ''}`);
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
