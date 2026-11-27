// Water vapor leaving a cryovolcanic moon. Short, and bright. The fractures
// are on the disc. This is only the spray. The head sits at the left.

const WIDTH = 360;
const HEIGHT = 140;
const ORIGIN_X = 12;
const ORIGIN_Y = 70;
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

/**
 * Painted vapor plume. Null when there is no canvas.
 * @param {string} [worldSeed]
 * @returns {string|null}
 */
export function plumeUrl(worldSeed = '') {
  if (typeof document === 'undefined') return null;
  const key = String(worldSeed || '');
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const seed = seedFrom(key || 'plume');
  const curve = (hash(1, 2, seed) - 0.5) * 22;
  const reach = 0.62 + hash(3, 4, seed) * 0.28;
  const tipX = ORIGIN_X + (WIDTH - ORIGIN_X - 8) * reach;
  const tipY = ORIGIN_Y + curve;

  context.save();
  context.filter = 'blur(8px)';
  context.beginPath();
  context.moveTo(ORIGIN_X, ORIGIN_Y - 2);
  context.bezierCurveTo(ORIGIN_X + 40, ORIGIN_Y - 10, tipX * 0.6, tipY - 22, tipX, tipY - 8);
  context.bezierCurveTo(tipX * 0.65, tipY + 8, ORIGIN_X + 48, ORIGIN_Y + 14, ORIGIN_X, ORIGIN_Y + 3);
  context.closePath();
  const fan = context.createLinearGradient(ORIGIN_X, ORIGIN_Y, tipX, tipY);
  fan.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
  fan.addColorStop(0.16, 'rgba(232, 242, 246, 0.72)');
  fan.addColorStop(0.42, 'rgba(214, 230, 238, 0.28)');
  fan.addColorStop(Math.min(0.96, reach + 0.05), 'rgba(210, 226, 234, 0)');
  fan.addColorStop(1, 'rgba(210, 226, 234, 0)');
  context.fillStyle = fan;
  context.fill();
  context.restore();

  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
