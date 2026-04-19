import { useState, useCallback, useEffect } from 'react';
import { generateSystem, redrawSystem, regenerateSpeciesForWorld, generateTextSummary } from './data/generator.js';
import { SPECTRAL_CLASSES, WORLD_TYPES, ORBITAL_ZONES } from './data/stellarData.js';
import { C, FONTS, ZONE_COLORS, navBtn, cardStyle, lockStripeStyle, lockBtnStyle, panelStyle } from './tokens.js';
import BootSequence from './components/BootSequence.jsx';
import { KOFI_URL, SUBSTACK_URL, LIVE_URL, LINKTREE } from './config.js';

// ─── UTILITY COMPONENTS ───────────────────────────────────────────────────────
function Label({ children, color = C.PRIMARY_L }) {
  return <span style={{ fontFamily: FONTS.MONO, fontSize: 13, letterSpacing: 2, color, textTransform: 'uppercase' }}>{children}</span>;
}
function Value({ children, color = C.TEXT, size = 15 }) {
  return <span style={{ fontFamily: FONTS.MONO, fontSize: size, color, letterSpacing: 1 }}>{children}</span>;
}
// Label stacked above value — fixes the alignment confusion in species cards
function DataPair({ label, value, color = C.TEXT }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontFamily: FONTS.MONO, fontSize: 11, letterSpacing: 2, color: C.TEXT_DIM, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color, letterSpacing: 1 }}>{value}</span>
    </div>
  );
}
// Horizontal label/value for star cards
function DataRow({ label, value, color = C.TEXT }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
      <span style={{ fontFamily: FONTS.MONO, fontSize: 11, letterSpacing: 2, color: C.TEXT_DIM, textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color, letterSpacing: 1, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
function Divider({ label, color = C.BORDER }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
      <div style={{ flex: 1, height: 1, background: color }}/>
      {label && <span style={{ fontFamily: FONTS.MONO, fontSize: 11, letterSpacing: 3, color: C.TEXT_DIM }}>{label}</span>}
      <div style={{ width: 6, height: 6, background: color, transform: 'rotate(45deg)', flexShrink: 0 }}/>
      <div style={{ flex: 1, height: 1, background: color }}/>
    </div>
  );
}
function Tag({ children, color = C.PRIMARY }) {
  return (
    <span style={{ background: color + '22', border: `1px solid ${color}55`, borderRadius: 2, color, fontFamily: FONTS.MONO, fontSize: 11, letterSpacing: 1, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}
function LockBtn({ locked, onToggle, color = C.PRIMARY }) {
  return (
    <button onClick={onToggle} style={{ ...lockBtnStyle(locked, color, false), fontSize: 10, padding: '3px 10px', flexShrink: 0 }}>
      {locked ? 'LOCKED' : 'LOCK'}
    </button>
  );
}

// ─── NEIGHBORHOOD CARD ────────────────────────────────────────────────────────
function ExoticInfoPanel({ obj, onClose }) {
  const color = obj.color || '#8866CC';
  return (
    <div style={{ background: C.PANEL_ALT, border: `1px solid ${color}55`, borderRadius: 4, padding: '14px 16px', marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{obj.icon}</span>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 14, color, letterSpacing: 2 }}>{obj.label}</span>
          <Tag color={color}>{obj.objectType.toUpperCase()}</Tag>
        </div>
        <button onClick={onClose} style={navBtn(false, C.TEXT_DIM, true)}>✕ CLOSE</button>
      </div>
      <div style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.TEXT, lineHeight: 1.8, marginBottom: 8 }}>
        {obj.description}
      </div>
      {obj.size      && <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM, marginBottom: 4 }}>Est. diameter: {obj.size} light years</div>}
      {obj.mass      && <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM, marginBottom: 4 }}>Mass: ~{obj.mass} M☉</div>}
      {/* Interstellar transient specifics */}
      {obj.objectType === 'Interstellar Transient' && (<>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 8 }}>
          <DataPair label="Origin Direction" value={obj.origin}                       color={C.TEXT}/>
          <DataPair label="Hyperbolic Speed" value={`${obj.speed} km/s`}             color={C.TEXT}/>
          <DataPair label="Est. Departure"   value={`~${obj.departureYears} years`}  color={C.HAZARD}/>
        </div>
        <div style={{ padding: '6px 10px', background: C.PANEL, borderRadius: 3, borderLeft: `2px solid ${color}44`, marginBottom: 6 }}>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM }}>
            Carries chemical fingerprints from its birth stellar system. Unbound to any star — on a one-way hyperbolic trajectory through this neighborhood.
          </span>
        </div>
      </>)}
      {obj.notes && (
        <div style={{ marginTop: 6, padding: '6px 10px', background: C.PANEL, borderRadius: 3, borderLeft: `2px solid ${color}44` }}>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_FAINT }}>{obj.notes}</span>
        </div>
      )}
    </div>
  );
}

