// One photosphere per spectral class and color. Painted once, then handed
// to the SVG as the body of the star. The corona stays a vector gradient
// so the glow does not pixelate. A neutron star is a point and has no disc.

const SIZE = 256;
const cache = new Map();

const PROFILE = {
  O:  { cell: 14, contrast: 0.12, faculae: 0, core: 0.7 },
  B:  { cell: 16, contrast: 0.14, faculae: 0, core: 0.55 },
  A:  { cell: 18, contrast: 0.18, faculae: 0, core: 0.4 },
  F:  { cell: 20, contrast: 0.26, faculae: 2, core: 0.16 },
  G:  { cell: 24, contrast: 0.34, faculae: 3, core: 0.06 },
  K:  { cell: 30, contrast: 0.38, faculae: 3, core: 0.03 },
  M:  { cell: 38, contrast: 0.42, faculae: 2, core: 0 },
  WD: { cell: 8,  contrast: 0,    faculae: 0, core: 0.82 },
  BD: { cell: 34, contrast: 0.16, faculae: 0, core: 0 },
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
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [255, 244, 234];
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

function faceColor(color, spectralClass) {
  const base = channels(color);
  if (spectralClass === 'WD') return mix(base, [255, 255, 255], 0.78);
  if (spectralClass === 'BD') return mix(base, [255, 255, 255], 0.12);
  if (spectralClass === 'M' || spectralClass === 'K') return mix(base, [255, 246, 234], 0.38);
  if (spectralClass === 'O' || spectralClass === 'B' || spectralClass === 'A') return mix(base, [255, 255, 255], 0.55);
  return mix(base, [255, 250, 242], 0.46);
}

function limbColor(color, spectralClass) {
  const amount = spectralClass === 'BD' ? 0.62 : 0.5;
  return mix(channels(color), [16, 12, 10], amount);
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

/** Smooth 0..1 noise. scale is the coarse feature size in pixels. */
function mottling(px, py, scale, seed) {
  const sample = (x, y, salt) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = fade(x - x0);
    const ty = fade(y - y0);
    const at = (ix, iy) => hash(ix, iy, salt);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
  let total = 0;
  let weight = 0;
  let amplitude = 0.55;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    total += amplitude * sample((px / scale) * frequency, (py / scale) * frequency, seed + octave * 17);
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2.05;
  }
  return total / weight;
}

/**
 * RGBA bytes for one photosphere. The center is the bright face, the limb
 * falls off, and cooler stars carry larger granules. Outside the disc the
 * alpha is 0 so the vector corona can show through.
 * @param {string} color
 * @param {string} spectralClass
 * @param {number} [size]
 * @returns {Uint8ClampedArray|null}
 */
export function starDiscPixels(color, spectralClass, size = SIZE) {
  if (spectralClass === 'NS') return null;
  const profile = PROFILE[spectralClass] || PROFILE.G;
  const face = faceColor(color, spectralClass);
  const limb = limbColor(color, spectralClass);
  const seed = seedFrom(`${spectralClass}|${color}`);
  const pixels = new Uint8ClampedArray(size * size * 4);
  const radius = size * 0.5 - 1;
  const origin = (size - 1) / 2;
  const spots = [];
  for (let i = 0; i < profile.faculae; i += 1) {
    const angle = hash(i, 3, seed) * Math.PI * 2;
    const dist = (0.62 + hash(i, 9, seed) * 0.3) * radius;
    spots.push({
      x: origin + Math.cos(angle) * dist,
      y: origin + Math.sin(angle) * dist,
        r: radius * (0.07 + hash(i, 5, seed) * 0.04),
    });
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - origin;
      const dy = y - origin;
      const rho = Math.hypot(dx, dy) / radius;
      const index = (y * size + x) * 4;
      if (rho >= 1) continue;
      const mu = Math.sqrt(Math.max(0, 1 - rho * rho));
      const light = mu ** 0.8;
      let rgb = mix(limb, face, light);
      if (profile.core) rgb = mix(rgb, [255, 255, 255], profile.core * mu ** 3);
      if (profile.contrast) {
        const delta = (mottling(x, y, profile.cell, seed) - 0.5) * profile.contrast;
        rgb = rgb.map(channel => channel * (1 + delta));
      }
      for (const spot of spots) {
        const d = Math.hypot(x - spot.x, y - spot.y) / spot.r;
        if (d < 1 && mu < 0.75) {
          const lift = (1 - d * d) * (1 - mu) * 0.28;
          rgb = rgb.map(channel => channel + (Math.min(255, channel + 36) - channel) * lift);
        }
      }
      const edge = rho > 0.96 ? (1 - rho) / 0.04 : 1;
      pixels[index] = Math.max(0, Math.min(255, Math.round(rgb[0])));
      pixels[index + 1] = Math.max(0, Math.min(255, Math.round(rgb[1])));
      pixels[index + 2] = Math.max(0, Math.min(255, Math.round(rgb[2])));
      pixels[index + 3] = Math.round(255 * edge);
    }
  }
  return pixels;
}

/**
 * PNG data URL for the photosphere. Cached for the life of the page.
 * Null for a neutron star, and when there is no canvas to paint on.
 * @param {string} color
 * @param {string} spectralClass
 * @returns {string|null}
 */
export function starDiscUrl(color, spectralClass) {
  if (spectralClass === 'NS' || typeof document === 'undefined') return null;
  const key = `${spectralClass}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pixels = starDiscPixels(color, spectralClass);
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
  softened.filter = 'blur(1.4px)';
  softened.drawImage(canvas, 0, 0);
  const url = soft.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
