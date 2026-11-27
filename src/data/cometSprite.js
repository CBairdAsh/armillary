// One painted comet. The head is a coma with a bright condensation.
// The broad tail is dust. The thin blue tail is ionized gas, and it
// points straight away from the star. The nucleus stays inside the glare.

const WIDTH = 840;
const HEIGHT = 280;
const HEAD_X = 96;
const HEAD_Y = 140;
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
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [210, 224, 232];
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
 * Painted coma, dust tail, and ion tail. The head sits near the left.
 * Null when there is no canvas, so the chart can fall back to a stroke.
 * @param {string} color
 * @param {string} [worldSeed]
 * @returns {string|null}
 */
export function cometSpriteUrl(color, worldSeed = '') {
  if (typeof document === 'undefined') return null;
  const key = `${color || '#e7f4fb'}|${worldSeed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const seed = seedFrom(key);
  const tone = channels(color);
  const dust = mix(tone, [232, 214, 186], 0.7);
  const curve = (hash(1, 2, seed) - 0.4) * 36;
  const ionLift = -8 - hash(3, 4, seed) * 14;
  const tipY = HEAD_Y + curve;

  context.save();
  context.filter = 'blur(16px)';
  context.beginPath();
  context.moveTo(HEAD_X - 4, HEAD_Y - 6);
  context.bezierCurveTo(280, HEAD_Y - 18 + curve * 0.15, 520, tipY - 28, 810, tipY - 22);
  context.bezierCurveTo(640, tipY + 8, 400, HEAD_Y + 34, HEAD_X - 4, HEAD_Y + 8);
  context.closePath();
  const fan = context.createLinearGradient(HEAD_X, HEAD_Y, 820, tipY);
  fan.addColorStop(0, rgba(mix(dust, [255, 250, 242], 0.75), 0.9));
  fan.addColorStop(0.22, rgba(dust, 0.5));
  fan.addColorStop(0.55, rgba(dust, 0.12));
  fan.addColorStop(0.82, rgba(dust, 0));
  fan.addColorStop(1, rgba(dust, 0));
  context.fillStyle = fan;
  context.fill();
  context.restore();

  context.save();
  context.lineCap = 'butt';
  const ion = context.createLinearGradient(HEAD_X, HEAD_Y, 790, HEAD_Y + ionLift);
  ion.addColorStop(0, 'rgba(220, 236, 246, 0)');
  ion.addColorStop(0.12, 'rgba(198, 222, 236, 0.5)');
  ion.addColorStop(0.62, 'rgba(176, 206, 226, 0.16)');
  ion.addColorStop(1, 'rgba(176, 206, 226, 0)');
  context.filter = 'blur(6px)';
  context.strokeStyle = ion;
  context.lineWidth = 9;
  context.beginPath();
  context.moveTo(HEAD_X + 10, HEAD_Y);
  context.lineTo(790, HEAD_Y + ionLift);
  context.stroke();
  context.restore();

  context.save();
  context.filter = 'blur(5px)';
  const coma = context.createRadialGradient(HEAD_X, HEAD_Y, 0, HEAD_X, HEAD_Y, 108);
  coma.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  coma.addColorStop(0.08, rgba(mix([255, 255, 255], tone, 0.12), 0.72));
  coma.addColorStop(0.28, rgba(mix(tone, [220, 232, 238], 0.55), 0.22));
  coma.addColorStop(0.62, rgba(tone, 0.05));
  coma.addColorStop(1, rgba(tone, 0));
  context.fillStyle = coma;
  context.beginPath();
  context.arc(HEAD_X, HEAD_Y, 108, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.fillStyle = 'rgba(255, 255, 255, 0.95)';
  context.beginPath();
  context.arc(HEAD_X, HEAD_Y, 4.2, 0, Math.PI * 2);
  context.fill();

  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
