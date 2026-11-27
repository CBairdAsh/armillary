import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { C, ZONE_COLORS } from '../tokens.js';
import { worldYearLabel } from '../data/generator.js';
import {
  SOL_ANGULAR_DEGREES,
  apparentSuns,
  buildMoonPlate,
  buildOrrery,
  formatAngular,
  sunMeasure,
} from '../data/orrery.js';
import { bodyColor } from '../data/bodyColor.js';
import { planetDiscUrl } from '../data/planetDisc.js';
import { rockDiscUrl } from '../data/rockDisc.js';
import { ringDiscUrl } from '../data/ringDisc.js';
import { asteroidFieldUrl } from '../data/asteroidField.js';
import { cometSpriteUrl } from '../data/cometSprite.js';
import { dustTailUrl } from '../data/dustTail.js';
import { starDiscUrl } from '../data/starDisc.js';

const INK = 'var(--font-mono)';

const DISC = {
  'Gas Giant': 8,
  'Ice Giant': 6.5,
  'Gas Dwarf': 6.5,
};

// Zone custom properties are not all defined. These are the console inks
// the sheet already uses for heat, life, and cold, so a world still reads
// by zone when the variable is empty.
const ZONE_FALLBACK = {
  INNER: '#C8860A',
  HABITABLE: '#4CAF7D',
  OUTER: '#7EC8E3',
  FRINGE: '#6a8aa0',
};

const FIT = { z: 1, x: 0, y: 0, pitch: 0 };
const ZOOM_MIN = 0.65;
const ZOOM_MAX = 5.5;
const ZOOM_STEP = 1.4;
const FOCUS_ZOOM = 3.4;
const PITCH_MAX = 80;
const PITCH_STEP = 8;

function zoneColor(zone) {
  return ZONE_COLORS[zone] || ZONE_FALLBACK[zone] || '#7B9BAF';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexChannels(hex) {
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

function mixHex(hex, target, amount) {
  const from = hexChannels(hex);
  const to = hexChannels(target);
  if (!from || !to) return hex || target;
  const mixed = from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount));
  return `#${mixed.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function darken(hex, amount) {
  return mixHex(hex, '#100c0a', amount);
}

function svgId(raw) {
  return String(raw).replace(/:/g, '');
}

/**
 * Screen point of a world point. Pan is in viewBox units, applied after
 * the scale, so a drag matches the pointer.
 */
function worldAt(screen, view, origin) {
  return {
    x: (screen.x - origin.x - view.x) / view.z + origin.x,
    y: (screen.y - origin.y - view.y) / view.z + origin.y,
  };
}

function panToHold(world, screen, zoom, origin) {
  return {
    x: screen.x - origin.x - (world.x - origin.x) * zoom,
    y: screen.y - origin.y - (world.y - origin.y) * zoom,
  };
}

function clientToViewBox(svg, clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const box = svg.viewBox.baseVal;
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    x: ((clientX - rect.left) / width) * box.width + box.x,
    y: ((clientY - rect.top) / height) * box.height + box.y,
  };
}

function viewDelta(svg, fromX, fromY, toX, toY) {
  const start = clientToViewBox(svg, fromX, fromY);
  const end = clientToViewBox(svg, toX, toY);
  return { x: end.x - start.x, y: end.y - start.y };
}

function isFit(view) {
  return Math.abs(view.z - 1) < 0.02 && Math.abs(view.x) < 0.6 && Math.abs(view.y) < 0.6;
}

function formatPitch(pitch) {
  const degrees = Math.round(pitch || 0);
  return degrees < 1 ? 'TOP' : `${degrees}°`;
}

function formatZoom(zoom) {
  return `${zoom.toFixed(1)}×`;
}

// The fitted system keeps its own coordinates. The viewBox grows to the
// sky element, so the clip is the cell, and the lower register can float
// over that sky without cutting the rings.
function skyViewBox(frame, metrics) {
  const native = { x: 0, y: 0, width: frame.width, height: frame.height };
  if (!metrics || metrics.width < 40 || metrics.height < 40) return native;
  const pad = 16;
  const chrome = Math.min(Math.max(0, metrics.chrome), metrics.height * 0.62);
  const availW = Math.max(80, metrics.width - pad * 2);
  const availH = Math.max(80, metrics.height - chrome - pad);
  const scale = Math.min(availW / frame.width, availH / frame.height);
  if (!(scale > 0)) return native;
  const width = metrics.width / scale;
  const height = metrics.height / scale;
  return {
    x: frame.cx - (metrics.width / 2) / scale,
    y: frame.cy - (pad + availH / 2) / scale,
    width,
    height,
  };
}

function starFace(color, spectralClass) {
  if (spectralClass === 'WD' || spectralClass === 'NS') return mixHex(color, '#ffffff', 0.78);
  if (spectralClass === 'BD') return mixHex(color, '#ffffff', 0.12);
  if (spectralClass === 'M' || spectralClass === 'K') return mixHex(color, '#fff6ea', 0.38);
  if (spectralClass === 'O' || spectralClass === 'B' || spectralClass === 'A') return mixHex(color, '#ffffff', 0.55);
  return mixHex(color, '#fffaf2', 0.46);
}

function coronaRadius(r, spectralClass, primary) {
  if (spectralClass === 'NS') return r * 5.2;
  if (spectralClass === 'BD') return Math.min(r * 1.7, r + 8);
  const multiple = primary ? 3.4 : 2.35;
  return Math.min(r * multiple, r + 22);
}

/**
 * Self-luminous disc. The body is a painted photosphere. The corona and
 * the bloom stay vector, so the glow stays soft when the view zooms. A
 * neutron star has no disc. A planet uses a white specular instead, so
 * the two do not read as the same object.
 */
function StarGlyph({ color, r, spectralClass, primary }) {
  const uid = svgId(useId());
  const coronaId = `corona-${uid}`;
  const bodyId = `body-${uid}`;
  const blurId = `blur-${uid}`;
  const clipId = `star-clip-${uid}`;
  const dim = spectralClass === 'BD';
  const point = spectralClass === 'NS';
  const coronaR = coronaRadius(r, spectralClass, primary);
  const face = starFace(color, spectralClass);
  const limb = darken(color, dim ? 0.66 : 0.5);
  const bloom = Math.min(4.2, Math.max(1.8, r * 0.34));
  const disc = starDiscUrl(color, spectralClass);

  return (
    <g className="orrery-star" pointerEvents="none">
      <defs>
        <radialGradient id={coronaId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity={dim ? 0.22 : 0.55} />
          <stop offset="38%" stopColor={color} stopOpacity={dim ? 0.08 : 0.22} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={bodyId} cx="35%" cy="32%" r="70%">
          <stop offset="0%" stopColor={face} />
          <stop offset="28%" stopColor={color} />
          <stop offset="100%" stopColor={limb} />
        </radialGradient>
        <filter id={blurId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation={point ? 1.8 : bloom} />
        </filter>
        <clipPath id={clipId}>
          <circle r={r} />
        </clipPath>
      </defs>
      <circle r={coronaR} fill={`url(#${coronaId})`} />
      <circle
        r={r * (point ? 2.4 : 1.45)}
        fill={color}
        opacity={dim ? 0.18 : Math.min(0.5, 5.5 / r)}
        filter={`url(#${blurId})`}
      />
      {disc ? (
        <image
          href={disc}
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          clipPath={`url(#${clipId})`}
        />
      ) : (
        <circle r={r} fill={`url(#${bodyId})`} />
      )}
    </g>
  );
}

