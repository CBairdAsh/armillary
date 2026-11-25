import { useEffect, useId, useRef, useState } from 'react';
import { C, ZONE_COLORS } from '../tokens.js';
import { worldYearLabel } from '../data/generator.js';
import {
  SOL_ANGULAR_DEGREES,
  apparentSuns,
  buildOrrery,
  formatAngular,
  sunMeasure,
} from '../data/orrery.js';
import { planetDiscUrl } from '../data/planetDisc.js';
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

function ShadedDisc({ uid, r, color, kind }) {
  const fill = `fill-${uid}`;
  const clip = `clip-${uid}`;
  const limb = darken(color, kind === 'Chthonian' ? 0.28 : 0.7);
  const disc = planetDiscUrl(color, kind);
  const bands = !disc && (kind === 'Gas Giant' || kind === 'Ice Giant' || kind === 'Gas Dwarf');
  const bandOpacity = kind === 'Gas Dwarf' ? 0.1 : 0.18;
  return (
    <g>
      <defs>
        {disc ? (
          <radialGradient id={fill} cx="30%" cy="26%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
            <stop offset="20%" stopColor="#ffffff" stopOpacity="0.2" />
            <stop offset="48%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="80%" stopColor="#041018" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#041018" stopOpacity="0.62" />
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
    </g>
  );
}

function Belt({ color, uid }) {
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

function Twin({ color, uid }) {
  return (
    <g>
      <g transform="translate(-3.2 0)">
        <ShadedDisc uid={`${uid}a`} r={4.2} color={color} kind="Terrestrial" />
      </g>
      <g transform="translate(3.2 0)">
        <ShadedDisc uid={`${uid}b`} r={4.2} color={darken(color, 0.16)} kind="Terrestrial" />
      </g>
    </g>
  );
}

function Coreless({ color, r }) {
  return (
    <g>
      <circle r={r} fill={color} fillOpacity="0.14" stroke={color} strokeWidth="1.6" />
      <circle r={r * 0.4} fill="none" stroke="#7EC8E3" strokeWidth="1.1" strokeDasharray="2 1.6" />
    </g>
  );
}

function Tail({ r, color }) {
  return (
    <g fill={color}>
      <circle cx={r + 3.2} cy="0.3" r="1.05" opacity="0.8" />
      <circle cx={r + 6.2} cy="-0.5" r="0.75" opacity="0.55" />
      <circle cx={r + 8.6} cy="0.7" r="0.5" opacity="0.35" />
    </g>
  );
}

function GiantRing({ r, color }) {
  return (
    <ellipse
      rx={r + 6}
      ry={Math.max(2.2, r * 0.38)}
      fill="none"
      stroke={color}
      strokeOpacity="0.72"
      strokeWidth="1.15"
      transform="rotate(-18)"
    />
  );
}

function BodyGlyph({ body }) {
  const uid = svgId(useId());
  const color = zoneColor(body.zone);
  if (body.belt) return <Belt color={color} uid={uid} />;
  if (body.worldType === 'Double Planet') return <Twin color={color} uid={uid} />;
  const radius = body.selected ? 8 : (DISC[body.worldType] || 5);
  if (body.worldType === 'Coreless') return <Coreless color={color} r={radius} />;
  const giant = body.worldType === 'Gas Giant' || body.worldType === 'Ice Giant';
  return (
    <g>
      {giant && <GiantRing r={radius} color={color} />}
      <ShadedDisc uid={uid} r={radius} color={color} kind={body.worldType} />
      {body.worldType === 'Disintegrating' && <Tail r={radius} color={color} />}
      {body.habitable && (
        <circle r={radius + 3.5} fill="none" stroke={C.HABITABLE || '#4CAF7D'} strokeWidth="1" />
      )}
    </g>
  );
}

function PlateText({ x, y, zoom, anchor = 'middle', fill, size = 10, children }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${1 / zoom})`} pointerEvents="none">
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

function readoutText(body, world, stars) {
  if (!body || !world) return '';
  const name = world.name || world.worldType;
  const year = worldYearLabel(world, stars);
  const bits = [`[${body.index + 1}] ${name}`, `${world.orbitalAU} AU`];
  if (year) bits.push(`year ${year}`);
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
 */
export default function Orrery({ system, selectedId, onSelect, onClear }) {
  const [hoverId, setHoverId] = useState(null);
  const [view, setView] = useState(FIT);
  const [dragging, setDragging] = useState(false);
  const skyRef = useRef(null);
  const sideRef = useRef(null);
  const frameRef = useRef(null);
  const boxRef = useRef(null);
  const viewRef = useRef(view);
  const [metrics, setMetrics] = useState(null);
  const dragRef = useRef(null);
  const pointers = useRef(new Map());
  const pinchRef = useRef(null);
  viewRef.current = view;

  function clampView(next) {
    const plate = frameRef.current;
    const box = boxRef.current;
    if (!plate || !box) return next;
    const zoom = clamp(next.z, ZOOM_MIN, ZOOM_MAX);
    const span = 210 * Math.max(0, zoom - 1);
    const roomX = Math.max(12, box.width / 2 - 28) + span;
    const roomY = Math.max(12, box.height / 2 - 28) + span;
    return {
      z: zoom,
      x: clamp(next.x, -roomX, roomX),
      y: clamp(next.y, -roomY, roomY),
      pitch: clamp(next.pitch || 0, 0, PITCH_MAX),
    };
  }

  const alive = !!(system && !system.isRoguePlanet && system.stars?.length);
  const frame = alive ? buildOrrery(system, selectedId, view.pitch) : null;
  frameRef.current = frame;

  useEffect(() => {
    setView(FIT);
    setHoverId(null);
    setDragging(false);
  }, [system?.id]);

  useEffect(() => {
    const node = skyRef.current;
    if (!node || !frameRef.current) return undefined;
    const onWheel = event => {
      event.preventDefault();
      const plate = frameRef.current;
      if (!plate) return;
      const current = viewRef.current;
      const screen = clientToViewBox(node, event.clientX, event.clientY);
      const origin = { x: plate.cx, y: plate.cy };
      const world = worldAt(screen, current, origin);
      const zoom = clamp(current.z * Math.exp(-event.deltaY * 0.0022), ZOOM_MIN, ZOOM_MAX);
      const pan = panToHold(world, screen, zoom, origin);
      setView(clampView({ z: zoom, x: pan.x, y: pan.y }));
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

  const worlds = system.worlds || [];
  const focusId = hoverId || selectedId;
  const focusBody = frame.bodies.find(body => body.id === focusId) || null;
  const focusWorld = worlds.find(world => world.id === focusId) || null;
  const selectedWorld = worlds.find(world => world.id === selectedId) || null;
  const readout = readoutText(focusBody, focusWorld, system.stars);
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

  function fitFrame() {
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
    if (!drag.moved && !event.target.closest?.('[data-orrery-world]')) onClear?.();
  }

  function onDoubleClick(event) {
    if (event.target.closest?.('[data-orrery-world]')) return;
    fitFrame();
  }

  const box = skyViewBox(frame, metrics);
  boxRef.current = box;
  const plate = `translate(${origin.x} ${origin.y}) scale(${view.z}) translate(${view.x / view.z} ${view.y / view.z}) translate(${-origin.x} ${-origin.y})`;

  return (
    <div className={selectedId ? 'orrery orrery--selected' : 'orrery'}>
      <div className="orrery-stage" tabIndex={0} onKeyDown={onKey}>
        <svg
          ref={skyRef}
          className={skyClass}
          viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
          preserveAspectRatio="xMidYMid meet"
          overflow="hidden"
          role="group"
          aria-label="System orrery. Drag to pan. Scroll or use the zoom controls. Raise the view to see a tilted orbit. Double-click empty sky to fit."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onDoubleClick={onDoubleClick}
          onMouseLeave={() => setHoverId(null)}
        >
          <rect data-sky="1" x={box.x} y={box.y} width={box.width} height={box.height} fill="transparent" pointerEvents="all" />
          <g transform={plate}>
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
              </g>
            ))}
            {frame.stars.map(star => (
              <g key={`star-${star.label}`} transform={`translate(${star.x} ${star.y})`}>
                <StarGlyph
                  color={star.color}
                  r={star.r}
                  spectralClass={star.spectralClass}
                  primary={star.primary}
                />
              </g>
            ))}
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
            {frame.bodies.map(body => body.label && (
              <g key={`label-${body.id}`} pointerEvents="none">
                {body.selected && (
                  <line
                    x1={body.ringX}
                    y1={body.ringY}
                    x2={body.label.anchor === 'start' ? body.label.x - 4 : body.label.x + 4}
                    y2={body.label.y}
                    stroke={C.BORDER_HI}
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <PlateText
                  x={body.label.x}
                  y={body.label.y}
                  zoom={view.z}
                  anchor={body.label.anchor}
                  fill={body.selected ? C.TEXT : C.TEXT_DIM}
                  size={body.selected ? 12 : 10}
                >
                  {body.label.text}
                </PlateText>
              </g>
            ))}
            {frame.bodies.map(body => {
              const world = worlds.find(item => item.id === body.id);
              const name = world?.name || body.worldType;
              return (
                <g
                  key={`mark-${body.id}`}
                  className={body.selected ? 'orrery-mark orrery-mark--selected' : 'orrery-mark'}
                  data-orrery-world={body.id}
                  transform={`translate(${body.markX} ${body.markY})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`[${body.index + 1}] ${name}, ${body.au} AU${body.inclination ? `, inclined ${body.inclination}°` : ''}`}
                  aria-pressed={body.selected}
                  onMouseEnter={() => setHoverId(body.id)}
                  onMouseLeave={() => setHoverId(current => (current === body.id ? null : current))}
                  onClick={() => onSelect?.(body.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect?.(body.id);
                    }
                  }}
                >
                  <circle className="orrery-hit" r="16" />
                  {body.selected && (
                    <circle r="12" fill="none" stroke={C.BORDER_HI} strokeWidth="1" pointerEvents="none" />
                  )}
                  <BodyGlyph body={body} />
                </g>
              );
            })}
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
            disabled={fitted}
            aria-label="Fit the system"
            title="Fit the system"
          >
            FIT
          </button>
        </div>
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
