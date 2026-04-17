// ─── STELLAR DATA ────────────────────────────────────────────────────────────
// Based on GURPS Space 4e stellar generation tables
// Supplemented with NASA exoplanet data for M-dwarf habitability notes

export const SPECTRAL_CLASSES = {
  O: {
    label: 'O',
    description: 'Blue supergiant',
    color: '#9BB0FF',
    tempK: [30000, 60000],
    massRange: [16, 150],       // solar masses
    luminosityRange: [30000, 1000000], // solar luminosity
    lifespan: 0.01,             // billion years typical
    habitableZoneAU: null,      // no stable HZ — too short-lived
    planetBodyRange: [0, 4],
    rarity: 0.00003,
    notes: 'Extremely rare, catastrophically short-lived. Habitable worlds essentially impossible.',
    exotic: false,
  },
  B: {
    label: 'B',
    description: 'Blue-white giant',
    color: '#AABFFF',
    tempK: [10000, 30000],
    massRange: [2.1, 16],
    luminosityRange: [25, 30000],
    lifespan: 0.1,
    habitableZoneAU: null,
    planetBodyRange: [0, 6],
    rarity: 0.0013,
    notes: 'Too short-lived for complex life. Intense UV radiation.',
    exotic: false,
  },
  A: {
    label: 'A',
    description: 'White star',
    color: '#CAD7FF',
    tempK: [7500, 10000],
    massRange: [1.4, 2.1],
    luminosityRange: [5, 25],
    lifespan: 2,
    habitableZoneAU: [1.5, 3.0],
    planetBodyRange: [2, 8],
    rarity: 0.006,
    notes: 'Lifespan may be too short for complex life. Strong UV.',
    exotic: false,
  },
  F: {
    label: 'F',
    description: 'Yellow-white star',
    color: '#F8F7FF',
    tempK: [6000, 7500],
    massRange: [1.04, 1.4],
    luminosityRange: [1.5, 5],
    lifespan: 7,
    habitableZoneAU: [1.1, 1.9],
    planetBodyRange: [3, 10],
    rarity: 0.03,
    notes: 'Good candidate for life-bearing worlds. Slightly high UV.',
    exotic: false,
  },
  G: {
    label: 'G',
    description: 'Yellow star (Sol-type)',
    color: '#FFF4EA',
    tempK: [5200, 6000],
    massRange: [0.8, 1.04],
    luminosityRange: [0.6, 1.5],
    lifespan: 10,
    habitableZoneAU: [0.85, 1.4],
    planetBodyRange: [4, 12],
    rarity: 0.076,
    notes: 'Optimal for life. Long stable lifespan. Sol is G2V.',
    exotic: false,
  },
  K: {
    label: 'K',
    description: 'Orange dwarf',
    color: '#FFD2A1',
    tempK: [3700, 5200],
    massRange: [0.45, 0.8],
    luminosityRange: [0.08, 0.6],
    lifespan: 20,
    habitableZoneAU: [0.4, 0.85],
    planetBodyRange: [3, 10],
    rarity: 0.121,
    notes: 'Excellent for life. Longer lifespan than Sol. Lower UV.',
    exotic: false,
  },
  M: {
    label: 'M',
    description: 'Red dwarf',
    color: '#FF9C71',
    tempK: [2400, 3700],
    massRange: [0.08, 0.45],
    luminosityRange: [0.001, 0.08],
    lifespan: 50,
    habitableZoneAU: [0.1, 0.4],
    planetBodyRange: [2, 8],
    rarity: 0.765,
    notes: 'Most common star type. HZ worlds likely tidally locked. Flare activity concern.',
    exotic: false,
  },
  // ── EXOTIC TYPES ──────────────────────────────────────────────────────────
  WD: {
    label: 'WD',
    description: 'White dwarf',
    color: '#E8F4FF',
    tempK: [5000, 80000],
    massRange: [0.5, 1.4],
    luminosityRange: [0.0001, 0.1],
    lifespan: 100,
    habitableZoneAU: [0.005, 0.02],
    planetBodyRange: [0, 4],
    rarity: 0.05,
    notes: 'Remnant of a dead star. HZ extremely close. Surviving worlds possible.',
    exotic: true,
  },
  NS: {
    label: 'NS',
    description: 'Neutron star',
    color: '#B0E0FF',
    tempK: [100000, 1000000],
    massRange: [1.1, 2.5],
    luminosityRange: [0.00001, 0.001],
    lifespan: 100,
    habitableZoneAU: null,
    planetBodyRange: [0, 3],
    rarity: 0.005,
    notes: 'Pulsar planets possible. Intense radiation. Hostile to life.',
    exotic: true,
  },
  BD: {
    label: 'BD',
    description: 'Brown dwarf',
    color: '#8B5E3C',
    tempK: [500, 2400],
    massRange: [0.013, 0.08],
    luminosityRange: [0.000001, 0.001],
    lifespan: 100,
    habitableZoneAU: null,
    planetBodyRange: [1, 6],
    rarity: 0.06,
    notes: 'Failed star. No fusion. Possible rogue-planet-like worlds.',
    exotic: true,
  },
};