function dunePath(r) {
  return `M ${-r} ${r * 0.22} C ${-r * 0.25} ${-r * 0.12} ${r * 0.15} ${r * 0.52} ${r} ${r * 0.06} L ${r} ${r} L ${-r} ${r} Z`;
}

function ShadedDisc({ uid, r, color, kind, seed = '', facet = '' }) {
  const fill = `fill-${uid}`;
  const clip = `clip-${uid}`;
  const limb = darken(color, kind === 'Chthonian' ? 0.28 : 0.7);
  const giantDisc = planetDiscUrl(color, kind);
  const rockDisc = giantDisc ? null : rockDiscUrl(color, kind, seed, facet);
  const disc = giantDisc || rockDisc;
  const bands = !disc && (kind === 'Gas Giant' || kind === 'Ice Giant' || kind === 'Gas Dwarf');
  const bandOpacity = kind === 'Gas Dwarf' ? 0.1 : 0.18;
  return (
    <g>
      <defs>
        {disc ? (
          <radialGradient id={fill} cx="30%" cy="26%" r="75%">
            {rockDisc ? (
              <>
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                <stop offset="16%" stopColor="#ffffff" stopOpacity="0.1" />
                <stop offset="46%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="78%" stopColor="#0a1016" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#0a1016" stopOpacity="0.48" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
                <stop offset="20%" stopColor="#ffffff" stopOpacity="0.2" />
                <stop offset="48%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="80%" stopColor="#041018" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#041018" stopOpacity="0.62" />
              </>
            )}
          </radialGradient>
        ) : (
          <radialGradient id={fill} cx="30%" cy="26%" r="78%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={kind === 'Chthonian' ? 0.9 : 0.82} />
            <stop offset="16%" stopColor={mixHex(color, '#ffffff', 0.35)} />
            <stop offset="48%" stopColor={color} />
            <stop offset="100%" stopColor={limb} />
          </radialGradient>
        )}
        <clipPath id={clip}>
          <circle r={r} />
        </clipPath>
      </defs>
      {disc ? (
        <image
          href={disc}
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          clipPath={`url(#${clip})`}
          pointerEvents="none"
        />
      ) : (
        <circle r={r} fill={`url(#${fill})`} />
      )}
      {disc && <circle r={r} fill={`url(#${fill})`} pointerEvents="none" />}
      {!disc && (
        <g clipPath={`url(#${clip})`}>
          {bands && (
            <>
              <rect x={-r} y={-r * 0.22} width={r * 2} height={r * 0.16} fill="#ffffff" opacity={bandOpacity} />
              <rect x={-r} y={r * 0.14} width={r * 2} height={r * 0.14} fill="#041018" opacity="0.22" />
            </>
          )}
          {kind === 'Ice Planet' && (
            <ellipse cx="0" cy={-r * 0.4} rx={r * 0.72} ry={r * 0.36} fill="#f7fbff" opacity="0.92" />
          )}
          {kind === 'Desert' && (
            <path d={dunePath(r)} fill={darken(color, 0.28)} />
          )}
          {(kind === 'Ocean Planet' || kind === 'Hycean') && (
            <ellipse cx={-r * 0.22} cy={-r * 0.28} rx={r * 0.36} ry={r * 0.15} fill="#ffffff" opacity="0.42" />
          )}
          {kind === 'Chthonian' && (
            <circle r={r * 0.32} fill="#ffb089" opacity="0.7" />
          )}
        </g>
      )}
    </g>
  );
}

function Belt({ color, uid, seed = '', tangent = 0 }) {
  const field = asteroidFieldUrl(color, seed);
  if (!field) {
    return (
      <g>
        <g transform="translate(-6 0)">
          <ShadedDisc uid={`${uid}a`} r={1.5} color={color} kind="rock" />
        </g>
        <ShadedDisc uid={`${uid}b`} r={1.8} color={color} kind="rock" />
        <g transform="translate(6 0.3)">
          <ShadedDisc uid={`${uid}c`} r={1.35} color={color} kind="rock" />
        </g>
      </g>
    );
  }
  return (
    <g transform={`rotate(${tangent})`} pointerEvents="none">
      <image
        href={field}
        x={-23}
        y={-12}
        width={46}
        height={23}
      />
    </g>
  );
}

function Twin({ color, uid, seed = '' }) {
  return (
    <g>
      <g transform="translate(-3.2 0)">
        <ShadedDisc uid={`${uid}a`} r={4.2} color={color} kind="Terrestrial" seed={`${seed}a`} />
      </g>
      <g transform="translate(3.2 0)">
        <ShadedDisc uid={`${uid}b`} r={4.2} color={darken(color, 0.16)} kind="Terrestrial" seed={`${seed}b`} />
      </g>
    </g>
  );
}

const DUST_ORIGIN = 18 / 640;

function DustTail({ r, color, seed, outward }) {
  const sprite = dustTailUrl(color, seed);
  const length = Math.min(68, 30 + r * 3.4);
  const height = length * (200 / 640);
  const x = r - length * DUST_ORIGIN;
  return (
    <g transform={`rotate(${outward || 0})`} pointerEvents="none">
      {sprite ? (
        <image href={sprite} x={x} y={-height / 2} width={length} height={height} />
      ) : (
        <path
          d={`M ${r} ${-r * 0.16} Q ${r + length * 0.45} ${-height * 0.32} ${r + length * 0.92} 0 Q ${r + length * 0.45} ${height * 0.32} ${r} ${r * 0.16} Z`}
          fill="#c4a078"
          opacity="0.5"
        />
      )}
    </g>
  );
}

const RING_TILT = -18;

function ringPoint(rx, ry, angle) {
  const tilt = RING_TILT * Math.PI / 180;
  const x = rx * Math.cos(angle);
  const y = ry * Math.sin(angle);
  return [
    x * Math.cos(tilt) - y * Math.sin(tilt),
    x * Math.sin(tilt) + y * Math.cos(tilt),
  ];
}

const RING_ASPECT = 0.3;

/**
 * One half of a painted ring. The far half is drawn before the disc and
 * the near half after, so the ring crosses the face. The cut is the long
 * axis of the ring plane.
 */
