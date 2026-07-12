import { APP_VERSION } from '../config.js';

export const EXPORT_SCHEMA_VERSION = 1;

export function wrapSystemForExport(system) {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    appVersion:    APP_VERSION,
    exportedAt:    Date.now(),
    system,
  };
}

export function serializeSystemExport(system) {
  return JSON.stringify(wrapSystemForExport(system), null, 2);
}

export function parseImportedJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON — file could not be parsed.' };
  }

  const system = data?.schemaVersion != null && data?.system ? data.system : data;
  const validation = validateSystem(system);
  if (!validation.ok) return validation;

  return {
    ok:     true,
    system: validation.system,
    meta:   data?.schemaVersion != null ? { appVersion: data.appVersion, exportedAt: data.exportedAt } : null,
  };
}

export function validateSystem(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Import must be a JSON object (Armillary system or export wrapper).' };
  }

  if (raw.isRoguePlanet) {
    if (!Array.isArray(raw.worlds)) {
      return { ok: false, error: 'Rogue system is missing worlds array.' };
    }
    return { ok: true, system: raw };
  }

  if (!Array.isArray(raw.stars)) {
    return { ok: false, error: 'Missing stars array — not a valid Armillary system.' };
  }
  if (!Array.isArray(raw.worlds)) {
    return { ok: false, error: 'Missing worlds array.' };
  }
  if (!raw.hz || typeof raw.hz.inner !== 'number' || typeof raw.hz.outer !== 'number') {
    return { ok: false, error: 'Missing or invalid habitable zone (hz.inner / hz.outer).' };
  }
  if (!raw.neighborhood || !Array.isArray(raw.neighborhood.neighbors)) {
    return { ok: false, error: 'Missing neighborhood data.' };
  }

  return { ok: true, system: raw };
}

export function archiveEntryMatchesQuery(entry, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const sys     = entry.system || {};
  const name    = (sys.name || '').toLowerCase();
  const seed    = (sys.seed || '').toLowerCase();
  const spectral = (entry.summary?.stars || sys.stars || [])
    .map(s => s.spectralClass)
    .join('+')
    .toLowerCase();

  return name.includes(q) || seed.includes(q) || spectral.includes(q);
}
