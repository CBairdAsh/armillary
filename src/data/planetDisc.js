// One banded albedo per giant type and zone color. Painted once, then
// handed to the SVG as the body. The highlight, the limb, and the ring
// stay vector, so the light is not baked into the texture. Rocky worlds
// are silhouettes and have no disc.

const SIZE = 256;
const cache = new Map();

const PROFILE = {
  // Ammonia ice over ammonium hydrosulfide. Dark bands go brown.
  'Gas Giant': { bands: 6.5, contrast: 0.92, wobble: 1, haze: 0.08, shadow: [42, 22, 10], light: [255, 244, 214] },
  // Methane absorbs red. The deep stays blue, the haze stays pale cyan.
  'Ice Giant': { bands: 4.2, contrast: 0.48, wobble: 0.4, haze: 0.34, shadow: [10, 36, 48], light: [226, 244, 242] },
  'Gas Dwarf': { bands: 5, contrast: 0.28, wobble: 0.3, haze: 0.16, shadow: [36, 30, 24], light: [238, 236, 228] },
};

function hash(x, y, seed) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function seedFrom(text) {
  let hashValue = 2166136261;
  const value = String(text);
  for (let i = 0; i < value.length; i += 1) {
    hashValue ^= value.charCodeAt(i);
    hashValue = Math.imul(hashValue, 16777619);
  }
  return hashValue >>> 0;
}

function channels(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  const full = raw.length === 3
    ? raw.split('').map(channel => channel + channel).join('')
    : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
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

/**
 * RGBA bytes for a banded giant. Latitude bands only. No highlight and
 * no limb, so the SVG can light the sphere. Outside the disc alpha is 0.
 * @param {string} color
 * @param {string} kind
 * @param {number} [size]
 * @returns {Uint8ClampedArray|null}
 */
export function planetDiscPixels(color, kind, size = SIZE) {
  const profile = PROFILE[kind];
  const base = channels(color);
  if (!profile || !base) return null;
  const seed = seedFrom(`${kind}|${color}`);
  const pixels = new Uint8ClampedArray(size * size * 4);
  const radius = size * 0.5 - 1;
  const origin = (size - 1) / 2;
  const pale = mix(base, profile.light, 0.42 + profile.haze);
  const deep = mix(base, profile.shadow, 0.62);
  const hazy = mix(base, profile.light, profile.haze);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - origin;
      const dy = y - origin;
      const rho = Math.hypot(dx, dy) / radius;
      if (rho >= 1) continue;
      const lat = dy / radius;
      const drift = (noise(x / 34, y / 46, seed) - 0.5) * profile.wobble * 0.55;
      const phase = lat * profile.bands + drift;
      const stripe = Math.sin(phase * Math.PI) * 0.82
        + Math.sin(phase * 2.15 * Math.PI + 1.1) * 0.18;
      const tone = 0.5 + Math.max(-1, Math.min(1, stripe)) * 0.5 * profile.contrast;
      let rgb = mix(deep, pale, tone);
      rgb = mix(rgb, hazy, profile.haze * 0.35);
      const grain = (noise(x / 11, y / 11, seed + 23) - 0.5) * 0.07;
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
 * PNG data URL for a giant's albedo. Cached for the life of the page.
 * Null for any world that is not a banded giant, and when there is no
 * canvas to paint on.
 * @param {string} color
 * @param {string} kind
 * @returns {string|null}
 */
export function planetDiscUrl(color, kind) {
  if (!PROFILE[kind] || typeof document === 'undefined') return null;
  const key = `${kind}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pixels = planetDiscPixels(color, kind);
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
  softened.filter = 'blur(0.8px)';
  softened.drawImage(canvas, 0, 0);
  const url = soft.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