// ─── HABITABLE ZONE CALCULATION ───────────────────────────────────────────────
// Based on GURPS Space 4e formula: d = sqrt(L) where d is AU and L is solar luminosity
// Inner edge: 0.95 * sqrt(L), Outer edge: 1.37 * sqrt(L)
// This is the "conservative" HZ. GURPS uses slightly tighter numbers.
export function calculateHabitableZone(luminosity) {
  const inner = parseFloat((0.95 * Math.sqrt(luminosity)).toFixed(3));
  const outer = parseFloat((1.37 * Math.sqrt(luminosity)).toFixed(3));
  return { inner, outer };
}

// ─── ORBITAL ZONES ────────────────────────────────────────────────────────────
export const ORBITAL_ZONES = {
  INNER:     { label: 'Inner Zone',     description: 'Hot, rocky worlds likely' },
  HABITABLE: { label: 'Habitable Zone', description: 'Liquid water possible' },
  OUTER:     { label: 'Outer Zone',     description: 'Cold, icy, gas giants likely' },
  FRINGE:    { label: 'Fringe',         description: 'Distant, frigid, or captured bodies' },
};

// ─── WORLD TYPE PROBABILITY BY ZONE ───────────────────────────────────────────
// Weighted probability tables. Array entries: [worldType, weight]
export const WORLD_TYPE_BY_ZONE = {
  INNER: [
    ['Terrestrial',   30],
    ['Desert',        25],
    ['Chthonian',     15],
    ['Coreless',      10],
    ['Ice Planet',     5], // rare but possible via migration
    ['Asteroid Belt',  15],
  ],
  HABITABLE: [
    ['Terrestrial',   30],
    ['Ocean Planet',  20],
    ['Desert',        15],
    ['Ice Planet',    10],
    ['Hycean',        10],
    ['Gas Dwarf',      5],
    ['Double Planet',  5],
    ['Asteroid Belt',  5],
  ],
  OUTER: [
    ['Gas Giant',     30],
    ['Ice Giant',     25],
    ['Ice Planet',    20],
    ['Gas Dwarf',     10],
    ['Asteroid Belt', 10],
    ['Ocean Planet',   5],
  ],
  FRINGE: [
    ['Ice Planet',    35],
    ['Ice Giant',     25],
    ['Asteroid Belt', 20],
    ['Gas Giant',     10],
    ['Rogue/Captured', 10],
  ],
};

