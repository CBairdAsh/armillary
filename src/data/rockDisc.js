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

function craterPalette(kind, facet) {
  if (kind === 'Coreless') {
    return {
      rim: [214, 206, 184], shade: [28, 36, 24], floor: [34, 48, 30], ejecta: [168, 178, 132],
      rimStrength: 0.06, rimFacing: 0.22, shadeStrength: 0.55,
      floorBase: 0.42, floorSpan: 0.34, ejectaStrength: 0.08,
    };
  }
  if (kind === 'Disintegrating') {
    // Pits open hotter rock. The rim is silicate dust, not bright ejecta.
    return {
      rim: [150, 104, 68], shade: [28, 14, 10], floor: [176, 52, 20], ejecta: [206, 156, 98],
      glow: [255, 188, 112],
      rimStrength: 0.18, rimFacing: 0.26, shadeStrength: 0.32,
      floorBase: 0.38, floorSpan: 0.48, ejectaStrength: 0.2,
    };
  }
  if (kind === 'Pulsar Planet') {
    // Impacts glass over. Rims stay dark. Almost no bright throw.
    return {
      rim: [52, 60, 70], shade: [6, 8, 12], floor: [14, 16, 22], ejecta: [40, 46, 54],
      rimStrength: 0.05, rimFacing: 0.1, shadeStrength: 0.5,
      floorBase: 0.16, floorSpan: 0.1, ejectaStrength: 0.04,
    };
  }
  if (kind === 'Rogue/Captured' && facet === 'ice') {
    return {
      rim: [214, 220, 226], shade: [46, 54, 64], floor: [92, 104, 114], ejecta: [176, 186, 194],
      rimStrength: 0.1, rimFacing: 0.34, shadeStrength: 0.4,
      floorBase: 0.18, floorSpan: 0.16, ejectaStrength: 0.12,
    };
  }
  if (kind === 'Rogue/Captured') {
    return {
      rim: [104, 64, 46], shade: [18, 12, 12], floor: [34, 22, 18], ejecta: [126, 74, 50],
      rimStrength: 0.12, rimFacing: 0.28, shadeStrength: 0.42,
      floorBase: 0.26, floorSpan: 0.2, ejectaStrength: 0.1,
    };
  }
  if (kind === 'Rocky') {
    return {
      rim: [176, 168, 156], shade: [36, 32, 28], floor: [58, 52, 46], ejecta: [148, 140, 128],
      rimStrength: 0.16, rimFacing: 0.42, shadeStrength: 0.48,
      floorBase: 0.3, floorSpan: 0.24, ejectaStrength: 0.16,
    };
  }
  if (kind === 'Icy' || kind === 'Subsurface Ocean' || kind === 'Cryovolcanic') {
    return {
      rim: [236, 242, 246], shade: [86, 108, 122], floor: [146, 166, 178], ejecta: [220, 230, 236],
      rimStrength: 0.1, rimFacing: 0.28, shadeStrength: 0.35,
      floorBase: 0.16, floorSpan: 0.12, ejectaStrength: 0.1,
    };
  }
  return {
    rim: [236, 228, 210], shade: [24, 18, 14], floor: [28, 24, 22], ejecta: [210, 200, 186],
    rimStrength: 0.12, rimFacing: 0.5, shadeStrength: 0.4,
    floorBase: 0.22, floorSpan: 0.2, ejectaStrength: 0.18,
  };
}

function applyCraters(rgb, nx, ny, list, kind, facet) {
  const paint = craterPalette(kind, facet);
  let next = rgb;
  for (const crater of list) {
    const ox = (nx - crater.x) / crater.r;
    const oy = (ny - crater.y) / crater.r;
    const distance = Math.hypot(ox, oy);
    if (distance > 1.08) continue;
    const facing = Math.max(0, -ox * 0.65 - oy * 0.75);
    if (distance > 0.78) {
      next = mix(next, paint.rim, paint.rimStrength + facing * paint.rimFacing);
      next = mix(next, paint.shade, (1 - facing) * paint.shadeStrength);
    } else {
      const floor = 1 - distance / 0.78;
      next = mix(next, paint.floor, paint.floorBase + floor * paint.floorSpan);
      next = mix(next, paint.ejecta, floor * floor * paint.ejectaStrength);
      if (paint.glow) next = mix(next, paint.glow, floor * floor * 0.7);
    }
  }
  return next;
}

