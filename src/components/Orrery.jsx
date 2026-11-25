import { useState } from 'react';
import { C, ZONE_COLORS } from '../tokens.js';
import { worldYearLabel } from '../data/generator.js';
import {
  SOL_ANGULAR_DEGREES,
  apparentSuns,
  buildOrrery,
  formatAngular,
  sunMeasure,
} from '../data/orrery.js';

const INK = 'var(--font-mono)';

const DISC = {
  'Gas Giant': 8,
  'Ice Giant': 6.5,
  'Gas Dwarf': 6.5,
};

function zoneColor(zone) {
  return ZONE_COLORS[zone] || C.PRIMARY;
}

function BodyGlyph({ body }) {
  const color = zoneColor(body.zone);
  if (body.belt) {
    return (
      <g fill={color}>
        <circle cx="-6" r="1.5" />
        <circle r="1.8" />
        <circle cx="6" r="1.4" />
      </g>
    );
  }
  if (body.worldType === 'Double Planet') {
    return (
      <g fill={color}>
        <circle cx="-3.2" r="4.2" />
        <circle cx="3.2" r="4.2" />
      </g>
    );
  }
  const giant = body.worldType === 'Gas Giant' || body.worldType === 'Ice Giant';
  const radius = body.selected ? 8 : (DISC[body.worldType] || 5);
  return (
    <g>
      {giant && (
        <ellipse
          rx={radius + 6}
          ry={Math.max(2.2, radius * 0.38)}
          fill="none"
          stroke={color}
          strokeWidth="1"
          transform="rotate(-18)"
        />
      )}
      {body.worldType === 'Coreless' ? (
        <circle r={radius} fill="none" stroke={color} strokeWidth="1.6" />
      ) : (
        <circle r={radius} fill={color} />
      )}
      {body.habitable && (
        <circle r={radius + 3.5} fill="none" stroke={C.HABITABLE} strokeWidth="1" />
      )}
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
          const radius = Math.max(disc.text === 'point' ? 1.3 : 1.6, ((disc.degrees || 0) / 2) * px);
          return (
            <g key={disc.label}>
              <circle cx={cx} cy="46" r={radius} fill={disc.color} />
              <circle
                cx={cx}
                cy="46"
                r={solRadius * px}
                fill="none"
                stroke={C.TEXT_FAINT}
                strokeWidth="1"
                strokeDasharray="2 2.5"
              />
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

/**
 * Face-on instrument for one system. A rogue renders nothing, so the
 * center column stays shut.
 */
export default function Orrery({ system, selectedId, onSelect, onClear }) {
  const [hoverId, setHoverId] = useState(null);
  if (!system || system.isRoguePlanet || !system.stars?.length) return null;

  const layout = buildOrrery(system, selectedId);
  const worlds = system.worlds || [];
  const focusId = hoverId || selectedId;
  const focusBody = layout.bodies.find(body => body.id === focusId) || null;
  const focusWorld = worlds.find(world => world.id === focusId) || null;
  const selectedWorld = worlds.find(world => world.id === selectedId) || null;
  const readout = readoutText(focusBody, focusWorld, system.stars);

  const onSkyClick = event => {
    if (event.target.closest && event.target.closest('[data-orrery-world]')) return;
    onClear?.();
  };

  return (
    <div className={selectedId ? 'orrery orrery--selected' : 'orrery'}>
      <svg
        className="orrery-sky"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        overflow="hidden"
        role="img"
        aria-label="System orrery"
        onClick={onSkyClick}
        onMouseLeave={() => setHoverId(null)}
      >
        <rect data-sky="1" width={layout.width} height={layout.height} fill="transparent" />
        {layout.hz && (
          <path
            d={annulus(layout.cx, layout.cy, layout.hz.rInner, layout.hz.rOuter)}
            fill={C.HABITABLE}
            fillOpacity="0.10"
            fillRule="evenodd"
          />
        )}
        {layout.hz && [layout.hz.rInner, layout.hz.rOuter].map(radius => (
          <circle
            key={radius}
            cx={layout.cx}
            cy={layout.cy}
            r={radius}
            fill="none"
            stroke={C.HABITABLE}
            strokeOpacity="0.4"
            strokeWidth="1"
          />
        ))}
        <g stroke={C.BORDER_HI} strokeWidth="1" opacity="0.8" pointerEvents="none">
          <line x1={layout.cx - 4} y1={layout.cy} x2={layout.cx + 4} y2={layout.cy} />
          <line x1={layout.cx} y1={layout.cy - 4} x2={layout.cx} y2={layout.cy + 4} />
        </g>
        {layout.stars.map(star => star.ringR > 0 && (
          <circle
            key={`orbit-${star.label}`}
            cx={layout.cx}
            cy={layout.cy}
            r={star.ringR}
            fill="none"
            stroke={star.color}
            strokeOpacity="0.35"
            strokeWidth="1"
          />
        ))}
        {layout.bodies.map(body => (
          <g key={`ring-${body.id}`} pointerEvents="none">
            <circle
              className={ringClass(body, hoverId)}
              cx={layout.cx}
              cy={layout.cy}
              r={body.ringR}
            />
            {body.circumbinary && (
              <circle
                className={ringClass(body, hoverId)}
                cx={layout.cx}
                cy={layout.cy}
                r={body.ringR + 3}
              />
            )}
          </g>
        ))}
        {layout.stars.map(star => (
          <g key={`star-${star.label}`} pointerEvents="none">
            <circle cx={star.x} cy={star.y} r={star.r + 2.6} fill="none" stroke={star.color} strokeOpacity="0.4" strokeWidth="1" />
            <circle cx={star.x} cy={star.y} r={star.r} fill={star.color} />
            <text
              x={starLabelX(star, layout.cx)}
              y={star.ringR === 0 ? star.y + star.r + 12 : star.y + 3}
              textAnchor={starTextAnchor(star, layout.cx)}
              fill={C.TEXT_DIM}
              fontFamily={INK}
              fontSize="10"
              letterSpacing="1"
              dominantBaseline="middle"
            >
              {layout.stars.length > 1 ? star.label : starLabelSingle(system)}
            </text>
          </g>
        ))}
        {layout.hz?.labels.map(label => (
          <text
            key={`hz-${label.text}-${label.r}`}
            x={label.x}
            y={label.y}
            textAnchor={label.anchor}
            fill={C.HABITABLE}
            fontFamily={INK}
            fontSize="10"
            letterSpacing="1"
            dominantBaseline="middle"
            pointerEvents="none"
          >
            {label.text}
          </text>
        ))}
        {layout.bodies.map(body => body.label && (
          <g key={`label-${body.id}`} pointerEvents="none">
            {body.selected && (
              <line
                x1={layout.cx + Math.cos(layout.labelAngle) * body.ringR}
                y1={layout.cy + Math.sin(layout.labelAngle) * body.ringR}
                x2={body.label.anchor === 'start' ? body.label.x - 4 : body.label.x + 4}
                y2={body.label.y}
                stroke={C.BORDER_HI}
                strokeWidth="1"
              />
            )}
            <text
              x={body.label.x}
              y={body.label.y}
              textAnchor={body.label.anchor}
              fill={body.selected ? C.TEXT : C.TEXT_DIM}
              fontFamily={INK}
              fontSize={body.selected ? 12 : 10}
              letterSpacing="1"
              dominantBaseline="middle"
            >
              {body.label.text}
            </text>
          </g>
        ))}
        {layout.bodies.map(body => {
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
              aria-label={`[${body.index + 1}] ${name}, ${body.au} AU`}
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
      </svg>
      <div className="orrery-side">
        <div className="orrery-readout">
          <span>{[layout.span, layout.pair].filter(Boolean).join(' · ')}</span>
          <span className="orrery-readout-focus">{readout}</span>
        </div>
        {selectedWorld && (
          <SunPlate world={selectedWorld} stars={system.stars} separation={system.separation} />
        )}
      </div>
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

function starLabelX(star, cx) {
  if (star.ringR === 0 && Math.abs(star.x - cx) < 1) return star.x;
  if (star.x >= cx) return star.x + star.r + 6;
  return star.x - star.r - 6;
}

function starTextAnchor(star, cx) {
  if (star.ringR === 0 && Math.abs(star.x - cx) < 1) return 'middle';
  return star.x >= cx ? 'start' : 'end';
}

function starLabelSingle(system) {
  return system.stars?.[0]?.spectralClass || '';
}

function annulus(cx, cy, r0, r1) {
  const inner = Math.min(r0, r1);
  const outer = Math.max(r1, inner + 0.8);
  return [
    `M ${cx + outer} ${cy}`,
    `A ${outer} ${outer} 0 1 0 ${cx - outer} ${cy}`,
    `A ${outer} ${outer} 0 1 0 ${cx + outer} ${cy}`,
    `M ${cx + inner} ${cy}`,
    `A ${inner} ${inner} 0 1 1 ${cx - inner} ${cy}`,
    `A ${inner} ${inner} 0 1 1 ${cx + inner} ${cy}`,
    'Z',
  ].join(' ');
}