// ─── WORLD TYPE DEFINITIONS ───────────────────────────────────────────────────
export const WORLD_TYPES = {
  'Terrestrial': {
    description: 'Rocky, solid-surface world',
    canSupportLife: true,
    atmosphereTypes: ['None', 'Trace', 'Thin', 'Standard', 'Dense', 'Exotic'],
    atmosphereWeights: [5, 10, 20, 40, 20, 5],
    gravityRange: [0.3, 1.8],
    hydrosphereTypes: ['Arid (0-5%)', 'Dry (5-30%)', 'Moderate (30-70%)', 'Wet (70-90%)', 'Oceanic (90-100%)'],
    hydrosphereWeights: [15, 20, 35, 20, 10],
    icon: '🌍',
  },
  'Ocean Planet': {
    description: 'Global ocean, no exposed land',
    canSupportLife: true,
    atmosphereTypes: ['Trace', 'Thin', 'Standard', 'Dense'],
    atmosphereWeights: [10, 20, 50, 20],
    gravityRange: [0.5, 2.0],
    hydrosphereTypes: ['Global Ocean (100%)'],
    hydrosphereWeights: [100],
    icon: '🌊',
  },
  'Desert': {
    description: 'Arid rocky world, minimal water',
    canSupportLife: true,
    atmosphereTypes: ['None', 'Trace', 'Thin', 'Standard'],
    atmosphereWeights: [20, 30, 30, 20],
    gravityRange: [0.3, 1.5],
    hydrosphereTypes: ['Arid (0-5%)', 'Dry (5-20%)'],
    hydrosphereWeights: [70, 30],
    icon: '🏜️',
  },
  'Ice Planet': {
    description: 'Frozen world, possible subsurface ocean',
    canSupportLife: true, // subsurface ocean possibility
    atmosphereTypes: ['None', 'Trace', 'Thin'],
    atmosphereWeights: [40, 40, 20],
    gravityRange: [0.1, 1.2],
    hydrosphereTypes: ['Ice Cap', 'Ice Sheet', 'Subsurface Ocean'],
    hydrosphereWeights: [40, 40, 20],
    icon: '❄️',
  },
  'Hycean': {
    description: 'Warm ocean under thick hydrogen atmosphere',
    canSupportLife: true,
    atmosphereTypes: ['Hydrogen-rich'],
    atmosphereWeights: [100],
    gravityRange: [0.5, 2.5],
    hydrosphereTypes: ['Global Ocean (100%)'],
    hydrosphereWeights: [100],
    icon: '💧',
  },
  'Gas Giant': {
    description: 'Massive gas world, possible moon life',
    canSupportLife: false, // moons handled separately
    atmosphereTypes: ['Hydrogen/Helium'],
    atmosphereWeights: [100],
    gravityRange: [1.0, 25.0],
    hydrosphereTypes: ['N/A'],
    hydrosphereWeights: [100],
    moonRange: [1, 12],
    icon: '🪐',
  },
  'Ice Giant': {
    description: 'Ice and rock giant (Neptune-type)',
    canSupportLife: false,
    atmosphereTypes: ['Methane/Ammonia'],
    atmosphereWeights: [100],
    gravityRange: [0.8, 2.0],
    hydrosphereTypes: ['Icy Mantle'],
    hydrosphereWeights: [100],
    moonRange: [1, 8],
    icon: '🔵',
  },
  'Gas Dwarf': {
    description: 'Small gas world, sub-Neptune',
    canSupportLife: false,
    atmosphereTypes: ['Hydrogen/Helium', 'Steam'],
    atmosphereWeights: [70, 30],
    gravityRange: [0.5, 3.0],
    hydrosphereTypes: ['N/A'],
    hydrosphereWeights: [100],
    moonRange: [0, 4],
    icon: '⚪',
  },
  'Chthonian': {
    description: 'Stripped gas giant core, molten rock',
    canSupportLife: false,
    atmosphereTypes: ['None', 'Trace'],
    atmosphereWeights: [60, 40],
    gravityRange: [1.0, 5.0],
    hydrosphereTypes: ['Lava Fields'],
    hydrosphereWeights: [100],
    icon: '🔴',
  },
  'Double Planet': {
    description: 'Twin terrestrial bodies orbiting each other',
    canSupportLife: true,
    atmosphereTypes: ['None', 'Trace', 'Thin', 'Standard', 'Dense'],
    atmosphereWeights: [10, 15, 25, 35, 15],
    gravityRange: [0.4, 1.5],
    hydrosphereTypes: ['Arid (0-5%)', 'Dry (5-30%)', 'Moderate (30-70%)', 'Wet (70-90%)'],
    hydrosphereWeights: [20, 25, 35, 20],
    icon: '⚫',
  },
  'Asteroid Belt': {
    description: 'Dense field of rocky/metallic debris',
    canSupportLife: false,
    atmosphereTypes: ['N/A'],
    atmosphereWeights: [100],
    gravityRange: [0, 0],
    hydrosphereTypes: ['N/A'],
    hydrosphereWeights: [100],
    icon: '⭕',
  },
  'Pulsar Planet': {
    description: 'World orbiting a neutron star',
    canSupportLife: false,
    atmosphereTypes: ['None', 'Exotic'],
    atmosphereWeights: [70, 30],
    gravityRange: [0.5, 3.0],
    hydrosphereTypes: ['None'],
    hydrosphereWeights: [100],
    icon: '💫',
  },
  'Coreless': {
    description: 'Rocky world with no iron core',
    canSupportLife: false, // no magnetic field
    atmosphereTypes: ['None', 'Trace'],
    atmosphereWeights: [70, 30],
    gravityRange: [0.3, 1.2],
    hydrosphereTypes: ['None', 'Arid (0-5%)'],
    hydrosphereWeights: [80, 20],
    icon: '⬜',
  },
  'Rogue/Captured': {
    description: 'Captured interstellar body or rogue planet',
    canSupportLife: false,
    atmosphereTypes: ['None', 'Trace', 'Exotic'],
    atmosphereWeights: [60, 30, 10],
    gravityRange: [0.1, 2.0],
    hydrosphereTypes: ['None', 'Ice Sheet'],
    hydrosphereWeights: [70, 30],
    icon: '🌑',
  },
};