function NeighborhoodCard({ neighborhood, onLock, onRedraw, onNavigate, exploredSystems = {} }) {
  const [infoObj, setInfoObj] = useState(null);

  // Close the info panel whenever the neighborhood is redrawn or regenerated
  useEffect(() => { setInfoObj(null); }, [neighborhood.id]);
  const locked = neighborhood.locked;

  const handleClick = (n) => {
    if (n.navigable !== false) {
      onNavigate(n);
    } else {
      setInfoObj(prev => prev?.id === n.id ? null : n);
    }
  };

  return (
    <div style={{ ...cardStyle(locked, C.PRIMARY), marginBottom: 12 }}>
      <div onClick={() => onLock('neighborhood')} style={{ ...lockStripeStyle(locked, C.PRIMARY), minHeight: 80 }}/>
      <div style={{ flex: 1, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Label>Stellar Neighborhood</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            <LockBtn locked={locked} onToggle={() => onLock('neighborhood')} color={C.PRIMARY}/>
            {!locked && <button onClick={onRedraw} style={navBtn(false, C.PRIMARY, true)}>↻ Redraw</button>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <Tag color={C.PRIMARY}>{neighborhood.density}</Tag>
          <Value color={C.TEXT_DIM} size={13}>{neighborhood.densityDesc}</Value>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {neighborhood.neighbors.map(n => {
            const isStar      = !n.objectType || n.objectType === 'Star';
            const explored    = isStar && !!exploredSystems[n.id];
            const exploredSys = exploredSystems[n.id] || null;
            const actualStar  = exploredSys?.stars?.[0];
            const displayClass = actualStar?.spectralClass || n.spectralClass;
            const displayColor = actualStar?.color || n.color;
            const redrawn     = explored && displayClass !== n.spectralClass;
            const isInfoOpen  = infoObj?.id === n.id;
            const btnColor    = displayColor;

            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                title={!n.navigable ? `View: ${n.label}` : explored ? 'Return to explored system' : `Explore system`}
                style={{
                  background:   explored ? btnColor + '18' : isInfoOpen ? btnColor + '22' : C.PANEL_ALT,
                  border:       `1px solid ${explored ? btnColor + '88' : isInfoOpen ? btnColor + '66' : C.BORDER}`,
                  borderRadius: 3, padding: '6px 10px',
                  display: 'flex', gap: 6, alignItems: 'center',
                  cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = btnColor; e.currentTarget.style.background = btnColor + '22'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = explored ? btnColor + '88' : isInfoOpen ? btnColor + '66' : C.BORDER; e.currentTarget.style.background = explored ? btnColor + '18' : isInfoOpen ? btnColor + '22' : C.PANEL_ALT; }}
              >
                {isStar ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    {explored && actualStar
                      ? exploredSys.stars.map((s, si) => <div key={si} style={{ width: si===0?10:7, height: si===0?10:7, borderRadius:'50%', background:s.color, boxShadow:`0 0 4px ${s.color}88` }}/>)
                      : <div style={{ width:10, height:10, borderRadius:'50%', background:displayColor, boxShadow:`0 0 4px ${displayColor}88` }}/>
                    }
                  </div>
                ) : (
                  <span style={{ fontSize: 14, lineHeight: 1 }}>{n.icon}</span>
                )}
                <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.TEXT_DIM }}>{n.distance} ly</span>
                {isStar ? (
                  <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: displayColor }}>
                    {displayClass}
                    {redrawn && <span style={{ fontSize: 10, color: displayColor + '88', marginLeft: 4 }}>(*{n.spectralClass})</span>}
                  </span>
                ) : (
                  <span style={{ fontFamily: FONTS.MONO, fontSize: 12, color: n.color }}>{n.objectType}</span>
                )}
                <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: explored ? displayColor + 'cc' : C.TEXT_FAINT }}>
                  {n.navigable === false ? (isInfoOpen ? '▴ Info' : '▾ Info') : explored ? '↺ Return' : '→ Explore'}
                </span>
              </button>
            );
          })}
        </div>

        {infoObj && <ExoticInfoPanel obj={infoObj} onClose={() => setInfoObj(null)}/>}

        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_FAINT }}>
            Click stars to explore · Rogue planets navigable · Nebulae and black holes show info
          </span>
          {Object.keys(exploredSystems).length > 0 && (
            <span style={{ fontFamily: FONTS.MONO, fontSize: 10, color: C.TEXT_FAINT }}>
              * indicates original listed star type differs from explored system
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── STAR CARD ────────────────────────────────────────────────────────────────
function StarCard({ star, label, onLock, onRedraw }) {
  const locked = star.locked;
  return (
    <div style={{ ...cardStyle(locked, star.color), flex: 1, minWidth: 220 }}>
      <div onClick={() => onLock(star.id)} style={{ ...lockStripeStyle(locked, star.color), minHeight: 120 }}/>
      <div style={{ flex: 1, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Label color={star.color}>{label}</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            <LockBtn locked={locked} onToggle={() => onLock(star.id)} color={star.color}/>
            {!locked && <button onClick={onRedraw} style={navBtn(false, star.color, true)}>↻</button>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: `radial-gradient(circle at 35% 35%, ${star.color}ff, ${star.color}55)`, boxShadow: `0 0 18px ${star.color}66, 0 0 6px ${star.color}44` }}/>
          <div>
            <div style={{ fontFamily: FONTS.MONO, fontSize: 22, color: star.color, letterSpacing: 2, lineHeight: 1 }}>{star.spectralClass}</div>
            <div style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.TEXT_DIM, marginTop: 2 }}>{star.description}</div>
          </div>
        </div>
        <DataRow label="Luminosity" value={`${star.luminosity} L☉`}         color={C.STAR_G}/>
        <DataRow label="Mass"       value={`${star.mass} M☉`}                color={C.TEXT}/>
        <DataRow label="Age"        value={`${star.age} Gyr`}                 color={C.TEXT_DIM}/>
        <DataRow label="HZ Inner"   value={`${star.habitableZone.inner} AU`}  color={C.HABITABLE}/>
        <DataRow label="HZ Outer"   value={`${star.habitableZone.outer} AU`}  color={C.HABITABLE}/>
        {star.notes && (
          <div style={{ marginTop: 10, padding: '6px 10px', background: C.PANEL_ALT, borderRadius: 3, borderLeft: `2px solid ${C.PRIMARY}44` }}>
            <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_FAINT, lineHeight: 1.7 }}>{star.notes}</span>
          </div>
        )}
        {star.exotic && <div style={{ marginTop: 8 }}><Tag color={C.EXOTIC}>EXOTIC TYPE</Tag></div>}
      </div>
    </div>
  );
}

