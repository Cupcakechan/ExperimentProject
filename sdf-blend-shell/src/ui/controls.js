// ============================================================
// controls.js — DOM layer: the blend-radius slider + the creature
// switcher buttons. Callbacks in, no rendering knowledge here.
// Returns a uniform interface ({ setActive }) even when headless,
// so callers never need to guard.
// ============================================================

import { K_MIN, K_MAX, K_STEP } from '../config.js';

export function createControls({ creatures, initialK, onK, onSelect }) {
  const noop = { setActive: () => {} };
  const wrap = document.getElementById('controls');
  if (!wrap) return noop; // graceful: missing container (or headless test)

  // --- creature switcher ---
  const row = document.createElement('div');
  row.className = 'creature-row';
  const buttons = creatures.map((creature, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${i + 1} ${creature.name}`;
    btn.addEventListener('click', () => onSelect(i));
    row.appendChild(btn);
    return btn;
  });
  wrap.appendChild(row);

  // --- blend-radius slider ---
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

  return {
    setActive(active) {
      buttons.forEach((btn, i) => btn.classList.toggle('active', i === active));
    },
  };
}