// ─── TEMPERATURE RANGES BY WORLD TYPE + ZONE ─────────────────────────────────
export function estimateTemperature(worldType, zone, luminosity) {
  // Simplified Stefan-Boltzmann approximation
  // Returns average surface temp in Celsius
  const baseByZone = {
    INNER: 200,
    HABITABLE: 15,
    OUTER: -80,
    FRINGE: -180,
  };
  const modByType = {
    'Desert':      +30,
    'Ocean Planet': -10,
    'Ice Planet':   -60,
    'Hycean':      +20,
    'Chthonian':   +400,
    'Gas Giant':   -100,
    'Ice Giant':   -150,
    'default':     0,
  };
  const base = baseByZone[zone] || 0;
  const mod  = modByType[worldType] ?? modByType['default'];
  const lumoMod = Math.log10(luminosity || 1) * 15;
  return Math.round(base + mod + lumoMod);
}

// ─── HAZARD TABLES ────────────────────────────────────────────────────────────
export const WORLD_HAZARDS = {
  'Terrestrial':   ['Seismic activity', 'Volcanic regions', 'Severe storms', 'Toxic atmosphere pockets', 'None'],
  'Ocean Planet':  ['Crushing pressure zones', 'Megastorms', 'Rogue waves', 'Bioluminescent predators (if life)', 'None'],
  'Desert':        ['Extreme temperature swings', 'Dust storms', 'Solar flare exposure', 'Subsurface voids', 'None'],
  'Ice Planet':    ['Cryovolcanism', 'Ice shelf collapse', 'Subsurface pressure vents', 'None'],
  'Hycean':        ['Crushing atmosphere', 'Hydrogen fire risk', 'Unknown deep-ocean conditions', 'None'],
  'Gas Giant':     ['Radiation belts', 'Crushing pressure', 'Lightning storms', 'Magnetic field interference'],
  'Ice Giant':     ['Methane ice storms', 'Radiation', 'Extreme cold'],
  'Chthonian':     ['Extreme heat', 'Lava flows', 'No atmosphere', 'Radiation'],
  'Double Planet': ['Tidal stress', 'Magnetic field interference', 'Unstable orbits', 'None'],
  'Asteroid Belt': ['Collision risk', 'Microgravity', 'Radiation exposure'],
  'default':       ['Unusual radiation', 'Unknown hazards', 'None'],
};

// ─── MOON GENERATION ─────────────────────────────────────────────────────────
export const MOON_TYPES = [
  {
    type:           'Rocky',
    weight:         25,
    canSupportLife: false,
    description:    'Barren rock, no atmosphere, heavy cratering',
  },
  {
    type:           'Icy',
    weight:         20,
    canSupportLife: false,
    description:    'Ice-covered surface, no significant internal heat',
  },
  {
    type:           'Subsurface Ocean',
    weight:         15,
    canSupportLife: true,
    lifeNote:       'Liquid water ocean beneath ice shell, tidal heating from parent body. Europa analog.',
    description:    'Ice shell over global liquid ocean, tidal flexing from gas giant gravity',
  },
  {
    type:           'Cryovolcanic',
    weight:         12,
    canSupportLife: true,
    lifeNote:       'Active geysers venting water vapor and organics. Enceladus analog — confirmed complex chemistry.',
    description:    'Active geysers, water-vapor plumes, organic chemistry detected in ejecta',
  },
  {
    type:           'Volcanic',
    weight:         10,
    canSupportLife: false,
    description:    'Intense tidal heating causes surface volcanism, hostile to life. Io analog.',
  },
  {
    type:           'Terrestrial',
    weight:         10,
    canSupportLife: true,
    lifeNote:       'Large enough to retain atmosphere and liquid water under favorable conditions.',
    description:    'Substantial rocky body with thin atmosphere, possible surface water',
  },
  {
    type:           'Thin Atmosphere',
    weight:         8,
    canSupportLife: false,
    description:    'Tenuous atmosphere of nitrogen or methane, surface too cold for liquid water. Titan analog.',
  },
];