// ─── WORLD CARD ───────────────────────────────────────────────────────────────
function WorldCard({ world, index, onLock, onRedraw, onGenerateSpecies }) {
  const [expanded, setExpanded] = useState(false);
  const locked    = world.locked;
  const zoneColor = ZONE_COLORS[world.zone] || C.PRIMARY;
  const worldDef  = WORLD_TYPES[world.worldType];
  const hasDetails = world.hazards.length > 0 || world.moons.length > 0 || world.isHabitable
    || world.tidallyLocked || world.tidalResonance || world.biosignature
    || world.isCircumbinary || world.worldNotes;

  return (
    <div style={{ ...cardStyle(locked, zoneColor), marginBottom: 8 }}>
      <div onClick={() => onLock(world.id)} style={{ ...lockStripeStyle(locked, zoneColor), minHeight: 64 }}/>
      <div style={{ flex: 1, padding: '10px 14px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.TEXT_FAINT }}>[{index + 1}]</span>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 15, color: zoneColor }}>{world.worldType}</span>
          <span style={{ fontSize: 15 }}>{worldDef?.icon || ''}</span>
          <Tag color={zoneColor}>{world.zone.replace('_', ' ')}</Tag>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.TEXT_DIM }}>{world.orbitalAU} AU</span>
          {world.isCircumbinary && <Tag color={C.STAR_G}>★ CIRCUMBINARY</Tag>}
          {world.isHabitable    && <Tag color={C.HABITABLE}>★ HABITABLE</Tag>}
          {world.tidallyLocked  && <Tag color={C.COLD}>⟳ TIDALLY LOCKED</Tag>}
          {world.tidalResonance && <Tag color={C.COLD}>⟳ RESONANCE</Tag>}
          {world.biosignature   && <Tag color={world.biosignature.color}>🔬 {world.biosignature.shortLabel}</Tag>}
          <div style={{ flex: 1 }}/>
          <LockBtn locked={locked} onToggle={() => onLock(world.id)} color={zoneColor}/>
          {!locked && <button onClick={onRedraw} style={navBtn(false, zoneColor, true)}>↻ Redraw</button>}
          {hasDetails && (
            <button onClick={() => setExpanded(e => !e)} style={navBtn(expanded, C.PRIMARY, true)}>
              {expanded ? 'CLOSE ▲' : 'DETAILS ▾'}
            </button>
          )}
        </div>
        {/* Summary */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.TEXT_DIM }}>ATM: <span style={{ color: C.TEXT }}>{world.atmosphere}</span></span>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.TEXT_DIM }}>H₂O: <span style={{ color: C.TEXT }}>{world.hydrosphere}</span></span>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.TEXT_DIM }}>G: <span style={{ color: C.TEXT }}>{world.gravity}g</span></span>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.TEXT_DIM }}>T: <span style={{ color: world.temperature > 50 ? C.HAZARD : world.temperature < -50 ? C.COLD : C.TEXT }}>{world.temperature}°C</span></span>
          {world.moons.length > 0 && <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.TEXT_DIM }}>MOONS: <span style={{ color: C.TEXT }}>{world.moons.length}</span></span>}
        </div>
        {/* Expanded */}
        {expanded && (
          <div style={{ marginTop: 12 }}>
            <Divider label="DETAIL"/>

            {/* Circumbinary note */}
            {world.isCircumbinary && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: C.PANEL_ALT, border: `1px solid ${C.STAR_G}44`, borderRadius: 3 }}>
                <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.STAR_G }}>★ CIRCUMBINARY ORBIT — </span>
                <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM }}>This world orbits all stars in the system around their combined center of mass. Two suns cross the sky.</span>
              </div>
            )}

            {/* Tidal lock */}
            {(world.tidallyLocked || world.tidalResonance) && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: C.PANEL_ALT, border: `1px solid ${C.COLD}44`, borderRadius: 3 }}>
                {world.tidallyLocked && (<>
                  <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.COLD }}>⟳ TIDALLY LOCKED — </span>
                  <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM }}>Permanent dayside and nightside. Terminator zone may be the most habitable region.</span>
                </>)}
                {world.tidalResonance && (<>
                  <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.COLD }}>⟳ SPIN-ORBIT RESONANCE — </span>
                  <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM }}>Slow rotation in gravitational resonance. Extreme temperature swings between long days and nights.</span>
                </>)}
              </div>
            )}

            {/* Biosignature */}
            {world.biosignature && (
              <div style={{ marginBottom: 12, padding: '10px 12px', background: C.PANEL_ALT, border: `1px solid ${world.biosignature.color}55`, borderRadius: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: FONTS.MONO, fontSize: 12, color: world.biosignature.color }}>🔬 BIOSIGNATURE CANDIDATE</span>
                  <Tag color={world.biosignature.color}>{world.biosignature.label}</Tag>
                  <Tag color={C.TEXT_DIM}>{world.biosignature.confidence}</Tag>
                </div>
                <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM, lineHeight: 1.8 }}>
                  {world.biosignature.description}
                </span>
              </div>
            )}

            {/* World notes (disintegrating etc) */}
            {world.worldNotes && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: C.PANEL_ALT, border: `1px solid ${C.HAZARD}33`, borderRadius: 3 }}>
                <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.HAZARD }}>⚠ </span>
                <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM }}>{world.worldNotes}</span>
              </div>
            )}
            {world.hazards.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Label color={C.HAZARD}>Hazards</Label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {world.hazards.map((h, i) => <Tag key={i} color={C.HAZARD}>{h}</Tag>)}
                </div>
              </div>
            )}
            {world.moons.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Label>Moons ({world.moons.length})</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {world.moons.map((m, i) => (
                    <div key={i}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Tag color={m.canSupportLife ? C.HABITABLE : C.TEXT_DIM}>
                          {m.type}{m.canSupportLife ? ' ★' : ''}
                        </Tag>
                        <span style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.TEXT_DIM }}>{m.description}</span>
                      </div>
                      {m.lifeNote && (
                        <div style={{ marginTop: 4, marginLeft: 4, padding: '4px 8px', background: C.PANEL, borderRadius: 3, borderLeft: `2px solid ${C.HABITABLE}66` }}>
                          <span style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.HABITABLE }}>★ {m.lifeNote}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {world.isHabitable && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Label color={C.HABITABLE}>Sapient Species ({world.species.length})</Label>
                  <button onClick={() => onGenerateSpecies(world.id)} style={navBtn(false, C.HABITABLE, true)}>↻ Regen Species</button>
                </div>
                {world.species.length === 0 && (
                  <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.TEXT_FAINT }}>No sapient life detected on this world.</span>
                )}
                {world.species.map((sp, si) => <SpeciesCard key={sp.id} species={sp} index={si}/>)}

                {/* Lost civilization ruins */}
                {world.ruins && world.species.length === 0 && (
                  <div style={{ marginTop: 10, background: C.PANEL_ALT, border: `1px solid ${C.DANGER}44`, borderRadius: 3, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.DANGER, letterSpacing: 2 }}>☠ RUINS DETECTED</span>
                      <Tag color={C.DANGER}>{world.ruins.tech}</Tag>
                      <Tag color={C.TEXT_DIM}>{world.ruins.ageLabel}</Tag>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 10 }}>
                      <DataPair label="Civilization Tech" value={world.ruins.tech}  color={C.TEXT}/>
                      <DataPair label="Estimated Age"     value={`~${world.ruins.ageYears.toLocaleString()} yrs`} color={C.TEXT}/>
                      <DataPair label="Collapse Cause"    value={world.ruins.cause} color={C.DANGER}/>
                    </div>
                    <div style={{ padding: '6px 10px', background: C.PANEL, borderRadius: 3, borderLeft: `2px solid ${C.DANGER}44`, marginBottom: 6 }}>
                      <span style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.TEXT_DIM, lineHeight: 1.8 }}>
                        {world.ruins.causeDesc}
                      </span>
                    </div>
                    <div style={{ padding: '6px 10px', background: C.PANEL, borderRadius: 3, borderLeft: `2px solid ${C.TEXT_FAINT}44` }}>
                      <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_FAINT, lineHeight: 1.8 }}>
                        {world.ruins.techDesc} · {world.ruins.ageDesc}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SPECIES CARD ─────────────────────────────────────────────────────────────
