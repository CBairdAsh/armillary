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

// ─── WORLD GENERATION ────────────────────────────────────────────────────────
function generateWorld(orbitalAU, hz, starLuminosity, index) {
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
    id:          crypto.randomUUID(),
    index,
    orbitalAU,
    zone,
    worldType,
    atmosphere,
    hydrosphere,
    gravity,
    temperature,
    isHabitable,
    hazards,
    moons,
    locked:      false,
    species:     [], // populated separately if habitable
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

// ─── INTERSTELLAR NEIGHBORHOOD ───────────────────────────────────────────────
function generateNeighborhood() {
  const density   = rndFrom(NEIGHBORHOOD_DENSITY);
  const [minD, maxD] = DISTANCE_RANGES[density.label];
  const starCount = rndInt(density.nearbyStarRange[0], density.nearbyStarRange[1]);

  const neighbors = Array.from({ length: Math.min(starCount, 6) }, (_, i) => {
    const distance   = round2(rnd(minD, maxD));
    const spectral   = generateSpectralClass(false); // no exotics for neighbors
    const sc         = SPECTRAL_CLASSES[spectral];
    return {
      id:           crypto.randomUUID(),
      distance,
      spectralClass: spectral,
      color:        sc?.color || '#FFFFFF',
      description:  sc?.description || 'Unknown',
      hasGeneratedSystem: false,
    };
  }).sort((a, b) => a.distance - b.distance);

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

  // Generate worlds
  const worlds = orbitalPositions.map((au, i) => {
    if (locked.worlds?.[i]) return locked.worlds[i];
    return generateWorld(au, combinedHZ, totalLuminosity, i);
  });

  // Generate species for habitable worlds
  worlds.forEach(world => {
    if (!world.isHabitable) return;
    if (world.locked && world.species.length > 0) return;
    const count = generateSpeciesCount();
    world.species = Array.from({ length: count }, () =>
      generateSpecies(world.worldType, world.zone)
    );
    // Also check moons
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

  return {
    id:           crypto.randomUUID(),
    timestamp:    Date.now(),
    neighborhood,
    stars,
    hz:           combinedHZ,
    worldCount,
    worlds,
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
  const species = world.species.map((s, i) =>
    s.locked ? s : generateSpecies(world.worldType, world.zone)
  );
  // Fill if count increased
  while (species.length < count) {
    species.push(generateSpecies(world.worldType, world.zone));
  }
  return { ...world, species: species.slice(0, Math.max(count, species.filter(s => s.locked).length)) };
}

// ─── TEXT EXPORT ──────────────────────────────────────────────────────────────
export function generateTextSummary(system) {
  const lines = [];
  const { neighborhood, stars, worlds, hz } = system;

  lines.push('═══════════════════════════════════════════');
  lines.push('ARMILLARY — STAR SYSTEM RECORD');
  lines.push(`Generated: ${new Date(system.timestamp).toLocaleString()}`);
  lines.push('═══════════════════════════════════════════');
  lines.push('');

  // Neighborhood
  lines.push('STELLAR NEIGHBORHOOD');
  lines.push(`Density: ${neighborhood.density} — ${neighborhood.densityDesc}`);
  lines.push(`Nearby Stars: ${neighborhood.neighbors.length}`);
  neighborhood.neighbors.forEach(n => {
    lines.push(`  ${n.distance} ly — ${n.spectralClass} (${n.description})`);
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

  // Worlds
  lines.push('PLANETARY BODIES');
  worlds.forEach((world, i) => {
    lines.push(`[${i + 1}] ${world.worldType} at ${world.orbitalAU} AU (${world.zone.replace('_', ' ')})`);
    lines.push(`  Atmosphere: ${world.atmosphere}  |  Hydrosphere: ${world.hydrosphere}`);
    lines.push(`  Gravity: ${world.gravity}g  |  Temperature: ${world.temperature}°C`);
    if (world.hazards.length) lines.push(`  Hazards: ${world.hazards.join(', ')}`);
    if (world.isHabitable) lines.push(`  ★ HABITABLE`);
    if (world.moons.length) lines.push(`  Moons: ${world.moons.length} (${world.moons.map(m => m.type).join(', ')})`);

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