// ─── INTERSTELLAR NEIGHBORHOOD ───────────────────────────────────────────────
export const NEIGHBORHOOD_DENSITY = [
  { label: 'Sparse',   description: 'Few nearby stars, wide spacing',      nearbyStarRange: [1, 4],  travelModifier: 1.5  },
  { label: 'Moderate', description: 'Typical stellar neighborhood',        nearbyStarRange: [3, 8],  travelModifier: 1.0  },
  { label: 'Dense',    description: 'Star cluster or galactic core region', nearbyStarRange: [6, 15], travelModifier: 0.6  },
  { label: 'Cluster',  description: 'Open or globular cluster member',     nearbyStarRange: [10, 30], travelModifier: 0.3 },
];

export const DISTANCE_RANGES = {
  'Sparse':   [2.5, 15],   // light years to nearest neighbor
  'Moderate': [1.0, 8],
  'Dense':    [0.3, 3],
  'Cluster':  [0.1, 1.5],
};

// ─── SPECIES GENERATION ───────────────────────────────────────────────────────
export const BIOLOGICAL_ORIGINS = [
  { label: 'Carbon-based',    description: 'Standard biochemistry, water solvent',        weight: 70 },
  { label: 'Carbon/Ammonia',  description: 'Carbon chemistry, ammonia solvent',           weight: 10 },
  { label: 'Silicon-based',   description: 'Silicon backbone, high-temp chemistry',       weight: 8  },
  { label: 'Sulfur-based',    description: 'Chemosynthetic origin, volcanic environments',weight: 7  },
  { label: 'Exotic',          description: 'Unknown or highly unusual biochemistry',      weight: 5  },
];

export const BODY_PLANS = [
  { label: 'Bilateral',  description: 'Left-right symmetry, common locomotion', weight: 45 },
  { label: 'Radial',     description: 'Circular symmetry, multiple limb axes',  weight: 20 },
  { label: 'Asymmetric', description: 'No fixed symmetry pattern',              weight: 15 },
  { label: 'Modular',    description: 'Colony organism or segmented structure',  weight: 12 },
  { label: 'Exotic',     description: 'Non-standard, possibly energy-based',    weight: 8  },
];

export const PRIMARY_SENSES = [
  { label: 'Vision (light)',        description: 'Primary sense is electromagnetic light',    weight: 35 },
  { label: 'Echolocation',          description: 'Primary sense is sound reflection',         weight: 20 },
  { label: 'Chemoreception',        description: 'Primary sense is chemical detection',       weight: 15 },
  { label: 'Electromagnetic',       description: 'Primary sense is EM field detection',       weight: 10 },
  { label: 'Thermoreception',       description: 'Primary sense is heat/infrared',            weight: 8  },
  { label: 'Mechanoreception',      description: 'Primary sense is vibration/pressure',       weight: 7  },
  { label: 'Exotic/Psionic',        description: 'Unusual or unknown sensory mechanism',      weight: 5  },
];

export const SOCIAL_STRUCTURES = [
  { label: 'Solitary',    description: 'Minimal social bonding, territorial',       weight: 10 },
  { label: 'Pair-bonded', description: 'Strong pair bonds, small family units',     weight: 20 },
  { label: 'Pack',        description: 'Small cooperative groups, hierarchy',       weight: 25 },
  { label: 'Tribal',      description: 'Larger kinship groups, cultural identity',  weight: 25 },
  { label: 'Hive',        description: 'Eusocial, collective decision-making',      weight: 10 },
  { label: 'Networked',   description: 'Distributed intelligence, no clear center', weight: 10 },
];