function hotBasin(nx, ny, seed, slot, radius) {
  const bx = (hash(slot, 3, seed) - 0.5) * 1.05;
  const by = (hash(slot, 7, seed) - 0.5) * 1.05;
  if (bx * bx + by * by > 0.62) return 0;
  return Math.max(0, 1 - Math.hypot(nx - bx, ny - by) / radius);
}

function surface(kind, nx, ny, tint, seed, facet) {
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
  if (kind === 'Coreless') {
    // Iron stayed in the silicates, so this is mantle the whole way down.
    // Pale crust on the high ground. Impacts open the olivine under it.
    const relief = fbm(nx * 1.7 + 1.4, ny * 1.7, seed + 3);
    const crust = smooth(0.44, 0.68, relief);
    const stone = mix([46, 60, 38], [104, 116, 64], fine);
    const highlands = mix([148, 140, 124], [190, 182, 164], fine);
    let rgb = mix(stone, highlands, crust * 0.8);
    const basin = 1 - smooth(0.2, 0.42, relief);
    rgb = mix(rgb, [28, 40, 26], basin * 0.72);
    return mix(rgb, tint, 0.12);
  }
  if (kind === 'Chthonian') {
    let rgb = mix([42, 32, 30], [72, 48, 40], fine);
    const vein = Math.abs(fbm(nx * 5.5, ny * 5.5, seed) - 0.5);
    const hot = vein < 0.055 ? (0.055 - vein) / 0.055 : 0;
    rgb = mix(rgb, [210, 72, 28], hot * 0.85);
    rgb = mix(rgb, [255, 196, 120], hot * hot);
    return mix(rgb, tint, 0.1);
  }
  if (kind === 'Disintegrating') {
    // Ablating crust. The heat is in the pits. The high ground is dust.
    let rgb = mix([52, 32, 26], [102, 64, 44], field);
    const dust = smooth(0.52, 0.8, fbm(nx * 2.2, ny * 2.2, seed + 6));
    rgb = mix(rgb, [176, 138, 98], dust * 0.62);
    const crack = Math.abs(fbm(nx * 6.4, ny * 6.4, seed + 2) - 0.5);
    const seam = crack < 0.014 ? (0.014 - crack) / 0.014 : 0;
    rgb = mix(rgb, [196, 68, 26], seam * 0.7);
    const basin = Math.max(
      hotBasin(nx, ny, seed, 1, 0.2),
      hotBasin(nx, ny, seed, 2, 0.14),
    );
    rgb = mix(rgb, [168, 48, 18], smooth(0.15, 0.7, basin));
    rgb = mix(rgb, [255, 176, 96], basin * basin * 0.85);
    return mix(rgb, tint, 0.06);
  }
  if (kind === 'Pulsar Planet') {
    // The air is gone. Particle flux fused the crust into a dark glass.
    const sheet = fbm(nx * 1.15 + 0.6, ny * 1.15, seed + 2);
    let rgb = mix([8, 10, 14], [30, 34, 42], sheet);
    const glaze = smooth(0.46, 0.74, fbm(nx * 2.2 + 4, ny * 1.8, seed + 8));
    rgb = mix(rgb, [58, 72, 88], glaze * 0.5);
    const sheen = Math.max(0, 1 - Math.hypot(nx + 0.22, ny + 0.28) / 0.5);
    rgb = mix(rgb, [118, 136, 154], sheen * sheen * 0.62);
    const pit = 1 - smooth(0.16, 0.34, fbm(nx * 2.8, ny * 2.8, seed + 5));
    rgb = mix(rgb, [3, 4, 6], pit * 0.75);
    return mix(rgb, tint, 0.04);
  }
  if (kind === 'Rocky') {
    // No air and no water. Dark plains, bright cratered highlands.
    const relief = fbm(nx * 1.5 + 0.8, ny * 1.5, seed + 2);
    let rgb = mix([78, 72, 64], [142, 134, 122], fine);
    const mare = smooth(0.48, 0.7, relief);
    rgb = mix(rgb, [52, 48, 44], mare * 0.75);
    rgb = mix(rgb, [168, 160, 148], (1 - mare) * smooth(0.55, 0.8, fine) * 0.45);
    return mix(rgb, tint, 0.08);
  }
  if (kind === 'Icy') {
    // Cold ice, no heat to resurface it. Craters stay.
    let rgb = mix([176, 190, 198], [232, 238, 242], field);
    rgb = mix(rgb, [248, 250, 252], smooth(0.5, 0.8, fine) * 0.35);
    const crack = Math.abs(fbm(nx * 5.5, ny * 5.5, seed + 3) - 0.5);
    if (crack < 0.016) rgb = mix(rgb, [90, 112, 126], (0.016 - crack) / 0.016);
    return mix(rgb, tint, 0.06);
  }
  if (kind === 'Subsurface Ocean') {
    // An ice shell over water. The long stains are where the shell has pulled apart.
    let rgb = mix([176, 194, 204], [230, 238, 242], field);
    const warp = fbm(nx * 1.2, ny * 1.2, seed + 2);
    const bands = [-0.28, 0.08, 0.42].map((offset, index) => {
      const tilt = (hash(index, 9, seed) - 0.5) * 1.1;
      const coord = nx * Math.cos(tilt) + ny * Math.sin(tilt) + (warp - 0.5) * 0.4;
      const dist = Math.abs(coord - offset);
      return dist < 0.05 ? (0.05 - dist) / 0.05 : 0;
    });
    rgb = mix(rgb, [112, 92, 72], Math.max(...bands) * 0.8);
    return mix(rgb, tint, 0.05);
  }
  if (kind === 'Cryovolcanic') {
    // Fresh ice. The dark bands are the fractures the geysers come from.
    let rgb = mix([220, 230, 234], [250, 252, 253], fine);
    const angle = hash(2, 6, seed) * Math.PI;
    const across = -nx * Math.sin(angle) + ny * Math.cos(angle);
    const along = nx * Math.cos(angle) + ny * Math.sin(angle);
    const region = smooth(-0.15, 0.35, along) * (1 - smooth(0.55, 0.9, along));
    const band = 0.5 + 0.5 * Math.sin(across * 8);
    const stripe = band > 0.58 ? (band - 0.58) / 0.42 : 0;
    rgb = mix(rgb, [64, 84, 96], stripe * region);
    rgb = mix(rgb, [255, 255, 255], stripe * region * stripe * 0.35);
    return mix(rgb, tint, 0.04);
  }
  if (kind === 'Volcanic') {
    // Sulfur plains. The dark ground is cooled lava. A few vents are still open.
    let rgb = mix([176, 124, 42], [236, 204, 110], field);
    const flow = smooth(0.38, 0.62, fbm(nx * 1.5 + 1, ny * 1.5, seed + 2));
    rgb = mix(rgb, [42, 22, 16], flow * 0.9);
    const vent = Math.max(hotBasin(nx, ny, seed, 4, 0.12), hotBasin(nx, ny, seed, 5, 0.08));
    rgb = mix(rgb, [255, 86, 28], smooth(0.2, 0.75, vent));
    rgb = mix(rgb, [255, 210, 120], vent * vent * 0.7);
    return mix(rgb, tint, 0.06);
  }
  if (kind === 'Thin Atmosphere') {
    // Methane haze hides the ground. Titan, not a dune field.
    let rgb = mix([132, 68, 28], [214, 132, 64], field);
    rgb = mix(rgb, [236, 176, 108], 0.22 + fine * 0.12);
    const patch = smooth(0.55, 0.78, fbm(nx * 1.8, ny * 1.8, seed + 4));
    rgb = mix(rgb, [96, 48, 24], patch * 0.35);
    return mix(rgb, tint, 0.08);
  }
  if (kind === 'Rogue/Captured') {
    if (facet === 'ice') {
      // A dirty ice crust. Dark rock still shows through in broad patches.
      const cover = smooth(0.32, 0.58, fbm(nx * 1.25, ny * 1.25, seed + 1));
      const frost = mix([150, 164, 172], [222, 230, 234], fine);
      const rock = mix([46, 28, 24], [92, 52, 36], fbm(nx * 2.4, ny * 2.4, seed + 4));
      let rgb = mix(rock, frost, 0.22 + cover * 0.68);
      const crack = Math.abs(fbm(nx * 5.6, ny * 5.6, seed + 3) - 0.5);
      if (crack < 0.016) rgb = mix(rgb, [40, 50, 60], (0.016 - crack) / 0.016);
      return mix(rgb, tint, 0.06);
    }
    // Captured dark body. Tholin over gray ice and rock. Frost only in the lows.
    const relief = fbm(nx * 1.45 + 1.1, ny * 1.45, seed + 3);
    const stone = mix([32, 28, 26], [56, 46, 40], fine);
    const tholin = mix([62, 30, 24], [118, 58, 36], field);
    let rgb = mix(stone, tholin, 0.48 + field * 0.38);
    const frost = 1 - smooth(0.18, 0.36, relief);
    rgb = mix(rgb, [142, 150, 156], frost * 0.38);
    return mix(rgb, tint, 0.07);
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

function craterSpec(kind, facet) {
  if (kind === 'Disintegrating') return { count: 15, min: 0.03, max: 0.1 };
  if (kind === 'Pulsar Planet') return { count: 5, min: 0.045, max: 0.09 };
  if (kind === 'Rogue/Captured') {
    return { count: facet === 'ice' ? 6 : 8, min: 0.042, max: facet === 'ice' ? 0.1 : 0.12 };
  }
  if (kind === 'Coreless') return { count: 9, min: 0.045, max: 0.12 };
  if (kind === 'Rocky') return { count: 16, min: 0.028, max: 0.13 };
  if (kind === 'Icy') return { count: 9, min: 0.04, max: 0.11 };
  if (kind === 'Subsurface Ocean' || kind === 'Cryovolcanic') return { count: 3, min: 0.04, max: 0.08 };
  if (kind === 'Ice Planet') return { count: 7, min: 0.05, max: 0.09 };
  if (kind === 'Desert') return { count: 7, min: 0.035, max: 0.09 };
  return { count: 4, min: 0.035, max: 0.09 };
}

/**
 * RGBA bytes for a rocky surface. Outside the disc alpha is 0.
 * @param {string} color
 * @param {string} kind
 * @param {string} [worldSeed]
 * @param {number} [size]
 * @param {string} [facet] Ice-sheet rogues pass "ice". Other worlds pass "".
 * @returns {Uint8ClampedArray|null}
 */
export function rockDiscPixels(color, kind, worldSeed = '', size = SIZE, facet = '') {
  if (!kind || GIANTS.has(kind)) return null;
  const seed = seedFrom(`${kind}|${facet}|${color}|${worldSeed}`);
  const tint = channels(color);
  const spec = craterSpec(kind, facet);
  const marks = craters(seed, spec.count, spec.min, spec.max);
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
      let rgb = surface(kind, nx, ny, tint, seed, facet);
      if (kind !== 'Ocean Planet' && kind !== 'Hycean' && kind !== 'Thin Atmosphere' && kind !== 'Volcanic') {
        rgb = applyCraters(rgb, nx, ny, marks, kind, facet);
      }
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
 * @param {string} [facet] Ice-sheet rogues pass "ice". Other worlds pass "".
 * @returns {string|null}
 */
export function rockDiscUrl(color, kind, worldSeed = '', facet = '') {
  if (!kind || GIANTS.has(kind) || typeof document === 'undefined') return null;
  const key = `${kind}|${facet}|${color}|${worldSeed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pixels = rockDiscPixels(color, kind, worldSeed, SIZE, facet);
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
