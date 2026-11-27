// A face-on ring, painted once per giant and tint. The SVG tilts it and
// splits it, so the near half can cross the disc. The light stays out of
// the texture.
//
// A gas giant gets the broad ice system: a dim inner crepe, a bright
// middle band, a dark division, and an outer band with a thin gap. The
// ends are brighter because the line of sight runs through more ice.
// An ice giant gets the narrow dark strands actually recorded there.

const SIZE = 512;
const cache = new Map();

function channels(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  const full = raw.length === 3
    ? raw.split('').map(channel => channel + channel).join('')
    : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [180, 150, 110];
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

/**
 * Optical depth of a broad ice ring. `t` is 0 at the center and 1 at the
 * outer edge. The dark interval is the main division.
 * @param {number} t
 * @returns {number}
 */
function broadProfile(t) {
  if (t < 0.50 || t > 0.978) return 0;
  if (t < 0.64) return 0.22 + ((t - 0.50) / 0.14) * 0.26;
  if (t < 0.825) return 0.96;
  if (t < 0.905) return 0.04;
  if (Math.abs(t - 0.948) < 0.012) return 0.06;
  return 0.62;
}

/**
 * A handful of narrow strands. The widest sits just inside the outer edge.
 * @param {number} t
 * @returns {number}
 */
function strandProfile(t) {
  const strands = [
    [0.62, 0.012, 0.42],
    [0.71, 0.009, 0.34],
    [0.79, 0.011, 0.5],
    [0.875, 0.022, 0.92],
    [0.95, 0.008, 0.36],
  ];
  let depth = 0;
  for (const [at, width, peak] of strands) {
    const distance = Math.abs(t - at) / width;
    if (distance < 1) depth = Math.max(depth, peak * (1 - distance * distance));
  }
  return depth;
}

/**
 * RGBA bytes for a face-on ring. Alpha is 0 in the hole, the divisions,
 * and outside the outer edge.
 * @param {string} kind
 * @param {string} tint
 * @param {number} [size]
 * @returns {Uint8ClampedArray|null}
 */
export function ringDiscPixels(kind, tint, size = SIZE) {
  const broad = kind === 'Gas Giant';
  const strands = kind === 'Ice Giant';
  if (!broad && !strands) return null;
  const dirt = channels(tint);
  const ice = broad ? mix([244, 236, 214], dirt, 0.16) : mix([168, 160, 148], dirt, 0.2);
  const crepe = broad ? mix([176, 142, 96], dirt, 0.28) : ice;
  const pixels = new Uint8ClampedArray(size * size * 4);
  const outer = size * 0.5 - 1;
  const origin = (size - 1) / 2;
  const profile = broad ? broadProfile : strandProfile;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - origin;
      const dy = y - origin;
      const radius = Math.hypot(dx, dy);
      const t = radius / outer;
      let depth = profile(t);
      if (depth <= 0) continue;
      const ansa = 0.68 + 0.32 * Math.abs(dx / Math.max(radius, 1));
      depth = Math.min(1, depth * ansa);
      const tone = t < 0.66 ? mix(crepe, ice, depth) : ice;
      const lit = tone.map(channel => channel * (0.72 + 0.28 * depth));
      const index = (y * size + x) * 4;
      pixels[index] = Math.max(0, Math.min(255, Math.round(lit[0])));
      pixels[index + 1] = Math.max(0, Math.min(255, Math.round(lit[1])));
      pixels[index + 2] = Math.max(0, Math.min(255, Math.round(lit[2])));
      pixels[index + 3] = Math.round(255 * depth);
    }
  }
  return pixels;
}

/**
 * PNG data URL for a face-on ring. Null when the giant has no ring
 * system, and when there is no canvas to paint on.
 * @param {string} kind
 * @param {string} tint
 * @returns {string|null}
 */
export function ringDiscUrl(kind, tint) {
  if ((kind !== 'Gas Giant' && kind !== 'Ice Giant') || typeof document === 'undefined') return null;
  const key = `${kind}|${tint || ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pixels = ringDiscPixels(kind, tint);
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
