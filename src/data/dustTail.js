// Silicate dust leaving a disintegrating world. There is no coma and no
// ion tail. The world disc is the source, so this sprite is only the stream.
// The head sits at the left. The chart rotates it away from the star.

const WIDTH = 640;
const HEIGHT = 200;
const ORIGIN_X = 18;
const ORIGIN_Y = 100;
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
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [176, 138, 98];
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

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/**
 * Painted dust stream. Null when there is no canvas, so the chart can
 * fall back to a wedge.
 * @param {string} color
 * @param {string} [worldSeed]
 * @returns {string|null}
 */
export function dustTailUrl(color, worldSeed = '') {
  if (typeof document === 'undefined') return null;
  const key = `${color || '#b08a62'}|${worldSeed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const seed = seedFrom(key);
  const tone = channels(color);
  const dust = mix(mix([146, 110, 76], tone, 0.18), [214, 186, 146], 0.42);
  const hot = mix(dust, [228, 132, 68], 0.55);
  const curve = (hash(1, 2, seed) - 0.42) * 46;
  const reach = 0.58 + hash(4, 5, seed) * 0.32;
  const tipX = ORIGIN_X + (WIDTH - ORIGIN_X - 12) * reach;
  const tipY = ORIGIN_Y + curve;

  context.save();
  context.filter = 'blur(11px)';
  context.beginPath();
  context.moveTo(ORIGIN_X, ORIGIN_Y - 4);
  context.bezierCurveTo(
    ORIGIN_X + 70,
    ORIGIN_Y - 14 + curve * 0.08,
    tipX * 0.55,
    tipY - 42,
    tipX,
    tipY - 18,
  );
  context.bezierCurveTo(
    tipX * 0.62,
    tipY + 16,
    ORIGIN_X + 84,
    ORIGIN_Y + 28,
    ORIGIN_X,
    ORIGIN_Y + 5,
  );
  context.closePath();
  const fan = context.createLinearGradient(ORIGIN_X, ORIGIN_Y, tipX, tipY);
  fan.addColorStop(0, rgba(mix(hot, [255, 228, 196], 0.55), 0.95));
  fan.addColorStop(0.14, rgba(dust, 0.78));
  fan.addColorStop(0.4, rgba(dust, 0.36));
  fan.addColorStop(Math.min(0.96, reach + 0.06), rgba(dust, 0));
  fan.addColorStop(1, rgba(dust, 0));
  context.fillStyle = fan;
  context.fill();
  context.restore();

  context.save();
  context.filter = 'blur(3.5px)';
  context.lineCap = 'round';
  const spine = context.createLinearGradient(ORIGIN_X, ORIGIN_Y, tipX, tipY);
  spine.addColorStop(0, rgba(mix(hot, [255, 236, 214], 0.65), 0.95));
  spine.addColorStop(0.28, rgba(dust, 0.7));
  spine.addColorStop(0.7, rgba(dust, 0.12));
  spine.addColorStop(1, rgba(dust, 0));
  context.strokeStyle = spine;
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(ORIGIN_X, ORIGIN_Y);
  context.quadraticCurveTo((ORIGIN_X + tipX) / 2, ORIGIN_Y + curve * 0.4, tipX * 0.92, tipY);
  context.stroke();
  context.restore();

  context.save();
  context.filter = 'blur(1.6px)';
  for (let i = 0; i < 22; i += 1) {
    const t = hash(i, 11, seed) * reach;
    const x = ORIGIN_X + (tipX - ORIGIN_X) * t;
    const spread = 3 + t * 26;
    const y = ORIGIN_Y + (hash(i, 13, seed) - 0.5) * spread + curve * t * t;
    const radius = 1.1 + hash(i, 17, seed) * (1.8 + t * 3.2);
    const bright = hash(i, 19, seed);
    context.fillStyle = rgba(
      mix(dust, [255, 232, 204], bright * 0.55),
      0.28 + (1 - t) * 0.5,
    );
    context.beginPath();
    context.ellipse(x, y, radius * (1.6 + t * 1.4), radius * 0.7, curve * 0.002, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