export const TECH_LEVELS = [
  { label: 'Pre-Sapient',   description: 'Tool use emerging, no language',                  weight: 5  },
  { label: 'Primitive',     description: 'Stone/bone tools, oral tradition',                weight: 15 },
  { label: 'Developing',    description: 'Metalworking, agriculture, written language',     weight: 20 },
  { label: 'Industrial',    description: 'Combustion, electricity, early computing',        weight: 20 },
  { label: 'Advanced',      description: 'Space-capable, digital civilization',             weight: 20 },
  { label: 'Stellar',       description: 'FTL or near-FTL, multi-system presence',         weight: 10 },
  { label: 'Post-Scarcity', description: 'Beyond conventional resource limitations',       weight: 7  },
  { label: 'Transcendent',  description: 'Technology indistinguishable from nature',       weight: 3  },
];

export const DISPOSITIONS = [
  { label: 'Openly Hostile',    description: 'Aggressive toward outsiders by default',       weight: 10 },
  { label: 'Suspicious',        description: 'Wary, slow to trust, defensive posture',       weight: 20 },
  { label: 'Neutral',           description: 'Transactional, neither welcoming nor hostile',  weight: 25 },
  { label: 'Cautiously Open',   description: 'Willing to engage, trust must be earned',      weight: 25 },
  { label: 'Welcoming',         description: 'Generally positive toward outsiders',          weight: 15 },
  { label: 'Absorbed/Isolated', description: 'Internal focus, indifferent to outsiders',     weight: 5  },
];

export const DISTINCTIVE_TRAITS = [
  'Hivemind communication',
  'Bioluminescent signaling',
  'Distributed nervous system',
  'Multi-generational memory',
  'Exoskeletal armor',
  'Symbiotic with native flora',
  'No fixed gender',
  'Metamorphic life stages',
  'Subsonic communication',
  'Magnetic field navigation',
  'Communal dreaming',
  'Extreme longevity',
  'Rapid regeneration',
  'Photosynthetic supplementation',
  'Electroreceptive skin',
  'Gestalt consciousness under stress',
  'Chemically-based language',
  'Cryogenic hibernation cycles',
  'Electromagnetic manipulation',
  'Collective memory storage',
  'Radiotrophic metabolism',
  'Crystalline exoskeleton',
  'Vacuum-tolerant biology',
  'Temporal perception (slow or fast)',
];

// ─── COMET DATA ───────────────────────────────────────────────────────────────
export const COMET_COUNTS = [[0, 35], [1, 25], [2, 20], [3, 12], [4, 5], [5, 3]];

export const COMET_COMPOSITIONS = [
  { label: 'Icy',          description: 'Water ice, carbon dioxide, ammonia — typical long-period comet',    weight: 45 },
  { label: 'Rocky-Icy',    description: 'Mixed silicate and volatile composition',                           weight: 30 },
  { label: 'Metallic',     description: 'High metal content, dense nucleus, possible captured asteroid',     weight: 10 },
  { label: 'Carbon-rich',  description: 'Organic compounds dominant, dark surface albedo',                   weight: 10 },
  { label: 'Exotic',       description: 'Unusual composition — possible interstellar origin',                 weight: 5  },
];

export const COMET_ORBITAL_PERIODS = [
  { label: 'Short-period',  range: [3, 20],    description: 'Frequent inner-system passage, likely Jupiter-family' },
  { label: 'Medium-period', range: [20, 200],  description: 'Periodic visitor, visible every few generations'     },
  { label: 'Long-period',   range: [200, 2000],description: 'Rare apparition, originates in outer cloud'          },
];