function RingHalf({ r, kind, tint, near, uid, tangent = 0 }) {
  const url = ringDiscUrl(kind, tint);
  const outer = r * (kind === 'Ice Giant' ? 1.82 : 2.16);
  if (!url) {
    const rx = outer;
    const ry = Math.max(2.2, outer * RING_ASPECT);
    const [x0, y0] = ringPoint(rx, ry, 0);
    const [x1, y1] = ringPoint(rx, ry, Math.PI);
    return (
      <g transform={`rotate(${tangent})`} pointerEvents="none">
        <path
          d={`M ${x0} ${y0} A ${rx} ${ry} ${RING_TILT} 0 ${near ? 1 : 0} ${x1} ${y1}`}
          fill="none"
          stroke={tint}
          strokeOpacity={near ? 0.92 : 0.46}
          strokeWidth="1.15"
        />
      </g>
    );
  }
  const clip = `ring-clip-${uid}-${near ? 'n' : 'f'}`;
  const spin = `rotate(${tangent}) rotate(${RING_TILT}) scale(1 ${RING_ASPECT})`;
  return (
    <g opacity={near ? 1 : 0.84} pointerEvents="none">
      <defs>
        <clipPath id={clip} clipPathUnits="userSpaceOnUse">
          <rect
            x={-outer - 2}
            y={near ? -0.4 : -outer - 2}
            width={outer * 2 + 4}
            height={outer + 2.4}
          />
        </clipPath>
      </defs>
      <image
        href={url}
        x={-outer}
        y={-outer}
        width={outer * 2}
        height={outer * 2}
        transform={spin}
        clipPath={`url(#${clip})`}
      />
    </g>
  );
}

function ink(body) {
  if (body.color) return body.color;
  return bodyColor(body.worldType, body.zone, body.id) || zoneColor(body.zone);
}

function glyphRadius(body) {
  if (body.radius) return body.radius;
  return body.selected ? 8 : (DISC[body.worldType] || 5);
}

function reticleRadius(body) {
  const disc = glyphRadius(body);
  if (body.worldType === 'Gas Giant') return disc * 2.16 + 4;
  if (body.worldType === 'Ice Giant') return disc * 1.82 + 4;
  if (body.belt) return 28;
  if (body.worldType === 'Double Planet') return 12;
  return disc + 6;
}

function bracketPath(radius, center) {
  const span = 16 * Math.PI / 180;
  const mid = center * Math.PI / 180;
  const x0 = radius * Math.cos(mid - span);
  const y0 = radius * Math.sin(mid - span);
  const x1 = radius * Math.cos(mid + span);
  const y1 = radius * Math.sin(mid + span);
  return `M ${x0} ${y0} A ${radius} ${radius} 0 0 1 ${x1} ${y1}`;
}

/**
 * A thin lock ring. One quarter turns slowly. A locked body also gets
 * the four corner brackets.
 */
function Reticle({ radius, locked = false }) {
  const sweep = radius + 1.8;
  return (
    <g className={locked ? 'orrery-reticle orrery-reticle--lock' : 'orrery-reticle'} pointerEvents="none">
      <circle className="orrery-reticle-ring" r={radius} />
      {locked && [45, 135, 225, 315].map(angle => (
        <path key={angle} className="orrery-reticle-bracket" d={bracketPath(radius + 3.2, angle)} />
      ))}
      <g className="orrery-reticle-sweep">
        <circle className="orrery-reticle-arc" r={sweep} pathLength="100" strokeDasharray="25 75" />
      </g>
    </g>
  );
}

function BodyGlyph({ body }) {
  const uid = svgId(useId());
  const color = ink(body);
  if (body.belt) return <Belt color={color} uid={uid} seed={body.id} tangent={body.tangent || 0} />;
  if (body.worldType === 'Double Planet') return <Twin color={color} uid={uid} seed={body.id} />;
  const radius = glyphRadius(body);
  const giant = body.worldType === 'Gas Giant' || body.worldType === 'Ice Giant';
  const facet = body.worldType === 'Rogue/Captured' && body.hydrosphere === 'Ice Sheet' ? 'ice' : '';
  return (
    <g>
      {giant && <RingHalf r={radius} kind={body.worldType} tint={color} uid={uid} tangent={body.tangent || 0} />}
      <ShadedDisc uid={uid} r={radius} color={color} kind={body.worldType} seed={body.id} facet={facet} />
      {giant && <RingHalf r={radius} kind={body.worldType} tint={color} uid={uid} tangent={body.tangent || 0} near />}
      {body.worldType === 'Disintegrating' && (
        <DustTail r={radius} color={color} seed={body.id} outward={body.outward || 0} />
      )}
    </g>
  );
}

function lifeArc(radius, mid) {
  const half = 36 * Math.PI / 180;
  const tick = 4.5;
  const end = (angle) => ({
    x: radius * Math.cos(angle),
    y: radius * Math.sin(angle),
    ix: (radius - tick) * Math.cos(angle),
    iy: (radius - tick) * Math.sin(angle),
  });
  const start = end(mid - half);
  const finish = end(mid + half);
  const arc = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 0 1 ${finish.x.toFixed(2)} ${finish.y.toFixed(2)}`;
  return { start, finish, arc };
}

/**
 * Habitability mark. Two thin brackets, one on the side away from the
 * star and one toward it. Large enough to read when the system is fitted,
 * and just outside the disc once the view is zoomed in. A faint dash
 * travels each arc.
 */
function LifeBracket({ body, frame, zoom }) {
  const facing = Math.atan2(body.markY - frame.cy, body.markX - frame.cx) * 180 / Math.PI;
  const radius = Math.max(body.moon ? 52 : 18, reticleRadius(body) * zoom + (body.moon ? 12 : 5));
  const outer = lifeArc(radius, 0);
  const inner = lifeArc(radius, Math.PI);
  return (
    <g
      className={body.moon ? 'orrery-life orrery-life--moon' : 'orrery-life'}
      transform={`translate(${body.markX} ${body.markY}) rotate(${facing}) scale(${1 / zoom})`}
      pointerEvents="none"
    >
      <title>Habitable</title>
      {[outer, inner].map((part, index) => (
        <g key={index}>
          <path className="orrery-life-arc" d={part.arc} />
          <path
            className={index === 0 ? 'orrery-life-flow' : 'orrery-life-flow orrery-life-flow--return'}
            d={part.arc}
            pathLength="100"
          />
          <line className="orrery-life-tick" x1={part.start.x} y1={part.start.y} x2={part.start.ix} y2={part.start.iy} />
          <line className="orrery-life-tick" x1={part.finish.x} y1={part.finish.y} x2={part.finish.ix} y2={part.finish.iy} />
        </g>
      ))}
    </g>
  );
}

function CometMark({ comet }) {
  const sprite = cometSpriteUrl(comet.color, comet.id);
  const turn = `translate(${comet.x} ${comet.y}) rotate(${comet.tail})`;
  if (!sprite) {
    return (
      <g transform={turn} pointerEvents="none">
        <title>{comet.title}</title>
        <path d="M 1.2 -1.35 L 36 0 L 1.2 1.35 Z" fill={comet.color} opacity="0.7" />
        <circle r="2.2" fill="#f8fbff" />
      </g>
    );
  }
  return (
    <g className="orrery-comet" transform={turn} pointerEvents="none">
      <title>{comet.title}</title>
      <image href={sprite} x={-7.1} y={-10.3} width={62} height={20.7} />
    </g>
  );
}

function PlateText({ x, y, zoom, anchor = 'middle', fill, size = 10, opacity = 1, children }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${1 / zoom})`} opacity={opacity} pointerEvents="none">
      <text
        textAnchor={anchor}
        fill={fill}
        fontFamily={INK}
        fontSize={size}
        letterSpacing="1"
        dominantBaseline="middle"
      >
        {children}
      </text>
    </g>
  );
}

