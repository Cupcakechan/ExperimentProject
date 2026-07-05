// ============================================================
// controls.js — DOM layer: the blend-radius slider (driving every
// actor via onK) + the C1 creature I/O row: export any roster
// creature as JSON, import a JSON file to spawn it live. All DATA
// decisions (which creature, validation, spawning) live in main;
// this layer only owns DOM: buttons, the file reader, the blob
// download, and the status line.
// ============================================================

import { K_MIN, K_MAX, K_STEP } from '../config.js';

export function createControls({ initialK, onK, roster, onExport, onImport }) {
  const wrap = document.getElementById('controls');
  if (!wrap) return null; // graceful: missing container (or headless test)

  const label = document.createElement('label');
  label.textContent = 'blend k ';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = K_MIN;
  slider.max = K_MAX;
  slider.step = K_STEP;
  slider.value = initialK;
  const readout = document.createElement('span');
  readout.textContent = Number(initialK).toFixed(2);
  slider.addEventListener('input', () => {
    const k = parseFloat(slider.value);
    onK(k);
    readout.textContent = k.toFixed(2);
  });
  label.appendChild(slider);
  label.appendChild(readout);
  wrap.appendChild(label);

  // --- creature I/O row (C1) ---
  const io = document.createElement('div');
  io.id = 'io-row';

  const select = document.createElement('select');
  function refreshRoster() {
    const items = roster();
    select.innerHTML = '';
    for (const { id, name } of items) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      select.appendChild(opt);
    }
  }
  refreshRoster();

  const status = document.createElement('span');
  status.id = 'io-status';
  const say = (text, isError) => {
    status.textContent = text;
    status.className = isError ? 'err' : 'ok';
  };

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'export';
  exportBtn.addEventListener('click', () => {
    const result = onExport(select.value);
    if (!result) return say('nothing to export', true);
    // Blob download: create, click, release — no server round trip.
    const url = URL.createObjectURL(new Blob([result.text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
    say(`exported ${result.filename}`, false);
  });

  // A hidden file input behind a visible button: the input's native
  // look can't be styled consistently, the button can.
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.style.display = 'none';
  const importBtn = document.createElement('button');
  importBtn.textContent = 'import json';
  importBtn.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = onImport(String(reader.result));
      if (r.ok) {
        refreshRoster(); // the newcomer joins the export list
        const warn = r.warnings?.length ? ` (${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''}: ${r.warnings[0]})` : '';
        say(`spawned ${r.name}${warn}`, false);
      } else {
        // First reasons only — a garbage file can carry dozens.
        const shown = r.errors.slice(0, 3).join('; ');
        const more = r.errors.length > 3 ? ` (+${r.errors.length - 3} more)` : '';
        say(`rejected: ${shown}${more}`, true);
      }
      file.value = ''; // same file re-selectable (change fires again)
    };
    reader.onerror = () => say('could not read the file', true);
    reader.readAsText(f);
  });

  io.appendChild(select);
  io.appendChild(exportBtn);
  io.appendChild(importBtn);
  io.appendChild(status);
  wrap.appendChild(io);

  return { refreshRoster };
}