// ─── NEIGHBORHOOD EXOTIC OBJECTS ─────────────────────────────────────────────
// These appear in the neighborhood alongside regular stars
// navigable: true = can be explored like a star system
// navigable: false = descriptive panel only
export const NEIGHBORHOOD_EXOTIC_TYPES = [
  {
    type:        'Nebula',
    navigable:   false,
    icon:        '☁',
    color:       '#CC99FF',
    weight:      12,
    subtypes: [
      { label: 'Emission Nebula',    description: 'Ionized gas glowing from nearby hot stars. Reds and pinks dominate.',          color: '#FF6B8A' },
      { label: 'Reflection Nebula',  description: 'Dust cloud reflecting starlight. Blue-white, diffuse.',                        color: '#88BBFF' },
      { label: 'Dark Nebula',        description: 'Dense dust cloud blocking background stars. An absence more than a presence.',  color: '#445566' },
      { label: 'Protostellar Nebula',description: 'Active star-forming region. Embedded protostars detectable in infrared.',      color: '#FFAA44' },
      { label: 'Planetary Nebula',   description: 'Ejected shell of a dying star. Concentric rings around a white dwarf remnant.',color: '#88FFCC' },
    ],
    sizeRange:   [1, 100],  // light years diameter
    notes:       'Not navigable — no stellar body to orbit. Rich in complex molecules.',
  },
  {
    type:        'Rogue Planet',
    navigable:   true,
    icon:        '⬛',
    color:       '#6688AA',
    weight:      8,
    description: 'Planetary mass object unbound to any star. Drifting through interstellar space.',
    notes:       'No solar energy. Surface temperature near absolute zero. Possible subsurface ocean from residual geothermal heat and radioactive decay.',
  },
  {
    type:        'Black Hole',
    navigable:   false,
    icon:        '◉',
    color:       '#8866CC',
    weight:      3,
    massRange:   [3, 50],   // solar masses — stellar-mass BH
    subtypes: [
      { label: 'Quiescent',         description: 'No active accretion. Detectable only by gravitational lensing and orbital perturbation of nearby bodies.' },
      { label: 'Accreting',         description: 'Active accretion disk. X-ray source. Any orbiting bodies subject to intense radiation.' },
      { label: 'Binary with star',  description: 'Paired with a companion star. Material transfer creates periodic X-ray bursts.' },
    ],
    notes:       'Extreme gravitational hazard. Safe observation distance: several AU minimum.',
  },
];

// ─── RUINS / LOST CIVILIZATIONS ──────────────────────────────────────────────
// Rolls on habitable worlds with zero current species
export const RUINS_CHANCE = 0.28; // 28% chance on eligible worlds

export const RUINS_COLLAPSE_CAUSES = [
  { label: 'Unknown',            description: 'No clear evidence of cause. Records destroyed or indecipherable.',                                           weight: 25 },
  { label: 'War',                description: 'Widespread weapons signatures in the geological record. Possible self-inflicted extinction event.',           weight: 20 },
  { label: 'Environmental',      description: 'Climate shift or ecological collapse. Civilization outgrew its world\'s carrying capacity.',                 weight: 20 },
  { label: 'Plague',             description: 'Rapid population collapse across all sites simultaneously. Pathogenic origin suspected.',                    weight: 15 },
  { label: 'Cosmic Event',       description: 'Astronomical impact, gamma-ray burst, or stellar flare. External and sudden.',                               weight: 10 },
  { label: 'Transcendence',      description: 'No collapse — the civilization departed or transformed. Structures abandoned intact.',                       weight: 7  },
  { label: 'Assimilation',       description: 'Contact with a more advanced civilization. Cultural or biological absorption.',                              weight: 3  },
];

export const RUINS_AGE_RANGES = [
  { label: 'Recent',    range: [100, 2000],       description: 'Structures largely intact. Artifacts recoverable. May still be detectable signals.' },
  { label: 'Ancient',   range: [2000, 100000],    description: 'Significant erosion. Major structures visible. Artifacts fragmentary.'              },
  { label: 'Deep Past', range: [100000, 5000000], description: 'Only foundations and buried sites remain. Requires active archaeology.'             },
  { label: 'Primordial',range: [5000000, 500000000], description: 'Geological record only. Possible anomalous mineral deposits or isotope ratios.' },
];

export const RUINS_TECH_LEVELS = [
  { label: 'Pre-Sapient',   description: 'Primitive tool-using species. Simple shelters and middens.' },
  { label: 'Primitive',     description: 'Stone construction, burial sites, early agriculture traces.' },
  { label: 'Developing',    description: 'Metal-working, written language fragments, urban foundations.' },
  { label: 'Industrial',    description: 'Machinery remnants, road networks, energy infrastructure.' },
  { label: 'Advanced',      description: 'Electronic artifacts, orbital debris, possible data storage.' },
  { label: 'Stellar',       description: 'Evidence of interstellar travel. Off-world colony sites possible.' },
  { label: 'Post-Scarcity', description: 'Structures defy known engineering. Purpose largely unclear.' },
];