/**
 * Screen size of a planet or moon name. Fit stays at the chart caption.
 * Zoomed in, it grows to a readable readout and the frame fades up.
 * @param {number} zoom
 * @param {boolean} emphasis
 */
function nameplateMetrics(zoom, emphasis) {
  const t = Math.min(1, Math.max(0, (zoom - 1.05) / 2.15));
  const size = (emphasis ? 12 : 11) + t * (emphasis ? 13 : 10);
  const padX = 9 + t * 7;
  const padY = 5 + t * 4;
  return { t, size, padX, padY, boxH: size + padY * 2 };
}

/** Caption slot just outside the disc, in plate units. */
function nameplatePoint(body, frame, zoom, metrics) {
  const clear = reticleRadius(body);
  return {
    x: body.markX,
    y: body.markY + clear + (metrics.boxH / 2 + 10) / zoom,
  };
}

function nameplateCorners(x, y, width, height) {
  const arm = 8;
  const left = x - 1.5;
  const right = x + width + 1.5;
  const top = y - 1.5;
  const bottom = y + height + 1.5;
  return [
    `M ${left} ${top + arm} V ${top} H ${left + arm}`,
    `M ${right - arm} ${top} H ${right} V ${top + arm}`,
    `M ${right} ${bottom - arm} V ${bottom} H ${right - arm}`,
    `M ${left + arm} ${bottom} H ${left} V ${bottom - arm}`,
  ].join(' ');
}

/**
 * Planet or moon name. The counter-scale keeps the type at a chosen
 * screen size. Past a fitted view the plate and corner ticks read as
 * an instrument label.
 */
function NamePlate({ x, y, zoom, fill, emphasis = false, opacity = 1, children }) {
  const text = String(children ?? '');
  const metrics = nameplateMetrics(zoom, emphasis);
  const { t, size, padX, padY, boxH } = metrics;
  const textWidth = Math.max(size, text.length * (size * 0.66 + 1.2));
  const boxW = textWidth + padX * 2;
  const boxX = -boxW / 2;
  const boxY = -boxH / 2;
  const frame = Math.min(1, Math.max(0, (t - 0.08) / 0.42));
  const ink = frame > 0.55 ? C.TEXT : fill;
  return (
    <g className="orrery-nameplate" transform={`translate(${x} ${y}) scale(${1 / zoom})`} opacity={opacity} pointerEvents="none">
      {frame > 0 && (
        <g opacity={frame}>
          <rect className="orrery-nameplate-plate" x={boxX} y={boxY} width={boxW} height={boxH} />
          <path className="orrery-nameplate-corner" d={nameplateCorners(boxX, boxY, boxW, boxH)} />
          <rect className="orrery-nameplate-led" x={boxX + 5} y={boxY + 5} width={3.5} height={3.5} />
        </g>
      )}
      <text
        textAnchor="middle"
        fill={ink}
        fontFamily={INK}
        fontSize={size}
        letterSpacing={1 + t * 0.8}
        dominantBaseline="middle"
      >
        {text}
      </text>
    </g>
  );
}

function readoutText(body, world, stars) {
  if (!body || !world) return '';
  const name = world.name || world.worldType;
  const year = worldYearLabel(world, stars);
  const bits = [`[${body.index + 1}] ${name}`, `${world.orbitalAU} AU`];
  if (year) bits.push(`year ${year}`);
  return bits.join(' · ');
}

function moonReadout(moon, world) {
  if (!world) return '';
  const name = world.name || world.worldType;
  if (!moon) {
    const count = world.moons?.length || 0;
    return `[${(world.index ?? 0) + 1}] ${name} · ${count === 1 ? '1 moon' : `${count} moons`}`;
  }
  const bits = [`M${moon.index + 1} ${moon.type}`];
  if (moon.biosphere?.label) bits.push(moon.biosphere.label);
  else if (moon.canSupportLife) bits.push('life-bearing');
  return bits.join(' · ');
}