function SpeciesCard({ species, index }) {
  const dispColor = species.disposition === 'Openly Hostile' ? C.DANGER : species.disposition === 'Welcoming' ? C.HABITABLE : C.PRIMARY;
  return (
    <div style={{ background: C.PANEL_ALT, border: `1px solid ${C.HABITABLE}33`, borderRadius: 3, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Label color={C.HABITABLE}>Species {index + 1}</Label>
        <Tag color={C.HABITABLE}>{species.tech}</Tag>
        <Tag color={dispColor}>{species.disposition}</Tag>
      </div>
      {/* 2-col grid, each cell is label ABOVE value */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginBottom: 12 }}>
        <DataPair label="Biological Origin" value={species.origin}        color={C.TEXT}/>
        <DataPair label="Body Plan"         value={species.bodyPlan}      color={C.TEXT}/>
        <DataPair label="Primary Sense"     value={species.primarySense}  color={C.TEXT}/>
        <DataPair label="Social Structure"  value={species.social}        color={C.TEXT}/>
      </div>
      <div style={{ marginBottom: 10, padding: '8px 10px', background: C.PANEL, borderRadius: 3, borderLeft: `2px solid ${C.HABITABLE}44` }}>
        <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.TEXT_DIM, lineHeight: 1.8 }}>
          {species.originDesc} · {species.bodyPlanDesc} · {species.senseDesc} · {species.socialDesc}
        </span>
      </div>
      {species.traits.length > 0 && (
        <div>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM, letterSpacing: 2 }}>DISTINCTIVE TRAITS</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {species.traits.map((t, i) => <Tag key={i} color={C.EXOTIC}>{t}</Tag>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SYSTEM OVERVIEW ─────────────────────────────────────────────────────────
function SystemOverview({ system, isNeighbor, onBack, onRename }) {
  const [editing,  setEditing]  = useState(false);
  const [nameVal,  setNameVal]  = useState(system.name || '');
  const habitable    = system.worlds.filter(w => w.isHabitable).length;
  const totalSpecies = system.worlds.reduce((sum, w) => sum + w.species.length, 0);

  const commitName = () => {
    setEditing(false);
    const trimmed = nameVal.trim();
    onRename(trimmed || '');
  };

  return (
    <div style={{ ...panelStyle(), marginBottom: 16 }}>
      {isNeighbor && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${C.BORDER}` }}>
          <button onClick={onBack} style={navBtn(false, C.PRIMARY, true)}>← Back to Primary System</button>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 10, color: C.TEXT_FAINT, letterSpacing: 2 }}>NEIGHBOR SYSTEM</span>
        </div>
      )}

      {/* Inline name editor */}
      <div style={{ marginBottom: 12 }}>
        {editing ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value.toUpperCase())}
              onBlur={commitName}
              onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameVal(system.name || ''); setEditing(false); } }}
              maxLength={48}
              placeholder="SYSTEM NAME..."
              style={{
                background: C.PANEL_ALT, border: `1px solid ${C.PRIMARY}88`,
                borderRadius: 3, color: C.TEXT, fontFamily: FONTS.MONO,
                fontSize: 15, letterSpacing: 3, padding: '4px 10px',
                flex: 1, outline: 'none',
              }}
            />
            <button onClick={commitName} style={navBtn(false, C.PRIMARY, true)}>SAVE</button>
            <button onClick={() => { setNameVal(system.name || ''); setEditing(false); }} style={navBtn(false, C.TEXT_DIM, true)}>CANCEL</button>
          </div>
        ) : (
          <div
            onClick={() => { setNameVal(system.name || ''); setEditing(true); }}
            title="Click to name this system"
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'text' }}
          >
            <span style={{
              fontFamily: FONTS.MONO, fontSize: 16, letterSpacing: 3,
              color: system.name ? C.TEXT : C.TEXT_FAINT,
            }}>
              {system.name || 'UNNAMED SYSTEM'}
            </span>
            <span style={{ fontFamily: FONTS.MONO, fontSize: 10, color: C.TEXT_FAINT, letterSpacing: 1 }}>✎ rename</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM, letterSpacing: 2, marginBottom: 6 }}>
            {system.isRoguePlanet ? 'ROGUE PLANET' : system.stars.length === 1 ? 'STAR' : system.stars.length === 2 ? 'BINARY' : 'TRIPLE'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {system.stars.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_FAINT }}>+</span>}
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: s.color, boxShadow: `0 0 8px ${s.color}88` }}/>
                <span style={{ fontFamily: FONTS.MONO, fontSize: 15, color: s.color }}>{s.spectralClass}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM, letterSpacing: 2, marginBottom: 6 }}>WORLDS</div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 24, color: C.TEXT }}>{system.worlds.length}</div>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM, letterSpacing: 2, marginBottom: 6 }}>HABITABLE</div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 24, color: C.HABITABLE }}>{habitable}</div>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM, letterSpacing: 2, marginBottom: 6 }}>SAPIENT SPECIES</div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 24, color: C.EXOTIC }}>{totalSpecies}</div>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM, letterSpacing: 2, marginBottom: 6 }}>HABITABLE ZONE</div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 15, color: C.HABITABLE }}>{system.hz.inner}–{system.hz.outer} AU</div>
        </div>
      </div>
    </div>
  );
}

// ─── ARCHIVE PANEL ────────────────────────────────────────────────────────────
function ArchivePanel({ archive, onRestore, onDelete }) {
  if (!archive.length) return (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <div style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.TEXT_FAINT, marginBottom: 8 }}>NO SAVED SYSTEMS</div>
      <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_FAINT }}>Use ↓ SAVE SYSTEM in the system view to archive a system</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {archive.map((entry, i) => (
        <div key={entry.id} style={{ background: C.PANEL, border: `1px solid ${C.BORDER}`, borderRadius: 4, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            {/* Star dots */}
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {entry.summary.stars.map((s, si) => (
                <div key={si} style={{ width: si === 0 ? 12 : 9, height: si === 0 ? 12 : 9, borderRadius: '50%', background: s.color, boxShadow: `0 0 6px ${s.color}88` }}/>
              ))}
            </div>
            {/* Name */}
            <span style={{ fontFamily: FONTS.MONO, fontSize: 14, color: entry.system.name ? C.TEXT : C.TEXT_FAINT, letterSpacing: 2, flex: 1 }}>
              {entry.system.name || 'UNNAMED SYSTEM'}
            </span>
            <button onClick={() => onRestore(entry)} style={navBtn(false, C.PRIMARY, true)}>RESTORE</button>
            <button onClick={() => onDelete(entry.id)} style={navBtn(false, C.DANGER, true)}>✕</button>
          </div>
          {/* Summary stats */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM }}>
              {entry.summary.stars.map(s => s.spectralClass).join('+')}
            </span>
            <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM }}>
              {entry.summary.worldCount} worlds
            </span>
            {entry.summary.habitableCount > 0 && (
              <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.HABITABLE }}>
                {entry.summary.habitableCount} habitable
              </span>
            )}
            {entry.summary.speciesCount > 0 && (
              <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.EXOTIC }}>
                {entry.summary.speciesCount} species
              </span>
            )}
          </div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 10, color: C.TEXT_FAINT }}>
            {new Date(entry.timestamp).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── STAR COUNT CONTROL ───────────────────────────────────────────────────────
function StarCountControl({ count, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.TEXT_DIM, letterSpacing: 2 }}>SYSTEM TYPE</span>
      {['Single', 'Binary', 'Triple'].map((label, i) => (
        <button key={label} onClick={() => onChange(i + 1)} style={navBtn(count === i + 1, C.PRIMARY, true)}>{label}</button>
      ))}
    </div>
  );
}

// ─── EXPORT PANEL ─────────────────────────────────────────────────────────────
function ExportPanel({ system }) {
  const [copied, setCopied] = useState(false);
  const dl = (content, type, ext) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `armillary-${Date.now()}.${ext}`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button onClick={() => dl(JSON.stringify(system, null, 2), 'application/json', 'json')} style={navBtn(false, C.PRIMARY)}>⬇ Export JSON</button>
      <button onClick={() => dl(generateTextSummary(system), 'text/plain', 'txt')} style={navBtn(false, C.PRIMARY)}>⬇ Export Text</button>
      <button onClick={() => { navigator.clipboard.writeText(generateTextSummary(system)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }} style={navBtn(copied, C.HABITABLE)}>
        {copied ? '✓ Copied!' : '⎘ Copy Text'}
      </button>
    </div>
  );
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────
const MAX_SAVED = 50;

const saveSystem = s => { try { localStorage.setItem('armillary_current', JSON.stringify(s)); } catch {} };
const loadSystem = () => { try { const s = localStorage.getItem('armillary_current'); return s ? JSON.parse(s) : null; } catch { return null; } };

const loadArchive  = () => { try { const s = localStorage.getItem('armillary_archive'); return s ? JSON.parse(s) : []; } catch { return []; } };
const saveArchive  = a => { try { localStorage.setItem('armillary_archive', JSON.stringify(a)); } catch {} };

function buildSummary(system) {
  return {
    stars:         system.stars.map(s => ({ spectralClass: s.spectralClass, color: s.color })),
    worldCount:    system.worlds.length,
    habitableCount: system.worlds.filter(w => w.isHabitable).length,
    speciesCount:  system.worlds.reduce((n, w) => n + w.species.length, 0),
  };
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [system,           setSystem]           = useState(() => {
    const saved = loadSystem();
    return saved || generateSystem({ starCount: 1 });
  });
  const [starCount,        setStarCount]        = useState(() => {
    const saved = loadSystem();
    return saved?.stars?.length || 1;
  });
  const [neighborSystems,  setNeighborSystems]  = useState({}); // map: neighbor.id → generated system
  const [activeNeighborId, setActiveNeighborId] = useState(null);
  const [view,             setView]             = useState('system');
  const [booted,           setBooted]           = useState(false);
  const [archive,          setArchive]          = useState(() => loadArchive());

  const active     = activeNeighborId ? (neighborSystems[activeNeighborId] || system) : system;
  const isNeighbor = !!activeNeighborId;

  const updateActive = useCallback(s => {
    if (activeNeighborId) {
      setNeighborSystems(prev => ({ ...prev, [activeNeighborId]: s }));
    } else {
      setSystem(s);
      saveSystem(s);
    }
  }, [activeNeighborId]);

  const handleGenerate  = () => {
    const s = generateSystem({ starCount });
    setSystem(s); saveSystem(s);
    setActiveNeighborId(null);
    setNeighborSystems({});
    // starCount already matches since we used it to generate
  };
  const handleRedraw    = () => updateActive(redrawSystem(active, { redrawnStarCount: starCount }));
  const handleUnlockAll = () => updateActive({ ...active, neighborhood: { ...active.neighborhood, locked: false }, stars: active.stars.map(s => ({ ...s, locked: false })), worlds: active.worlds.map(w => ({ ...w, locked: false })) });

  const handleLockNbhd   = () => updateActive({ ...active, neighborhood: { ...active.neighborhood, locked: !active.neighborhood.locked } });
  const handleRedrawNbhd = () => { const f = generateSystem({ starCount }); updateActive({ ...active, neighborhood: f.neighborhood }); };

  const handleNavigate = (neighbor) => {
    if (!neighborSystems[neighbor.id]) {
      let ns;
      if (neighbor.objectType === 'Rogue Planet') {
        // Build a hand-crafted rogue body system — no star, no HZ, 0-1 captured bodies
        const bodyCount = Math.random() < 0.4 ? 1 : 0; // 40% chance of a single captured moon/body
        const rogueWorlds = bodyCount === 0 ? [] : [{
          id:            crypto.randomUUID(),
          index:         0,
          orbitalAU:     0,
          zone:          'FRINGE',
          worldType:     Math.random() < 0.5 ? 'Subsurface Ocean' : 'Ice Planet',
          atmosphere:    Math.random() < 0.3 ? 'Trace' : 'None',
          hydrosphere:   'Subsurface Ocean',
          gravity:       parseFloat((Math.random() * 0.4 + 0.1).toFixed(2)),
          temperature:   Math.floor(Math.random() * -100 - 150), // -150 to -250°C
          isHabitable:   false,
          tidallyLocked: false,
          tidalResonance:false,
          biosignature:  null,
          hazards:       ['Extreme cold', 'No solar energy', 'Radiation from cosmic sources'],
          moons:         [],
          worldNotes:    'Captured companion body. Geothermal heat from radioactive decay may sustain subsurface liquid water.',
          locked:        false,
          species:       [],
          ruins:         null,
          isCircumbinary:false,
        }];
        ns = {
          id:           crypto.randomUUID(),
          timestamp:    Date.now(),
          isRoguePlanet:true,
          stars:        [],
          hz:           { inner: 0, outer: 0 },
          worldCount:   rogueWorlds.length,
          worlds:       rogueWorlds,
          comets:       [],
          neighborhood: { density: 'N/A', densityDesc: 'Interstellar void', neighbors: [], locked: false },
        };
      } else {
        ns = generateSystem({ starCount: 1, primarySpectralClass: neighbor.spectralClass });
      }
      setNeighborSystems(prev => ({ ...prev, [neighbor.id]: ns }));
    }
    setActiveNeighborId(neighbor.id);
    const existingNs = neighborSystems[neighbor.id];
    if (!existingNs?.isRoguePlanet && neighbor.objectType !== 'Rogue Planet') {
      setStarCount(existingNs?.stars?.length || 1);
    }
  };

  const handleBack = () => {
    setActiveNeighborId(null);
    // Restore starCount to primary system's star count
    setStarCount(system.stars.length);
  };

  const handleLockStar   = useCallback(id => updateActive({ ...active, stars: active.stars.map(s => s.id === id ? { ...s, locked: !s.locked } : s) }), [active, updateActive]);
  const handleRedrawStar = useCallback(id => {
    const f = generateSystem({ starCount });
    const i = active.stars.findIndex(s => s.id === id);
    const fs = f.stars[i] || f.stars[0];
    updateActive({ ...active, stars: active.stars.map(s => s.id === id ? { ...fs, id, locked: false } : s) });
  }, [active, starCount, updateActive]);

  const handleLockWorld   = useCallback(id => updateActive({ ...active, worlds: active.worlds.map(w => w.id === id ? { ...w, locked: !w.locked } : w) }), [active, updateActive]);
  const handleRedrawWorld = useCallback(id => {
    const f  = generateSystem({ starCount });
    const wi = active.worlds.findIndex(w => w.id === id);
    const fw = f.worlds[wi] || f.worlds[0];
    updateActive({ ...active, worlds: active.worlds.map(w => w.id === id ? { ...fw, id, locked: false } : w) });
  }, [active, starCount, updateActive]);

  const handleSpecies = useCallback(id => updateActive({ ...active, worlds: active.worlds.map(w => w.id === id ? regenerateSpeciesForWorld(w) : w) }), [active, updateActive]);

  const handleRename = (name) => {
    updateActive({ ...active, name });
  };

  const handleSaveToArchive = () => {
    const entry = {
      id:        crypto.randomUUID(),
      timestamp: Date.now(),
      system:    active,
      summary:   buildSummary(active),
    };
    const updated = [entry, ...archive].slice(0, MAX_SAVED);
    setArchive(updated);
    saveArchive(updated);
  };

  const handleRestoreFromArchive = (entry) => {
    setSystem(entry.system);
    saveSystem(entry.system);
    setStarCount(entry.system.stars.length);
    setActiveNeighborId(null);
    setNeighborSystems({});
    setView('system');
  };

  const handleDeleteFromArchive = (id) => {
    const updated = archive.filter(e => e.id !== id);
    setArchive(updated);
    saveArchive(updated);
  };

  const starLabels = active.stars.length === 1 ? ['Primary Star'] : active.stars.map((_, i) => `Star ${String.fromCharCode(65 + i)}`);

  return (
    <div style={{ background: C.BG, minHeight: '100vh', color: C.TEXT, fontFamily: FONTS.MONO }}>
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet"/>

      {/* BOOT SEQUENCE */}
      {!booted && <BootSequence onComplete={() => setBooted(true)}/>}

      {/* HEADER */}
      <div style={{ background: '#060a0f', borderBottom: `2px solid ${C.BORDER_HI}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1024, margin: '0 auto', padding: '8px 16px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', minHeight: 54, gap: '6px 0' }}>
          <div style={{ width: 4, background: C.PRIMARY, marginRight: 16, flexShrink: 0, alignSelf: 'stretch', minHeight: 38 }}/>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 160 }}>
            <div>
              <div style={{ fontFamily: FONTS.MONO, fontSize: 16, color: C.PRIMARY, letterSpacing: 5 }}>ARMILLARY</div>
              <div style={{ fontFamily: FONTS.MONO, fontSize: 8, color: C.TEXT_FAINT, letterSpacing: 3 }}>STELLAR SYSTEM GENERATOR</div>
            </div>
          </div>
          {/* main control buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setView('system')}  style={navBtn(view === 'system')}>SYSTEM</button>
            <button onClick={() => setView('archive')} style={navBtn(view === 'archive')}>ARCHIVE{archive.length > 0 ? ` (${archive.length})` : ''}</button>
            <button onClick={() => setView('about')}   style={navBtn(view === 'about')}>ABOUT</button>
            <div style={{ width: 1, height: 24, background: C.BORDER, margin: '0 4px' }}/>
            <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{ ...navBtn(false, '#FF6B6B'), textDecoration: 'none', fontSize: 10 }}>☕ Support</a>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1024, margin: '0 auto', padding: '16px' }}>

        {view === 'system' && (<>
          {/* Controls */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px', background: C.PANEL, border: `1px solid ${C.BORDER}`, borderRadius: 4 }}>
            {!active.isRoguePlanet && <StarCountControl count={starCount} onChange={setStarCount}/>}
            {isNeighbor && (
              <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_FAINT, letterSpacing: 1 }}>
                {active.isRoguePlanet
                  ? '⬛ ROGUE PLANET — no host star'
                  : `— NEIGHBOR · ${active.stars[0]?.spectralClass} origin`}
              </span>
            )}
            <div style={{ flex: 1 }}/>
            {!isNeighbor && <button onClick={handleGenerate} style={{ ...navBtn(false, C.HABITABLE), fontWeight: 700 }}>⚡ Generate New</button>}
            <button onClick={handleRedraw}          style={navBtn(false, C.PRIMARY)}>↻ Redraw Free</button>
            <button onClick={handleUnlockAll}       style={navBtn(false, C.TEXT_DIM, true)}>⊘ Unlock All</button>
            <button onClick={handleSaveToArchive}   style={navBtn(false, C.EXOTIC)}>↓ Save System</button>
          </div>

          {/* Star count change notice — not applicable for rogue planet systems */}
          {!active.isRoguePlanet && starCount !== active.stars.length && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              marginBottom: 14, padding: '10px 14px',
              background: C.HAZARD + '11',
              border: `1px solid ${C.HAZARD}55`,
              borderRadius: 4,
            }}>
              <span style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.HAZARD, flex: 1 }}>
                ⚠ SYSTEM TYPE CHANGED TO {['','SINGLE','BINARY','TRIPLE'][starCount]}
                {isNeighbor ? ' for this neighbor' : ''} — this will add or remove stars and redraw unlocked worlds
              </span>
              <button onClick={handleRedraw}                    style={{ ...navBtn(false, C.HAZARD), fontSize: 11 }}>↻ Apply & Redraw</button>
              <button onClick={() => setStarCount(active.stars.length)} style={{ ...navBtn(false, C.TEXT_DIM, true), fontSize: 11 }}>✕ Revert</button>
            </div>
          )}

          <SystemOverview system={active} isNeighbor={isNeighbor} onBack={handleBack} onRename={handleRename}/>

          {!isNeighbor && (
            <NeighborhoodCard
              neighborhood={active.neighborhood}
              onLock={handleLockNbhd}
              onRedraw={handleRedrawNbhd}
              onNavigate={handleNavigate}
              exploredSystems={neighborSystems}
            />
          )}

          <div style={{ marginBottom: 14 }}>
            {active.isRoguePlanet ? (
              // Rogue planet — no star, show a descriptive panel instead
              <div style={{ padding: '12px 16px', background: C.PANEL, border: `1px solid ${C.PRIMARY}33`, borderRadius: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 20 }}>⬛</span>
                  <Label color={C.PRIMARY}>Rogue Planetary Body</Label>
                </div>
                <div style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.TEXT_DIM, lineHeight: 1.9 }}>
                  No host star. This body drifts through interstellar space unbound to any stellar system.
                  Surface temperature approaches absolute zero. Any liquid water would require subsurface
                  geothermal heating from residual radioactive decay — a Europa-like scenario in permanent darkness.
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Tag color={C.COLD}>No Solar Energy</Tag>
                  <Tag color={C.COLD}>Geothermal Only</Tag>
                  <Tag color={C.TEXT_DIM}>No Habitable Zone</Tag>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Label color={C.PRIMARY}>
                    {active.stars.length === 1 ? 'Primary Star' : active.stars.length === 2 ? 'Binary System' : 'Triple System'}
                  </Label>
                  {active.stars.length > 1 && (
                    <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_FAINT }}>
                      — habitable zone calculated from combined luminosity of all stars
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  {active.stars.map((star, i) => (
                    <StarCard key={star.id} star={star} label={starLabels[i]} onLock={handleLockStar} onRedraw={() => handleRedrawStar(star.id)}/>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* HZ bar — suppress for rogue planets */}
          {!active.isRoguePlanet && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: C.PANEL, border: `1px solid ${C.HABITABLE}44`, borderRadius: 4, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <Label color={C.HABITABLE}>Habitable Zone</Label>
              <span style={{ fontFamily: FONTS.MONO, fontSize: 15, color: C.HABITABLE }}>{active.hz.inner} – {active.hz.outer} AU</span>
              <span style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.TEXT_FAINT }}>Liquid water range (combined luminosity)</span>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <Label color={C.PRIMARY}>Planetary Bodies ({active.worlds.length})</Label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(ZONE_COLORS).map(([zone, color]) => (
                  <span key={zone} style={{ fontFamily: FONTS.MONO, fontSize: 11, color, letterSpacing: 1 }}>■ {zone.replace('_', ' ')}</span>
                ))}
              </div>
            </div>
            {active.worlds.map((world, i) => (
              <WorldCard key={world.id} world={world} index={i} onLock={handleLockWorld} onRedraw={() => handleRedrawWorld(world.id)} onGenerateSpecies={handleSpecies}/>
            ))}
          </div>

          {/* Comets */}
          {active.comets?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                <div style={{ width: 40, height: 4, background: C.COLD, borderRadius: 2 }}/>
                <Label color={C.COLD}>Comets ({active.comets.length})</Label>
                <div style={{ flex: 1, height: 4, background: C.COLD + '22', borderRadius: 2 }}/>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {active.comets.map((c, i) => (
                  <div key={c.id} style={{ background: C.PANEL, border: `1px solid ${C.COLD}33`, borderRadius: 4, padding: '8px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_FAINT }}>[C{i + 1}]</span>
                    <Tag color={C.COLD}>{c.composition}</Tag>
                    <Tag color={C.TEXT_DIM}>{c.periodType}</Tag>
                    <span style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.TEXT }}>
                      {c.period} yr period
                    </span>
                    <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.TEXT_DIM, flex: 1 }}>
                      {c.compDesc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ ...panelStyle(), marginBottom: 24 }}>
            <Label color={C.PRIMARY}>Export System</Label>
            <div style={{ marginTop: 12 }}><ExportPanel system={active}/></div>
          </div>
        </>)}

        {view === 'archive' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
              <div style={{ width: 4, height: 44, background: C.EXOTIC, borderRadius: 2 }}/>
              <div style={{ flex: 1, height: 5, background: C.EXOTIC + '22', borderRadius: 3 }}/>
              <div style={{ width: 40, height: 5, background: C.EXOTIC, borderRadius: 3 }}/>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.EXOTIC, letterSpacing: 3 }}>
                SYSTEM ARCHIVE · {archive.length} / {MAX_SAVED}
              </span>
              {archive.length > 0 && (
                <button
                  onClick={() => { if (window.confirm('Clear all saved systems?')) { setArchive([]); saveArchive([]); } }}
                  style={navBtn(false, C.DANGER, true)}
                >
                  ✕ Clear All
                </button>
              )}
            </div>
            <ArchivePanel archive={archive} onRestore={handleRestoreFromArchive} onDelete={handleDeleteFromArchive}/>
          </div>
        )}

        {view === 'about' && (
          <div style={{ ...panelStyle(), maxWidth: 660, margin: '0 auto' }}>
            <div style={{ fontFamily: FONTS.MONO, lineHeight: 1.9 }}>
              <div style={{ fontSize: 18, color: C.PRIMARY, letterSpacing: 4, marginBottom: 16 }}>ABOUT ARMILLARY</div>

              <p style={{ marginBottom: 14, color: C.TEXT, fontSize: 14 }}>
                Armillary is a deep star system generator for writers, game masters, and worldbuilders. Generate complete solar systems — stellar data, planetary bodies, habitable zones, and sapient species — in seconds.
              </p>

              <Divider label="METHODOLOGY"/>
              <p style={{ marginBottom: 14, color: C.TEXT, fontSize: 14 }}>
                Generation logic is based on <em>GURPS Space</em> 4th Edition (Steve Jackson Games) stellar and planetary generation tables, supplemented with NASA exoplanet habitability research. Species generation draws on <em>GURPS Aliens</em> biological origin and social structure frameworks. All methodology is used for fan creative purposes with attribution.
              </p>

              <Divider label="HOW TO USE"/>
              <p style={{ marginBottom: 14, color: C.TEXT, fontSize: 14 }}>
                Choose a system type (Single, Binary, Triple) and click Generate New. Lock any card to preserve it during redraws — use Redraw Free to regenerate only unlocked elements. Click DETAILS on any world to see full data and species. Click any neighbor star in the Stellar Neighborhood to explore that system. Export to JSON or plain text for session notes and world bibles.
              </p>

              <Divider label="SUPPORT"/>
              <p style={{ marginBottom: 14, color: C.TEXT, fontSize: 14 }}>
                Armillary is free and no account is required. Your current system saves automatically in your browser. If it's useful to you, a coffee is always appreciated.
              </p>
              <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{ ...navBtn(false, '#FF6B6B'), textDecoration: 'none', display: 'inline-block', fontSize: 13 }}>
                ☕ Buy me a coffee on Ko-fi
              </a>

              <Divider/>
              <p style={{ color: C.TEXT_DIM, fontSize: 13, marginBottom: 8 }}>
                Built by Kummer Wolfe — fiction author and worldbuilder.
              </p>
              <a 
                href={LINKTREE} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ ...navBtn(false, C.PRIMARY), textDecoration: 'none', display: 'inline-block', fontSize: 13 }}
              >
                ✦ My Linktr.ee
              </a>
              <br/>
              <a
                href={SUBSTACK_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...navBtn(false, C.PRIMARY), textDecoration: 'none', display: 'inline-block', fontSize: 13 }}
              >
                ✦ Read my fiction on Substack
              </a>
              <p style={{ color: C.TEXT_FAINT, fontSize: 11, marginTop: 12 }}>
                © 2026 Kummer Wolfe · Free for personal, commercial, and creative use · CC BY 4.0<br/>
                <a href={LIVE_URL} style={{ color: C.TEXT_FAINT }}>armillary-star-gen.pages.dev</a>
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
