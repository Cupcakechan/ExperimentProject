// ============================================================
// creatureIO.js — creature JSON round trip (C1).
//
// EXPORT wraps the creature object, untouched, in a tiny envelope
// (format stamp + version) so a future reader can tell what it is
// holding and refuse files from the future politely.
//
// PARSE accepts the envelope OR a bare creature object (hand-made
// files shouldn't need ceremony), validates it against the
// executable authoring rules, and returns the RAW parsed object —
// never a reconstruction. That is the preserve-hand-authored-data
// rule in code: fields this tool doesn't manage (a custom note, a
// future field) flow through import -> stage -> re-export intact.
// ============================================================

import { validateCreature } from './validate.js';

export const CREATURE_FORMAT = 'sdf-blend-shell/creature';
export const CREATURE_FORMAT_VERSION = 1;

export function exportCreature(creature) {
  // 2-space pretty print: these files exist to be hand-edited.
  return JSON.stringify({ format: CREATURE_FORMAT, version: CREATURE_FORMAT_VERSION, creature }, null, 2);
}

export function parseCreatureJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`not valid JSON: ${e.message}`], warnings: [] };
  }
  let creature = parsed;
  if (parsed && typeof parsed === 'object' && parsed.format === CREATURE_FORMAT) {
    if (typeof parsed.version === 'number' && parsed.version > CREATURE_FORMAT_VERSION) {
      return { ok: false, errors: [`file is format version ${parsed.version}; this build reads up to ${CREATURE_FORMAT_VERSION}`], warnings: [] };
    }
    creature = parsed.creature;
  }
  const v = validateCreature(creature);
  return v.ok ? { ok: true, creature, warnings: v.warnings } : { ok: false, errors: v.errors, warnings: v.warnings };
}
