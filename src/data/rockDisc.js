// One surface per rocky world. Painted once, then handed to the SVG as
// the body. The highlight and the limb stay vector, so the light is not
// baked into the ground. Two worlds of one type differ by their seed.
// A gas giant has its own disc and is not painted here.

const SIZE = 256;
const cache = new Map();

const GIANTS = new Set(['Gas Giant', 'Ice Giant', 'Gas Dwarf']);

function hash(x, y, seed) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + (seed | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function seedFrom(text) {
  let value = 2166136261;
  const source = String(text);
  for (let i = 0; i < source.length; i += 1) {
    value ^= source.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function channels(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  const full = raw.length === 3
    ? raw.split('').map(channel => channel + channel).join('')
    : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [140, 130, 110];
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function mix(from, to, amount) {
  const t = Math.min(1, Math.max(0, amount));
  return from.map((channel, index) => channel + (to[index] - channel) * t);
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function noise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const at = (ix, iy) => hash(ix, iy, seed);
  const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
  const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
  return a + (b - a) * ty;
}

function fbm(x, y, seed) {
  let total = 0;
  let weight = 0;
  let amplitude = 0.55;
  let frequency = 1;
  for (let octave = 0; octave < 5; octave += 1) {
    total += amplitude * noise(x * frequency, y * frequency, seed + octave * 17);
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2.05;
  }
  return total / weight;
}

function smooth(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function craters(seed, count, minR, maxR) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const angle = hash(i, 4, seed) * Math.PI * 2;
    const dist = Math.sqrt(hash(i, 8, seed)) * 0.72;
    list.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      r: minR + hash(i, 2, seed) * (maxR - minR),
    });
  }
  return list;
}

function applyCraters(rgb, nx, ny, list) {
  let next = rgb;
  for (const crater of list) {
    const ox = (nx - crater.x) / crater.r;
    const oy = (ny - crater.y) / crater.r;
    const distance = Math.hypot(ox, oy);
    if (distance > 1.08) continue;
    const facing = Math.max(0, -ox * 0.65 - oy * 0.75);
    if (distance > 0.78) {
      next = mix(next, [236, 228, 210], 0.12 + facing * 0.5);
      next = mix(next, [24, 18, 14], (1 - facing) * 0.4);
    } else {
      const floor = 1 - distance / 0.78;
      next = mix(next, [28, 24, 22], 0.22 + floor * 0.2);
      next = mix(next, [210, 200, 186], floor * floor * 0.18);
    }
  }
  return next;
}

function surface(kind, nx, ny, tint, seed) {
  const field = fbm(nx * 2.1 + 3, ny * 2.1 + 1, seed);
  const fine = fbm(nx * 7 + 11, ny * 7, seed + 5);
  if (kind === 'Desert') {
    const angle = hash(2, 6, seed) * Math.PI;
    const along = nx * Math.cos(angle) + ny * Math.sin(angle);
    const across = -nx * Math.sin(angle) + ny * Math.cos(angle);
    const warp = fbm(nx * 2.4 + 2, ny * 2.4, seed + 8) * 0.55;
    const ridge = 0.5 + 0.5 * Math.sin((along + warp) * 6.5 + across * 1.4);
    let rgb = mix([122, 74, 40], [186, 132, 74], ridge);
    rgb = mix(rgb, [228, 188, 128], smooth(0.78, 0.96, ridge) * 0.7);
    rgb = mix(rgb, [96, 62, 40], fine * 0.28);
    return mix(rgb, tint, 0.1);
  }
  if (kind === 'Ocean Planet' || kind === 'Hycean') {
    const deep = kind === 'Hycean' ? [8, 42, 52] : [8, 40, 78];
    const shallow = kind === 'Hycean' ? [24, 96, 104] : [24, 112, 150];
    let rgb = mix(deep, shallow, field);
    const cloud = smooth(0.6, 0.82, fbm(nx * 3.2 + 8, ny * 2.4, seed + 9));
    rgb = mix(rgb, [232, 238, 242], cloud * (kind === 'Hycean' ? 0.28 : 0.5));
    if (kind === 'Hycean') rgb = mix(rgb, [170, 196, 188], 0.16);
    return mix(rgb, tint, 0.08);
  }
  if (kind === 'Ice Planet') {
    let rgb = mix([150, 162, 172], [214, 222, 228], field);
    rgb = mix(rgb, [244, 248, 252], smooth(0.42, 0.78, Math.abs(ny)));
    const crack = Math.abs(fbm(nx * 6.5, ny * 6.5, seed + 3) - 0.5);
    if (crack < 0.018) rgb = mix(rgb, [64, 86, 108], (0.018 - crack) / 0.018);
    return mix(rgb, tint, 0.08);
  }
  if (kind === 'Chthonian') {
    let rgb = mix([42, 32, 30], [72, 48, 40], fine);
    const vein = Math.abs(fbm(nx * 5.5, ny * 5.5, seed) - 0.5);
    const hot = vein < 0.055 ? (0.055 - vein) / 0.055 : 0;
    rgb = mix(rgb, [210, 72, 28], hot * 0.85);
    rgb = mix(rgb, [255, 196, 120], hot * hot);
    return mix(rgb, tint, 0.1);
  }
  if (kind === 'Disintegrating' || kind === 'Pulsar Planet' || kind === 'Rogue/Captured') {
    let rgb = mix([78, 72, 66], [128, 116, 102], field);
    rgb = mix(rgb, [48, 44, 40], fine * 0.35);
    return mix(rgb, tint, 0.18);
  }
  const shore = 0.4 + hash(1, 7, seed) * 0.18;
  const land = smooth(shore - 0.06, shore + 0.06, field);
  const sea = mix([10, 46, 78], [32, 108, 142], fine);
  const ground = mix([86, 108, 58], [132, 96, 62], fbm(nx * 4, ny * 4, seed + 4));
  let rgb = mix(sea, ground, land);
  rgb = mix(rgb, [236, 242, 246], smooth(0.66, 0.86, Math.abs(ny)) * (0.35 + land * 0.65));
  const cloud = smooth(0.64, 0.84, fbm(nx * 3.6 + 4, ny * 2.8, seed + 12));
  rgb = mix(rgb, [228, 232, 236], cloud * 0.34);
  return mix(rgb, tint, 0.1);
}

/**
 * RGBA bytes for a rocky surface. Outside the disc alpha is 0.
 * @param {string} color
 * @param {string} kind
 * @param {string} [worldSeed]
 * @param {number} [size]
 * @returns {Uint8ClampedArray|null}
 */
export function rockDiscPixels(color, kind, worldSeed = '', size = SIZE) {
  if (!kind || GIANTS.has(kind)) return null;
  const seed = seedFrom(`${kind}|${color}|${worldSeed}`);
  const tint = channels(color);
  const marks = craters(
    seed,
    kind === 'Disintegrating' ? 16 : kind === 'Ice Planet' || kind === 'Desert' ? 7 : 4,
    kind === 'Ice Planet' ? 0.05 : 0.035,
    kind === 'Disintegrating' ? 0.16 : 0.09,
  );
  const pixels = new Uint8ClampedArray(size * size * 4);
  const radius = size * 0.5 - 1;
  const origin = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - origin;
      const dy = y - origin;
      const rho = Math.hypot(dx, dy) / radius;
      if (rho >= 1) continue;
      const nx = dx / radius;
      const ny = dy / radius;
      let rgb = surface(kind, nx, ny, tint, seed);
      if (kind !== 'Ocean Planet' && kind !== 'Hycean') rgb = applyCraters(rgb, nx, ny, marks);
      const grain = (noise(x / 3, y / 3, seed + 21) - 0.5) * 0.06;
      rgb = rgb.map(channel => channel * (1 + grain));
      const edge = rho > 0.97 ? (1 - rho) / 0.03 : 1;
      const index = (y * size + x) * 4;
      pixels[index] = Math.max(0, Math.min(255, Math.round(rgb[0])));
      pixels[index + 1] = Math.max(0, Math.min(255, Math.round(rgb[1])));
      pixels[index + 2] = Math.max(0, Math.min(255, Math.round(rgb[2])));
      pixels[index + 3] = Math.round(255 * edge);
    }
  }
  return pixels;
}

/**
 * PNG data URL for a rocky world's albedo. Null for a giant, and when
 * there is no canvas to paint on.
 * @param {string} color
 * @param {string} kind
 * @param {string} [worldSeed]
 * @returns {string|null}
 */
export function rockDiscUrl(color, kind, worldSeed = '') {
  if (!kind || GIANTS.has(kind) || typeof document === 'undefined') return null;
  const key = `${kind}|${color}|${worldSeed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pixels = rockDiscPixels(color, kind, worldSeed);
  if (!pixels) return null;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(SIZE, SIZE);
  image.data.set(pixels);
  context.putImageData(image, 0, 0);
  const soft = document.createElement('canvas');
  soft.width = SIZE;
  soft.height = SIZE;
  const softened = soft.getContext('2d');
  if (!softened) return null;
  softened.filter = 'blur(0.45px)';
  softened.drawImage(canvas, 0, 0);
  const url = soft.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
