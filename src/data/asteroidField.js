// One rubble field per zone color. Painted once, then handed to the SVG
// as the asteroid-belt mark. The Kuiper belt is a disk, not this field.

const WIDTH = 192;
const HEIGHT = 96;
const cache = new Map();

function hash(a, b, c) {
  let n = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + (c | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function channels(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  const full = raw.length === 3
    ? raw.split('').map(channel => channel + channel).join('')
    : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [140, 150, 160];
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

function css([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * PNG of a rocky rubble cluster. Null when there is no canvas.
 * @param {string} color
 * @returns {string|null}
 */
export function asteroidFieldUrl(color) {
  if (typeof document === 'undefined') return null;
  const key = color || '#8aa0b0';
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const base = channels(key);
  const rocks = [
    [96, 50, 22], [58, 46, 14], [138, 44, 16], [34, 58, 9],
    [164, 56, 11], [78, 68, 8], [118, 30, 10], [150, 68, 7],
    [46, 36, 6], [172, 38, 6], [88, 28, 5], [124, 72, 6],
  ];
  rocks.forEach(([x, y, radius], index) => {
    const turn = hash(index, 3, 9) * Math.PI * 2;
    const tone = mix(base, [18, 22, 26], 0.25 + hash(index, 1, 4) * 0.45);
    context.beginPath();
    for (let step = 0; step < 8; step += 1) {
      const angle = turn + (step / 8) * Math.PI * 2;
      const wobble = 0.7 + hash(index, step, 2) * 0.45;
      const px = x + Math.cos(angle) * radius * wobble;
      const py = y + Math.sin(angle) * radius * wobble * 0.84;
      if (step === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fillStyle = css(tone);
    context.fill();
    context.beginPath();
    context.arc(x - radius * 0.25, y - radius * 0.28, radius * 0.28, 0, Math.PI * 2);
    context.fillStyle = css(mix(tone, [255, 248, 236], 0.45));
    context.fill();
  });
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