function SunPlate({ world, stars, separation }) {
  const view = apparentSuns(world, stars, separation);
  const name = world.name || world.worldType;
  const solText = formatAngular(SOL_ANGULAR_DEGREES);
  if (!view?.reliable) {
    const note = view?.reason === 'unseparated'
      ? 'Star separation is unset. Sun size is unset.'
      : 'Orbit inside the pair. Sun size is unset.';
    return (
      <div className="sun-plate">
        <div className="sun-plate-head">
          <span>{name}</span>
          <span>SOL {solText}</span>
        </div>
        <p className="sun-plate-note">{note}</p>
      </div>
    );
  }

  const solRadius = SOL_ANGULAR_DEGREES / 2;
  const biggest = Math.max(solRadius, ...view.discs.map(disc => (disc.degrees || 0) / 2));
  const px = 28 / biggest;
  const count = view.discs.length;
  const centers = view.discs.map((_, index) => 160 + (index - (count - 1) / 2) * 108);

  return (
    <div className="sun-plate" role="img" aria-label={`Sun from ${name}: ${sunMeasure(view)}. Sol is ${solText}.`}>
      <div className="sun-plate-head">
        <span>{name}</span>
        <span>SOL {solText}</span>
      </div>
      <svg className="sun-plate-sky" viewBox="0 0 320 108" aria-hidden="true">
        {view.discs.map((disc, index) => {
          const cx = centers[index];
          const radius = Math.max(disc.text === 'point' ? 1.6 : 2.2, ((disc.degrees || 0) / 2) * px);
          return (
            <g key={disc.label}>
              <circle
                cx={cx}
                cy="46"
                r={solRadius * px}
                fill="none"
                stroke={C.TEXT_FAINT}
                strokeWidth="1"
                strokeDasharray="2 2.5"
              />
              <g transform={`translate(${cx} 46)`}>
                <StarGlyph
                  color={disc.color}
                  r={radius}
                  spectralClass={disc.spectralClass}
                  primary={index === 0}
                />
              </g>
              <text
                x={cx}
                y="92"
                textAnchor="middle"
                fill={C.TEXT_DIM}
                fontFamily={INK}
                fontSize="11"
                letterSpacing="1"
              >
                {count === 1 ? disc.text : `${disc.label} ${disc.text}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ringClass(body, hoverId) {
  const names = ['orrery-ring'];
  if (body.belt) names.push('orrery-ring--belt');
  if (body.selected) names.push('orrery-ring--selected');
  else if (body.id === hoverId) names.push('orrery-ring--hot');
  return names.join(' ');
}

function starLabelPoint(star, cx) {
  const centered = star.ringR === 0 && Math.abs(star.x - cx) < 1;
  if (centered) {
    return { x: star.x, y: star.y + star.r * 3.3 + 10, anchor: 'middle' };
  }
  const pad = star.r * 2.7 + 8;
  const right = star.x >= cx;
  return {
    x: star.x + (right ? pad : -pad),
    y: star.y,
    anchor: right ? 'start' : 'end',
  };
}

function starLabelSingle(system) {
  return system.stars?.[0]?.spectralClass || '';
}

/**
 * Instrument for one system. A rogue renders nothing, so the center
 * column stays shut. The plate zooms, pans, and pitches. The distances
 * do not change. Pitch is the camera, not an orbit's inclination.
 * Moons are a second plate. The wheel stays on whichever plate is up.
 */
export default function Orrery({ system, selectedId, focusToken = 0, focusMoonId = null, onSelect, onClear }) {
  const [hoverId, setHoverId] = useState(null);
  const [view, setView] = useState(FIT);
  const [dragging, setDragging] = useState(false);
  const [moonWorldId, setMoonWorldId] = useState(null);
  const [moonPick, setMoonPick] = useState(null);
  const skyRef = useRef(null);
  const sideRef = useRef(null);
  const frameRef = useRef(null);
  const boxRef = useRef(null);
  const viewRef = useRef(view);
  const [metrics, setMetrics] = useState(null);
  const dragRef = useRef(null);
  const pointers = useRef(new Map());
  const pinchRef = useRef(null);
  const focusRaf = useRef(0);
  const systemViewRef = useRef(FIT);
  viewRef.current = view;

  function stopFocus() {
    if (!focusRaf.current) return;
    cancelAnimationFrame(focusRaf.current);
    focusRaf.current = 0;
  }

  function clampView(next) {
    const plate = frameRef.current;
    const box = boxRef.current;
    if (!plate || !box) return next;
    const zoom = clamp(next.z, ZOOM_MIN, ZOOM_MAX);
    const span = 210 * Math.max(0, zoom - 1);
    const reach = Math.hypot(plate.width, plate.height) * 0.5 * zoom;
    const roomX = Math.max(Math.max(12, box.width / 2 - 28) + span, reach);
    const roomY = Math.max(Math.max(12, box.height / 2 - 28) + span, reach);
    return {
      z: zoom,
      x: clamp(next.x, -roomX, roomX),
      y: clamp(next.y, -roomY, roomY),
      pitch: clamp(next.pitch || 0, 0, PITCH_MAX),
    };
  }

  const alive = !!(system && !system.isRoguePlanet && system.stars?.length);
  const worlds = system?.worlds || [];
  const moonWorld = moonWorldId
    ? worlds.find(world => world.id === moonWorldId && world.id === selectedId && world.moons?.length) || null
    : null;
  const frame = !alive
    ? null
    : moonWorld
      ? buildMoonPlate(moonWorld, moonPick, view.pitch, hoverId)
      : buildOrrery(system, selectedId, view.pitch);
  frameRef.current = frame;

  useEffect(() => {
    stopFocus();
    setView(FIT);
    setHoverId(null);
    setDragging(false);
    setMoonWorldId(null);
    setMoonPick(null);
    systemViewRef.current = FIT;
  }, [system?.id]);

  useEffect(() => {
    if (!moonWorldId || moonWorldId === selectedId) return;
    const aiming = focusMoonId && (system?.worlds || []).some(
      world => world.id === selectedId && world.moons?.some(moon => moon.id === focusMoonId),
    );
    if (aiming) return;
    const restored = systemViewRef.current || FIT;
    setMoonWorldId(null);
    setMoonPick(null);
    viewRef.current = restored;
    setView(restored);
  }, [selectedId, moonWorldId, focusMoonId, system]);

  function centerOf(plate) {
    const sky = skyRef.current;
    const side = sideRef.current;
    const rect = sky?.getBoundingClientRect();
    const sideRect = side?.getBoundingClientRect();
    const chrome = rect && sideRect ? Math.max(0, Math.min(rect.height, rect.bottom - sideRect.top)) : 0;
    const fitted = rect ? skyViewBox(plate, { width: rect.width, height: rect.height, chrome }) : null;
    const span = rect ? Math.max(1, rect.height - chrome) : 1;
    if (!fitted) return { x: plate.cx, y: plate.cy };
    return {
      x: fitted.x + fitted.width / 2,
      y: fitted.y + ((span / 2) / rect.height) * fitted.height,
    };
  }

  function flyTo(plate, body, start) {
    frameRef.current = plate;
    const place = centerOf(plate);
    const target = clampView({
      z: FOCUS_ZOOM,
      x: place.x - plate.cx - (body.markX - plate.cx) * FOCUS_ZOOM,
      y: place.y - plate.cy - (body.markY - plate.cy) * FOCUS_ZOOM,
      pitch: start.pitch || 0,
    });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stopFocus();
    if (reduced) {
      viewRef.current = target;
      setView(target);
      return;
    }
    viewRef.current = start;
    setView(start);
    const t0 = performance.now();
    const duration = 460;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = {
        z: start.z + (target.z - start.z) * eased,
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        pitch: target.pitch,
      };
      viewRef.current = next;
      setView(next);
      focusRaf.current = t < 1 ? requestAnimationFrame(step) : 0;
    };
    focusRaf.current = requestAnimationFrame(step);
  }

  useLayoutEffect(() => {
    if (!focusToken) return undefined;
    const pitch = viewRef.current.pitch || 0;
    const world = (system?.worlds || []).find(item => item.id === selectedId) || null;
    const moon = focusMoonId ? world?.moons?.find(item => item.id === focusMoonId) : null;
    if (moon && world) {
      const onPlate = moonWorldId === world.id;
      if (!onPlate) {
        if (frameRef.current?.mode !== 'moons') systemViewRef.current = viewRef.current;
        setMoonWorldId(world.id);
      }
      setMoonPick(moon.id);
      setHoverId(null);
      const plate = buildMoonPlate(world, moon.id, pitch);
      const body = plate?.bodies?.find(item => item.id === moon.id);
      if (!plate || !body) return undefined;
      flyTo(plate, body, onPlate ? viewRef.current : { ...FIT, pitch });
      return stopFocus;
    }

    if (moonWorldId) {
      const restored = systemViewRef.current || { ...FIT, pitch };
      setMoonWorldId(null);
      setMoonPick(null);
      setHoverId(null);
      viewRef.current = restored;
      setView(restored);
    }
    const plate = system ? buildOrrery(system, selectedId, pitch) : null;
    const body = plate?.bodies?.find(item => item.id === selectedId);
    if (!plate || !body) return undefined;
    flyTo(plate, body, viewRef.current);
    return stopFocus;
  }, [focusToken]);

  useEffect(() => {
    const node = skyRef.current;
    if (!node || !frameRef.current) return undefined;
    const onWheel = event => {
      event.preventDefault();
      stopFocus();
      const plate = frameRef.current;
      if (!plate) return;
      const current = viewRef.current;
      const screen = clientToViewBox(node, event.clientX, event.clientY);
      const origin = { x: plate.cx, y: plate.cy };
      const world = worldAt(screen, current, origin);
      const zoom = clamp(current.z * Math.exp(-event.deltaY * 0.0022), ZOOM_MIN, ZOOM_MAX);
      const pan = panToHold(world, screen, zoom, origin);
      setView(clampView({ z: zoom, x: pan.x, y: pan.y, pitch: current.pitch }));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [system?.id, alive]);

  useEffect(() => {
    const sky = skyRef.current;
    const side = sideRef.current;
    if (!sky) return undefined;
    const measure = () => {
      const rect = sky.getBoundingClientRect();
      const sideRect = side?.getBoundingClientRect();
      const overlap = sideRect ? Math.max(0, Math.min(rect.height, rect.bottom - sideRect.top)) : 0;
      const next = { width: rect.width, height: rect.height, chrome: overlap };
      setMetrics(prev => {
        if (!prev) return next;
        const same = Math.abs(prev.width - next.width) < 0.5
          && Math.abs(prev.height - next.height) < 0.5
          && Math.abs(prev.chrome - next.chrome) < 0.5;
        return same ? prev : next;
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(sky);
    if (side) observer.observe(side);
    measure();
    return () => observer.disconnect();
  }, [alive, system?.id]);

  if (!frame) return null;

  const lunar = frame.mode === 'moons';
  const focusId = lunar ? (hoverId || moonPick) : (hoverId || selectedId);
  const focusBody = frame.bodies.find(body => body.id === focusId) || null;
  const focusWorld = worlds.find(world => world.id === focusId) || null;
  const selectedWorld = worlds.find(world => world.id === selectedId) || null;
  const moonTarget = selectedWorld?.moons?.length ? selectedWorld : null;
  const focusMoon = lunar
    ? (moonWorld?.moons || []).find(moon => moon.id === focusId) || null
    : null;
  const readout = lunar
    ? moonReadout(focusMoon, moonWorld)
    : readoutText(focusBody, focusWorld, system.stars);
  const origin = { x: frame.cx, y: frame.cy };
  const fitted = isFit(view);
  const skyClass = [
    'orrery-sky',
    !fitted ? 'orrery-sky--map' : '',
    dragging ? 'orrery-sky--drag' : '',
  ].filter(Boolean).join(' ');

  function zoomAbout(screen, factor) {
    const plate = frameRef.current;
    if (!plate) return;
    const current = viewRef.current;
    const place = { x: plate.cx, y: plate.cy };
    const held = worldAt(screen, current, place);
    const zoom = clamp(current.z * factor, ZOOM_MIN, ZOOM_MAX);
    const pan = panToHold(held, screen, zoom, place);
    setView(clampView({ z: zoom, x: pan.x, y: pan.y, pitch: current.pitch }));
  }

  function zoomBy(factor) {
    zoomAbout(origin, factor);
  }

  function nudge(dx, dy) {
    const current = viewRef.current;
    setView(clampView({ ...current, x: current.x + dx, y: current.y + dy }));
  }

  function enterMoons() {
    if (!moonTarget) return;
    stopFocus();
    systemViewRef.current = viewRef.current;
    setMoonPick(null);
    setHoverId(null);
    setMoonWorldId(moonTarget.id);
    const next = { ...FIT, pitch: viewRef.current.pitch || 0 };
    viewRef.current = next;
    setView(next);
  }

  function leaveMoons(fit) {
    stopFocus();
    const pitch = viewRef.current.pitch || 0;
    const restored = fit
      ? { ...FIT, pitch }
      : { ...(systemViewRef.current || FIT) };
    setMoonWorldId(null);
    setMoonPick(null);
    setHoverId(null);
    viewRef.current = restored;
    setView(restored);
  }

  function fitFrame() {
    if (lunar) {
      leaveMoons(true);
      return;
    }
    stopFocus();
    setView({ ...FIT, pitch: viewRef.current.pitch || 0 });
  }

  function pitchBy(delta) {
    const current = viewRef.current;
    const next = clampView({ ...current, pitch: (current.pitch || 0) + delta });
    viewRef.current = next;
    setView(next);
  }

  function onKey(event) {
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const step = 36;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(ZOOM_STEP);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomBy(1 / ZOOM_STEP);
    } else if (event.key === '0' || event.key === 'Home') {
      event.preventDefault();
      fitFrame();
    } else if (event.key === 'Escape' && lunar) {
      event.preventDefault();
      leaveMoons(false);
    } else if (event.key === '[') {
      event.preventDefault();
      pitchBy(-PITCH_STEP);
    } else if (event.key === ']') {
      event.preventDefault();
      pitchBy(PITCH_STEP);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      nudge(step, 0);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      nudge(-step, 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      nudge(0, step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      nudge(0, -step);
    }
  }

  function onPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    stopFocus();
    const touchAtFit = event.pointerType === 'touch' && isFit(viewRef.current) && pointers.current.size === 0;
    if (touchAtFit) return;
    const svg = event.currentTarget;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const onMark = !!event.target.closest?.('[data-orrery-world]');
    if (pointers.current.size >= 2) {
      dragRef.current = null;
      setDragging(false);
      const pts = [...pointers.current.values()];
      const mid = clientToViewBox(svg, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      const current = viewRef.current;
      pinchRef.current = {
        dist: Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)),
        z: current.z,
        world: worldAt(mid, current, origin),
      };
      for (const id of pointers.current.keys()) {
        try { svg.setPointerCapture(id); } catch { /* already released */ }
      }
      return;
    }
    if (onMark) return;
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      px: viewRef.current.x,
      py: viewRef.current.y,
      moved: false,
    };
  }

  function onPointerMove(event) {
    const known = pointers.current.get(event.pointerId);
    if (known) {
      known.x = event.clientX;
      known.y = event.clientY;
    }
    const svg = event.currentTarget;
    if (pinchRef.current && pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
      const mid = clientToViewBox(svg, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      const zoom = clamp(pinchRef.current.z * (dist / pinchRef.current.dist), ZOOM_MIN, ZOOM_MAX);
      const pan = panToHold(pinchRef.current.world, mid, zoom, origin);
      setView(clampView({ z: zoom, x: pan.x, y: pan.y, pitch: viewRef.current.pitch }));
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const delta = viewDelta(svg, drag.x, drag.y, event.clientX, event.clientY);
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
    if (!drag.moved) {
      try { svg.setPointerCapture(event.pointerId); } catch { /* already released */ }
    }
    drag.moved = true;
    setDragging(true);
    setView(clampView({ z: viewRef.current.z, x: drag.px + delta.x, y: drag.py + delta.y, pitch: viewRef.current.pitch }));
  }

  function endPointer(event) {
    const drag = dragRef.current;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (!drag.moved && !event.target.closest?.('[data-orrery-world]')) {
      if (lunar) {
        setMoonPick(null);
        return;
      }
      onClear?.();
    }
  }

  function onDoubleClick(event) {
    if (event.target.closest?.('[data-orrery-world]')) return;
    fitFrame();
  }

  const box = skyViewBox(frame, metrics);
  boxRef.current = box;
  const plate = `translate(${origin.x} ${origin.y}) scale(${view.z}) translate(${view.x / view.z} ${view.y / view.z}) translate(${-origin.x} ${-origin.y})`;

  const skyLabel = lunar
    ? `Moons of ${moonWorld?.name || moonWorld?.worldType || 'the selected world'}. Drag to pan. Scroll to zoom. System returns to the star system. Fit returns and fits it.`
    : 'System orrery. Drag to pan. Scroll or use the zoom controls. Raise the view to see a tilted orbit. Double-click empty sky to fit.';
  const dimmed = lunar ? !!moonPick : !!selectedId;

  return (
    <div className={dimmed ? 'orrery orrery--selected' : 'orrery'}>
      <div className="orrery-stage" tabIndex={0} onKeyDown={onKey}>
        <svg
          ref={skyRef}
          className={skyClass}
          viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
          preserveAspectRatio="xMidYMid meet"
          overflow="hidden"
          role="group"
          aria-label={skyLabel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onDoubleClick={onDoubleClick}
          onMouseLeave={() => setHoverId(null)}
        >
          <rect data-sky="1" x={box.x} y={box.y} width={box.width} height={box.height} fill="transparent" pointerEvents="all" />
          <g key={lunar ? `moons-${moonWorld.id}` : 'system'} className="orrery-plate" transform={plate}>
            {frame.belt && (
              <g pointerEvents="none">
                <path
                  d={frame.belt.bandPath}
                  className={frame.belt.narrow ? 'orrery-kuiper orrery-kuiper--narrow' : 'orrery-kuiper'}
                  fillRule="evenodd"
                >
                  <title>{`Kuiper belt, ${frame.belt.label.text} AU`}</title>
                </path>
                {(frame.belt.narrow ? [frame.belt.midPath] : [frame.belt.innerPath, frame.belt.outerPath]).map(path => (
                  <path
                    key={path}
                    d={path}
                    className={frame.belt.narrow ? 'orrery-kuiper-edge orrery-kuiper-edge--narrow' : 'orrery-kuiper-edge'}
                  />
                ))}
              </g>
            )}
            {frame.hz && (
              <path
                d={frame.hz.bandPath}
                fill={C.HABITABLE || '#4CAF7D'}
                fillOpacity="0.10"
                fillRule="evenodd"
              />
            )}
            {frame.hz && [frame.hz.innerPath, frame.hz.outerPath].map(path => (
              <path
                key={path}
                d={path}
                fill="none"
                stroke={C.HABITABLE || '#4CAF7D'}
                strokeOpacity="0.4"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <g stroke={C.BORDER_HI} strokeWidth="1" opacity="0.8" pointerEvents="none">
              <line x1={frame.cx - 4} y1={frame.cy} x2={frame.cx + 4} y2={frame.cy} vectorEffect="non-scaling-stroke" />
              <line x1={frame.cx} y1={frame.cy - 4} x2={frame.cx} y2={frame.cy + 4} vectorEffect="non-scaling-stroke" />
            </g>
            {frame.stars.map(star => star.ringPath && (
              <path
                key={`orbit-${star.label}`}
                d={star.ringPath}
                fill="none"
                stroke={star.color}
                strokeOpacity="0.35"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {frame.bodies.map(body => (
              <g key={`ring-${body.id}`} pointerEvents="none">
                <path className={ringClass(body, hoverId)} d={body.path} />
                {body.outerPath && (
                  <path className={ringClass(body, hoverId)} d={body.outerPath} />
                )}
                {body.specks?.map((speck, speckIndex) => (
                  <circle
                    key={speckIndex}
                    cx={speck.x}
                    cy={speck.y}
                    r={speck.r}
                    fill={mixHex(ink(body), '#14110e', speck.shade || 0)}
                    opacity="0.9"
                  />
                ))}
              </g>
            ))}
            {frame.comets?.map(comet => (
              <g key={`comet-path-${comet.id}`} pointerEvents="none">
                {comet.paths.map(path => (
                  <path key={path} className="orrery-comet-path" d={path} stroke={comet.color} />
                ))}
              </g>
            ))}
            {frame.stars.map(star => (
              <g
                key={`star-${star.label}`}
                transform={`translate(${star.x} ${star.y})`}
                onMouseEnter={() => setHoverId(`star:${star.label}`)}
                onMouseLeave={() => setHoverId(current => (current === `star:${star.label}` ? null : current))}
              >
                <circle className="orrery-hit" r={star.r + 4} />
                {hoverId === `star:${star.label}` && <Reticle radius={star.r + 5} />}
                <StarGlyph
                  color={star.color}
                  r={star.r}
                  spectralClass={star.spectralClass}
                  primary={star.primary}
                />
              </g>
            ))}
            {frame.parent && (
              <g
                className="orrery-mark"
                data-orrery-world={frame.parent.id}
                transform={`translate(${frame.parent.markX} ${frame.parent.markY})`}
                role="button"
                tabIndex={0}
                aria-label={`${frame.parent.label}, parent world`}
                onMouseEnter={() => setHoverId(frame.parent.id)}
                onMouseLeave={() => setHoverId(current => (current === frame.parent.id ? null : current))}
                onFocus={() => setHoverId(frame.parent.id)}
                onBlur={() => setHoverId(current => (current === frame.parent.id ? null : current))}
                onClick={() => setMoonPick(null)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setMoonPick(null);
                  }
                }}
              >
                <circle className="orrery-hit" r={frame.parent.radius + 8} />
                {(frame.parent.selected || hoverId === frame.parent.id) && (
                  <Reticle radius={reticleRadius(frame.parent)} locked={frame.parent.selected} />
                )}
                <BodyGlyph body={frame.parent} />
                <NamePlate
                  x={0}
                  y={(() => {
                    const metrics = nameplateMetrics(view.z, true);
                    const rest = frame.parent.radius + 16;
                    const clear = reticleRadius(frame.parent) + (metrics.boxH / 2 + 10) / view.z;
                    return rest + (clear - rest) * metrics.t;
                  })()}
                  zoom={view.z}
                  fill={C.TEXT_DIM}
                  emphasis
                >
                  {frame.parent.label}
                </NamePlate>
              </g>
            )}
            {frame.stars.map(star => {
              const label = starLabelPoint(star, frame.cx);
              return (
                <PlateText
                  key={`star-label-${star.label}`}
                  x={label.x}
                  y={label.y}
                  zoom={view.z}
                  anchor={label.anchor}
                  fill={C.TEXT_DIM}
                >
                  {frame.stars.length > 1 ? star.label : starLabelSingle(system)}
                </PlateText>
              );
            })}
            {frame.belt?.label && (
              <PlateText
                x={frame.belt.label.x}
                y={frame.belt.label.y}
                zoom={view.z}
                anchor={frame.belt.label.anchor}
                fill="#8aa4b8"
                size={10}
              >
                {frame.belt.label.text}
              </PlateText>
            )}
            {frame.hz?.labels.map(label => (
              <PlateText
                key={`hz-${label.text}-${label.r}`}
                x={label.x}
                y={label.y}
                zoom={view.z}
                anchor={label.anchor}
                fill={C.HABITABLE || '#4CAF7D'}
              >
                {label.text}
              </PlateText>
            ))}
            {frame.bodies.map(body => body.label && !body.moon && !body.selected && (
              <PlateText
                key={`label-${body.id}`}
                x={body.label.x}
                y={body.label.y}
                zoom={view.z}
                anchor={body.label.anchor}
                fill={C.TEXT_DIM}
                size={10}
              >
                {body.label.text}
              </PlateText>
            ))}
            {frame.bodies.map(body => {
              const world = worlds.find(item => item.id === body.id);
              const name = body.moon
                ? `M${body.index + 1} ${body.moonType}`
                : (world?.name || body.worldType);
              const detail = body.moon
                ? (body.habitable ? ', life-bearing' : '')
                : `, ${body.au} AU${body.inclination ? `, inclined ${body.inclination}°` : ''}${body.habitable ? ', habitable' : ''}`;
              const choose = () => {
                if (body.moon) {
                  setMoonPick(body.id);
                  return;
                }
                onSelect?.(body.id);
              };
              return (
                <g
                  key={`mark-${body.id}`}
                  className={body.selected ? 'orrery-mark orrery-mark--selected' : 'orrery-mark'}
                  data-orrery-world={body.id}
                  transform={`translate(${body.markX} ${body.markY})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${body.moon ? '' : `[${body.index + 1}] `}${name}${detail}`}
                  aria-pressed={body.selected}
                  onMouseEnter={() => setHoverId(body.id)}
                  onMouseLeave={() => setHoverId(current => (current === body.id ? null : current))}
                  onFocus={() => setHoverId(body.id)}
                  onBlur={() => setHoverId(current => (current === body.id ? null : current))}
                  onClick={choose}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      choose();
                    }
                  }}
                >
                  <circle className="orrery-hit" r={body.moon ? 12 : 16} />
                  {(body.selected || hoverId === body.id) && (
                    <Reticle radius={reticleRadius(body)} locked={body.selected} />
                  )}
                  <BodyGlyph body={body} />
                </g>
              );
            })}
            {frame.bodies.map(body => body.habitable && (
              <LifeBracket key={`life-${body.id}`} body={body} frame={frame} zoom={view.z} />
            ))}
            {frame.bodies.map(body => {
              if (!body.label || (!body.moon && !body.selected)) return null;
              const emphasis = body.selected || hoverId === body.id;
              const metrics = nameplateMetrics(view.z, emphasis);
              const caption = nameplatePoint(body, frame, view.z, metrics);
              const travel = Math.min(1, Math.max(0, (metrics.t - 0.12) / 0.88));
              const plateFade = Math.min(1, Math.max(0, (metrics.t - 0.12) / 0.38));
              const captionFade = 1 - Math.min(1, metrics.t / 0.4);
              const fill = emphasis ? C.TEXT : C.TEXT_DIM;
              return (
                <g key={`name-${body.id}`} pointerEvents="none">
                  {captionFade > 0.02 && (
                    <>
                      {body.selected && (
                        <line
                          x1={body.ringX}
                          y1={body.ringY}
                          x2={body.label.anchor === 'start' ? body.label.x - 4 : body.label.x + 4}
                          y2={body.label.y}
                          stroke={C.BORDER_HI}
                          strokeWidth="1"
                          strokeOpacity={captionFade}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      <PlateText
                        x={body.label.x}
                        y={body.label.y}
                        zoom={view.z}
                        anchor={body.label.anchor}
                        fill={fill}
                        size={emphasis ? 12 : 10}
                        opacity={captionFade}
                      >
                        {body.label.text}
                      </PlateText>
                    </>
                  )}
                  {plateFade > 0.02 && (
                    <NamePlate
                      x={body.label.x + (caption.x - body.label.x) * travel}
                      y={body.label.y + (caption.y - body.label.y) * travel}
                      zoom={view.z}
                      fill={fill}
                      emphasis={emphasis}
                      opacity={plateFade}
                    >
                      {body.label.text}
                    </NamePlate>
                  )}
                </g>
              );
            })}
            {frame.comets?.map(comet => (
              <CometMark key={`comet-${comet.id}`} comet={comet} />
            ))}
          </g>
        </svg>
        <div className="orrery-nav">
          <button
            type="button"
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            disabled={view.z <= ZOOM_MIN + 0.001}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
          <span className="orrery-zoom" aria-hidden="true">{formatZoom(view.z)}</span>
          <button
            type="button"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={view.z >= ZOOM_MAX - 0.001}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={fitFrame}
            disabled={fitted && !lunar}
            aria-label={lunar ? 'Leave the moons and fit the system' : 'Fit the system'}
            title={lunar ? 'Leave the moons and fit the system' : 'Fit the system'}
          >
            FIT
          </button>
        </div>
        {moonTarget && (
          <div className={lunar ? 'orrery-nav orrery-layer orrery-layer--back' : 'orrery-nav orrery-layer'}>
            <button
              type="button"
              onClick={lunar ? () => leaveMoons(false) : enterMoons}
              aria-label={lunar ? 'Return to the system' : `Show the moons of ${moonTarget.name || moonTarget.worldType}`}
              title={lunar ? 'Return to the system' : 'Show the moons'}
            >
              {lunar ? 'SYSTEM' : 'MOONS'}
            </button>
          </div>
        )}
        <div className="orrery-nav orrery-pitch">
          <button
            type="button"
            onClick={() => pitchBy(-PITCH_STEP)}
            disabled={(view.pitch || 0) <= 0.5}
            aria-label="Flatten the view"
            title="Flatten the view"
          >
            −
          </button>
          <span className="orrery-zoom" aria-hidden="true">{formatPitch(view.pitch)}</span>
          <button
            type="button"
            onClick={() => pitchBy(PITCH_STEP)}
            disabled={(view.pitch || 0) >= PITCH_MAX - 0.5}
            aria-label="Raise the view"
            title="Raise the view"
          >
            +
          </button>
        </div>
      </div>
      <div className="orrery-side" ref={sideRef}>
        <div className="orrery-readout">
          <span>{[frame.span, frame.pair].filter(Boolean).join(' · ')}</span>
          <span className="orrery-readout-focus">{readout}</span>
        </div>
        {selectedWorld && (
          <SunPlate world={selectedWorld} stars={system.stars} separation={system.separation} />
        )}
      </div>
    </div>
  );
}
