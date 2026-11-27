// One rubble field per belt. Each stone is shaded and cratered. The
// Kuiper belt is a disk, not this field.

const WIDTH = 440;
const HEIGHT = 220;
const cache = new Map();

function hash(a, b, seed) {
  let n = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + (seed | 0);
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
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [110, 100, 90];
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function mix(from, to, amount) {
  const t = Math.min(1, Math.max(0, amount));
  return from.map((channel, index) => Math.round(channel + (to[index] - channel) * t));
}

function css(rgb) {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function paintRock(context, x, y, radius, turn, tone, seed, index) {
  context.save();
  context.translate(x, y);
  context.rotate(turn);
  context.beginPath();
  const steps = 10;
  for (let step = 0; step < steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    const wobble = 0.72 + hash(index, step, seed) * 0.38;
    const px = Math.cos(angle) * radius * wobble;
    const py = Math.sin(angle) * radius * wobble * 0.86;
    if (step === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.save();
  context.clip();
  const light = mix(tone, [244, 236, 220], 0.55);
  const dark = mix(tone, [16, 14, 12], 0.62);
  const gradient = context.createRadialGradient(-radius * 0.38, -radius * 0.42, radius * 0.08, radius * 0.1, radius * 0.05, radius * 1.25);
  gradient.addColorStop(0, css(light));
  gradient.addColorStop(0.42, css(tone));
  gradient.addColorStop(1, css(dark));
  context.fillStyle = gradient;
  context.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 4);
  if (radius < 30) {
    context.restore();
    context.restore();
    return;
  }
  const angle = hash(index, 3, seed) * Math.PI * 2;
  const dist = (0.15 + hash(index, 6, seed) * 0.35) * radius;
  const cr = radius * (0.08 + hash(index, 11, seed) * 0.05);
  context.beginPath();
  context.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, cr, 0, Math.PI * 2);
  context.fillStyle = css(mix(tone, [22, 18, 14], 0.55));
  context.fill();
  context.restore();
  context.restore();
}

/**
 * PNG of a cratered rubble cluster. Null when there is no canvas.
 * @param {string} color
 * @param {string} [worldSeed]
 * @returns {string|null}
 */
export function asteroidFieldUrl(color, worldSeed = '') {
  if (typeof document === 'undefined') return null;
  const key = `${color || '#8a7b70'}|${worldSeed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const seed = seedFrom(key);
  const base = channels(color);
  const layout = [
    [220, 112, 52], [128, 104, 36], [318, 98, 38], [64, 136, 24],
    [378, 132, 22], [176, 58, 18], [268, 158, 20], [36, 72, 15],
    [408, 68, 14], [96, 168, 13], [346, 52, 12],
  ];
  layout.forEach(([x, y, radius], index) => {
    const jx = (hash(index, 1, seed) - 0.5) * 18;
    const jy = (hash(index, 2, seed) - 0.5) * 14;
    const tone = mix(base, index % 2 ? [150, 112, 78] : [72, 68, 64], 0.28 + hash(index, 4, seed) * 0.35);
    paintRock(
      context,
      x + jx,
      y + jy,
      radius * (0.9 + hash(index, 5, seed) * 0.25),
      hash(index, 7, seed) * Math.PI,
      tone,
      seed,
      index,
    );
  });
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
