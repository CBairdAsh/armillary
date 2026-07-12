// Seeded PRNG for reproducible system generation (mulberry32)

let activeRng = null;

function hashSeedString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getRandom() {
  return activeRng ? activeRng() : Math.random();
}

export function runWithSeed(seed, fn) {
  const rng = mulberry32(hashSeedString(String(seed)));
  const prev = activeRng;
  activeRng = rng;
  try {
    return fn();
  } finally {
    activeRng = prev;
  }
}

const SEED_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateRandomSeed(length = 10) {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)];
  }
  return s;
}

export function buildSeedShareUrl(seed, starCount, baseUrl = window.location.origin + window.location.pathname) {
  const params = new URLSearchParams();
  params.set('seed', seed);
  if (starCount && starCount !== 1) params.set('stars', String(starCount));
  return `${baseUrl}?${params.toString()}`;
}
